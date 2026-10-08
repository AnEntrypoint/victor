import base from "./auto-pipeline.js";
import { toPixels } from "../docs/auto.js";

const ORT_DIST = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const MODELS = {
  waifu: { url: "https://huggingface.co/deepghs/waifu2x_onnx/resolve/main/20230131/onnx_models/cunet/art/noise2_scale2x.onnx", eps: ["wasm"] },
  swin: { url: "https://huggingface.co/Xenova/swin2SR-compressed-sr-x4-48/resolve/main/onnx/model.onnx", eps: ["webgpu", "wasm"] },
  pidi: { url: "https://huggingface.co/bdck/PiDiNet_ONNX/resolve/main/table5_pidinet_tiny.onnx", data: "https://huggingface.co/bdck/PiDiNet_ONNX/resolve/main/table5_pidinet_tiny.onnx.data", eps: ["wasm"] }
};
const MAXDIM = 1536;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

let ortPromise;
const sessions = new Map();

function loadOrt() {
  ortPromise ||= import(ORT_DIST + "ort.webgpu.min.mjs").then(ort => {
    ort.env.wasm.wasmPaths = ORT_DIST;
    ort.env.wasm.numThreads = Math.min(8, navigator.hardwareConcurrency || 1);
    ort.env.logLevel = "error";
    return ort;
  });
  return ortPromise;
}

async function fetchBytes(url) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

function session(key) {
  if (!sessions.has(key)) {
    sessions.set(key, (async () => {
      const ort = await loadOrt();
      const m = MODELS[key];
      const options = { executionProviders: m.eps, logSeverityLevel: 4 };
      if (m.data) options.externalData = [{ path: m.data.split("/").pop(), data: await fetchBytes(m.data) }];
      return ort.InferenceSession.create(await fetchBytes(m.url), options);
    })());
  }
  return sessions.get(key);
}

async function working(image) {
  const s = Math.min(1, MAXDIM / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
  const px = await toPixels(await createImageBitmap(image), w, h);
  const n = w * h, planes = new Float32Array(3 * n), alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const a = px.data[4 * i + 3] / 255;
    alpha[i] = px.data[4 * i + 3];
    for (let c = 0; c < 3; c++) planes[c * n + i] = (px.data[4 * i + c] * a + 255 * (1 - a)) / 255;
  }
  return { w, h, planes, alpha, px };
}

function toImageData({ w, h, alpha, px }, planes) {
  const n = w * h, out = new ImageData(w, h);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(Math.min(1, Math.max(0, planes[c * n + i])) * 255);
      out.data[4 * i + c] = alpha[i] === 0 ? px.data[4 * i + c] : v;
    }
    out.data[4 * i + 3] = alpha[i];
  }
  return out;
}

const reflect = (i, n) => {
  if (n === 1) return 0;
  const p = 2 * n - 2;
  i = ((i % p) + p) % p;
  return i < n ? i : p - i;
};

async function tiled({ w, h, planes }, spec, run) {
  const { core, pad, scale } = spec;
  const T = core + 2 * pad, n = w * h, result = new Float32Array(3 * n);
  for (let ty = 0; ty * core < h; ty++) {
    for (let tx = 0; tx * core < w; tx++) {
      const input = new Float32Array(3 * T * T);
      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < T; y++) {
          const sy = reflect(ty * core - pad + y, h);
          for (let x = 0; x < T; x++) input[c * T * T + y * T + x] = planes[c * n + sy * w + reflect(tx * core - pad + x, w)];
        }
      }
      const { data, size, crop } = await run(input, T);
      const area = scale * scale;
      for (let c = 0; c < 3; c++) {
        for (let oy = 0; oy < core && ty * core + oy < h; oy++) {
          for (let ox = 0; ox < core && tx * core + ox < w; ox++) {
            let sum = 0;
            for (let dy = 0; dy < scale; dy++) {
              const row = c * size * size + (crop + oy * scale + dy) * size + crop + ox * scale;
              for (let dx = 0; dx < scale; dx++) sum += data[row + dx];
            }
            result[c * n + (ty * core + oy) * w + tx * core + ox] = sum / area;
          }
        }
      }
    }
  }
  return result;
}

async function superres(key, spec, field, image) {
  const ort = await loadOrt(), sess = await session(key), src = await working(image);
  const out = await tiled(src, spec, async (input, T) => {
    const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, T, T]) });
    const t = r[field], data = await t.getData();
    const size = t.dims[3];
    return { data, size, crop: spec.crop };
  });
  return toImageData(src, out);
}

function blurred(src, radius) {
  const c = new OffscreenCanvas(src.w, src.h), x = c.getContext("2d", { willReadFrequently: true });
  const flat = new OffscreenCanvas(src.w, src.h), fx = flat.getContext("2d");
  fx.putImageData(toImageData(src, src.planes), 0, 0);
  x.filter = `blur(${radius}px)`;
  x.drawImage(flat, 0, 0);
  return x.getImageData(0, 0, src.w, src.h).data;
}

async function edgeMap(src) {
  const ort = await loadOrt(), sess = await session("pidi"), { w, h } = src, n = w * h;
  const input = new Float32Array(3 * n);
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) input[c * n + i] = (src.planes[c * n + i] - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
  const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]) });
  const e = Float32Array.from(await r.fused.getData());
  const sorted = Float32Array.from(e).sort();
  const hi = Math.max(1e-6, sorted[Math.floor(0.99 * (n - 1))]);
  for (let i = 0; i < n; i++) e[i] = Math.min(1, e[i] / hi);
  return e;
}

async function edgeModulated(image, mode) {
  const src = await working(image), n = src.w * src.h;
  const e = mode === "flat" ? new Float32Array(n).fill(1) : await edgeMap(src);
  const b = blurred(src, mode === "smooth" ? 1.5 : 1.2), out = new Float32Array(3 * n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) {
      const o = src.planes[c * n + i], bl = b[4 * i + c] / 255;
      out[c * n + i] = mode === "smooth" ? e[i] * o + (1 - e[i]) * bl : o + 1.0 * e[i] * (o - bl);
    }
  }
  return toImageData(src, out);
}

const withSourceFrame = async (image, processed) => {
  const svg = await base.auto(processed);
  return svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);
};

export default {
  auto: base.auto,
  waifu: async image => withSourceFrame(image, await superres("waifu", { core: 220, pad: 18, scale: 2, crop: 0 }, "y", image)),
  swin: async image => withSourceFrame(image, await superres("swin", { core: 80, pad: 8, scale: 4, crop: 32 }, "reconstruction", image)),
  "pidi-smooth": async image => withSourceFrame(image, await edgeModulated(image, "smooth")),
  "pidi-sharp": async image => withSourceFrame(image, await edgeModulated(image, "sharp")),
  "unsharp-flat": async image => withSourceFrame(image, await edgeModulated(image, "flat"))
};
