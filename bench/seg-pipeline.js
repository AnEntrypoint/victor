import init, { vectorize, Options } from "../docs/pkg/victor.js";
import { configureSeg, tracePlain, traceSegmented } from "../docs/seg.js";

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

const MAX_DIM = 1536;

function frame(image) {
  const s = Math.min(1, MAX_DIM / Math.max(image.width, image.height));
  return { w: Math.max(1, Math.round(image.width * s)), h: Math.max(1, Math.round(image.height * s)) };
}

const fitToSource = (svg, image) => svg.replace(/width="\d+" height="\d+"/, `width="${image.width}" height="${image.height}"`);

export async function traceWithSegments(image, options = {}) {
  const bmp = await createImageBitmap(image);
  const { w, h } = frame(image);
  const result = await traceSegmented(bmp, w, h, trace, options);
  traceWithSegments.last = { used: result.used, fraction: result.fraction, background: result.background, subject: result.subject, segScore: result.segScore, plainScore: result.plainScore };
  return fitToSource(result.svg, image);
}

export function useModel(options) { configureSeg(options); }

export default {
  auto: async image => {
    const bmp = await createImageBitmap(image);
    const { w, h } = frame(image);
    return fitToSource((await tracePlain(bmp, w, h, trace)).svg, image);
  },
  segments: image => traceWithSegments(image)
};
