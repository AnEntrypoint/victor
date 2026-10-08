import init, { vectorize, Options } from "./pkg/victor.js";

const ready = init();

const FIELDS = {
  binary: "binary", stacked: "stacked", spline: "spline", filterSpeckle: "filter_speckle",
  colorPrecision: "color_precision", layerDifference: "layer_difference", cornerThreshold: "corner_threshold",
  lengthThreshold: "length_threshold", spliceThreshold: "splice_threshold", pathPrecision: "path_precision",
  smooth: "smooth", threshold: "threshold", gradients: "gradients", gradientGain: "gradient_gain"
};

self.onmessage = async ({ data }) => {
  await ready;
  const { id, rgba, width, height, params } = data;
  const o = new Options();
  o.max_iterations = 10;
  for (const [k, v] of Object.entries(params)) if (k in FIELDS) o[FIELDS[k]] = v;
  const t0 = performance.now();
  try {
    self.postMessage({ id, svg: vectorize(new Uint8Array(rgba), width, height, o), ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  } finally {
    o.free();
  }
};
