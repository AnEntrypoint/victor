# Exact-intent vectorization of logos, icons and flat designs: research and recommended browser pipeline

Date 2026-10-08. Research only. Tags: [M] = measured by a source on stated inputs, [C] = claimed/marketing/abstract only, [I] = my inference or recipe, not in any source. Sources that could not be read in full are named in "Gaps".

## 1. Key findings

1. The strongest evidence for "exact" output is the coverage-measurement approach: treat a boundary pixel as `pixel = t*A + (1-t)*B`, recover `t` per palette colour, take the 0.5 iso-line, fit lines/primitives, intersect lines for corners, and pick the simplest candidate whose re-rasterisation matches the measured coverage. Open Vectorizer (MIT, Rust+WASM) implements exactly this and reports on synthetic known-geometry cases [M]: circle 1 node, 0.0026 px geometry error, accuracy 0.99991; rotated square corners within 0.2 px; vs potrace on an ideal thresholded mask: circle 5 nodes, 0.99801; 24px icon 1 node / 0.99705 vs 5 nodes / 0.97926. Caveat from its own README: synthetic geometric cases only, no gradients, no stroke recovery, no real-logo corpus, 2-4x slower than VTracer. https://github.com/vardirhq/open-vectorizer (README, MIT per LICENSE), https://raw.githubusercontent.com/vardirhq/open-vectorizer/main/docs/ARCHITECTURE.md
2. Thresholding AA discards the information: potrace on bilevel masks lands boundaries up to half a pixel inside (area errors -56..-113 px on the small shapes) [M, same README table].
3. vectorizer.ai publicly claims [C]: whole-shape fitting (circles, ellipses, rounded rects, stars, rotation), lines + circular/elliptical arcs + quadratic/cubic Beziers, per-corner analysis, mirror and rotational symmetry, sub-pixel boundaries placed from AA pixel values, deep-learning plus classical hybrid, "neighbouring shapes perfectly aligned", auto palette size. No gradient or gap-free method claims, no paper. https://vectorizer.ai/
4. Learned clip-art deblurring exists: Yang et al. EG 2023 take a low-res AA raster (target 100x100 or less), predict a low-blur 2x image with a network, then a discrete partitioning step produces a compact palette; user study preferred 75 to 8.5 over best alternative [M, project page]; typical AA inputs have 100-200 distinct colours vs about a dozen in the source vector [M, paper]. Code "coming soon", no licence stated; not browser ready. https://www.cs.ubc.ca/labs/imager/tr/2022/SubpixelDeblurring/ , https://diglib.eg.org/bitstream/handle/10.1111/cgf14744/v42i2pp061-076_cgf14744.pdf
5. Learned vectorisers are not exact: VectorArk (Adobe, May 2026) predicts rounded polygons (lines+arcs) with a VLM, trains with a degradation model (downscale to 224-336 px, random Gaussian blur, noise on control points) and reports MSE about 0.004-0.04 on easy/hard tiers and Chamfer distance as a geometry metric [M]; needs a VLM, not browser-sized. https://arxiv.org/pdf/2605.24398
6. DiffVG/LIVE-style optimisation is slow and non-exact: LIVE 1080x1920 first layer 200 iters on RTX 3090 Ti took 212 s, 28 layers about 2 h [M, via review]; LIVE handles gradients poorly; SGLIVE (Zhou 2024) adds radial gradient fills, PSNR on Noto/Fluent emoji 256 paths, Iconfont 512 paths. https://arxiv.org/pdf/2408.15741 , https://openaccess.thecvf.com/content/CVPR2022/html/Ma_Towards_Layer-Wise_Image_Vectorization_CVPR_2022_paper.html . This repo already has a differentiable gradient refinement stage (see git log).

## 2. Per-topic recipes

