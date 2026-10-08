import init, { vectorize, Options } from "./pkg/victor.js";

const ready = init();

self.onmessage = async ({ data }) => {
  await ready;
  const { id, rgba, width, height, opts } = data;
  const o = new Options();
  Object.assign(o, opts);
  const t0 = performance.now();
  try {
    const svg = vectorize(new Uint8Array(rgba), width, height, o);
    self.postMessage({ id, svg, ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  } finally {
    o.free();
  }
};
