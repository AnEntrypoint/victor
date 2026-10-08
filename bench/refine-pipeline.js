import init, { vectorize, Options } from "../docs/pkg/victor.js";
import { CANDIDATES, chooseParams, toPixels } from "../docs/auto.js";

const ready = init();
const FIELDS = {
  binary: "binary", stacked: "stacked", spline: "spline", filterSpeckle: "filter_speckle",
  colorPrecision: "color_precision", layerDifference: "layer_difference", cornerThreshold: "corner_threshold",
  lengthThreshold: "length_threshold", spliceThreshold: "splice_threshold", pathPrecision: "path_precision",
  smooth: "smooth", threshold: "threshold", gradients: "gradients", gradientGain: "gradient_gain",
  refine: "refine", refineIters: "refine_iters", refineMs: "refine_ms", refineGradients: "refine_gradients", refineSolid: "refine_solid", refineGain: "refine_gain"
};

async function trace(rgba, w, h, params) {
  await ready;
  const o = new Options();
  o.max_iterations = 10;
  for (const [k, v] of Object.entries(params)) if (k in FIELDS) o[FIELDS[k]] = v;
  try { return vectorize(rgba, w, h, o); } finally { o.free(); }
}

const variant = extra => async image => {
  const bmp = await createImageBitmap(image);
  const ranked = await chooseParams(bmp, image.width, image.height, trace);
  const s = Math.min(1, 1536 / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
  const px = await toPixels(bmp, w, h);
  const svg = await trace(new Uint8Array(px.data), w, h, { ...CANDIDATES[ranked[0].name], ...extra });
  return svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);
};

export default {
  auto: variant({}),
  "refine-solid": variant({ refine: true, refineGradients: false, refineSolid: true }),
  "refine-grad": variant({ refine: true, refineGradients: true }),
  "refine-grad150": variant({ refine: true, refineGradients: true, refineGain: 150 }),
  "refine-grad60-i250": variant({ refine: true, refineGradients: true, refineGain: 60, refineIters: 250, refineMs: 3000 })
};
