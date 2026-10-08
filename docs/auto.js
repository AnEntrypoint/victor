import { compare, combine } from "./metrics.js";

const BASE = { smooth: 1, colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, stacked: true, spline: true, binary: false, pathPrecision: 1, gradients: false, gradientGain: 0.35, threshold: 128 };

export const CANDIDATES = {
  detailed: { ...BASE },
  balanced: { ...BASE, filterSpeckle: 8, colorPrecision: 5, layerDifference: 24 },
  compact: { ...BASE, filterSpeckle: 12, colorPrecision: 4, layerDifference: 32, lengthThreshold: 6 },
  smoothed: { ...BASE, smooth: 3, filterSpeckle: 8, colorPrecision: 5, layerDifference: 24 },
  lineart: { ...BASE, binary: true, stacked: false, smooth: 0, filterSpeckle: 2 }
};

export const EVAL_DIM = 640;
export const QUALITY_FLOOR = 0.85;
export const MAX_BYTES = 6 * 1024 * 1024;

export async function toPixels(source, w, h) {
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.drawImage(source, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

async function rasterize(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
    x.drawImage(img, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
  } finally { URL.revokeObjectURL(url); }
}

export async function chooseParams(source, srcW, srcH, trace, names = Object.keys(CANDIDATES)) {
  const s = Math.min(1, EVAL_DIM / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * s)), h = Math.max(1, Math.round(srcH * s));
  const ref = await toPixels(source, w, h);
  const scored = await Promise.all(names.map(async name => {
    const svg = await trace(new Uint8Array(ref.data), w, h, CANDIDATES[name]);
    const out = await rasterize(svg, w, h);
    const m = compare(ref.data, out, w, h);
    const bytes = svg.length / s;
    return { name, bytes, ...m, ...combine({ ...m, bytes }) };
  }));
  const floor = QUALITY_FLOOR * Math.max(...scored.map(r => r.quality));
  const eligible = r => (r.quality >= floor) + (r.bytes <= MAX_BYTES);
  scored.sort((a, b) => eligible(b) - eligible(a) || b.score - a.score);
  return scored;
}