### (1) Sub-pixel boundary extraction
- Soft colour segmentation: Aksoy et al. TOG 2017 "sparse colour unmixing": alpha-add layers `sum alpha_i = 1`, per-pixel energy = colour-model unmixing cost + sparsity term (weight 10 in their implementation), then matte regularisation by guided filter and colour refinement; per-pixel and parallelisable (box filters) [M, paper text]. https://la.disneyresearch.com/wp-content/uploads/Unmixing-Based-Soft-Color-Segmentation-for-Image-Manipulation-Paper.pdf , https://yaksoy.github.io/scs/ (no code/licence on page). For flat logos a cheap 2-colour projection (Open Vectorizer's `field`: pick palette pair whose segment passes closest to the pixel, `t` = projection) is sufficient and exact for 2-region pixels; fields sum to 1 [M]. Use full unmixing only at 3-colour junction pixels [I].
- Contour: marching squares at 0.5 with linear interpolation; saddles resolved by cell centre; zero-pad border one sample [M, ARCHITECTURE.md].
- Do the maths in linear light, premultiplied alpha (source states compositing is linear in premultiplied alpha) [C/M].
- Deconvolution of the AA filter: no source gives a closed-form inverse; Yang 2023 uses a learned net. The coverage model sidesteps it for box-filter AA; for resampled/blurred inputs expect a systematic radius bias [I].

### (2) Exact flat palette
- Build the palette only from interior pixels (pixel matches its 4 neighbours within tolerance), then median cut, then agglomerative merge (chain-merge near colours, e.g. 197/199/201/203) so AA blends never take palette slots [M, ARCHITECTURE.md]. Documented weakness: an absolute flatness test leaks blends on low-contrast edges; use a relative test [I].
- Cluster in OKLab (VTracer snaps to a palette via nearest OKLab, 1.0 framework) [M]. https://github.com/visioncortex/vtracer
- JPEG damage [I]: pre-denoise only for palette estimation (edge-preserving, e.g. median or bilateral on 8x8-block ringing), then keep original pixels for coverage; snap each region mean to the mode (histogram peak, mean-shift) of its interior, not the mean, so ringing does not shift the colour.

### (3) Corners and curve fitting
- Potrace (Selinger 2003): bitmap to paths, optimal polygon (min segments, tie-break on penalty = path length times distance of path points to the segment), then corner/smooth decision per vertex by alpha vs `alphamax`, then optional curve merge (`opticurve`). Defaults: alphamax 1.0 (range 0 = polygon to 1.3334 = no corners), opttolerance 0.2, turdsize 2 [M]. https://potrace.sourceforge.net/potracelib.pdf , https://potrace.sourceforge.net/potrace.pdf . Bezier handle alpha clamped to 0.55..1 in the paper [M]. Licence GPL (not verified by me here) [I].
- Open Vectorizer corner test: turn angle over window d vs 2d; ratio about 1.0 = corner, about 0.5 = arc, scale invariant [M]. Corner position = intersection of lines fitted from the run interiors (chamfer trimmed), not a traced vertex [M]. Then Schneider least-squares cubic with Newton reparameterisation [M, ARCHITECTURE.md].
- VTracer: stacked vs cutout, corner_threshold 60, segment_length 4, splice_threshold 45, `--simplify` refits runs with fewest cubics in a pixel tolerance, `filter_speckle` 0..128 [M, README]. https://github.com/visioncortex/vtracer
- Silhouette vectorisation by affine scale-space: control points from curvature extrema at sub-pixel level tracked through affine scale space, least-squares cubics, perfect circles when no extrema; fewer control points than other software at bounded Hausdorff [C, abstract]. https://arxiv.org/pdf/2007.12117
- PolyFit (Dominici 2020): intermediate polygon, learned mapping polygon-to-primitive configuration, global G1/C0 spline; runs 0.5-1.2 s per image; preferred 3x over closest competitor [M, user study]. Hoshyari 2018: learned metric for perceived discontinuities drives joint spline fitting and corner detection. https://www.cs.ubc.ca/~lsigal/Publications/dominici2020siggraph.pdf , https://www.cs.ubc.ca/labs/imager/tr/2018/PerceptionDrivenVectorization/
- Kopf-Lischinski depixelising targets aliased pixel art (similarity graph, cell reshaping, spline contours); not designed for AA input [C, abstract]. https://johanneskopf.de/publications/pixelart/
- Adobe Image Trace: Paths/Corners/Noise sliders, Abutting (cutout) vs Overlapping (stacked); no published algorithm [C, tutorials]. Not a source of numbers.

