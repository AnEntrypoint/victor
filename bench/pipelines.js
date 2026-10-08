import init, { vectorize, Options } from "../docs/pkg/victor.js";

const PRESETS = {
  photo: { maxdim: 1536, smooth: 2, colorPrecision: 8, layerDifference: 8, filterSpeckle: 4, cornerThreshold: 180, lengthThreshold: 4, spliceThreshold: 45, stacked: true, spline: true, binary: false },
  illustration: { maxdim: 2048, smooth: 1, colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, stacked: true, spline: true, binary: false }
};

const ready = init();

function publishedPipeline(p) {
  return async (image) => {
    await ready;
    const s = Math.min(1, p.maxdim / Math.max(image.width, image.height));
    let rgba = image.data, w = image.width, h = image.height;
    if (s < 1) {
      w = Math.max(1, Math.round(image.width * s)); h = Math.max(1, Math.round(image.height * s));
      const src = new OffscreenCanvas(image.width, image.height);
      src.getContext("2d").putImageData(image, 0, 0);
      const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
      x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h);
      rgba = x.getImageData(0, 0, w, h).data;
    }
    const o = new Options();
    Object.assign(o, {
      binary: p.binary, stacked: p.stacked, spline: p.spline, filter_speckle: p.filterSpeckle,
      color_precision: p.colorPrecision, layer_difference: p.layerDifference, corner_threshold: p.cornerThreshold,
      length_threshold: p.lengthThreshold, splice_threshold: p.spliceThreshold, max_iterations: 10,
      path_precision: 2, smooth: p.smooth, threshold: 128
    });
    try { return vectorize(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h, o); }
    finally { o.free(); }
  };
}

export default {
  illustration: publishedPipeline(PRESETS.illustration),
  photo: publishedPipeline(PRESETS.photo)
};
