# Victor

In-browser, serverless raster → SVG vectorizer. Nothing is uploaded: tracing runs in a Web Worker on a Rust/WASM core.

**Live:** https://anentrypoint.github.io/victor/

## Engine
- [visioncortex](https://github.com/visioncortex/vtracer) (the VTracer engine, MIT): O(n) hierarchical color clustering, stacked or cut-out layers, spline fitting. Chosen over Potrace (GPL, B&W only) and imagetracerjs (pure JS, slower, lower fidelity).
- Edge-preserving bilateral denoise pass before clustering (removes JPEG noise that fragments paths).
- Binary mode for line art; alpha-aware (transparent pixels are keyed out).
- ~170 KB wasm, UI is dependency-free static files in `docs/`.

## Build
`./build.sh` (Rust nightly with `wasm32-unknown-unknown`, `wasm-bindgen-cli`). Serve `docs/` statically.