### (4) Primitives and symmetry
- Open Vectorizer: circle by Kasa algebraic fit then Landau fixed-point refinement; ellipse by area-moment matching; rect from a 4-line contour, axis-aligned only; each candidate rasterised and scored, simplest passing wins, primitives win ties; error budget scales with shape size (half a pixel is negligible at 200 px and is the whole shape at 4 px); acceptance floor taken from path candidates only so a bad primitive cannot lower the bar [M]. Thresholds are not published (read source).
- Ellipse via arc grouping + RANSAC: Mai et al. Pattern Recognition 2008 (hierarchical ellipse extraction) [C via search]. For rounded rect: detect 4 lines + 4 arcs with equal radius and G1 joins, emit `<rect rx ry>` (Open Vectorizer lists this as TODO) [M/I].
- Symmetry: only claimed by vectorizer.ai [C]. Recipe [I]: after fitting, test mirror/rotation of the vertex+primitive set about the bbox centre and principal axes; if residual < budget, symmetrise by averaging mirrored pairs.

### (5) Gap-free layering
- VTracer `cutout` = seam-free tessellation with shared boundaries; `stacked` = overlapping layers [M]. Illustrator Abutting vs Overlapping [C]. vectorizer.ai: "neighbouring shapes perfectly aligned" [C].
- Recipe [I]: fit each shared boundary once (planar map edge list), reuse the same fitted path (reversed) for both neighbours; emit stacked: background largest-area first, each upper region closed on its own full outline (including the part overlapping the layer below). Stacking removes AA seams for free; keep shared-edge fit so the visible boundary is one curve. Open Vectorizer paints larger-coverage colours first [M].

### (6) Gradients
- No open implementation found for exact linear/radial recovery; Open Vectorizer lists it as unsolved and outputs bands [M]. SGLIVE gets radial gradients by optimisation with a gradient-aware segmentation (difference, filter, binarise, close) [M, paper]. 
- Recipe [I]: for each flat-fit region with large residual, least-squares fit `c(p) = c0 + g.(p)` (affine in x,y, per channel); accept linear if residual RMS < ~1.5 levels after JPEG denoise, else test radial by fitting `c = f(|p-q|)`; reject if banding steps are constant-width plateaus (posterised). Stops from the 1D profile along the gradient axis, snapped to few stops by Ramer-Douglas-Peucker on the profile. The existing repo refinement stage can polish stops.

### (7) Text and wordmarks
- Open Vectorizer: no text recognition, glyphs are vectorised as shapes (usually what you want) [M]. Keep glyph holes (even-odd) and fit corners aggressively; no font matching [I].

### (8) SR/deblurring priors
- Evidence is thin. Vendor/glossary sources warn generative SR hallucinates detail, critical for text/logos [C]: https://ai-solutions.daviesmeyer.com/en/glossary/super-resolution . The only learned prior purpose-built for AA clip-art is Yang 2023 (2x, palette-compact) [M, user study], not packaged. Recommendation: no generic SR before tracing; the coverage model already extracts sub-pixel information; keep any learned step optional and verified by re-rasterising against the source.
- Classical vectorisers degrade with low-res input; VectorArk notes this and trains on degraded inputs [M/C].

### (9) Evaluation
- Open Vectorizer: accuracy = 1 - mean absolute coverage error after re-rasterising; nodes; geometry error px vs ground truth [M]. VectorArk: LPIPS, SSIM, DINO, MSE, Chamfer distance [M]. SGLIVE: PSNR at fixed path counts [M]. Silhouette paper: Hausdorff bound [C]. Add: palette colour error (dE in OKLab between output and ground-truth palette), node count vs original SVG, and symmetric boundary Hausdorff/chamfer [I]. Synthetic ground truth (rasterise known SVG with AA, then JPEG q70-90) is the only way to get exactness numbers; reported node-count and accuracy must be read together [M, README].

