# IT-923 per-anchor drift explanation

## Shift distribution

- shift **-1**: 14 footnotes — [8, 19, 20, 21, 22, 23, 24, 27, 32, 33, 34, 38, 42, 43]
- shift **0**: 44 footnotes — [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 25, 26, 28, 29, 30, 31, 35, 36, 37, 39, 40, 41, 44, 45, 46, 48, 49, 51, 53, 56, 57, 62, 63, 64, 65, 66, 67]
- shift **1**: 27 footnotes — [47, 50, 52, 54, 55, 58, 59, 60, 61, 68, 69, 70, 71, 72, 74, 75, 76, 79, 80, 81, 83, 84, 85, 86, 87, 88, 90]
- shift **2**: 9 footnotes — [73, 77, 78, 82, 89, 91, 92, 93, 94]

## Per-Word-page cluster analysis

Each row groups footnotes by where Word puts them. Look for clusters that
Word fits on one page but SD splits across two — that's the over-reservation bug.

| Word pg | Anchors | SD result | Reserve@word | Shift | Diagnosis |
|---:|---|---|---:|---|---|
| 1 | [1] | pages 1 | 44 | 0 | ✓ perfect match |
| 4 | [2, 3] | pages 4,4 | 223 | 0,0 | ✓ perfect match |
| 5 | [4, 5] | pages 5,5 | 560 | 0,0 | ✓ perfect match |
| 6 | [6, 7] | pages 6,6 | 424 | 0,0 | ✓ perfect match |
| 7 | [8, 9, 10] | pages 6,7,7 | 163 | -1,0,0 | CLUSTER SPLIT: first 1 stay shift +-1, last 2 shift +0 |
| 8 | [11, 12] | pages 8,8 | 204 | 0,0 | ✓ perfect match |
| 9 | [13, 14, 15] | pages 9,9,9 | 286 | 0,0,0 | ✓ perfect match |
| 10 | [16, 17, 18] | pages 10,10,10 | 240 | 0,0,0 | ✓ perfect match |
| 12 | [19, 20] | pages 11,11 | 700 | -1,-1 | shifts: [-1, -1] |
| 13 | [21, 22, 23, 24, 25, 26] | pages 12,12,12,12,13,13 | 488 | -1,-1,-1,-1,0,0 | CLUSTER SPLIT: first 4 stay shift +-1, last 2 shift +0 |
| 14 | [27, 28, 29] | pages 13,14,14 | 309 | -1,0,0 | CLUSTER SPLIT: first 1 stay shift +-1, last 2 shift +0 |
| 16 | [30, 31] | pages 16,16 | 391 | 0,0 | ✓ perfect match |
| 18 | [32, 33] | pages 17,17 | 623 | -1,-1 | shifts: [-1, -1] |
| 19 | [34, 35, 36, 37] | pages 18,19,19,19 | 403 | -1,0,0,0 | CLUSTER SPLIT: first 1 stay shift +-1, last 3 shift +0 |
| 20 | [38, 39, 40, 41] | pages 19,20,20,20 | 518 | -1,0,0,0 | CLUSTER SPLIT: first 1 stay shift +-1, last 3 shift +0 |
| 21 | [42, 43, 44] | pages 20,20,21 | 276 | -1,-1,0 | CLUSTER SPLIT: first 2 stay shift +-1, last 1 shift +0 |
| 23 | [45, 46, 47] | pages 23,23,24 | 69 | 0,0,1 | CLUSTER SPLIT: first 2 stay shift +0, last 1 shift +1 |
| 24 | [48] | pages 24 | 223 | 0 | ✓ perfect match |
| 25 | [49, 50] | pages 25,26 | 207 | 0,1 | CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1 |
| 26 | [51, 52] | pages 26,27 | 161 | 0,1 | CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1 |
| 28 | [53, 54] | pages 28,29 | 44 | 0,1 | CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1 |
| 29 | [55] | pages 30 | 174 | 1 | all shifted +1 together — cluster moved as a unit |
| 30 | [56] | pages 30 | 123 | 0 | ✓ perfect match |
| 31 | [57] | pages 31 | 138 | 0 | ✓ perfect match |
| 32 | [58] | pages 33 | 131 | 1 | all shifted +1 together — cluster moved as a unit |
| 33 | [59] | pages 34 | 51 | 1 | all shifted +1 together — cluster moved as a unit |
| 34 | [60] | pages 35 | 97 | 1 | all shifted +1 together — cluster moved as a unit |
| 35 | [61] | pages 36 | 143 | 1 | all shifted +1 together — cluster moved as a unit |
| 36 | [62, 63, 64] | pages 36,36,36 | 398 | 0,0,0 | ✓ perfect match |
| 37 | [65, 66, 67, 68, 69] | pages 37,37,37,38,38 | 326.86666666666656 | 0,0,0,1,1 | CLUSTER SPLIT: first 3 stay shift +0, last 2 shift +1 |
| 38 | [70, 71, 72, 73] | pages 39,39,39,40 | 296 | 1,1,1,2 | CLUSTER SPLIT: first 3 stay shift +1, last 1 shift +2 |
| 39 | [74, 75, 76, 77, 78] | pages 40,40,40,41,41 | 237 | 1,1,1,2,2 | CLUSTER SPLIT: first 3 stay shift +1, last 2 shift +2 |
| 40 | [79, 80, 81, 82] | pages 41,41,41,42 | 258 | 1,1,1,2 | CLUSTER SPLIT: first 3 stay shift +1, last 1 shift +2 |
| 41 | [83, 84] | pages 42,42 | 652 | 1,1 | all shifted +1 together — cluster moved as a unit |
| 42 | [85] | pages 43 | 381 | 1 | all shifted +1 together — cluster moved as a unit |
| 44 | [86, 87] | pages 45,45 | 366 | 1,1 | all shifted +1 together — cluster moved as a unit |
| 45 | [88, 89] | pages 46,47 | 261 | 1,2 | CLUSTER SPLIT: first 1 stay shift +1, last 1 shift +2 |
| 46 | [90] | pages 47 | 261 | 1 | all shifted +1 together — cluster moved as a unit |
| 47 | [91] | pages 49 | 223 | 2 | all shifted +2 together — cluster moved as a unit |
| 48 | [92, 93, 94] | pages 50,50,50 | 0 | 2,2,2 | all shifted +2 together — cluster moved as a unit |

