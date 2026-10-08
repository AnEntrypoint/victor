# victor bench

Scores any vectorizer pipeline on output quality against a fixed corpus (`corpus/`, see `corpus/SOURCES.md`).

## Pipeline contract

A pipelines module default-exports `{ name: async (imageData) => svgString }`. `imageData` is a browser `ImageData` at the source resolution (straight alpha). The SVG is rasterized back to the source width and height; a pipeline that downscales internally is fine as long as the SVG scales to the same frame. `pipelines.js` holds the published pipeline (`../docs/pkg` wasm) with the `illustration` and `photo` presets copied from `docs/index.html`.

## Metrics

All comparisons flatten source and render over white, so transparency is judged against a white page.

- PSNR: dB over RGB, capped at 100.
- SSIM: BT.601 luma, gaussian 11x11 window, sigma 1.5, K1=0.01, K2=0.03, valid region only, mean of the map.
- dE00: mean CIEDE2000 over all pixels, sRGB (D65) converted to Lab; lower is better.
- Edge SSIM: the same SSIM applied to Sobel gradient magnitude of the luma, normalised to 0..255.
- Also recorded: SVG bytes (UTF-8), path count (`<path` occurrences), wall ms of the pipeline call only (rasterize and metrics excluded).

## Combined score

```
Q     = mean( SSIM, edgeSSIM, clamp((PSNR-10)/40), clamp(1 - dE00/25) )      in 0..1
score = 100 * Q / (1 + 0.25 * log2(1 + KB/100))
```

Quality dominates and size is a logarithmic penalty with 100 KB as the reference point: 10 KB costs about 3.5 percent, 100 KB 25 percent, 1 MB about 87 percent more divisor. A pipeline wins by reaching the same Q in fewer bytes, or higher Q at similar size. Per-image best preset is reported by score and by Q.

## Running

1. Static server rooted at the repo (wasm mime included, plus a `/__save` endpoint that writes into `bench/results` and `bench/corpus`): `node bench/serve.js` (port 8765, `PORT` env overrides). Start it with a background shell command.
2. Headless Chrome with remote debugging: `chrome --headless=new --remote-debugging-port=9250 --user-data-dir=C:/dev/victor/.chrome-prof`; `.gm/browser-config.json` points gm `cdp` at it.
3. Drive it with the gm `cdp` verb, see `run.cdp.txt` (opens `http://127.0.0.1:8765/bench/index.html?save=<tag>`, which runs every corpus image through every pipeline and writes `results/<tag>.json` and `results/<tag>.md`). Query parameters: `pipelines=<module path relative to bench/>`, `names=a,b`, `auto=0` (load only, then call `victorBench.runBench({pipelines, names, ids})` yourself).

Run images in one page sequentially; concurrent browser sessions compete for CPU and inflate `ms`.

Learned-preprocessing candidates live in `neural-pipelines.js` (`pipelines=./neural-pipelines.js`); results in `results/neural.md`. `serve.js` sends COOP/COEP so onnxruntime-web can use wasm threads.