## 3. Recommended pipeline (ranked by value per effort)

1. Decode; if JPEG-like, estimate noise; denoised copy for palette/segmentation only; keep original for coverage. [I]
2. Interior-pixel palette: interior mask (4-neighbour agreement), OKLab median-cut/k-means, chain merge (dE about 2-3 JND), snap each colour to interior mode. [M for interior+merge; I for numbers]
3. Region labelling: per-pixel argmax coverage after step 4; remove regions < `filter_speckle` (VTracer 0..128; Potrace turdsize 2) except thin strokes (sub-pixel features need coverage evidence). [M]
4. Per-colour coverage fields with pair projection `t` (Aksoy-style sparsity only at junctions). [M/I]
5. Contours at 0.5 (marching squares, saddle by centre), shared-edge planar map. [M]
6. Corner detection: angle ratio d vs 2d (about 1 corner, about 0.5 arc), plus Potrace alphamax 1.0 test as fallback. [M]
7. Fit lines from run interiors, intersect for vertices; fit circular/elliptical arcs; Schneider cubics elsewhere; opttolerance about 0.2 px merge. [M]
8. Primitive hypotheses (circle, ellipse, rect, rounded rect, line, symmetry), render-back score, simplest wins; scale-aware budget. [M for scoring, I for rounded rect/symmetry]
9. Gradient pass on high-residual regions (linear, then radial); else leave bands. [I]
10. Emit stacked layers, largest first, shared-edge paths reused, `<circle/ellipse/rect>` where accepted, 2 decimals max. [M/I]
11. Optional: repo differentiable refinement and byte-priced pruning as final polish only if the render-back score improves. [existing repo]

Failure modes and fixes: low-contrast adjacent colours leak blends into palette (use relative flatness test); tiny shapes (<5 px) fail circle/rect gates (scale budget to size); JPEG ringing creates phantom 1-2 level regions (denoised palette, merge); thin lines under 1 px (keep as stroke candidates, coverage not binarisation); junction pixels with 3 colours (unmix, do not project to 2); gradients turning into bands (step 9); font glyph serifs rounded by arc fitting (corner ratio test first).

## 4. Reference implementations

| Project | Licence | Lang | Use |
|---|---|---|---|
| Open Vectorizer https://github.com/vardirhq/open-vectorizer | MIT [M] | Rust+WASM | closest match; port coverage field, corner, fit, primitive, scoring |
| VTracer https://github.com/visioncortex/vtracer | MIT [M] | Rust, WASM/Node | clustering, stacked/cutout, spline simplify |
| ImageTracer.js https://github.com/jankovicsandras/imagetracerjs | Unlicense [M] | JS | simple quantise+layer reference (default pathomit 8) |
| Potrace https://potrace.sourceforge.net/ | GPL [I, unverified] | C | algorithm reference only; reimplement from the paper, do not copy code |
| AutoTrace https://github.com/autotrace/autotrace | GPL-2.0 [M] | C | reference only |
| DiffVG https://github.com/BachiLi/diffvg | Apache-2.0 [M] | C++/Python | differentiable refinement |
| LIVE https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization | Apache-2.0 [M] | Python | layer-wise init |
| Aksoy soft colour segmentation | no code on page [M] | - | reimplement from paper |
| PolyFit, Hoshyari, Yang deblurring | no public code found [I] | - | papers only |

## 5. Gaps

- LogoScale ("A Method for Vectorizing Small, Crappy Logos", msprout.notion.site) is Notion JS-rendered; content not readable, not used.
- vectorizer.ai gives claims only; the VTracer docs site and Illustrator docs could not be read; Potrace polygon penalty formula, Schneider (Graphics Gems 1990) and Kopf-Lischinski internals were not read in full for this report.
- Thresholds in Open Vectorizer (flatness tolerance, corner cut-off, noise floor, ladder) are not published: read its source before porting.
- No benchmark was found measuring SR helping or hurting logo exactness; point 8 rests on one learned-method paper plus caution statements.
