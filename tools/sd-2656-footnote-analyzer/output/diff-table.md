# IT-923 footnote layout — Word vs SuperDoc diff

- Word total pages: **49**
- SuperDoc total pages: **50** (delta +1)
- Drift starts at page: **4**
- Cluster violations: **35**

| Pg | Word anchors | SD body refs | SD note slices | Reserve | Match | Cluster status |
|---:|---|---|---|---:|:--:|---|
| 1 | 1 | 1 | 1 | 36 | ✓ | 1L=ok-split-or-full |
| 2 | — | — | — | 0 | ✓ | — |
| 3 | — | — | — | 0 | ✓ | — |
| 4 | 2, 3 | 2, 3, 4 | 2, 3, 4 | 240 | ✗ | 2 =ok-complete 3L=ok-split-or-full |
| 5 | 4, 5 | 5 | 4, 5 | 475 | ✗ | 4 =ok-complete 5L=ok-split-or-full |
| 6 | 6, 7 | 6, 7 | 5, 6, 7 | 839 | ✓ | 6 =ok-complete 7L=ok-split-or-full |
| 7 | 8, 9, 10 | 8, 9, 10 | 7, 8, 9, 10 | 294.8666666666667 | ✓ | 8 =ok-complete 9 =ok-complete 10L=ok-split-or-full |
| 8 | 11, 12 | 11, 12 | 10, 11, 12 | 156 | ✓ | 11 =ok-complete 12L=ok-split-or-full |
| 9 | 13, 14, 15 | 13, 14, 15 | 13, 14, 15 | 294 | ✓ | 13 =ok-complete 14 =ok-complete 15L=ok-split-or-full |
| 10 | 16, 17, 18 | 16, 17, 18 | 16, 17, 18 | 133 | ✓ | 16 =ok-complete 17 =ok-complete 18L=ok-split-or-full |
| 11 | — | 19 | 18, 19 | 489 | ✗ | — |
| 12 | 19, 20 | 20, 21, 22, 23, 24 | 18, 19, 20, 21, 22, 23, 24 | 510 | ✗ | 19 =ok-complete 20L=ok-split-or-full |
| 13 | 21, 22, 23, 24, 25, 26 | 25, 26, 27, 28 | 24, 25, 26, 27, 28 | 352 | ✗ | 21 =missing 22 =missing 23 =missing 24 =ok-complete 25 =ok-complete 26L=ok-split-or-full |
| 14 | 27, 28, 29 | 29 | 28, 29 | 161 | ✗ | 27 =missing 28 =ok-complete 29L=ok-split-or-full |
| 15 | — | 30 | 30 | 36 | ✗ | — |
| 16 | 30, 31 | 31 | 30, 31 | 407 | ✗ | 30 =ok-complete 31L=ok-split-or-full |
| 17 | — | 32, 33 | 31, 32, 33 | 806 | ✗ | — |
| 18 | 32, 33 | 34, 35 | 31, 33, 34, 35 | 350 | ✗ | 32 =missing 33L=ok-split-or-full |
| 19 | 34, 35, 36, 37 | 36, 37, 38, 39 | 35, 36, 37, 38, 39 | 475 | ✗ | 34 =missing 35 =ok-complete 36 =ok-complete 37L=ok-split-or-full |
| 20 | 38, 39, 40, 41 | 40, 41, 42, 43 | 39, 40, 41, 42, 43 | 314 | ✗ | 38 =missing 39 =ok-complete 40 =ok-complete 41L=ok-split-or-full |
| 21 | 42, 43, 44 | 44 | 44 | 220 | ✗ | 42 =missing 43 =missing 44L=ok-split-or-full |
| 22 | — | 45, 46 | 44, 45, 46 | 110 | ✗ | — |
| 23 | 45, 46, 47 | 47, 48 | 47, 48 | 153 | ✗ | 45 =missing 46 =missing 47L=ok-split-or-full |
| 24 | 48 | 49, 50 | 48, 49, 50 | 208.79999999999995 | ✗ | 48L=ok-split-or-full |
| 25 | 49, 50 | 51 | 50, 51 | 146 | ✗ | 49 =missing 50L=ok-split-or-full |
| 26 | 51, 52 | 52 | 52 | 75 | ✗ | 51 =missing 52L=ok-split-or-full |
| 27 | — | 53 | 53 | 44 | ✗ | — |
| 28 | 53, 54 | 54, 55 | 54, 55 | 207 | ✗ | 53 =missing 54L=ok-split-or-full |
| 29 | 55 | 56 | 56 | 143 | ✗ | 55L=missing |
| 30 | 56 | 57 | 56, 57 | 131 | ✗ | 56L=ok-split-or-full |
| 31 | 57 | — | — | 0 | ✗ | 57L=missing |
| 32 | 58 | 58 | 58 | 36 | ✓ | 58L=ok-split-or-full |
| 33 | 59 | 59, 60 | 58, 59, 60 | 271 | ✗ | 59L=ok-split-or-full |
| 34 | 60 | — | 60 | 305 | ✗ | 60L=ok-split-or-full |
| 35 | 61 | 61, 62, 63, 64 | 61, 62, 63, 64 | 173 | ✗ | 61L=ok-split-or-full |
| 36 | 62, 63, 64 | 65, 66, 67, 68 | 64, 65, 66, 67, 68 | 406 | ✗ | 62 =missing 63 =missing 64L=ok-split-or-full |
| 37 | 65, 66, 67, 68, 69 | 69, 70, 71, 72 | 69, 70, 71, 72 | 227 | ✗ | 65 =missing 66 =missing 67 =missing 68 =missing 69L=ok-split-or-full |
| 38 | 70, 71, 72, 73 | 73, 74, 75, 76 | 73, 74, 75, 76 | 204 | ✗ | 70 =missing 71 =missing 72 =missing 73L=ok-split-or-full |
| 39 | 74, 75, 76, 77, 78 | 77, 78, 79, 80, 81 | 76, 77, 78, 79, 80, 81 | 708 | ✗ | 74 =missing 75 =missing 76 =ok-complete 77 =ok-complete 78L=ok-split-or-full |
| 40 | 79, 80, 81, 82 | 82, 83 | 81, 82, 83 | 652 | ✗ | 79 =missing 80 =missing 81 =ok-complete 82L=ok-split-or-full |
| 41 | 83, 84 | 84 | 84 | 381 | ✗ | 83 =missing 84L=ok-split-or-full |
| 42 | 85 | 85 | 85 | 36 | ✓ | 85L=ok-split-or-full |
| 43 | — | — | 85 | 366 | ✓ | — |
| 44 | 86, 87 | 86, 87 | 86, 87 | 491 | ✓ | 86 =ok-complete 87L=ok-split-or-full |
| 45 | 88, 89 | 88 | 88 | 317 | ✗ | 88 =ok-complete 89L=missing |
| 46 | 90 | 89, 90 | 89, 90 | 223 | ✗ | 90L=ok-split-or-full |
| 47 | 91 | — | — | 151 | ✗ | 91L=missing |
| 48 | 92, 93, 94 | 91 | 91 | 209 | ✗ | 92 =missing 93 =missing 94L=missing |
| 49 | — | 92, 93, 94 | 92, 93, 94 | 209 | ✗ | — |
| 50 | — | — | 94 | 44 | ✓ | — |