# SD-2656 — Footnote Rendering Fidelity (Implementation Plan)

**Epic:** [SD-2656](https://linear.app/superdocworkspace/issue/SD-2656) (In Progress, assigned to Tadeu)
**Project:** Footnote rendering fidelity
**Goal:** Close the remaining gaps so DOCX footnotes render with Word-level fidelity in SuperDoc, validated against the Spicy / Observatory corpus (~172 corpus docs, 906 footnote occurrences).

---

## 0. Operating principles (do not skip)

These three principles override the temptation to "fix everything at once":

1. **Surgical, falsifiable changes** (karpathy-guidelines). Each sub-issue ships with one verifiable success criterion that can be checked in a browser screenshot or layout snapshot — not "renders better." If we cannot state how a reviewer will tell pass from fail, we are not ready to write code.
2. **Reproduce before theorize** (analyze-issue iron rule). For every sub-issue, run the SD-1680 verification flow first — open the named fixture in `pnpm dev`, screenshot the broken state, document it. If it does not reproduce, the ticket may already be resolved by PR #2881 or downstream work; close as stale rather than refactor speculatively.
3. **TDD with the right test type** (testing-excellence). Pagination logic = unit tests against `computeFootnoteLayoutPlan` with real `BlockMeasure` inputs (managed dependency, not a mock). Visual fidelity = `pnpm test:layout` + `pnpm test:visual` against R2 corpus. Editing flows for footnotes = Playwright behavior tests. **Do not mock the layout-bridge** — the bug surface lives in the integration of measurement + reserve + relayout, and mocks of that surface have hidden production bugs in the past (SD-1680 oscillation went undetected by the existing single-pass tests).

---

## 1. Sub-issue inventory & status (2026-05-08)

| ID | Title | Status | Cluster | Ships first? |
|---|---|---|---|---|
| **SD-3049** | Body break consults footnote demand for refs anchored on this page | Backlog | Pagination | ✅ Yes — slice 1 |
| **SD-3050** | Continuation-aware break (carry-forward demand from prior page) | Backlog | Pagination | ✅ Yes — slice 2 |
| **SD-3051** | Stabilize when refs migrate between pages during convergence | Backlog | Pagination | ✅ Yes — slice 3 |
| SD-2649 | Footnote-aware body pagination (parent of 3049/3050/3051) | **Canceled** (split) | Pagination | n/a |
| SD-2986 | Footnote Configuration | Backlog | Configuration | After pagination |
| SD-2985 | Footnote Separators | Backlog | Separators | After pagination |
| SD-2987 | Footnotes (residual umbrella) | Backlog | Residual | Last |
| SD-2657 | Honor OOXML footnote numbering semantics | **Archived** | (subsumed by SD-2986) | — |
| SD-2658 | Render custom footnote reference marks | **Archived** | (no observatory replacement; verify if still needed) | — |
| SD-2659 | Render DOCX footnote separators with higher fidelity | **Archived** | (subsumed by SD-2985) | — |
| SD-2660 | Footnote continuation notice rendering | **Archived** | (no observatory replacement; verify if still needed) | — |
| SD-2661 | Honor DOCX footnote placement modes (`beneathText`) | **Archived** | (subsumed by SD-2986) | — |
| SD-2662 | Improve footnote reference and marker styling parity | **Archived** | (no observatory replacement; verify if still needed) | — |

**Action item before scoping the residuals**: confirm with Missy / Vivienne whether SD-2658, SD-2660, SD-2662 fold into SD-2987 or were intentionally deprioritized. Do **not** start work on them speculatively.

---

## 2. Background: where the current code lives

### Layout-bridge (the heart of footnote pagination)

`packages/layout-engine/layout-bridge/src/incrementalLayout.ts`

| Concern | Lines | Notes |
|---|---|---|
| `computeFootnoteLayoutPlan` | 1365–1572 | Plan that decides which slices land on which page/column |
| `placeFootnote` (closure) | 1448–1495 | Per-footnote placement; `availableHeight = max(0, placementCeiling − usedHeight − overhead − gapBefore)` (line 1466) |
| `pendingByColumn` continuation | 1393, 1430–1436, 1548–1550 | Carries excess footnote slices to the next page |
| Multi-pass reserve loop | 1843–1877 | `MAX_FOOTNOTE_LAYOUT_PASSES = 4` (line 313) |
| Element-wise max merge | 1935 | `Math.max(v, last[i] ?? 0)` — guarantees monotonic convergence (PR #2881) |
| Body relayout call | 1844 | `layout = relayout(reserves)` — current "post-hoc reserve" entry point |
| `growReserves` async loop | 1919–1942 | `GROW_MAX_PASSES = 10` |
| Tighten phase | 1978–1996 | `TIGHTEN_SLACK_PX = 8` reclaim |
| `injectFragments` | 1575–1700+ | Renders separator + slices into reserved band |

### Body break decision (the surface the pagination tickets need to touch)

`packages/layout-engine/layout-engine/src/layout-paragraph.ts`

- `availableHeight = state.contentBottom − state.cursorY` (line 825)
- `if (remainingHeight < nextLineHeight) advanceColumn()` (line 832)
- `contentBottom` derives from `pageHeight − topMargin − (bottomMargin − footnoteReserve)`. **Today the body paginator only sees the reserve as a margin reduction; it does not see footnote demand directly.** This is the architectural lever for SD-3049/3050.

### Footnote import / contract types

| Concern | Path |
|---|---|
| `w:footnoteReference` translator | `packages/super-editor/src/editors/v1/core/super-converter/v3/handlers/w/footnoteReference/footnoteReference-translator.js` |
| Footnotes part importer | `documentFootnotesImporter.js` (preserves separator and continuationSeparator records) |
| Footnotes part exporter | `footnotesExporter.js` (round-trips the same XML) |
| Document-API types | `packages/document-api/src/footnotes/footnotes.types.ts` |
| Internal layout types | `incrementalLayout.ts` lines 328–368 (`FootnoteRange`, `FootnoteSlice`, `FootnoteLayoutPlan`) |
| pm-adapter inline marker | `packages/layout-engine/pm-adapter/src/converters/inline-converters/footnote-reference.ts` (`buildReferenceMarkerRun`, `resolveFootnoteDisplayNumber`) |

### Existing tests (the green baseline we must not break)

- `packages/layout-engine/layout-bridge/test/footnoteMultiPass.test.ts` — convergence
- `packages/layout-engine/layout-bridge/test/footnoteBandOverflow.test.ts` — overflow capping
- `packages/layout-engine/layout-bridge/test/footnoteColumnPlacement.test.ts` — column assignment
- `packages/layout-engine/layout-bridge/test/footnoteSeparatorSpacing.test.ts` — separator/padding

### Reference fixtures (already pulled to `~/Documents/sd-2656-fixtures/`)

| File | Purpose |
|---|---|
| `harvey-problem-docs__NVCA Model SPA.docx` | 108 footnote refs — primary dense fixture |
| `footnotes__basic-footnotes.docx` | Standard separator + continuationSeparator |
| `footnotes__multi-column-footnotes.docx` | Column-aware reserve |
| `footnotes__footnotes-large-bump-content.docx` | Body content pushed past page boundary by footnote demand |
| `footnotes__longer-header-with-footnotes.docx` | Header + footnote reserve interaction |
| `pagination__pagination_footnote_break.docx` | Pagination-specific footnote break case |

**Missing from corpus (referenced in SD-1680 / SD-2649):** Carlsbad/Torke `086 - Carlsbad Technology Inc v HIF Bio Inc.docx` and `Footnote overlapping footer text2 (1).docx`. **Action:** download from Linear (signed URLs likely expired — re-attach from human source), then `pnpm corpus:upload <file> --issue SD-2656 --description carlsbad-torke` and `--description footnote-overlap-footer`, so layout/visual regression suites can pick them up automatically.

---

## 3. Cluster A — Footnote pagination (SD-3049, SD-3050, SD-3051) — **start here**

### 3.0 Cluster framing

PR #2881 made the post-hoc reserve loop *safe* — fragments no longer overflow the page bottom. It did **not** make the body paginator *aware* — when references shift between pages or carry a continuation forward, the paginator still chooses break points using last pass's reserve, not the demand it is about to create. Visible symptoms: large blank gaps on dense pages (Harvey NVCA), under-filled bodies after a long footnote on the prior page (Torke), oscillation that converges but to the wrong distribution.

The three slices are **strictly ordered**. Each builds on the previous:

1. **SD-3049** — give body break the per-page demand signal for refs anchored on the *current* page.
2. **SD-3050** — extend that signal to carry forward unfinished footnotes from *prior* pages (continuation demand).
3. **SD-3051** — stabilize convergence when the demand signal causes refs to migrate between pages mid-iteration.

**Do not collapse them into one PR.** Each slice has a self-contained verifiable outcome; a combined PR will regress and we will have no bisection signal.

---

### 3.1 SD-3049 — Body break consults footnote demand for refs anchored on this page

#### 3.1.1 Reproduced bug (verified, with measurements)

**Fixture:** `harvey-problem-docs/NVCA Model SPA.docx` (137 KB, 108 footnote refs, 405 PM paragraphs).

**Word baseline:** 51 pages (R2 `msword-baselines/harvey/HVY - 03_[Public] Updated Template - NVCA-Model-SPA-10-28-2025.docx/`, manifest confirms 51 page PNGs).

**SuperDoc on `main` (commit `a81c2d434`):** ~57 pages (`superdocScrollH = 63696px ÷ ~1126px/page`). **+6 pages, +12% over-pagination.**

**Per-page body→separator gap measured on the first 7 visible pages:**

| Page | Body bottom y | Sep top y | Gap | Legit overhead | Excess gap |
|---|---|---|---|---|---|
| 1 | 887 | 905 | 18px | 24px | -6px (fine) |
| **2** | 567 | 609 | **42px** | 24px | **+18px** |
| 3 | 853 | 884 | 31px | 24px | +7px |
| **4** | 668 | 697 | **29px** | 24px | +5px |
| 5 | 815 | 838 | 23px | 24px | -1px (fine) |
| 6 | 718 | 740 | 22px | 24px | -2px (fine) |
| 7 (last) | 680 | 701 | 21px | 24px | -3px (end of doc) |

`legit overhead = separatorSpacingBefore (12px) + dividerHeight (6px) + topPadding (6px)`. Anything beyond is real blank space.

Page 2 also leaves 41px between footnote band bottom (920px) and page footer top (961px) — extra under-utilization of the reserve. Total wasted vertical on page 2 alone: **~83px (≈ 4 body lines)**. Compounded across 50+ pages, this is the +6 page bloat.

**This is the falsifiable, measurable bug for SD-3049.**

#### 3.1.2 OOXML grounding (verified)

- `w:pos` § 17.11.21 — placement is `pageBottom` (default), `beneathText`, `sectEnd`, `docEnd`. Pagination cares about `pageBottom` (current scope); other modes are SD-2986.
- `ST_FtnPos = { pageBottom, beneathText, sectEnd, docEnd }`.
- We are **not** changing semantics of `pos` — only making the paginator demand-aware for the existing pageBottom case.

#### 3.1.3 Verified code surface (line numbers from current `main`)

| File | Symbol | Lines | What it does |
|---|---|---|---|
| `layout-bridge/src/incrementalLayout.ts` | `FootnotesLayoutInput` type | 79–87 | `{ refs: FootnoteReference[]; blocksById: Map<string, FlowBlock[]>; gap?, topPadding?, dividerHeight?, separatorSpacingBefore? }` |
| `layout-bridge/src/incrementalLayout.ts` | `isFootnotesLayoutInput` guard | 89–95 | Validates `options.footnotes` shape |
| `layout-bridge/src/incrementalLayout.ts` | `measureFootnoteBlocks` | 1337–1363 | Async measures each footnote block's height — already runs before the loop |
| `layout-bridge/src/incrementalLayout.ts` | `computeFootnoteLayoutPlan` | 1365–1573 | Computes per-page demand (1409–1426), per-page reserve (1539–1545), continuation pending (1429–1436, 1548–1550) |
| `layout-bridge/src/incrementalLayout.ts` | reserve loop | 1843–1872 | Up to `MAX_FOOTNOTE_LAYOUT_PASSES = 4` body relayouts |
| `layout-bridge/src/incrementalLayout.ts` | `relayout` | 1818–1830 | Calls `layoutDocument(currentBlocks, currentMeasures, { …options, footnoteReservedByPageIndex })` |
| `layout-bridge/src/incrementalLayout.ts` | `growReserves` | 1919–1942 | Monotonic post-loop convergence |
| `layout-engine/src/index.ts` | `LayoutOptions.footnoteReservedByPageIndex` | 477 | `number[]` per-page bottom-margin add-on |
| `layout-engine/src/index.ts` | `LayoutOptions.footnotes` | 482 | **Currently typed `unknown`, not consumed in layout-engine** |
| `layout-engine/src/index.ts` | `getActiveBottomMargin` | 1252–1258 | Reads `options.footnoteReservedByPageIndex[pageIndex]`, adds to `activeBottomMargin` — **the only signal layout-engine sees today** |
| `layout-engine/src/layout-paragraph.ts` | break decision | 821–833 | `if (state.cursorY >= state.contentBottom) advanceColumn`; `if (remainingHeight < nextLineHeight) advanceColumn` |
| `contracts/src/index.ts` | `Page.footnoteReserved` | 1792 | Per-page reserved band height (used by painter at `painters/dom/src/renderer.ts:2476`) |

#### 3.1.4 Approach (verified, surgical)

The bug is that the paginator's only signal is **page-level reserve added to bottom margin**. That signal is uniform across the page — it doesn't know that the first 4 lines of the page don't need reserve (because no ref has been committed yet) but the last line does (because it carries a ref that drags 200px of footnote body with it). So either:
- pass 1 has no reserve → body fills to bottom → ref ends up with footnote forced into separator overhead → next pass adds reserve, body re-breaks earlier, leaves blank gap, OR
- pass 2+ has uniform reserve → body breaks earlier than necessary throughout the page → page underfilled

**The surgical fix gives the paginator block-level awareness**: as fragments commit to a page, accumulate the footnote demand contributed by refs they contain. Use the accumulated demand as a *floor* for the bottom-margin reserve, but only after refs have been committed.

**Concrete steps:**

1. **Promote `options.footnotes` to a typed value in `layout-engine/src/index.ts`** (currently `unknown`). Type it as the existing `FootnotesLayoutInput` (move/import the type from layout-bridge — or re-declare a layout-engine-internal subset).
2. **Add a derived field**: `FootnotesLayoutInput.bodyHeightById?: Map<string, number>`. Layout-bridge populates it before `relayout` from the measures it already computes (sum of `measure.totalHeight` for each footnote's blocks, plus per-footnote separator/gap overhead).
3. **In layout-engine**, build a fast lookup at start of `layoutDocument`: `refsByBlockId: Map<string, Array<{id, pos, height}>>` derived from `options.footnotes.refs` + `bodyHeightById`. (Each ref's pos is mapped to the FlowBlock that contains it — the block whose `pmStart <= pos <= pmEnd`.)
4. **Add paginator state**: `state.footnoteDemandThisPage: number` (initialized to `safeSeparatorSpacingBefore + dividerHeight + topPadding` if the page will get any footnote, else 0).
5. **Modify break decision in `layout-paragraph.ts:821–833`**: replace `state.contentBottom - state.cursorY` with `(state.contentBottom + state.pageBottomReserveCancellation) - state.cursorY - state.footnoteDemandThisPage`. (We *cancel* the page-level reserve because we now compute it dynamically; falls back to existing reserve if `state.footnoteDemandThisPage === 0`.)
6. **On line/fragment commit**, if the fragment's pm range contains a ref, add that ref's body height to `state.footnoteDemandThisPage`.
7. **On page advance**, reset `state.footnoteDemandThisPage` to the per-page baseline.
8. **Layout-bridge changes**: skip seeding `footnoteReservedByPageIndex` on pass 1. After pass 1 with block-level demand, reserves should already be near-correct; the existing 2-4 pass loop continues to absorb residual oscillation.

**Why this works:** the body fills tight to "next line + cumulative footnote demand exceeds page bottom." When no ref has been committed yet, demand is 0 and body fills as if no footnote existed. As soon as a ref commits, demand jumps by that footnote's height and the next break decision sees the constraint. No blank gap, no global over-reservation.

#### 3.1.5 Files to touch (verified, ordered)

1. **`packages/layout-engine/layout-engine/src/index.ts`** — type `options.footnotes` properly (line 482); thread `refsByBlockId` into paginator.
2. **`packages/layout-engine/layout-engine/src/layout-paragraph.ts`** — paginator state + break decision (around line 821–833).
3. **`packages/layout-engine/layout-bridge/src/incrementalLayout.ts`** — populate `bodyHeightById` from measures before first `relayout` (between lines 1834 and 1844).
4. **`packages/layout-engine/contracts/src/index.ts`** — only if `FootnotesLayoutInput` needs to move from layout-bridge to contracts to be shared. **Prefer not** — keep it in layout-engine to minimize coupling.
5. **`packages/layout-engine/layout-bridge/test/footnoteBodyDemand.test.ts`** — new RED test (see 3.1.7).

**Surgical surface estimate:** ~150–250 LoC across these 4–5 files. No new files in painter; no new files in pm-adapter.

#### 3.1.6 Verifiable success criteria

1. **Page count parity:** `harvey-problem-docs/NVCA Model SPA.docx` renders ≤ 53 pages (within +5% of Word's 51). Today: ~57 pages.
2. **Per-page gap budget:** for every page rendering footnotes, body→separator gap ≤ 28px (legit 24 + 4px slack). Today page 2 has 42px, page 3 has 31px.
3. **No fragment escapes the band:** existing `footnoteBandOverflow.test.ts` stays green.
4. **No-footnote docs are byte-identical**: layout-snapshot diff against any non-footnote fixture is zero. Add an explicit unit test for this.
5. **Reserve loop converges in ≤ 2 passes** for the existing `footnoteMultiPass.test.ts` scenario (currently needs ≥ 2 because pass 1 wastes the layout). Should drop to ≤ 1 effective pass after this change.

#### 3.1.7 RED test scaffold (verified pattern from existing tests)

```ts
// packages/layout-engine/layout-bridge/test/footnoteBodyDemand.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph', id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});
const makeMeasure = (lineHeight: number, lineCount: number): Measure => ({
  kind: 'paragraph',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    fromRun: 0, fromChar: i, toRun: 0, toChar: i + 1,
    width: 200, ascent: lineHeight * 0.8, descent: lineHeight * 0.2, lineHeight,
  })),
  totalHeight: lineCount * lineHeight,
});

describe('SD-3049: body break consults anchored footnote demand', () => {
  it('packs body lines tighter when footnote demand is known up-front', async () => {
    // Page can hold 30 lines × 20px = 600px body + 156px reserve.
    // 1 ref in body line 25, footnote = 5 lines (60px including overhead).
    // Today (post-hoc reserve): pass 1 lays out 30 lines, ref ends up on this page
    // → reserve grows to 60px → pass 2 caps body at ~27 lines → 3 lines move to next page
    // → page 1 has 27-line body bottom + ~24px gap + 60px reserve = blank gap above sep.
    // After SD-3049: paginator knows about ref's 60px demand at line 25, so when committing
    // line 25 it sees "remaining = 600 - 480 - 60 = 60px = 3 lines" and breaks at line 28
    // (line 25 + 3 more lines fit). Body bottom ≈ 560px, sep top ≈ 584px (gap = 24px legit only).

    const BODY_LINES = 30;
    const FOOTNOTE_LINES = 5;
    const LINE_H = 20;

    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < BODY_LINES; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const refPos = blocks[24].runs![0].pmStart! + 2; // ref inside body line 25
    const ftBlock = makeParagraph('footnote-1-0-paragraph', 'Footnote body content.', 0);

    const measureBlock = vi.fn(async (b: FlowBlock) => {
      if (b.id.startsWith('footnote-')) return makeMeasure(12, FOOTNOTE_LINES);
      return makeMeasure(LINE_H, 1);
    });

    const result = await incrementalLayout([], null, blocks, {
      pageSize: { w: 612, h: 600 + 144 }, // 600px body + 72/72 margins
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      footnotes: {
        refs: [{ id: '1', pos: refPos }],
        blocksById: new Map([['1', [ftBlock]]]),
        topPadding: 4, dividerHeight: 2,
      },
    }, measureBlock);

    expect(result.layout.pages.length).toBe(1); // RED today (likely 2 pages); GREEN after fix
    const page1 = result.layout.pages[0];
    const bodyMaxY = Math.max(
      ...page1.fragments
        .filter(f => !String(f.blockId).startsWith('footnote-'))
        .map(f => (f.y ?? 0) + ('height' in f ? (f.height as number) : 0)),
    );
    const sepFrag = page1.fragments.find(f => String(f.blockId).startsWith('footnote-separator'));
    const sepTopY = (sepFrag as { y?: number })?.y ?? Infinity;
    expect(sepTopY - bodyMaxY).toBeLessThanOrEqual(28); // 24 legit + 4 slack
  });
});
```

**Why this RED test is faithful**: it doesn't mock `layoutDocument`. It exercises the real layout engine, the real footnote plan, and asserts on `Layout.pages[i].fragments`. Mirrors the existing `footnoteMultiPass.test.ts` and `footnoteBandOverflow.test.ts` patterns exactly. (Testing-excellence rule: managed dependencies are not mocked.)

#### 3.1.8 Risk / blast radius

- **Non-footnote docs**: when `options.footnotes.refs.length === 0` or `options.footnotes` is undefined, `state.footnoteDemandThisPage` stays 0 and break decisions are unchanged. Add an explicit unit test that a doc with 100 paragraphs and zero footnotes produces byte-identical layout before/after.
- **Multi-column footnotes (SD-2985 fixture)**: demand is column-scoped today (lines 1410–1426). The block-level demand must respect column scoping — a ref in column 1 shouldn't penalize column 2's body. The paginator already tracks `state.columnIndex`; piggyback on it.
- **Pages 1's title-page-style fixtures**: title pages with no footnotes shouldn't see any change. Same as the no-footnote case.
- **Tables containing refs**: a ref inside a table cell is handled by the same path (table fragments get pm ranges). Verify with `multi-column-footnotes.docx` and a synthetic test where a ref lives inside a table cell.

---

### 3.2 SD-3050 — Continuation-aware break (carry-forward demand from prior page)

**Current behavior**

`pendingByColumn` (line 1393) carries unfinished footnote slices to the next page in the *plan*, but the body paginator on the next page does not see those slices' future demand — it only sees the reserve that will eventually grow to absorb them.

**Approach**

1. Augment `footnoteDemandByRef` with a synthetic "continuation pseudo-ref" at `pos = 0` of each page that has carry-forward demand. Demand value = remaining unsliced height of the carry-forward footnote.
2. The body paginator on page N+1 reads pseudo-ref's demand from `pageStart`, reserves that height before laying out *any* body content, then proceeds with anchored refs as in SD-3049.

**Files**

- `incrementalLayout.ts` — produce continuation pseudo-refs in the demand map between passes
- `layout-paragraph.ts` — handle pseudo-ref at page-start

**Verifiable success criteria**

- `footnotes-large-bump-content.docx`: a footnote that Word splits across pages 1–2. Today: page 2 body starts at `topMargin` because the paginator forgets the carried-over footnote. After: page 2 body starts at `topMargin + carryoverDemand`. Specific pixel assertion in unit test.
- Layout-snapshot diff vs published baseline: page 2 of `footnotes-large-bump-content` body cursor moves down by ≥ 1 line, ≤ continuation-slice height.
- All footnote tests still green.

**TDD plan**

1. **RED**: `footnoteContinuationDemand.test.ts`. Given a 200-px-tall footnote anchored at end of page 1 with only 80px reserve room on page 1, expect page 2's body cursor to start `120px` below page 2 top margin. Fails today.
2. **GREEN**: Implement pseudo-ref pipeline.
3. **REFACTOR**: Unify "demand at ref" and "demand at page start" into `PageDemandSchedule` so SD-3051 can mutate it deterministically.

**Risk**

- Pseudo-ref ID space must not collide with real refs. Use a sentinel `__continuation_<pageIdx>` and assert at type level it cannot leak into PM positions.

---

### 3.3 SD-3051 — Stabilize when refs migrate between pages during convergence

**Current behavior**

After SD-3049 + SD-3050, the body paginator will produce different breaks than before. This will move some refs to a different page than the previous pass placed them. The reserve loop merges element-wise max (PR #2881), but the *demand schedule* used by the body paginator is not yet bounded the same way — it can flip between two configurations and never settle on the correct one.

**Approach**

1. Treat the demand schedule itself as the convergence variable, not just `reserves`. Each pass produces `(reserves, demandSchedule)`; both must be element-wise-monotonic for the loop to converge.
2. Introduce a "stable-once-anchored" rule: once a ref is assigned to page P at iteration K, in iteration K+1 it can move to page < P (earlier, more demand) but never to page > P (later, less demand) within a single layout. Migration is one-way until convergence.
3. Bound the loop by `MAX_FOOTNOTE_LAYOUT_PASSES` (already 4) **and** add a "no-improvement" early-exit: if `(reserves, demandSchedule)` are byte-identical to the previous pass, stop.
4. Final stabilization: if after `MAX_PASSES` passes refs are still oscillating, fall back to the most-recent passing layout where every ref is on a page where its demand fits — log a metric, do not crash, do not produce a layout that overflows.

**Files**

- `incrementalLayout.ts` — `growReserves` becomes `growDemandAndReserves`; add migration-direction invariant
- New test file `footnoteRefMigration.test.ts`

**Verifiable success criteria**

- Build a synthetic 3-page input where SD-3049's demand-aware break would push ref-7 from page 2 to page 1 (it now fits because page 1 had blank gap), and ref-7's footnote body was previously assigned to page 2's reserve. After fix: ref-7 and its body both end up on page 1; pages 2 and 3 redistribute without leaving a blank page.
- Harvey NVCA Model SPA: total page count ≤ Word page count + 0 (currently +N due to over-pagination). Capture before/after page counts in PR.
- Loop never exceeds 4 passes for any fixture in the existing test suite (instrument with `pages.passes` metric in test output).

**TDD plan**

1. **RED**: 3-page synthetic input with provoked migration. Today: oscillates and converges with ref on wrong page. Fails after assert "ref-7 on page 1 final".
2. **GREEN**: Implement monotonic demand schedule + one-way migration rule.
3. **Existing tests** (`footnoteMultiPass`, `footnoteBandOverflow`, `footnoteColumnPlacement`) — must stay green throughout. Run them after every commit in this slice.

**Risk**

- One-way migration is a strong invariant — verify against Carlsbad/Torke (which is *the* convergence case). If we can't reproduce Carlsbad locally yet, this slice cannot ship; flag as blocker for fixture upload.

---

### 3.4 Cluster A — combined acceptance walkthrough

Before merging slice 3, run this full validation:

```bash
# unit
pnpm --filter @superdoc/layout-bridge test
# layout snapshot vs latest stable
pnpm test:layout --match "footnote|harvey|carlsbad|nvca"
# pixel diff for any document that diverged
pnpm test:visual
# behavior in the browser
pnpm dev   # then open each fixture and screenshot pages 1-N
```

Record before/after page-by-page screenshots for the three demo fixtures (Harvey, Torke, large-bump) in the SD-3051 PR description. Anything less is not "verified" per analyze-issue iron rule #3.

---

## 4. Cluster B — Footnote Configuration (SD-2986) — after pagination

Subsumes the archived SD-2657 (numbering semantics) and SD-2661 (placement modes).

### 4.1 OOXML grounding

| Element | XSD | Spec |
|---|---|---|
| `w:footnotePr` (settings + sectPr) | `CT_FtnDocProps` / `CT_FtnProps` | §17.11.11 (section), §17.11.12 (document) |
| `w:pos` | `CT_FtnPos` ⊃ `ST_FtnPos = {pageBottom, beneathText, sectEnd, docEnd}` | §17.11.21 |
| `w:numFmt` | `CT_NumFmt` ⊃ `ST_NumberFormat` (63 enum values: decimal, upperRoman, lowerRoman, upperLetter, lowerLetter, ordinal, …) | §17.11.18 |
| `w:numStart` | `ST_DecimalNumber` | §17.11.19 |
| `w:numRestart` | `ST_RestartNumber = {continuous, eachSect, eachPage}` | §17.11.20 |

Section-level `w:footnotePr` overrides document-level. **Important normative note**: per §17.11.21, `w:pos` at the section level **shall be ignored** when the document-level `pos` is present (the spec contradicts itself in places — verify against Word behavior on a real fixture; capture which producer "wins" in our test).

### 4.2 Slice plan (3 PRs)

#### Slice B1 — Numbering format (`w:numFmt`)

- **Files**: `pm-adapter/src/converters/inline-converters/footnote-reference.ts` → `resolveFootnoteDisplayNumber`. Replace cardinal-from-order with `formatNumber(cardinal, numFmt)` using a new `formatOoxmlNumber` helper.
- **Coverage**: prioritize `decimal` (already), `upperRoman`, `lowerRoman`, `upperLetter`, `lowerLetter`. Defer the 58 ideograph/Asian formats to a later slice unless corpus has them.
- **Test**: unit test per format. Single-source-of-truth helper used by both the inline reference and the leading marker, so they cannot drift.

#### Slice B2 — Numbering start + restart (`w:numStart`, `w:numRestart`)

- **Files**: footnote numbering pre-pass in pm-adapter. Today the cardinal is `index + 1`; instead, derive cardinal by walking sections and pages with `numStart` / `numRestart` rules.
- **Test**: 3 fixtures — `continuous` (start=5), `eachPage` (start=1), `eachSect` (mid-doc section break with start=1).

#### Slice B3 — Placement (`w:pos = beneathText`)

- **Surface**: layout-bridge — when `pos = beneathText`, footnote slices render immediately after the paragraph that contains the ref, not in the page-bottom band.
- **This is non-trivial** — it inverts the reserve model. Suggest splitting again into B3a (parse + plumb the value) and B3b (alternate placement renderer). Do **not** start B3b until pagination cluster is stable; the two systems share the demand schedule and we don't want to debug both at once.
- **Defer `sectEnd` / `docEnd` to a follow-up** unless corpus shows demand. They are end-of-document layouts that look more like endnotes; reusing endnote infrastructure may be cheaper.

### 4.3 Verifiable success criteria

- `layout/Simple OnlyOffice.docx` and `IT-864__Template_Test_Report.docx`: imported `numFmt`, `numStart`, `numRestart` round-trip and render correctly. Visual diff vs Word baseline (pull via `--bucket word`).
- `IT-921__Keyper-Series-A-Shareholders-Agreement.docx`: section-level overrides survive.
- Existing footnote tests stay green.

---

## 5. Cluster C — Footnote Separators (SD-2985) — after pagination

Subsumes the archived SD-2659.

### 5.1 OOXML grounding

| Element | Mechanism |
|---|---|
| `w:footnote w:type="separator"` | Special record in `word/footnotes.xml` |
| `w:footnote w:type="continuationSeparator"` | Special record |
| `w:footnote w:type="continuationNotice"` | Special record (see SD-2660) |
| `ST_FtnEdn = {normal, separator, continuationSeparator, continuationNotice}` | Type enum |
| `<w:footnote w:id>` in `w:footnotePr` | Document-level pointer to which IDs are special |

Importer already preserves these (per ticket "current support" notes). Renderer currently draws a generic 1px separator.

### 5.2 Slice plan

1. **Slice C1 — render the separator's actual content** (run-properties from the `w:footnote w:type="separator"` body), not a hardcoded line. Honor inline run width if defined; fall back to current 1px when empty.
2. **Slice C2 — render the continuationSeparator** (broader by default in Word; spans the body width). Already structurally distinct in `incrementalLayout.ts:1633–1674`; this slice replaces the styling source.
3. **Slice C3 — separator spacing** is already well-tested (`footnoteSeparatorSpacing.test.ts`); only adjust if C1/C2 changes baseline pixels.

### 5.3 Files

- `incrementalLayout.ts:1575–1700` (`injectFragments`) — separator generation
- pm-adapter — expose separator paragraph runs as a normalized `SeparatorContent`
- `painters/dom/src/renderer.ts` — apply borders / inline run as DOM

### 5.4 Tests

- Add `footnoteSeparatorContent.test.ts` — assert separator DOM matches `w:separator` body (e.g., a doc with custom-styled separator runs).
- Existing `footnoteSeparatorSpacing.test.ts` must stay green.

---

## 6. Cluster D — Residual / archived items (SD-2987 + ambiguous)

### 6.1 SD-2987 — residual footnotes

This ticket says "core implementation works, child gaps remain." After clusters A/B/C it should reduce to a punch list. Re-scope at that point, not now.

### 6.2 SD-2658 — Custom marks (`customMarkFollows`)

OOXML hook: `<w:footnoteReference customMarkFollows="1" w:id="N">` followed by a literal-symbol run (e.g., `<w:t>*</w:t>`). The reference does not produce an automatic number — the next run *is* the visible mark.

- **Verify reproduction first**. If the import path already preserves the symbol run and only the synthesized superscript needs to be suppressed, this is a 20-line fix in `pm-adapter/footnote-reference.ts`.
- If reproduction shows the symbol is dropped during import, this is a bigger fix in `super-converter/v3/handlers/w/footnoteReference/`.
- **Decide via repro before committing scope.**

### 6.3 SD-2660 — Continuation notice rendering

OOXML hook: `<w:footnote w:type="continuationNotice">…body…</w:footnote>`. Word renders this *below* the continuation slice on the page where the footnote continues. Today SuperDoc imports it (preserved on round-trip) but never renders it.

- Reuse the slice-injection path in `incrementalLayout.ts:1575–1700`. After the last continuation slice on a continuing page, emit a `continuationNotice` slice with the notice body.
- One unit test, one corpus fixture (need to source — none of the pulled fixtures have a continuation notice; check Keyper or upload a synthetic).
- **Cheap win** if pagination is stable — schedule after Cluster A.

### 6.4 SD-2662 — Marker styling parity

Today the leading marker in the footnote body uses synthesized Unicode superscript. Fix: read `rPr` from the `w:footnoteRef` run and apply it. Strict styling parity. Should fall out for free from SD-2657's "single source of truth" helper if implemented carefully — verify and close as duplicate of SD-2986/B1 once that ships.

---

## 7. Cross-cutting work (must not be skipped)

### 7.1 Fixture infrastructure

- Upload Carlsbad/Torke and Footnote-overlapping-footer to R2:
  ```bash
  pnpm corpus:upload <file> --issue SD-2656 --description carlsbad-torke
  pnpm corpus:upload <file> --issue SD-2656 --description footnote-overlap-footer
  pnpm corpus:pull
  ```
- Verify `pnpm test:layout` and `pnpm test:visual` discover the new fixtures.

### 7.2 Word baselines

For visual regression, fetch Word-rendered PDFs via `--bucket word` for each named fixture *before* writing any fix. Without a Word baseline, "matches Word" is unfalsifiable.

### 7.3 Eval coverage

Promote one footnote-pagination smoke test into the Level 2 / Level 3 eval (`evals/`). Specifically: agent reads a footnote across a page break in Harvey NVCA. If pagination breaks future regressions will be caught by the eval suite, not just by visual review.

### 7.4 CLAUDE.md update

After cluster A ships, add a "Footnote pagination" section to `.claude/CLAUDE.md` documenting:
- where the demand schedule lives
- the one-way migration invariant
- the layered convergence (demand → reserves → relayout)

This satisfies the auto-memory rule "every time I learn something new about the codebase, I MUST update CLAUDE.md."

---

## 8. Suggested execution order (with rough estimates)

| # | Issue | Estimate | Depends on |
|---|---|---|---|
| 1 | Upload Carlsbad/Torke + footer-overlap fixtures | 30 min | — |
| 2 | Pull Word baselines for all named fixtures | 30 min | (1) |
| 3 | **SD-3049** — anchored demand → body break | 1.5 days | (2) |
| 4 | **SD-3050** — continuation-aware break | 1 day | (3) |
| 5 | **SD-3051** — convergence stabilization | 2 days | (4) |
| 6 | Update CLAUDE.md + memo | 1 hour | (5) |
| 7 | **SD-2986/B1** — numFmt | 0.5 day | (5) |
| 8 | **SD-2986/B2** — numStart + numRestart | 1 day | (7) |
| 9 | **SD-2985** — separator content fidelity | 1 day | (5) |
| 10 | SD-2660 — continuation notice (if in scope) | 0.5 day | (5) |
| 11 | SD-2658 — custom marks (verify repro first) | 0.5–2 days | — |
| 12 | **SD-2986/B3** — `pos = beneathText` | 2 days | (5), (7), (8) |
| 13 | SD-2987 — residual punch list | reassess | (6)–(12) |

Total realistic estimate: ~10 dev days, plus fixture/baseline/eval work.

---

## 9. Open questions to resolve before coding starts

1. **Fixture availability** — Are Carlsbad/Torke/footer-overlap available from a non-expired source so we can upload them? If not, can we reproduce the convergence bug from synthetic inputs alone?
2. **Archived ticket disposition** — Confirm with PM whether SD-2658, SD-2660, SD-2662 are intentionally deferred or expected as part of SD-2987.
3. **`w:pos` section vs document precedence** — Spec is ambiguous; verify which Word actually honors using a real fixture (build one with a section-level override and compare to Word's PDF print).
4. **`numRestart eachPage` vs our pagination** — Restarting per *page* couples numbering to layout output. This creates a chicken/egg with pagination convergence (numbers depend on pages, pages may depend on numbers if number-width changes line wrap). Decide: do we feed numbers back into the layout pass, or freeze numbers from page assignment of the prior pass and accept one-pass lag? **Recommendation: freeze + lag, document the limitation.**
5. **Eval owner** — Who promotes the footnote pagination smoke test into the Level 3 benchmark, and against which fixture?

---

## 10. References

- [SD-2656 epic](https://linear.app/superdocworkspace/issue/SD-2656)
- [SD-1680 (closed) — original overflow fix](https://linear.app/superdocworkspace/issue/SD-1680) — PR [#2881](https://github.com/superdoc-dev/superdoc/pull/2881), commits `adf4ea62e`, `70d4c85b1`, `2ce2f9f7e`
- ECMA-376 §17.11 — Footnotes part (`part1.txt:37793–38618`)
- `.claude/CLAUDE.md` § "Architecture: Rendering" and § "Style Resolution Boundary"
- `.claude/skills/ooxml-spec` — for any further OOXML lookup
- `.claude/skills/karpathy-guidelines` — surgical changes, verifiable criteria
- `.claude/skills/testing-excellence` — TDD discipline, no mocking managed dependencies
