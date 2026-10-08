# Benchmark 2026-10-08T12:12:25.032Z

## auto

| image | kind | PSNR dB | SSIM | dE00 | edge SSIM | KB | paths | ms | Q | score |
|---|---|---|---|---|---|---|---|---|---|---|
| logo-bitcoin | logo | 33.32 | 0.9927 | 0.15 | 0.9877 | 9.3 | 4 | 7907 | 0.8894 | 86.19 |
| logo-brazil-flag | logo | 28.94 | 0.9865 | 0.52 | 0.9819 | 11.2 | 21 | 6753 | 0.8553 | 82.37 |
| illus-kawa | illustration | 22.95 | 0.7929 | 4.75 | 0.5628 | 1520.5 | 3206 | 13882 | 0.6224 | 31.05 |
| alpha-gear | transparent | 25.29 | 0.9700 | 0.58 | 0.9606 | 6.0 | 2 | 2188 | 0.8224 | 80.55 |
| lowq-fema | lowq-jpeg | 19.62 | 0.7291 | 7.30 | 0.6134 | 884.5 | 2408 | 6582 | 0.5727 | 31.38 |
| **mean** | | 26.02 | 0.8942 | 2.66 | 0.8213 | 486.3 | 1128 | 7462 | 0.7524 | 62.31 |

## swin

| image | kind | PSNR dB | SSIM | dE00 | edge SSIM | KB | paths | ms | Q | score |
|---|---|---|---|---|---|---|---|---|---|---|
| logo-bitcoin | logo | 32.81 | 0.9921 | 0.61 | 0.9865 | 9.2 | 4 | 362752 | 0.8810 | 85.40 |
| logo-brazil-flag | logo | 30.80 | 0.9901 | 1.20 | 0.9858 | 18.7 | 39 | 403314 | 0.8620 | 81.18 |
| illus-kawa | illustration | 21.60 | 0.7751 | 5.85 | 0.5465 | 1236.9 | 2710 | 587651 | 0.5944 | 30.71 |
| alpha-gear | transparent | 25.30 | 0.9653 | 1.03 | 0.9606 | 6.0 | 2 | 113538 | 0.8168 | 80.01 |
| lowq-fema | lowq-jpeg | 17.37 | 0.6429 | 10.09 | 0.5362 | 424.0 | 1222 | 160234 | 0.4900 | 30.67 |
| **mean** | | 25.58 | 0.8731 | 3.76 | 0.8031 | 339.0 | 795 | 325498 | 0.7288 | 61.59 |

## Best preset per image

| image | kind | best by score | score | best by quality | Q |
|---|---|---|---|---|---|
| logo-bitcoin | logo | auto | 86.19 | auto | 0.8894 |
| logo-brazil-flag | logo | auto | 82.37 | swin | 0.8620 |
| illus-kawa | illustration | auto | 31.05 | auto | 0.6224 |
| alpha-gear | transparent | auto | 80.55 | auto | 0.8224 |
| lowq-fema | lowq-jpeg | auto | 31.38 | auto | 0.5727 |

Mean with best preset per image: score 62.31, Q 0.7538
