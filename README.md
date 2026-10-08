# Victor

In-browser, serverless raster → SVG vectorizer. Nothing is uploaded: tracing runs in a Web Worker on a Rust/WASM core.

**Live:** https://anentrypoint.github.io/victor/

## Pipeline
1. **Candidates:** five presets (`detailed`, `balanced`, `compact`, `smoothed`, `lineart`) are traced in parallel Web Workers on a 640 px copy.
2. **Closed loop:** each SVG is rendered back and scored (SSIM, edge SSIM, PSNR, CIEDE2000, SVG bytes; see `bench/README.md`). The best quality-per-byte candidate wins, subject to a quality floor and a size cap.
3. **Trace:** the winner is re-run at full resolution by the Rust/WASM engine ([visioncortex](https://github.com/visioncortex/vtracer), the VTracer engine, MIT).
4. **Differentiable refinement** (`crate/src/refine/`, in the spirit of Bezier Splatting / DiffVG / LIVE): the stacked paths are rasterized with exact anti-aliased coverage and optimised by Adam against the source: per-layer linear gradient fills, analytic boundary gradients on Bezier control points with an edge-snap term, byte-priced pruning of layers, and densification with new Bezier blobs at residual-error peaks. Quality select: fast / balanced / max, about 0.4 to 2.5 s per image.
5. **Optional neural subject separation** (EdgeTAM via onnxruntime-web, off by default).

## Measured (`bench/`, 12-image corpus, tex-sand excluded, same session)
| pipeline | mean score | mean Q | mean SVG |
|---|---|---|---|
| auto (closed-loop presets) | 45.65 | 0.656 | 1043 KB |
| + gradient refinement | 46.24 | 0.669 | 1052 KB |
| + control points, pruning, densification (balanced) | 49.47 | 0.671 | 474 KB |

Photos 28.3 to 36.8 and low-quality JPEG 31.4 to 39.8 gain the most; logos, line art, textures and transparent images skip refinement.

Tried and rejected because the benchmark said so: Real-ESRGAN 4x super-resolution, waifu2x / Swin2SR denoising and PiDiNet edge guidance before tracing (no gain), per-cluster closed-form gradients, cut-out layering, SIMD autovectorisation, coarse-to-fine. EdgeTAM subject separation gives +1.85, mostly one image, so it stays opt-in.

## Build
`./build.sh` (Rust nightly with `wasm32-unknown-unknown`, `wasm-bindgen-cli`). Serve `docs/` statically.
