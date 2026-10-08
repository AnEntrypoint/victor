# Learned preprocessing vs auto

Models run through onnxruntime-web 1.22.0 in headless Chrome (wasm threads for waifu2x and PiDiNet, WebGPU for Swin2SR), the processed image feeds the unchanged auto selection and tracer, and the SVG is scored against the original. Each session re-ran the auto baseline for fair timing. tex-sand excluded.

Cells are delta score / delta Q versus auto.

| pipeline | logo | lineart | illustration | texture | photo | transparent | lowq-jpeg | mean dScore | mean dQ | ms per image | corpus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pidi-sharp | -0.1 / -0.003 | -0.1 / 0.002 | 0.2 / 0.013 | -0.8 / 0.001 | -0.7 / 0.027 | -0.1 / -0.001 | 5.0 / 0.113 | 0.17 | 0.018 | 8981 vs 6335 | 12 images |
| unsharp-flat | -0.2 / -0.003 | -0.2 / 0.005 | 0.2 / 0.031 | 0.0 / 0.000 | -0.5 / -0.026 | -0.1 / -0.001 | 6.1 / 0.157 | 0.34 | 0.012 | 8645 vs 6335 | 12 images |
| pidi-smooth | -0.4 / -0.004 | -3.3 / -0.131 | -1.1 / -0.041 | -0.0 / 0.000 | -0.3 / -0.057 | -0.0 / -0.000 | -0.4 / -0.057 | -0.91 | -0.048 | 7502 vs 6335 | 12 images |
| waifu | -0.3 / -0.002 | 0.0 / -0.000 | -0.0 / -0.002 | -1.1 / 0.001 | 0.5 / -0.007 | -0.0 / -0.000 | 0.1 / -0.039 | 0.01 | -0.006 | 43260 vs 5086 | 12 images |
| swin | -1.0 / -0.001 | n/a | -0.3 / -0.028 | n/a | n/a | -0.5 / -0.006 | -0.7 / -0.083 | -0.71 | -0.024 | 325498 vs 7462 | 5 images |

## Findings

- waifu2x cunet noise2_scale2x (2x output box-reduced to 1x): mean score +0.01, Q -0.006, 8.5x slower. No kind improves beyond noise; lowq-jpeg Q falls 0.039.
- Swin2SR compressed x4 (model.onnx fp32, fp16 fails to load in ort-web, 4x output box-reduced to 1x): worse on every kind measured, about 45x slower. Run on logo, illustration (kawa), transparent and lowq-jpeg only because of the cost.
- PiDiNet tiny edge-aware smoothing (blur where no edge): worse on lineart, illustration, photo and lowq-jpeg; smaller SVGs but Q drops 0.048 on average.
- PiDiNet edge-weighted unsharp: lowq-jpeg +5.0 score / +0.113 Q, mean +0.17. The flat unsharp control (blur radius 1.2 px, amount 1, no network) gives lowq-jpeg +6.1 / +0.157 and mean +0.35, so the learned edge map contributes nothing.
- Lead, not learned: a plain unsharp mask before tracing helps the single lowq-jpeg image (and illustration Q +0.03) at the cost of photo Q. One image is not enough to ship; needs more lowq samples.

WebGPU notes: waifu2x fails on WebGPU (Clip kernel), Swin2SR fp16 fails to create a session on both providers, PiDiNet needs its .onnx.data passed through externalData. serve.js now sends COOP/COEP headers so wasm threads work.

Verdict: no learned candidate clears +2 mean score or a clear lowq-jpeg/illustration gain over its non-learned control; nothing integrated into docs/.
