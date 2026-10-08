# Logo / icon / flat-design ground-truth benchmark

The main bench scores a vectorisation against the raster it was given. For logos that is the wrong judge: the raster is itself an approximation of an exact vector. This bench starts from real vector sources, degrades them into raster inputs, runs a pipeline, and scores the output SVG against the original vector.

## Layout

- `gt/` and `manifest.json`: 46 original SVGs (about 78 KB). Licences and origins per file in `SOURCES.md`.
- `degrade.js`: browser module. Rasterises a ground-truth SVG with the browser renderer and produces the input variants.
- `score.js`: scoring functions. They take pixel arrays and SVG strings; the SVG-parsing parts (`svgPalette`, `nodeStats`) need `DOMParser`, so they run in the page.
- `run.js`, `index.html`: in-page runner. `baselines.js`: baseline pipelines.
- `report.js`: Node aggregator for the raw result files.
- `results/raw-*.json`: per-image records. `results/baseline.{json,md}`: aggregated tables.

## Corpus

46 files, kinds assigned heuristically at download time: glyph 16 (single-colour fills: simple-icons, Material, Bootstrap), stroke 7 (Lucide, Tabler: thin lines, round caps), flat-multi 7 (Twemoji, flags, YouTube mark), gradient 10 (Tango-style icons, Telegram, GroupMe, Cosmic, Avid, Windows 11, shutdown button, round button), text 6 (wordmarks: HBO, Visa, Buick, Le Coq Sportif, Letterboxd, Windows). Items alternate between a transparent and a white background (even index transparent), except the JPEG variant, which is always on white.

## Degradations

Sizes (long side): 128, 256, 512. Variants: `clean` (anti-aliased render), `jpeg70` (canvas JPEG quality 0.7 re-encode on white), `blur` (canvas `blur(0.7px)`), `screenshot` (render, halve, scale back up 2x with bilinear smoothing). 12 inputs per logo, 552 in total.

## Pipeline contract

A module whose default export is `{ name: async (imageData) => svgString }`. Run with `index.html?pipelines=./mod.js&names=a,b&items=id1,id2&sizes=128,256&variants=clean&tag=mytag`. The page saves `results/raw-<tag>.json` through the bench server (`node bench/serve.js`) and sets `window.logoDone`.

## Metrics

Ground truth and output are both rendered at 1024 px long side over white (aspect from the ground-truth viewBox; the output SVG is forced to the same box).

1. Pixel: PSNR, SSIM (luma), CIEDE2000 mean, edge-SSIM, from `docs/metrics.js`.
2. Boundary accuracy: edge pixels are pixels adjacent to a neighbour with max-channel difference over 24; exact Euclidean distance transforms give, for every ground-truth edge pixel, the distance to the nearest output edge pixel and the reverse. The two sets are pooled; mean and 95th percentile are reported in px at 1024. Distances are capped at 64 px, so a missing or hallucinated structure costs 64 rather than infinity.
3. Palette accuracy, read from the SVG source: solid fill and stroke colours (inherited, `style`, `currentColor` and named colours resolved, `fill-opacity` 0 and hidden `defs` content ignored) and gradient stop colours. Reported: number of distinct solid colours, out/gt ratio, and the mean and max CIEDE2000 from each ground-truth colour (solid or stop) to the nearest output colour.
4. Node economy: anchors (path segments plus move-tos; rect 4, rounded rect 8, circle and ellipse 4, line 2, polygon points), path/shape element count, SVG byte size, each as an out/gt ratio.

Regularity (anchors on true lines or circles) is not measured.

## Fidelity score (0 to 100)

```
sBoundary = 0.5 exp(-mean px) + 0.5 exp(-p95 px / 4)
sPalette  = 0.5 exp(-palette dE / 4) + 0.5 min(r, 1/r),   r = out solid colours / gt solid colours
sSsim     = clamp((SSIM@1024 - 0.7) / 0.3)
sNodes    = 1 / (1 + 0.5 max(0, log2(anchor ratio)))
fidelity  = 100 (0.40 sBoundary + 0.25 sPalette + 0.35 sSsim) sNodes
```

Boundary carries the most weight because crisp, correctly placed edges are the point. The node term only penalises more anchors than the original (ratio above 1); it never rewards dropping detail, since boundary and SSIM catch that.

## Baselines

`baselines.js` exports `vtracer-fixed` (the VTracer default preset through the same wasm, no auto-selection), `auto` (`bench/auto-pipeline.js`) and `refine-balanced` (`bench/refine-pipeline.js` balanced preset). Run per size and variant, then:

```
node bench/logo/report.js
```

Results: `results/baseline.md`.
