export const SIZES = [128, 256, 512];
export const VARIANTS = ["clean", "jpeg70", "blur", "screenshot"];

export function svgAspect(text) {
  const el = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  const vb = (el.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[2] / vb[3];
  const w = parseFloat(el.getAttribute("width")), h = parseFloat(el.getAttribute("height"));
  return w > 0 && h > 0 ? w / h : 1;
}

export function fitSvg(text, w, h) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const el = doc.documentElement;
  if (!el.getAttribute("viewBox")) {
    const iw = parseFloat(el.getAttribute("width")), ih = parseFloat(el.getAttribute("height"));
    if (iw > 0 && ih > 0) el.setAttribute("viewBox", `0 0 ${iw} ${ih}`);
  }
  el.setAttribute("width", w);
  el.setAttribute("height", h);
  return new XMLSerializer().serializeToString(doc);
}

export function dimsFor(aspect, longSide) {
  return aspect >= 1 ? [longSide, Math.max(1, Math.round(longSide / aspect))] : [Math.max(1, Math.round(longSide * aspect)), longSide];
}

async function decode(svgText) {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export async function rasterSvg(text, w, h, background) {
  const img = await decode(fitSvg(text, w, h));
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
  if (background === "white") { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); }
  x.drawImage(img, 0, 0, w, h);
  return c;
}

const pixels = c => c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

export async function renderImageData(text, w, h) {
  return pixels(await rasterSvg(text, w, h, "white"));
}

function gaussian(img, sigma) {
  const { width: w, height: h, data } = img, r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const norm = k.reduce((x, y) => x + y, 0);
  for (let i = 0; i < k.length; i++) k[i] /= norm;
  const a = new Float32Array(w * h * 4), b = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const al = data[i * 4 + 3] / 255; a[i * 4] = data[i * 4] * al; a[i * 4 + 1] = data[i * 4 + 1] * al; a[i * 4 + 2] = data[i * 4 + 2] * al; a[i * 4 + 3] = data[i * 4 + 3]; }
  const pass = (src, dst, dx, dy) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let t = -r; t <= r; t++) {
        const xx = Math.min(w - 1, Math.max(0, x + t * dx)), yy = Math.min(h - 1, Math.max(0, y + t * dy));
        acc += src[(yy * w + xx) * 4 + c] * k[t + r];
      }
      dst[(y * w + x) * 4 + c] = acc;
    }
  };
  pass(a, b, 1, 0);
  pass(b, a, 0, 1);
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const al = a[i * 4 + 3], f = al > 0 ? 255 / al : 0;
    out.data[i * 4] = a[i * 4] * f; out.data[i * 4 + 1] = a[i * 4 + 1] * f; out.data[i * 4 + 2] = a[i * 4 + 2] * f; out.data[i * 4 + 3] = al;
  }
  return out;
}

export async function degrade(gtText, size, variant, background) {
  const [w, h] = dimsFor(svgAspect(gtText), size);
  if (variant === "jpeg70") {
    const c = await rasterSvg(gtText, w, h, "white");
    const bmp = await createImageBitmap(await c.convertToBlob({ type: "image/jpeg", quality: 0.7 }));
    const o = new OffscreenCanvas(w, h), x = o.getContext("2d", { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    return pixels(o);
  }
  const base = await rasterSvg(gtText, w, h, background);
  if (variant === "clean") return pixels(base);
  if (variant === "blur") return gaussian(pixels(base), 0.7);
  const o = new OffscreenCanvas(w, h), x = o.getContext("2d", { willReadFrequently: true });
  const small = new OffscreenCanvas(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  const sx = small.getContext("2d");
  sx.imageSmoothingQuality = "high";
  sx.drawImage(base, 0, 0, small.width, small.height);
  x.imageSmoothingQuality = "high";
  x.drawImage(small, 0, 0, w, h);
  return pixels(o);
}
