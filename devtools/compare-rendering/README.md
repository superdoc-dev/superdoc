# compare-rendering

Diffs Word and SuperDoc rendering of the same `.docx` at the *resolved schema* level — text, page assignment, and (in later milestones) font/indent/color/numbering. Emits typed `Finding[]` so an agent can route fixes to specific SuperDoc modules.

This is a dev tool, not a pass/fail test. It surfaces concrete divergences so you don't have to compare screenshots by eye.

## Scope (M1)

- **Supported:** paragraph-only documents (text-heavy memos, letters, policies).
- **Short-circuited with a reason:** docs containing tables, inline/floating shapes, or tracked changes. The report emits an `unsupported` finding and skips the diff — honest boundary rather than a misleading "everything looks fine."
- **Categories emitted in M1:** `text`, `pagination`, `structure`, `unsupported`. Style/indent/color/numbering come in M2 once the SuperDoc-side normalizer pulls resolved values out of `measures[]` and `runs[]`.

## Quick start

```bash
export WORD_API_URL="https://word-mcp.superdoc.workers.dev"
export WORD_API_TOKEN="<your-bearer-token>"

pnpm compare-rendering -- \
  --input evals/fixtures/docs/memorandum.docx \
  --format md
```

Run directly without the wrapper:

```bash
bun devtools/compare-rendering/src/cli.ts --input <path> --format md
```

Example output (truncated):

```markdown
# compare-rendering: memorandum.docx

- Word pages: 3, SuperDoc pages: 3
- Word paragraphs: 94, SuperDoc paragraphs: 94

## Findings (2)

### pagination (2)
- **[visible]** Paragraph #39 landed on page 1 in SuperDoc but page 2 in Word (empty line)
  - spec: ECMA-376 §17.3.1.16 (keepNext/keepLines/pageBreakBefore)
  - code: `layout-engine/layout-engine/src/pagination`
- **[visible]** Paragraph #80 landed on page 2 in SuperDoc but page 3 in Word ("   - Any press releases…")
  - spec: ECMA-376 §17.3.1.16 (keepNext/keepLines/pageBreakBefore)
  - code: `layout-engine/layout-engine/src/pagination`
```

## How it works

```
docx
 ├── word adapter (POST /v1/executions to word-api)         ─► word.json (cached)
 └── superdoc adapter (spawn pnpm layout:export-one)        ─► sd.layout.json
                                │
                        normalize both sides
                                │
                     NormalizedParagraph[] × 2
                                │
                           differ + taxonomy
                                │
                           Finding[] report
```

- Word extraction is **cached** by `sha256(docx) + sha256(extract-layout.ps1)`. Editing SuperDoc code and re-running the tool only re-runs the SuperDoc side — no re-hit to the VM (~25s saved per iteration). Editing the PowerShell script busts the cache automatically.
- Bypass the cache for a single run with `--no-cache`.

## Env

| Variable         | Purpose                                              |
|------------------|------------------------------------------------------|
| `WORD_API_URL`   | Base URL of the word-api worker                      |
| `WORD_API_TOKEN` | Bearer token                                         |

## Exit codes

- `0` — ran successfully; findings are at most `visible`/`cosmetic` (or no findings at all)
- `1` — tool error (network, missing input, bad args)
- `2` — ran successfully but emitted at least one `blocking` finding

Makes it CI-usable later without rework.

## Non-goals

- Pixel diffing (see `tests/visual/`).
- Tables, images, shapes, track changes, headers/footers, comments, TOC — deferred past M5.
- Auto-fix generation.
- Publishing as a package.

## Milestones

- **M1** ✅ — CLI on paragraph-only docs. 4 categories (`text`, `pagination`, `structure`, `unsupported`). Word-extraction cache.
- **M2** ✅ — Baseline + delta reporting (`--input-dir`, `--save-baseline`, `--baseline`). Findings get a stable `fingerprint` (`category:paragraphOrdinal`). Delta mode emits only `resolved` / `new` / `unchanged` vs baseline; exits `2` on any new finding. This is what makes the tool **agent-usable** — signal is "my change fixed N, broke M" instead of absolute findings.
- **M3** — LLM screenshot judge for docs where schema diff is silent or near-silent. Catches rendering divergences that don't surface in layout data at all (e.g. `w:val="wave"` border styles rendered as plain lines, font substitution, painter-level overflow).
- **M4** — Populate `NormalizedParagraph.resolved` on SuperDoc side. Taxonomy extends to `style`, `indent`, `font`, `color`, `alignment`, `spacing`, `numbering`. Safe to add now that M2 absorbs the "new field adds findings everywhere" noise.
- **M5** — Table support. Non-trivial; needs parallel table walks on both sides.

## Insights from M1 corpus batch (75 docs, April 2026)

- **Pagination findings compound.** Many "N pagination findings" collapse to one underlying bug expressed N times. `memorandum.docx` (3 findings) and `sd-1741-paragraph-between-borders` (36 findings) share the same root cause — SuperDoc fits slightly more content per page than Word; drift accumulates across pages. One fix likely eliminates most findings at once.
- **Schema diff has real false negatives.** `sd-1741` reports 0 text/style findings, but visually SuperDoc renders every border-between style (`wave`, `doubleWave`, `dashDotStroked`, `triple`, …) as a plain line while Word renders each correctly. Schema-level comparison will never catch this class without the M3 screenshot judge.
- **~27 % of the corpus is in M1 scope.** 13 / 75 docs are short-circuited for tables/shapes/comments/revisions; the rest yield meaningful findings. Real-world DOCX coverage unlocks at M5 (tables).

## Corpus sweep + baselines

Pass `--input-dir` to run a whole directory of docs. Combine with `--save-baseline` to snapshot the current findings, and `--baseline` to diff a later run against that snapshot.

```bash
# Snapshot current state as the main-branch baseline (once, on main).
pnpm compare-rendering -- \
  --input-dir test-corpus/rendering \
  --save-baseline test-corpus/.baseline.json

# On a feature branch: what did my change actually affect?
pnpm compare-rendering -- \
  --input-dir test-corpus/rendering \
  --baseline test-corpus/.baseline.json \
  --format md
```

Delta output names the docs with `resolved` (baseline had it, current doesn't → you fixed it) and `new` (current has it, baseline didn't → you introduced or didn't fix it). `unchanged` is counted but not listed. Exit `2` when any new finding shows up — CI-friendly gate.
