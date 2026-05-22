# IT-923 footnote layout — Word vs SuperDoc diff

- Word total pages: **49**
- SuperDoc total pages: **57** (delta +8)
- Drift starts at page: **10**
- Cluster violations: **68**

| Pg | Word anchors | SD body refs | SD note slices | Reserve | Match | Cluster status |
|---:|---|---|---|---:|:--:|---|
| 1 | 1 | 1 | 1 | 36 | ✓ | 1L=ok-split-or-full |
| 2 | — | — | — | 0 | ✓ | — |
| 3 | — | — | — | 0 | ✓ | — |
| 4 | 2, 3 | 2, 3 | 2, 3 | 223 | ✓ | 2 =ok-complete 3L=ok-split-or-full |
| 5 | 4, 5 | 4, 5 | 4, 5 | 752 | ✓ | 4 =ok-complete 5L=ok-split-or-full |
| 6 | 6, 7 | 6, 7 | 5, 6, 7 | 539 | ✓ | 6 =ok-complete 7L=ok-split-or-full |
| 7 | 8, 9, 10 | 8, 9, 10 | 7, 8, 9, 10 | 473 | ✓ | 8 =ok-complete 9 =ok-complete 10L=ok-split-or-full |
| 8 | 11, 12 | 11, 12 | 11, 12 | 156 | ✓ | 11 =ok-complete 12L=ok-split-or-full |
| 9 | 13, 14, 15 | 13, 14, 15 | 13, 14, 15 | 194 | ✓ | 13 =ok-complete 14 =ok-complete 15L=ok-split-or-full |
| 10 | 16, 17, 18 | 16, 17 | 15, 16, 17 | 233 | ✗ | 16 =ok-complete 17 =ok-complete 18L=missing |
| 11 | — | 18 | 18 | 584 | ✗ | — |
| 12 | 19, 20 | 19, 20 | 19, 20 | 207 | ✓ | 19 =ok-complete 20L=ok-split-or-full |
| 13 | 21, 22, 23, 24, 25, 26 | 21, 22, 23, 24, 25, 26 | 21, 22, 23, 24, 25, 26 | 546 | ✓ | 21 =ok-complete 22 =ok-complete 23 =ok-complete 24 =ok-complete 25 =ok-complete 26L=ok-split-or-full |
| 14 | 27, 28, 29 | 27 | 26, 27 | 675 | ✗ | 27 =ok-complete 28 =missing 29L=missing |
| 15 | — | 28, 29 | 28, 29 | 615 | ✗ | — |
| 16 | 30, 31 | — | — | 0 | ✗ | 30 =missing 31L=missing |
| 17 | — | 30, 31 | 30, 31 | 330 | ✗ | — |
| 18 | 32, 33 | — | 31 | 790 | ✗ | 32 =missing 33L=missing |
| 19 | 34, 35, 36, 37 | 32, 33 | 31, 32, 33 | 317 | ✗ | 34 =missing 35 =missing 36 =missing 37L=missing |
| 20 | 38, 39, 40, 41 | 34, 35 | 33, 34, 35 | 414 | ✗ | 38 =missing 39 =missing 40 =missing 41L=missing |
| 21 | 42, 43, 44 | 36, 37, 38, 39 | 36, 37, 38, 39 | 513.2666666666668 | ✗ | 42 =missing 43 =missing 44L=missing |
| 22 | — | 40, 41, 42, 43 | 40, 41, 42, 43 | 273 | ✗ | — |
| 23 | 45, 46, 47 | 44 | 44 | 769 | ✗ | 45 =missing 46 =missing 47L=missing |
| 24 | 48 | — | — | 0 | ✗ | 48L=missing |
| 25 | 49, 50 | 45, 46, 47 | 45, 46, 47 | 187 | ✗ | 49 =missing 50L=missing |
| 26 | 51, 52 | 48 | 48 | 105 | ✗ | 51 =missing 52L=missing |
| 27 | — | 49, 50 | 49, 50 | 330 | ✗ | — |
| 28 | 53, 54 | 51 | 51 | 644 | ✗ | 53 =missing 54L=missing |
| 29 | 55 | 52 | 52 | 36 | ✗ | 55L=missing |
| 30 | 56 | 53 | 52, 53 | 77 | ✗ | 56L=missing |
| 31 | 57 | 54 | 54 | 138 | ✗ | 57L=missing |
| 32 | 58 | 55 | 54, 55 | 377 | ✗ | 58L=missing |
| 33 | 59 | 56 | 56 | 473 | ✗ | 59L=missing |
| 34 | 60 | 57 | 57 | 36 | ✗ | 60L=missing |
| 35 | 61 | — | 57 | 59 | ✗ | 61L=missing |
| 36 | 62, 63, 64 | 58 | 58 | 273 | ✗ | 62 =missing 63 =missing 64L=missing |
| 37 | 65, 66, 67, 68, 69 | 59 | 59 | 189 | ✗ | 65 =missing 66 =missing 67 =missing 68 =missing 69L=missing |
| 38 | 70, 71, 72, 73 | 60 | 59, 60 | 353 | ✗ | 70 =missing 71 =missing 72 =missing 73L=missing |
| 39 | 74, 75, 76, 77, 78 | 61, 62, 63 | 61, 62, 63 | 210 | ✗ | 74 =missing 75 =missing 76 =missing 77 =missing 78L=missing |
| 40 | 79, 80, 81, 82 | 64, 65 | 64, 65 | 291 | ✗ | 79 =missing 80 =missing 81 =missing 82L=missing |
| 41 | 83, 84 | 66, 67, 68, 69 | 66, 67, 68, 69 | 491 | ✗ | 83 =missing 84L=missing |
| 42 | 85 | 70, 71, 72 | 70, 71, 72 | 291 | ✗ | 85L=missing |
| 43 | — | 73, 74, 75, 76 | 73, 74, 75, 76 | 375 | ✗ | — |
| 44 | 86, 87 | 77, 78, 79, 80, 81 | 77, 78, 79, 80, 81 | 652 | ✗ | 86 =missing 87L=missing |
| 45 | 88, 89 | 82 | 81, 82 | 703 | ✗ | 88 =missing 89L=missing |
| 46 | 90 | 83, 84 | 83, 84 | 687 | ✗ | 90L=missing |
| 47 | 91 | 85 | 85 | 67 | ✗ | 91L=missing |
| 48 | 92, 93, 94 | — | 85 | 661 | ✗ | 92 =missing 93 =missing 94L=missing |
| 49 | — | — | — | 0 | ✓ | — |
| 50 | — | 86, 87 | 86, 87 | 315 | ✗ | — |
| 51 | — | 88, 89 | 88, 89 | 440 | ✗ | — |
| 52 | — | 90 | 90 | 223 | ✗ | — |
| 53 | — | 91 | 91 | 59 | ✗ | — |
| 54 | — | 92, 93 | 92, 93 | 742 | ✗ | — |
| 55 | — | 94 | 94 | 36 | ✗ | — |
| 56 | — | — | 94 | 769 | ✓ | — |
| 57 | — | — | — | 0 | ✓ | — |