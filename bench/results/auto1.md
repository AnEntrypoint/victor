# Benchmark 2026-10-08T11:17:38.795Z

## auto

| image | kind | PSNR dB | SSIM | dE00 | edge SSIM | KB | paths | ms | Q | score |
|---|---|---|---|---|---|---|---|---|---|---|
| logo-bitcoin | logo | 33.32 | 0.9927 | 0.15 | 0.9877 | 9.3 | 4 | 8500 | 0.8894 | 86.19 |
| logo-brazil-flag | logo | 28.94 | 0.9865 | 0.52 | 0.9819 | 11.2 | 21 | 7174 | 0.8553 | 82.37 |
| line-animal | lineart | 15.10 | 0.8545 | 4.68 | 0.8142 | 1098.9 | 535 | 9431 | 0.6523 | 34.41 |
| line-heron | lineart | 18.18 | 0.9049 | 2.76 | 0.8752 | 728.6 | 1558 | 8684 | 0.7185 | 40.76 |
| illus-kawa | illustration | 22.95 | 0.7929 | 4.75 | 0.5628 | 1520.5 | 3206 | 14957 | 0.6224 | 31.05 |
| illus-kare | illustration | 25.98 | 0.8025 | 3.97 | 0.5963 | 4220.4 | 9671 | 20599 | 0.6599 | 27.98 |
| tex-granite | texture | 24.88 | 0.5732 | 3.60 | 0.1310 | 0.4 | 1 | 11577 | 0.4830 | 48.23 |
| tex-sand | texture | 16.65 | 0.1232 | 10.13 | 0.0342 | 4037.0 | 3275 | 30803 | 0.2297 | 9.80 |
| photo-curtis | photo | 14.15 | 0.6292 | 15.21 | 0.4759 | 0.4 | 1 | 7833 | 0.4001 | 39.95 |
| photo-building | photo | 17.45 | 0.6214 | 8.41 | 0.4190 | 347.1 | 744 | 9266 | 0.4726 | 30.68 |
| photo-fema | photo | 14.81 | 0.5420 | 14.11 | 0.3770 | 116.7 | 166 | 8275 | 0.3687 | 28.83 |
| alpha-gear | transparent | 25.29 | 0.9700 | 0.58 | 0.9606 | 6.0 | 2 | 2451 | 0.8224 | 80.55 |
| lowq-fema | lowq-jpeg | 15.25 | 0.5409 | 13.11 | 0.4066 | 34.4 | 74 | 7197 | 0.3886 | 35.11 |
| **mean** | | 21.00 | 0.7180 | 6.31 | 0.5863 | 933.1 | 1481 | 11288 | 0.5818 | 44.30 |

## fixed-balanced

| image | kind | PSNR dB | SSIM | dE00 | edge SSIM | KB | paths | ms | Q | score |
|---|---|---|---|---|---|---|---|---|---|---|
| logo-bitcoin | logo | 33.84 | 0.9929 | 0.14 | 0.9879 | 9.7 | 4 | 1024 | 0.8928 | 86.38 |
| logo-brazil-flag | logo | 31.34 | 0.9906 | 0.40 | 0.9863 | 18.9 | 39 | 1629 | 0.8736 | 82.24 |
| line-animal | lineart | 14.29 | 0.7880 | 6.82 | 0.7254 | 2753.8 | 2439 | 7343 | 0.5869 | 26.57 |
| line-heron | lineart | 18.06 | 0.8785 | 3.81 | 0.8297 | 2220.8 | 1624 | 5359 | 0.6893 | 32.30 |
| illus-kawa | illustration | 18.15 | 0.7216 | 8.78 | 0.4631 | 348.4 | 405 | 3074 | 0.5093 | 33.04 |
| illus-kare | illustration | 19.23 | 0.6435 | 9.25 | 0.4069 | 1015.4 | 1261 | 4222 | 0.4777 | 25.55 |
| tex-granite | texture | 24.97 | 0.5750 | 3.56 | 0.1328 | 12.5 | 39 | 3321 | 0.4849 | 46.52 |
| tex-sand | texture | 17.28 | 0.2340 | 9.21 | 0.1058 | 15488.0 | 9749 | 41755 | 0.2884 | 10.22 |
| photo-curtis | photo | 14.18 | 0.6297 | 15.13 | 0.4815 | 32.3 | 64 | 2322 | 0.4026 | 36.57 |
| photo-building | photo | 18.61 | 0.6576 | 7.20 | 0.4489 | 658.5 | 1154 | 3408 | 0.5085 | 29.38 |
| photo-fema | photo | 16.19 | 0.6005 | 11.79 | 0.4238 | 728.6 | 1055 | 3625 | 0.4268 | 24.21 |
| alpha-gear | transparent | 25.79 | 0.9714 | 0.56 | 0.9629 | 7.9 | 2 | 90 | 0.8267 | 80.45 |
| lowq-fema | lowq-jpeg | 15.99 | 0.5705 | 11.75 | 0.4407 | 120.8 | 233 | 758 | 0.4228 | 32.89 |
| **mean** | | 20.61 | 0.7118 | 6.80 | 0.5689 | 1801.2 | 1390 | 5995 | 0.5685 | 42.03 |

## Best preset per image

| image | kind | best by score | score | best by quality | Q |
|---|---|---|---|---|---|
| logo-bitcoin | logo | fixed-balanced | 86.38 | fixed-balanced | 0.8928 |
| logo-brazil-flag | logo | auto | 82.37 | fixed-balanced | 0.8736 |
| line-animal | lineart | auto | 34.41 | auto | 0.6523 |
| line-heron | lineart | auto | 40.76 | auto | 0.7185 |
| illus-kawa | illustration | fixed-balanced | 33.04 | auto | 0.6224 |
| illus-kare | illustration | auto | 27.98 | auto | 0.6599 |
| tex-granite | texture | auto | 48.23 | fixed-balanced | 0.4849 |
| tex-sand | texture | fixed-balanced | 10.22 | fixed-balanced | 0.2884 |
| photo-curtis | photo | auto | 39.95 | fixed-balanced | 0.4026 |
| photo-building | photo | auto | 30.68 | fixed-balanced | 0.5085 |
| photo-fema | photo | auto | 28.83 | fixed-balanced | 0.4268 |
| alpha-gear | transparent | auto | 80.55 | fixed-balanced | 0.8267 |
| lowq-fema | lowq-jpeg | auto | 35.11 | fixed-balanced | 0.4228 |

Mean with best preset per image: score 44.50, Q 0.5985
