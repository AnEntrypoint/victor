# Victor

In-browser, serverless raster → SVG vectorizer. Nothing is uploaded: tracing runs in a Web Worker on a Rust/WASM core.

**Live:** https://anentrypoint.github.io/victor/

## Pipeline
1. **Candidates:** five presets (`detailed`, `balanced`, `compact`, `smoothed`, `lineart`) are traced in parallel Web Workers on a 640 px copy.
2. **Closed loop:** each SVG is rendered back and scored (SSIM, edge SSIM, PSNR, CIEDE2000, SVG bytes; see `bench/README.md`). The best quality-per-byte candidate wins, subject to a quality floor (85% of the best candidate's quality) and a size cap, so a flat rectangle can't win on size alone.
3. **Final trace:** the winner is re-run at full resolution.
4. **Engine:** [visioncortex](https://github.com/visioncortex/vtracer) (the VTracer engine, MIT) in Rust/WASM, with a bilateral denoise pre-pass, alpha keying and spline fitting. About 170 KB of wasm; the UI is dependency-free static files in `docs/`.

## Measured, not assumed (`bench/`, 13-image corpus)
| pipeline | mean score | mean Q | mean SVG |
|---|---|---|---|
| v1 published (fixed presets) | 39.4 | 0.657 | 6.8 MB |
| auto (this) | 43.0 | 0.633 | 3.1 MB |

Tried and rejected because the benchmark said so: 4x Real-ESRGAN super-resolution before tracing (lower quality on every image kind, 15 s), per-region linear gradient fills (no gain; the option remains in the core, off by default), cut-out layering (larger and worse).

## Build
`./build.sh` (Rust nightly with `wasm32-unknown-unknown`, `wasm-bindgen-cli`). Serve `docs/` statically.
