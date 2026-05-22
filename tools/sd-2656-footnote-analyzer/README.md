# SD-2656 Footnote Layout Analyzer

Pure-diagnostic tooling for the IT-923 footnote fidelity work. Read-only —
does NOT modify production code. Captures, diffs, and explains the gap
between Word and SuperDoc's current rendering.

## Tasks

1. **Capture** the live SuperDoc layout state for the IT-923 fixture.
2. **Diff** that state against Word's expected page-anchor inventory.
3. **Explain** per-anchor drift (which Word page each footnote lands on in SD).
4. **Simulate** the ordered-cluster rule statically and quantify the per-page
   over-reservation that drives the drift.
5. **Render** a per-page side-by-side comparison (Word PDF page | SD page).

Nothing here changes the body slicer or the footnote planner. Use it to plan
the actual fix; the fix itself follows the four-layer architecture in
`docs/architecture/sd-2656-it923-footnote-word-fidelity-plan.md`.

## Quick start

```bash
# 1. Start dev server (or use existing — script auto-detects 909x ports)
pnpm dev

# 2. Capture: upload fixture, wait for layout, extract per-page JSON
bash tools/sd-2656-footnote-analyzer/scripts/capture.sh

# 3. Diff captured state against Word expected
python3 tools/sd-2656-footnote-analyzer/scripts/diff-pages.py

# 4. Explain per-anchor drift
python3 tools/sd-2656-footnote-analyzer/scripts/explain-drift.py

# 5. Quantify how much over-reservation the ordered-cluster rule would save
python3 tools/sd-2656-footnote-analyzer/scripts/simulate-ordered-cluster.py

# 6. Capture per-page SuperDoc PNGs (slow — ~3s/page × 51 pages)
bash tools/sd-2656-footnote-analyzer/scripts/capture-superdoc-pages.sh

# 7. Render visual side-by-side comparison
python3 tools/sd-2656-footnote-analyzer/scripts/render-comparison.py
open tools/sd-2656-footnote-analyzer/output/comparison.html
```

## Outputs

| File | What |
|---|---|
| `output/superdoc-state.json` | Per-page snapshot: bodyRefs, footnoteSlices, reserve |
| `output/diff-summary.json` | Structured diff vs Word inventory |
| `output/diff-table.md` | Human-readable per-page diff table |
| `output/drift-explanation.md` | Per-anchor shift analysis (where each footnote landed) |
| `output/ordered-cluster-simulation.json` | Static "what if ordered-cluster" analysis |
| `output/per-page/sd/page-NN.png` | Captured SuperDoc page images |
| `output/comparison.html` | Side-by-side Word \| SuperDoc visual |

## Data flow (current — post-revert)

```
DOCX
  ↓
super-converter (parses footnotes.xml, attaches ids 2..N to body refs)
  ↓
PM doc with footnoteReference nodes (each has attrs.id = OOXML id)
  ↓
PresentationEditor builds FootnotesLayoutInput via FootnotesBuilder
  ↓
incrementalLayout passes refs[] + blocksById to layoutDocument
  ↓
layoutDocument (layout-engine/src/index.ts:1230):
  builds footnoteAnchorsByBlockId  = blockId -> [{pmPos, refId, height}]
  exposes getFootnoteDemandForBlockId(blockId, pmStart?, pmEnd?)
    → sums height of refs in range
  exposes getFootnoteBandOverhead()
    → separator + topPadding + dividerHeight + (refs-1)*gap
  ↓
layout-paragraph.ts uses these to budget body lines against page bottom.
  ↓
After body layout: incrementalLayout.computeFootnoteLayoutPlan
  - Per page, computes columnDemand = sum(measured slice heights) + overhead
  - Caps placement at min(demand, maxReserve)
  - placeFootnote() greedily places each id; if first slice fits, accept
    even partial; if not, defer to pendingByColumn for next page
  ↓
Layout pages get .footnoteReserved set; band painted bottom-anchored.
```

## Diagnosis (May 22, 2026)

From the captured state on the IT-923 fixture (94 user footnotes, Word=49 pages, SD=51 pages):

- **Drift starts at Word page 5** (anchors [4,5]). SD pushes fn 5 to page 6.
- **77 footnotes shifted +1 page; 10 shifted +2 pages; 7 perfect.**
- **10 cluster-split events** — pages where Word fits all anchors but SD pushes
  only the LAST anchor off:
  - Word p5  [4,5]        → split: [4][5]
  - Word p7  [8,9,10]     → split: [8][9,10]
  - Word p9  [13,14,15]   → split: [13][14,15]
  - Word p10 [16,17,18]   → split: [16,17][18]
  - Word p13 [21..26]     → split: [21][22..26]
  - Word p16 [30,31]      → split: [30][31]
  - Word p39 [74..78]     → split: [74..77][78]
  - Word p40 [79..82]     → split: [79..81][82]
  - Word p44 [86,87]      → split: [86][87]
  - Word p45 [88,89]      → split: [88][89]
- **Ordered-cluster simulator** shows the body slicer would have ~102px of
  additional budget per page on average — and cluster-split pages save up to
  516px (page 5) or 768px (page 16). Those are the exact pages where the
  current model rejects the last anchor.

The split pattern is uniform: **only the last anchor of each Word cluster gets
pushed**. This is the precise signature of demand model:

  current: sum(fullHeight(all))            ← over-reserves the last
  target:  sum(fullHeight(non-last)) + firstLine(last)

## Implementation notes (for the next fix attempt)

The plan's Phase 0 is **trace + guardrails before any algorithm change**.
Reasons two prior attempts failed:

1. `forceFirst` semantics matter. The slicer's first-slice forcing must be
   conditional on whether the slicer reserved firstLineHeight for that anchor.
   Forcing without reservation produces 52 pages of zero-slice output.
2. The body slicer and the planner must agree on which anchor is "last".
   Tracking this requires PageState to carry an ordered anchor list, and
   `placeFootnote` must consult it (not just `idsByColumn` order).
3. Demand for body pagination MUST equal demand for footnote placement.
   Otherwise the body reserves space the planner can't fill — orphan pages.

The fix should follow these layers strictly:
- contracts: add `firstLineHeight` to `FootnoteAnchorEntry`
- layout-engine: PageState.footnoteAnchorsThisPage = ordered list
- layout-paragraph: use ordered-cluster math for break decisions
- incrementalLayout planner: enforce non-last must fit fully

Tests must assert per-page **completion** (continuesOnNext false for non-last
anchors on their anchor page), not just "first slice exists".
