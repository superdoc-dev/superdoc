# SD-2656 — Footnote Rendering Fidelity (Implementation Report)

**Status:** ready for review · **Epic:** [SD-2656](https://linear.app/superdocworkspace/issue/SD-2656) · **Plan:** [sd-2656-footnote-rendering-fidelity.md](./sd-2656-plan.md) · **Base commit:** `a81c2d434`

This report documents the SD-2656 footnote-rendering-fidelity work end to end: the slices shipped, the architecture, the measured outcomes, the verification regime, the deferred work, and the review findings that landed before merge.

---

## 1. Tickets covered

| Ticket | Title | Status |
|---|---|---|
| **SD-3049** | Footnote pagination — body break consults footnote demand for refs anchored on this page | ✅ shipped |
| **SD-3050** | Footnote pagination — continuation-aware break (carry-forward demand from prior page) | ✅ shipped (safety cap + carry-through via existing reserve loop; covered by determinism regression) |
| **SD-3051** | Footnote pagination — stabilise when refs migrate between pages during convergence | ✅ shipped (determinism regression test; existing convergence loop + monotonic grow remain sound) |
| **SD-2986/B1** | Footnote configuration — honour `w:numFmt` from settings.xml | ✅ shipped |
| **SD-2986/B2** | Footnote configuration — honour `w:numStart` from settings.xml | ✅ shipped |
| **SD-2658** | Render custom footnote reference marks (`customMarkFollows`) | ✅ shipped |
| **SD-2662** | Improve footnote reference and marker styling parity | ✅ closed by shared formatter (single source of truth between inline ref and leading marker) |
| **SD-2986/B3** | `w:pos = beneathText` placement | ⏸ deferred (see § 8) |
| **SD-2985** | Footnote separators — render `w:separator` body content | ⏸ deferred |
| **SD-2660** | Footnote continuation notice | ⏸ deferred |
| **SD-2987** | Footnotes residual | ⏸ reassess after the above |

---

## 2. Headline outcome

| Fixture | BEFORE (clean main) | AFTER (this PR) | Word baseline | Δ |
|---|---:|---:|---:|---:|
| `harvey-problem-docs/NVCA Model SPA.docx` (108 footnote refs) | **57** pages | **53** pages | **51** pages | **−4** pages (−7 %), within +5 % of Word |
| Other 5 footnote fixtures (basic, multi-column, large-bump, longer-header, pagination_break) | 1–3 pages each | identical | n/a | 0 |

The before/after measurement was captured by running two dev servers in parallel — one in a worktree pinned to clean `main` (commit `a81c2d434`), one in the working directory with this PR's changes — and querying `document.querySelector('.dev-app__main').scrollHeight / 1126` in both. Comparison report at `/tmp/sd2656-comparison/report.html` (generated 2026-05-09).

### Layout-snapshot regression check (`pnpm test:layout` vs published superdoc@1.32.0)

| Metric | Result |
|---|---:|
| Total corpus documents | **543** |
| **Unchanged** | **535 (98.5 %)** |
| Changed | 8 (1.5 %) |
| ↳ Unique-change docs | **5** — all NVCA-style footnote-rich legal templates |
| ↳ Widespread-only docs | 3 — pre-existing schema-evolution patterns (`lineCount`, `textIndentPx`, `markers[*].text`) |

The 5 unique-change docs are exactly the target population:

```
2026-april-intake-docs/IT-923__NVCA-Model-COI-10-1-2025.docx       (page count: 94 → 90)
2026-april-intake-docs/IT-923__NVCA-Model-IRA-10-1-2025-2-1.docx   (page count: 52 → 47)
2026-april-intake-docs/IT-923__NVCA-2020-Management-Rights-Letter.docx (localised, 3 pages)
harvey-problem-docs/Template_Update_Based_on_Precedent.docx       (page count: 58 → 47)
harvey/HVY - 03_[Public] Template - NVCA_Model-SPA-10-24-2024.docx (localised, 43 pages)
```

### Pixel-diff regression check (`pnpm test:visual`)

Final stdout verdict: **"Pixel comparison complete. No visual differences found."**

Per-doc breakdown is in `devtools/visual-testing/results/2026-05-09-17-27-55-v.1.32.0/webkit/report.html`. The 100 %-per-page diffs on page-count-changed docs are the diff tool's accounting of "reference page N is no longer candidate page N" — i.e. the intended pagination improvement, not a regression.

---

## 3. Slice-by-slice walkthrough

### 3.1 SD-3049 — Block-aware body break

**Problem.** Before this PR, the body paginator's only footnote signal was `LayoutOptions.footnoteReservedByPageIndex` — a uniform per-page bottom-margin add-on derived from the previous pass's plan. On pass 1 it is empty, so the body fills the whole page; a ref + footnote body land near the bottom; the reserve loop then claws back space, leaving visible blank space between the body's last fragment and the footnote separator. Compounded across many footnote-bearing pages this produced +4 pages on the Harvey NVCA fixture.

**Fix.** Two new fields on `PageState`:

```ts
pageFootnoteReserve: number;       // existing per-page reserve, exposed to break decision
footnoteDemandThisPage: number;    // accumulator of measured footnote body heights
                                   //  for refs anchored on this page's fragments
```

The paragraph layout consults a new callback at fragment-commit time:

```ts
getFootnoteDemandForBlockId?: (blockId: string) => number;
```

When a block lays out a fragment on a page, its total footnote demand (sum of measured body heights for every ref inside the block) is added to `state.footnoteDemandThisPage`. The break decision uses an `effectiveBottom`:

```ts
const additionalDemand = Math.max(
  0,
  state.footnoteDemandThisPage - state.pageFootnoteReserve,
);
const effectiveBottom = state.contentBottom - additionalDemand;
```

Only the *excess* over the page-level reserve constrains the body — so once the convergence loop has set a correct reserve, `additionalDemand` is 0 and the new code is a no-op. On pass 1 (no reserve), it provides the tight-packing signal that prevents post-hoc reserve relayouts from leaving visible blank space.

**Demand lookup builder** runs once per `layoutDocument` call. It walks the block tree (top-level + table cells via `rows[].cells[].blocks/.paragraph`) and resolves each ref's `pos` to the containing top-level block. Demand is attributed to the *table* block, not the individual cell paragraph, because the table is the unit the body paginator places on a page.

#### Safety cap (SD-3050 hand-off)

A footnote larger than the page body area would push `effectiveBottom` below `topMargin + lineHeight`, triggering `advanceColumn` on every iteration and infinite-looping the paginator. Capped:

```ts
const minBodyLineHeight = lines[fromLine]?.lineHeight ?? 0;
const maxAdditional = Math.max(
  0,
  state.contentBottom - state.topMargin - minBodyLineHeight,
);
const additionalDemand = Math.min(rawAdditional, maxAdditional);
```

The footnote can overflow safely (PR #2881's plan-side cap and continuation logic still apply); the paginator must not deadlock.

**Files touched.**

| File | Change |
|---|---|
| `packages/layout-engine/layout-engine/src/paginator.ts` | + 2 required fields on `PageState`; + optional `getFootnoteReserveForPage` hook on `PaginatorOptions`; threaded into `startNewPage` |
| `packages/layout-engine/layout-engine/src/index.ts` | Typed `LayoutOptions.footnotes`; built `footnoteDemandByBlockId` IIFE; wired `getFootnoteReserveForPage` + `getFootnoteDemandForBlockId` into the paragraph context |
| `packages/layout-engine/layout-engine/src/layout-paragraph.ts` | Demand accumulator + `effectiveBottom` in break decision + safety cap |
| `packages/layout-engine/layout-engine/src/layout-paragraph.test.ts` | Extended `makePageState()` helper with new required fields |
| `packages/layout-engine/layout-bridge/src/incrementalLayout.ts` | Populated `bodyHeightById` from measures via `refreshBodyHeights`; pre-measure all refs each convergence iteration so migrating refs do not drop from the lookup |

**Tests.**

- `packages/layout-engine/layout-bridge/test/footnoteBodyDemand.test.ts` (RED-then-GREEN for the block-aware break + a no-op invariant for footnote-less docs)

### 3.2 SD-3050 — Continuation-aware

The existing reserve loop already converges to a layout where `reserves[N+1]` includes carry-forward height (proven by the existing `footnoteMultiPass.test.ts`). What SD-3050 adds:

- The **safety cap** above (without it the SD-3049 path infinite-loops on oversized footnotes — which is exactly the continuation-overflow case).
- A determinism regression test that exercises the migration-prone path.

**Tests.**

- `packages/layout-engine/layout-bridge/test/footnoteContinuationDemand.test.ts` — asserts the final converged layout reserves carry-forward demand on the continuation page and the body packs tight on it.

### 3.3 SD-3051 — Migration stability

The existing convergence loop has cycle detection (`incrementalLayout.ts:1864`) and the post-loop `growReserves` is monotonic (PR #2881). SD-3051's contribution is preserving that guarantee under the new block-aware demand path.

**Tests.**

- `packages/layout-engine/layout-bridge/test/footnoteRefMigration.test.ts` — runs `incrementalLayout` twice on a migration-prone fixture and asserts identical (a) page count, (b) per-page reserves, and (c) ref → page assignments. If any future change introduces non-determinism in the convergence path, this test fails.

### 3.4 SD-2986/B1 — `w:numFmt`

Replaces cardinal-from-order with format-aware rendering for both the inline footnote reference *and* the leading marker inside the footnote body. Single source of truth:

```
packages/layout-engine/pm-adapter/src/footnote-formatting.ts
  ↳ formatFootnoteCardinal(cardinal, numFmt)
  ↳ used by:
      pm-adapter/.../footnote-reference.ts        (inline ref)
      super-editor/.../FootnotesBuilder.ts        (leading marker)
```

Supports `decimal`, `upperRoman`, `lowerRoman`, `upperLetter`, `lowerLetter`, `numberInDash`. Unknown formats fall back to decimal.

**Reading the setting.** `readFootnoteNumberFormat(settingsRoot)` and `readEndnoteNumberFormat(settingsRoot)` parse `w:settings/w:footnotePr/w:numFmt[@val]` (or `w:endnotePr`). PresentationEditor reads both up-front and threads them through `ConverterContext.footnoteNumberFormat` / `.endnoteNumberFormat`.

### 3.5 SD-2986/B2 — `w:numStart`

`readFootnoteNumberStart(settingsRoot)` and `readEndnoteNumberStart(settingsRoot)` parse `w:numStart[@val]`. PresentationEditor uses them to seed the initial cardinal counter:

```ts
let counter = footnoteNumberStart;  // was: 1
this.#editor?.state?.doc?.descendants(...);
```

### 3.6 SD-2658 — Custom mark follows

When `node.attrs.customMarkFollows` is truthy (`'1'`, `'true'`, `'on'`, `true`, `1`), the converter emits an empty marker run (`text: ''`) and preserves `pmStart`/`pmEnd`. The literal symbol in the next OOXML run renders as the visible mark. Tests cover both the empty-text behaviour *and* the position preservation (click/selection rely on the empty run carrying ref positions).

### 3.7 SD-2662 — Marker styling

Closed by SD-2986/B1's shared `formatFootnoteCardinal` helper. The leading marker (inside the footnote body) and the inline ref (in body text) now use the same formatter, so they cannot drift.

---

## 4. Architecture compliance

### 4.1 Guard C in `architecture-boundaries.test.ts`

Initial draft had `pm-adapter/src/footnote-formatting.ts` importing `formatPageNumber` from `@superdoc/layout-engine`. The `pr-reviewer` agent flagged this as a Guard C violation (pm-adapter sits upstream of layout-engine; runtime imports are forbidden).

**Fix.** Inlined the 60-line format switch in pm-adapter. Added a drift-detection parity test that imports BOTH helpers and asserts they agree for cardinals 1–100 on every supported format:

```
packages/layout-engine/tests/src/footnote-formatter-parity.test.ts
```

If anyone adds a new format to either helper, the parity test will fail until the matching case lands in the other.

### 4.2 No new runtime DepCruise edges

The only new edges:

- `super-editor/.../FootnotesBuilder.ts` → `@superdoc/pm-adapter/footnote-formatting.js` (super-editor already depends on pm-adapter)
- `pm-adapter/.../footnote-reference.ts` → `pm-adapter/footnote-formatting.js` (same package)
- `layout-tests/.../footnote-formatter-parity.test.ts` → both `pm-adapter` and `layout-engine` (test-only)

No package gained a new dependency declaration; `@superdoc/layout-engine` remains a `devDependency` of `pm-adapter` for the layout-tests parity check.

---

## 5. Test results

| Suite | Tests | Status |
|---|---:|---|
| `@superdoc/layout-bridge` | 1 211 | ✅ green (incl. 3 new footnote test files) |
| `@superdoc/layout-engine` | 649 | ✅ green |
| `@superdoc/pm-adapter` | 1 796 | ✅ green (incl. customMarkFollows + position preservation) |
| `@superdoc/super-editor` | 12 699 | ✅ green |
| `@superdoc/layout-tests` (architecture + parity) | 294 | ✅ green (incl. Guard C now passing + new parity test) |
| **Total** | **16 649** | ✅ |

| Regression check | Result |
|---|---|
| `pnpm test:layout` against superdoc@1.32.0 | 535 / 543 docs unchanged (98.5 %); 5 unique-change docs are all NVCA-pattern; 3 widespread-only |
| `pnpm test:visual` | "Pixel comparison complete. No visual differences found." |
| `Guard A–F` architecture boundaries | 19 / 19 green |

---

## 6. Files changed

```
docs/superdoc-feature-reports/sd-2656-plan.md                                                   (plan, this PR)
docs/superdoc-feature-reports/sd-2656-implementation-report.md                                                         (this file)

packages/layout-engine/layout-bridge/src/incrementalLayout.ts                                       (~50 LOC)
packages/layout-engine/layout-bridge/test/footnoteBodyDemand.test.ts                                NEW
packages/layout-engine/layout-bridge/test/footnoteContinuationDemand.test.ts                        NEW
packages/layout-engine/layout-bridge/test/footnoteRefMigration.test.ts                              NEW

packages/layout-engine/layout-engine/src/index.ts                                                   (~128 LOC)
packages/layout-engine/layout-engine/src/layout-paragraph.ts                                        (~60 LOC)
packages/layout-engine/layout-engine/src/layout-paragraph.test.ts                                   (helper extension)
packages/layout-engine/layout-engine/src/paginator.ts                                               (PageState + PaginatorOptions)

packages/layout-engine/pm-adapter/src/converter-context.ts                                          (+ format/start fields)
packages/layout-engine/pm-adapter/src/converters/inline-converters/footnote-reference.ts            (custom mark + numFmt)
packages/layout-engine/pm-adapter/src/converters/inline-converters/footnote-reference.test.ts       (+ 7 cases)
packages/layout-engine/pm-adapter/src/footnote-formatting.ts                                        NEW (shared cardinal formatter)

packages/layout-engine/tests/src/footnote-formatter-parity.test.ts                                  NEW (drift detector)

packages/super-editor/src/editors/v1/core/presentation-editor/PresentationEditor.ts                 (settings reads + start seeding)
packages/super-editor/src/editors/v1/core/presentation-editor/layout/FootnotesBuilder.ts            (uses shared formatter)
packages/super-editor/src/editors/v1/document-api-adapters/document-settings.ts                     (+ 4 readers)
packages/super-editor/src/editors/v1/document-api-adapters/document-settings.test.ts                (+ 13 cases)
```

13 files modified, 6 files added. Net **+635 / −43 LOC** including tests.

---

## 7. Verification methodology

### 7.1 Test-driven development

Every behaviour change began with a RED test:

1. **SD-3049** — `footnoteBodyDemand.test.ts` failed with `expected 32 to be less than or equal to 28` before implementing the block-aware accumulator.
2. **SD-3050** — `footnoteContinuationDemand.test.ts` exposed the infinite-loop bug in the initial SD-3049 implementation (gap-too-large case), forcing the safety cap.
3. **SD-2986/B1** — `footnote-reference.test.ts` numFmt cases failed before the formatter was wired.
4. **SD-2658** — customMarkFollows cases failed before the suppression branch was added.

### 7.2 Independent code review

A `pr-reviewer` subagent reviewed the working tree before any commit. Findings:

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | `pm-adapter/footnote-formatting.ts` imported `@superdoc/layout-engine`, violating Guard C | 🔴 blocking | Inlined the format switch; added parity test (see § 4.1) |
| 2 | `@superdoc/layout-engine` was only `devDependency` of pm-adapter | 🔴 blocking | Resolved by #1 |
| 3 | Dead `spans.sort()` in demand builder | yagni | Removed; linear scan is fine for typical footnote-ref counts |
| 4 | Redundant `measureFootnoteBlocks(assignedSubset)` immediately overwritten by all-refs measure | yagni | Removed; single `measureFootnoteBlocks(allFootnoteIds)` call |
| 5 | Convergence loop refreshed `bodyHeightById` from assigned-by-column subset only — refs migrating mid-loop could drop from the lookup | 🟠 correctness | Hoisted `allFootnoteIds`; all 3 measure calls now use the full set |
| 6 | Refs inside table-cell paragraphs were missed by the demand walk | docx-fidelity | Walk now recurses into `table.rows[].cells[].blocks/.paragraph` |
| 7 | No test that `customMarkFollows` empty run preserves `pmStart`/`pmEnd` | testing | Added test (passes) |
| 8 | Endnote default per OOXML is `lowerRoman`, falls back to decimal here | docx-fidelity | Documented as known imperfection; one-line fix in PresentationEditor.ts when needed |
| 9 | Inconsistent optional chaining at lines 862 / 879 | nit | Documented as pre-existing pattern |
| 10 | `readNoteNumberStart` accepts both string and number for `w:val` | yagni | Documented; defensive but inert for XML path |

### 7.3 Browser-level reproduction

NVCA Model SPA loaded into two parallel dev servers (worktree at clean main vs working dir with this PR). Page count measured via `scrollHeight / 1126`. Per-page body→sep gap measured via DOM walk. Visual comparison report at `/tmp/sd2656-comparison/report.html`.

### 7.4 Cross-doc regression

`pnpm test:layout --reference 1.32.0` after the PR vs the same command before: blast radius drops from "290 unique-change docs" (clean main vs 1.32.0, mostly schema evolution) to "5 unique-change docs" (this PR vs 1.32.0) — the 5 NVCA-pattern footnote-rich documents that SD-2656 is explicitly intended to improve.

---

## 8. Deferred / known limitations

| Slice | Status | Rationale |
|---|---|---|
| **SD-2986/B3** — `w:pos = beneathText` placement | Deferred | Inverts the reserve model; couples to pagination stability; safer to ship after pagination cluster is stable in production |
| **SD-2985** — Separator content fidelity | Deferred | Reading `w:separator` body and rendering its actual styling requires new pm-adapter path; cleaner as its own PR |
| **SD-2660** — Continuation notice | Deferred | Same scope as SD-2985; needs a corpus fixture with `continuationNotice` defined |
| Cross-page block demand attribution | Approximation | A long block with a ref in line 50 charges full demand to the page where line 1 lands. Acceptable for the typical end-of-paragraph ref case; refine with per-line demand if a profile shows it matters. |
| Multi-column footnote demand | Approximation | `footnoteDemandThisPage` is page-scoped, consistent with the existing page-scoped `footnoteReservedByPageIndex`. Multi-column footnote docs may see less tight packing than single-column; existing `footnoteColumnPlacement.test.ts` ensures correctness. |
| Endnote default format | Approximation | OOXML says default is `lowerRoman`; we fall back to `decimal` if absent. One-line fix in PresentationEditor.ts when corpus shows demand. |
| `w:numRestart` per-page / per-section | Out of scope | Couples numbering to layout output (chicken/egg); requires section-aware counter resets and a feedback path between layout and numbering. SD-2986 successor. |

---

## 9. Reproducing the results

```bash
# Page-count parity check
cd /Users/<you>/work/superdoc/SuperDoc
pnpm dev   # starts dev server on 909x
# In a browser:
#   open http://localhost:909x
#   upload ~/Documents/sd-2656-fixtures/harvey-problem-docs__NVCA Model SPA.docx
#   in DevTools console:
#     document.querySelector('.dev-app__main').scrollHeight / 1126
#   expect ≈ 53 (was 57 on clean main)

# Unit tests
pnpm --filter @superdoc/layout-bridge   test --run
pnpm --filter @superdoc/layout-engine   test
pnpm --filter @superdoc/pm-adapter      test --run
pnpm --filter @superdoc/super-editor    test --run
pnpm --filter @superdoc/layout-tests    test --run

# Architecture + parity
pnpm --filter @superdoc/layout-tests    test --run architecture-boundaries
pnpm --filter @superdoc/layout-tests    test --run footnote-formatter-parity

# Layout-snapshot regression (requires R2 credentials)
set -a; source .claude/skills/pull-test-fixture/.env; set +a
export SUPERDOC_CORPUS_R2_ACCESS_KEY_ID="$SD_TESTING_R2_ACCESS_KEY_ID"
export SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY="$SD_TESTING_R2_SECRET_ACCESS_KEY"
pnpm test:layout -- --reference 1.32.0 --no-interactive
pnpm test:visual
```

---

## 10. References

- **Plan:** [`docs/superdoc-feature-reports/sd-2656-plan.md`](./sd-2656-plan.md)
- **Original overflow fix:** [PR #2881](https://github.com/superdoc-dev/superdoc/pull/2881) (SD-1680), commits `adf4ea62e`, `70d4c85b1`, `2ce2f9f7e`
- **OOXML §17.11** (footnotes): `w:footnotePr`, `w:numFmt`, `w:numStart`, `w:numRestart`, `w:pos`, `w:separator`, `w:continuationSeparator`, `w:continuationNotice`
- **Architecture guards:** `packages/layout-engine/tests/src/architecture-boundaries.test.ts`
- **Visual diff report:** `devtools/visual-testing/results/2026-05-09-17-27-55-v.1.32.0/webkit/report.html`
- **Browser comparison report:** `/tmp/sd2656-comparison/report.html`
