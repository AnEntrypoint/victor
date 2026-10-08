import init, { vectorize, Options } from "../docs/pkg/victor.js";
import { CANDIDATES, chooseParams, toPixels } from "../docs/auto.js";

const ready = init();
const FIELDS = {
  binary: "binary", stacked: "stacked", spline: "spline", filterSpeckle: "filter_speckle",
  colorPrecision: "color_precision", layerDifference: "layer_difference", cornerThreshold: "corner_threshold",
  lengthThreshold: "length_threshold", spliceThreshold: "splice_threshold", pathPrecision: "path_precision",
  smooth: "smooth", threshold: "threshold", gradients: "gradients", gradientGain: "gradient_gain"
};

async function trace(rgba, w, h, params) {
  await ready;
  const o = new Options();
  o.max_iterations = 10;
  for (const [k, v] of Object.entries(params)) if (k in FIELDS) o[FIELDS[k]] = v;
  try { return vectorize(rgba, w, h, o); } finally { o.free(); }
}

async function auto(image, maxdim = 1536, names) {
  const bmp = await createImageBitmap(image);
  const ranked = await chooseParams(bmp, image.width, image.height, trace, names);
  const s = Math.min(1, maxdim / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
  const px = await toPixels(bmp, w, h);
  const svg = await trace(new Uint8Array(px.data), w, h, CANDIDATES[ranked[0].name]);
  return svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);
}

export default { auto: image => auto(image), "fixed-balanced": async image => {
  const bmp = await createImageBitmap(image);
  const s = Math.min(1, 1536 / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
  const px = await toPixels(bmp, w, h);
  const svg = await trace(new Uint8Array(px.data), w, h, CANDIDATES.balanced);
  return svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);
} };
