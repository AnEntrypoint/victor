const DIST = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const CACHE_NAME = "victor-seg-v1";

const settings = {
  model: "edgetam",
  providers: ["webgpu", "wasm"],
  modelUrl: (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`
};

export function configureSeg(options) { Object.assign(settings, options); }

const MODELS = {
  edgetam: {
    repo: "onnx-community/EdgeTAM-ONNX",
    files: ["onnx/vision_encoder_fp16.onnx", "onnx/vision_encoder_fp16.onnx_data", "onnx/prompt_encoder_mask_decoder_fp16.onnx", "onnx/prompt_encoder_mask_decoder_fp16.onnx_data"],
    mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225]
  }
};

let ortPromise = null;
const sessions = new Map();

function loadOrt() {
  ortPromise ||= import(DIST + "ort.webgpu.min.mjs").then(ort => {
    ort.env.wasm.wasmPaths = DIST;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return ort;
  });
  return ortPromise;
}

async function fetchBytes(url) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch (e) { cache = null; }
  let response = cache ? await cache.match(url) : null;
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`model download failed ${response.status} ${url}`);
    if (cache) { try { await cache.put(url, response.clone()); } catch (e) { cache = null; } }
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function releaseOtherModels(repo) {
  for (const [key, session] of [...sessions]) {
    if (key.startsWith(repo + "/")) continue;
    sessions.delete(key);
    try { await session.release(); } catch (e) { sessions.delete(key); }
  }
}

async function openSession(ort, repo, file, hasData, providers) {
  const key = `${repo}/${file}/${providers.join()}`;
  if (sessions.has(key)) return sessions.get(key);
  await releaseOtherModels(repo);
  const model = await fetchBytes(settings.modelUrl(repo, file));
  const options = { executionProviders: providers };
  if (hasData) options.externalData = [{ path: file.split("/").pop() + "_data", data: await fetchBytes(settings.modelUrl(repo, file + "_data")) }];
  const session = await ort.InferenceSession.create(model, options);
  sessions.set(key, session);
  return session;
}

function flattenToCanvas(image, w, h) {
  const src = new OffscreenCanvas(image.width, image.height);
  src.getContext("2d").putImageData(image, 0, 0);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function planar(rgba, w, h, mean, std) {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
  }
  return out;
}

const sigmoid = v => 1 / (1 + Math.exp(-v));

function scaleProbabilities(prob, w, h, outW, outH) {
  const gray = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(prob[i] * 255)));
    gray.data[i * 4] = gray.data[i * 4 + 1] = gray.data[i * 4 + 2] = v;
    gray.data[i * 4 + 3] = 255;
  }
  const src = new OffscreenCanvas(w, h);
  src.getContext("2d").putImageData(gray, 0, 0);
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, outW, outH);
  const px = ctx.getImageData(0, 0, outW, outH).data;
  const out = new Uint8Array(outW * outH);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4] >= 128 ? 255 : 0;
  return out;
}

function boxBlur(values, w, h, r) {
  let src = values;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { sum += src[y * w + k]; n++; }
        tmp[y * w + x] = sum / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { sum += tmp[k * w + x]; n++; }
        dst[y * w + x] = sum / n;
      }
    }
    src = dst;
  }
  return src;
}

const SPECK_FRACTION = 0.004;
const GRID = [0.2, 0.35, 0.5, 0.65, 0.8];
const MIN_AREA = 0.03, MAX_AREA = 0.9;

async function runEdgetam(ort, image, spec, provider) {
  const [encFile, , decFile] = spec.files;
  const encoder = await openSession(ort, spec.repo, encFile, true, [provider]);
  const decoder = await openSession(ort, spec.repo, decFile, true, [provider]);
  const S = 1024, M = 256;
  const input = planar(flattenToCanvas(image, S, S), S, S, spec.mean, spec.std);
  const embeddings = await encoder.run({ [encoder.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, S, S]) });
  const feeds = Object.fromEntries(encoder.outputNames.map(n => [n, embeddings[n]]));
  const noBoxes = new ort.Tensor("float32", new Float32Array(0), [1, 0, 4]);
  const label = new ort.Tensor("int64", BigInt64Array.from([1n]), [1, 1, 1]);
  let best = null;
  for (const gy of GRID) {
    for (const gx of GRID) {
      const point = new ort.Tensor("float32", Float32Array.from([gx * S, gy * S]), [1, 1, 1, 2]);
      const out = await decoder.run({ ...feeds, input_points: point, input_labels: label, input_boxes: noBoxes });
      const iou = out.iou_scores.data, masks = out.pred_masks.data;
      for (let k = 0; k < 3; k++) {
        let area = 0;
        const off = k * M * M;
        for (let i = 0; i < M * M; i++) if (masks[off + i] > 0) area++;
        const frac = area / (M * M);
        if (frac < MIN_AREA || frac > MAX_AREA) continue;
        const score = iou[k] * (0.5 + Math.min(frac, 0.5));
        if (!best || score > best.score) best = { score, mask: Float32Array.from(masks.subarray(off, off + M * M)) };
      }
    }
  }
  if (!best) return new Uint8Array(image.width * image.height).fill(255);
  return scaleProbabilities(boxBlur(best.mask.map(sigmoid), M, M, 2), M, M, image.width, image.height);
}

const RUNNERS = { edgetam: runEdgetam };

import { CANDIDATES, EVAL_DIM, chooseParams, toPixels } from "./auto.js";
import { compare, combine } from "./metrics.js";

const RUN_TIMEOUT_MS = 90000;

function withTimeout(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("segmentation timed out")), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

let queue = Promise.resolve();

export function segmentSubject(rgbaImageData) {
  const job = queue.then(() => segmentNow(rgbaImageData));
  queue = job.catch(() => {});
  return job;
}

async function segmentNow(rgbaImageData) {
  const ort = await loadOrt();
  const spec = MODELS[settings.model];
  const providers = settings.providers;
  let last = null;
  for (const provider of providers) {
    try { return await withTimeout(RUNNERS[settings.model](ort, rgbaImageData, spec, provider), RUN_TIMEOUT_MS); }
    catch (e) { last = e; }
  }
  throw last;
}

function flipSmallRegions(mask, w, h, value, limit) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || mask[start] !== value) continue;
    let top = 0, count = 0;
    stack[top++] = start; seen[start] = 1;
    const members = [];
    while (top) {
      const p = stack[--top];
      count++;
      if (count <= limit) members.push(p);
      const x = p % w, y = (p - x) / w;
      if (x > 0 && !seen[p - 1] && mask[p - 1] === value) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && mask[p + 1] === value) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - w] && mask[p - w] === value) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && !seen[p + w] && mask[p + w] === value) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (count < limit) for (const p of members) mask[p] = 255 - value;
  }
}

function dropSpecks(mask, w, h) {
  const limit = Math.max(8, Math.round(w * h * SPECK_FRACTION));
  flipSmallRegions(mask, w, h, 255, limit);
  flipSmallRegions(mask, w, h, 0, limit);
}

function morph(mask, w, h, r, grow) {
  const pick = grow ? Math.max : Math.min;
  const init = grow ? 0 : 255;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = init;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, mask[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = init;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

function maskedCanvas(px, w, h, keep) {
  const data = new Uint8ClampedArray(px.data);
  for (let i = 0; i < keep.length; i++) if (!keep[i]) data[i * 4 + 3] = 0;
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
  return canvas;
}

async function traceRegion(canvas, w, h, trace, names) {
  const ranked = await chooseParams(canvas, w, h, trace, names);
  const px = await toPixels(canvas, w, h);
  const svg = await trace(new Uint8Array(px.data), w, h, CANDIDATES[ranked[0].name]);
  return { svg, choice: ranked[0].name, params: CANDIDATES[ranked[0].name] };
}

const innerSvg = svg => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const headSvg = svg => svg.match(/<svg[^>]*>/)[0];

async function rasterize(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } finally { URL.revokeObjectURL(url); }
}

async function scoreSegmented(source, w, h, trace, canvases, params, bytes) {
  const s = Math.min(1, EVAL_DIM / Math.max(w, h));
  const ew = Math.max(1, Math.round(w * s)), eh = Math.max(1, Math.round(h * s));
  const ref = await toPixels(source, ew, eh);
  const parts = await Promise.all(canvases.map(async (canvas, i) => {
    const px = await toPixels(canvas, ew, eh);
    return trace(new Uint8Array(px.data), ew, eh, params[i]);
  }));
  const svg = headSvg(parts[0]) + parts.map(innerSvg).join("") + "</svg>";
  const m = compare(ref.data, await rasterize(svg, ew, eh), ew, eh);
  return combine({ ...m, bytes });
}

export async function tracePlain(source, w, h, trace, names) {
  const ranked = await chooseParams(source, w, h, trace, names);
  const px = await toPixels(source, w, h);
  const svg = await trace(new Uint8Array(px.data), w, h, CANDIDATES[ranked[0].name]);
  return { svg, choice: ranked[0].name, score: ranked[0].score };
}

export async function traceSegmented(source, w, h, trace, { names, overlap = 1, mask: given, guard = true } = {}) {
  const px = await toPixels(source, w, h);
  const mask = given || await segmentSubject(px);
  dropSpecks(mask, w, h);
  let covered = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) covered++;
  const fraction = covered / mask.length;
  if (fraction < 0.01 || fraction > 0.99) return { ...(await tracePlain(source, w, h, trace, names)), used: "plain", fraction };
  const subjectKeep = morph(mask, w, h, overlap, true);
  const backgroundKeep = morph(mask, w, h, overlap + 1, false).map(v => 255 - v);
  const canvases = [maskedCanvas(px, w, h, backgroundKeep), maskedCanvas(px, w, h, subjectKeep)];
  const [background, subject] = await Promise.all(canvases.map(c => traceRegion(c, w, h, trace, names)));
  const svg = headSvg(background.svg) + innerSvg(background.svg) + "<g>" + innerSvg(subject.svg) + "</g></svg>";
  const result = { svg, used: "segments", fraction, background: background.choice, subject: subject.choice };
  if (!guard) return result;
  const plain = await tracePlain(source, w, h, trace, names);
  const segScore = (await scoreSegmented(source, w, h, trace, canvases, [background.params, subject.params], svg.length)).score;
  return segScore > plain.score ? { ...result, segScore, plainScore: plain.score } : { ...plain, used: "plain", fraction, segScore, plainScore: plain.score };
}