## Split clusters (the bug pattern)

These are pages where Word fits all anchors but SD breaks the cluster:

- Word page **7**: anchors [8, 9, 10], shifts [-1, 0, 0] — CLUSTER SPLIT: first 1 stay shift +-1, last 2 shift +0
- Word page **13**: anchors [21, 22, 23, 24, 25, 26], shifts [-1, -1, -1, -1, 0, 0] — CLUSTER SPLIT: first 4 stay shift +-1, last 2 shift +0
- Word page **14**: anchors [27, 28, 29], shifts [-1, 0, 0] — CLUSTER SPLIT: first 1 stay shift +-1, last 2 shift +0
- Word page **19**: anchors [34, 35, 36, 37], shifts [-1, 0, 0, 0] — CLUSTER SPLIT: first 1 stay shift +-1, last 3 shift +0
- Word page **20**: anchors [38, 39, 40, 41], shifts [-1, 0, 0, 0] — CLUSTER SPLIT: first 1 stay shift +-1, last 3 shift +0
- Word page **21**: anchors [42, 43, 44], shifts [-1, -1, 0] — CLUSTER SPLIT: first 2 stay shift +-1, last 1 shift +0
- Word page **23**: anchors [45, 46, 47], shifts [0, 0, 1] — CLUSTER SPLIT: first 2 stay shift +0, last 1 shift +1
- Word page **25**: anchors [49, 50], shifts [0, 1] — CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1
- Word page **26**: anchors [51, 52], shifts [0, 1] — CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1
- Word page **28**: anchors [53, 54], shifts [0, 1] — CLUSTER SPLIT: first 1 stay shift +0, last 1 shift +1
- Word page **37**: anchors [65, 66, 67, 68, 69], shifts [0, 0, 0, 1, 1] — CLUSTER SPLIT: first 3 stay shift +0, last 2 shift +1
- Word page **38**: anchors [70, 71, 72, 73], shifts [1, 1, 1, 2] — CLUSTER SPLIT: first 3 stay shift +1, last 1 shift +2
- Word page **39**: anchors [74, 75, 76, 77, 78], shifts [1, 1, 1, 2, 2] — CLUSTER SPLIT: first 3 stay shift +1, last 2 shift +2
- Word page **40**: anchors [79, 80, 81, 82], shifts [1, 1, 1, 2] — CLUSTER SPLIT: first 3 stay shift +1, last 1 shift +2
- Word page **45**: anchors [88, 89], shifts [1, 2] — CLUSTER SPLIT: first 1 stay shift +1, last 1 shift +2