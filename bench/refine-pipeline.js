import init, { vectorize, refine_svg, Options } from "../docs/pkg/victor.js";
import { CANDIDATES, chooseParams, toPixels } from "../docs/auto.js";

const ready = init();
const FIELDS = {
  binary: "binary", stacked: "stacked", spline: "spline", filterSpeckle: "filter_speckle",
  colorPrecision: "color_precision", layerDifference: "layer_difference", cornerThreshold: "corner_threshold",
  lengthThreshold: "length_threshold", spliceThreshold: "splice_threshold", pathPrecision: "path_precision",
  smooth: "smooth", threshold: "threshold", gradients: "gradients", gradientGain: "gradient_gain",
  refine: "refine", refineIters: "refine_iters", refineMs: "refine_ms", refineGradients: "refine_gradients", refineSolid: "refine_solid", refineGain: "refine_gain",
  refineShape: "refine_shape", refineShapeIters: "refine_shape_iters", refineEdge: "refine_edge", refineLevels: "refine_levels", refineLr: "refine_lr", refineCap: "refine_cap", refineDead: "refine_dead", refinePrune: "refine_prune", refineDens: "refine_dens", refinePrecision: "refine_precision"
};

function options(params) {
  const o = new Options();
  o.max_iterations = 10;
  for (const [k, v] of Object.entries(params)) if (k in FIELDS) o[FIELDS[k]] = v;
  return o;
}

async function trace(rgba, w, h, params) {
  await ready;
  const o = options(params);
  try { return vectorize(rgba, w, h, o); } finally { o.free(); }
}

const bases = new Map();
globalThis.refineMs = {};

async function base(image) {
  const key = image.width + "x" + image.height + ":" + image.data.slice(0, 4096).reduce((a, b) => (a * 31 + b) >>> 0, 7);
  if (!bases.has(key)) {
    const t0 = performance.now();
    const bmp = await createImageBitmap(image);
    const ranked = await chooseParams(bmp, image.width, image.height, trace);
    const s = Math.min(1, 1536 / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
    const px = await toPixels(bmp, w, h);
    const rgba = new Uint8Array(px.data);
    const params = { ...CANDIDATES[ranked[0].name] };
    const svg = await trace(rgba, w, h, params);
    let alpha = false;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 128) { alpha = true; break; }
    bases.set(key, { svg, rgba, w, h, params, alpha, ms: performance.now() - t0 });
  }
  return bases.get(key);
}

const finish = (svg, image) => svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);

const variant = extra => async image => {
  await ready;
  const b = await base(image);
  if (!extra) return finish(b.svg, image);
  if (b.params.binary || b.params.gradients || b.alpha) return finish(b.svg, image);
  const o = options({ ...b.params, ...extra, refine: true });
  try {
    const t0 = performance.now();
    const svg = refine_svg(b.rgba, b.w, b.h, b.svg, o);
    globalThis.refineMs[image.width + "x" + image.height] = (globalThis.refineMs[image.width + "x" + image.height] || []).concat(Math.round(performance.now() - t0));
    return finish(svg, image);
  } finally { o.free(); }
};

const P = { refineGradients: false, refineShape: true, refinePrecision: 2, refineLevels: 1 };
const Q = { refineShape: true, refineLevels: 1, refineLr: 0.05, refineCap: 0.3, refineEdge: 25 };
const C = { refineGradients: false, refinePrecision: 1 };
const H = { ...Q, ...C, refineEdge: 60, refineDead: 0.3 };
const B5 = { ...Q, refinePrecision: 1, refineEdge: 60, refineDead: 0.5, refineCap: 1.5, refineLr: 0.2 };
export default {
  auto: variant(null),
  phase1: variant({ refineGradients: true, refineShape: false, refinePrecision: 0 }),
  c1g: variant({ refineGradients: true, refineShape: false, refinePrecision: 1 }),
  b5: variant({ ...B5, refineGradients: false }),
  b5g: variant({ ...B5, refineGradients: true, refineMs: 2500 }),
  b5g35: variant({ ...B5, refineGradients: true, refineMs: 3500 })
};
