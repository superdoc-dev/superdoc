# IT-923 page-by-page alignment

- Word total: **49**
- SuperDoc total: **57** (+8)
- Perfectly aligned: **5 / 49**
- Drift events: **14**
- Final drift: **8**

## Drift events (where SD diverges from Word)

Each event is a Word page where SD's body content first appears on a different SD page than expected.

| Word | SD | Δ | Word anchors | SD body refs | Word body start | SD body start |
|---:|---:|:--:|---|---|---|---|
| 4 | 1 | -3 | [2, 3] | [1] | `AMENDED AND RESTATED2 CERTIFICATE OF INCORPORATION` | `AMENDED AND RESTATEDCERTIFICATE OF INCORPORATION` |
| 5 | 5 | +3 | [4, 5] | [4, 5] | `FOURTH: The total number of shares of all classes4` | `: The total number of shares of all classes4 of st` |
| 15 | 16 | +1 | [] | [] | `(b) [In the event of a Deemed Liquidation Event re` | `Effecting a Deemed Liquidation Event.` |
| 17 | 19 | +1 | [] | [32, 33] | `3. Voting. 3.1 General. On any matter presented to` | `General. On any matter presented to the stockholde` |
| 18 | 19 | -1 | [32, 33] | [32, 33] | `for determining stockholders entitled to vote on s` | `General. On any matter presented to the stockholde` |
| 21 | 20 | -2 | [42, 43, 44] | [34, 35] | `3.3.5 increase [or decrease] the authorized number` | `If the holders of shares of Preferred Stock or Com` |
| 22 | 24 | +3 | [] | [] | `(a) [unless the aggregate indebtedness of the Corp` | `[unless the aggregate indebtedness of the Corporat` |
| 25 | 33 | +6 | [49, 50] | [56] | `or physical) for the number of full shares of Comm` | `If the number of shares of Common Stock issuable u` |
| 27 | 30 | -5 | [] | [53] | `Securities actually issued upon the exercise of Op` | `[shares of Common Stock, Options or Convertible Se` |
| 33 | 33 | -3 | [59] | [56] | `after the Original Issue Date combine the outstand` | `If the number of shares of Common Stock issuable u` |
| 34 | 38 | +4 | [60] | [60] | `4.8 Adjustment for Merger or Reorganization, etc. ` | `Adjustment for Merger or Reorganization, etc. Subj` |
| 37 | 33 | -8 | [65, 66, 67, 68, 69] | [56] | `shares of Common Stock issuable on such conversion` | `If the number of shares of Common Stock issuable u` |
| 44 | 50 | +10 | [86, 87] | [86, 87] | `Corporation Law as so amended. Any amendment, repe` | `Any amendment, repeal or elimination of the forego` |
| 49 | 57 | +2 | [] | [] | `4. Indemnification of Employees and Agents. The Co` | `Other Indemnification. The Corporation’s obligatio` |

## Full alignment table

| Word | SD | Drift | Score | Word anchors | SD body refs | SD slices | Body match |
|---:|---:|---:|---:|---|---|---|---|
| 1 | — | ? | 0.14 | 1 | — | — | ≈ |
| 2 | 2 | +0 | 0.33 | — | — | — | ≈ |
| 3 | — | ? | 0.16 | — | — | — | ≈ |
| 4 | 1 | -3 | 0.26 | 2,3 | 1 | 1 | ≈ |
| 5 | 5 | +0 | 0.64 | 4,5 | 4,5 | 4,5 | ≈ |
| 6 | — | ? | 0.17 | 6,7 | — | — | ≈ |
| 7 | — | ? | 0.19 | 8,9,10 | — | — | ≈ |
| 8 | — | ? | 0.17 | 11,12 | — | — | ≈ |
| 9 | — | ? | 0.12 | 13,14,15 | — | — | ≈ |
| 10 | — | ? | 0.1 | 16,17,18 | — | — | ≈ |
| 11 | — | ? | 0.17 | — | — | — | ≈ |
| 12 | — | ? | 0.09 | 19,20 | — | — | ≈ |
| 13 | 13 | +0 | 0.24 | 21,22,23,24,25,26 | 21,22,23,24,25,26 | 21,22,23,24,25,26 | ≈ |
| 14 | 14 | +0 | 0.42 | 27,28,29 | 27 | 26,27 | ≈ |
| 15 | 16 | +1 | 0.29 | — | — | — | ≈ |
| 16 | — | ? | 0.08 | 30,31 | — | — | ≈ |
| 17 | 19 | +2 | 0.4 | — | 32,33 | 31,32,33 | ≈ |
| 18 | 19 | +1 | 0.2 | 32,33 | 32,33 | 31,32,33 | ≈ |
| 19 | — | ? | 0.12 | 34,35,36,37 | — | — | ≈ |
| 20 | — | ? | 0.09 | 38,39,40,41 | — | — | ≈ |
| 21 | 20 | -1 | 0.2 | 42,43,44 | 34,35 | 33,34,35 | ≈ |
| 22 | 24 | +2 | 0.57 | — | — | — | ≈ |
| 23 | 25 | +2 | 0.64 | 45,46,47 | 45,46,47 | 45,46,47 | ≈ |
| 24 | 26 | +2 | 0.43 | 48 | 48 | 48 | ≈ |
| 25 | 33 | +8 | 0.32 | 49,50 | 56 | 56 | ≈ |
| 26 | — | ? | 0.11 | 51,52 | — | — | ≈ |
| 27 | 30 | +3 | 0.34 | — | 53 | 52,53 | ≈ |
| 28 | — | ? | 0.17 | 53,54 | — | — | ≈ |
| 29 | 32 | +3 | 0.26 | 55 | 55 | 54,55 | ≈ |
| 30 | — | ? | 0.19 | 56 | — | — | ≈ |
| 31 | — | ? | 0.07 | 57 | — | — | ≈ |
| 32 | — | ? | 0.13 | 58 | — | — | ≈ |
| 33 | 33 | +0 | 0.22 | 59 | 56 | 56 | ≈ |
| 34 | 38 | +4 | 0.49 | 60 | 60 | 59,60 | ≈ |
| 35 | — | ? | 0.15 | 61 | — | — | ≈ |
| 36 | — | ? | 0.13 | 62,63,64 | — | — | ≈ |
| 37 | 33 | -4 | 0.23 | 65,66,67,68,69 | 56 | 56 | ≈ |
| 38 | — | ? | 0.19 | 70,71,72,73 | — | — | ≈ |
| 39 | — | ? | 0.15 | 74,75,76,77,78 | — | — | ≈ |
| 40 | — | ? | 0.15 | 79,80,81,82 | — | — | ≈ |
| 41 | — | ? | 0.18 | 83,84 | — | — | ≈ |
| 42 | — | ? | 0.13 | 85 | — | — | ≈ |
| 43 | — | ? | 0.11 | — | — | — | ≈ |
| 44 | 50 | +6 | 0.23 | 86,87 | 86,87 | 86,87 | ≈ |
| 45 | — | ? | 0.16 | 88,89 | — | — | ≈ |
| 46 | — | ? | 0.09 | 90 | — | — | ≈ |
| 47 | 53 | +6 | 0.69 | 91 | 91 | 91 | ✓ |
| 48 | 54 | +6 | 0.2 | 92,93,94 | 92,93 | 92,93 | ≈ |
| 49 | 57 | +8 | 0.3 | — | — | — | ≈ |