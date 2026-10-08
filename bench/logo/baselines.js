import init, { vectorize, Options } from "../../docs/pkg/victor.js";
import auto from "../auto-pipeline.js";
import refine from "../refine-pipeline.js";

const ready = init();

const VTRACER_DEFAULT = {
  binary: false, stacked: true, spline: true, filter_speckle: 4, color_precision: 6, layer_difference: 16,
  corner_threshold: 60, length_threshold: 4, splice_threshold: 45, path_precision: 2
};

async function fixed(image) {
  await ready;
  const o = new Options();
  o.max_iterations = 10;
  for (const [k, v] of Object.entries(VTRACER_DEFAULT)) o[k] = v;
  try { return vectorize(new Uint8Array(image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength)), image.width, image.height, o); } finally { o.free(); }
}

export default { "vtracer-fixed": fixed, auto: auto.auto, "refine-balanced": refine.balanced };
