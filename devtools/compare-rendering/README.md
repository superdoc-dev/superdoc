# compare-rendering

Diffs Word and SuperDoc rendering of the same `.docx` at the *resolved schema* level — text, page assignment, and (in later milestones) font/indent/color/numbering. Emits typed `Finding[]` so an agent can route fixes to specific SuperDoc modules.

This is a dev tool, not a pass/fail test. It surfaces concrete divergences so you don't have to compare screenshots by eye.

## Scope (M1)

- **Supported:** paragraph-only documents (text-heavy memos, letters, policies).
- **Short-circuited with a reason:** docs containing tables, inline/floating shapes, or tracked changes. The report emits an `unsupported` finding and skips the diff — honest boundary rather than a misleading "everything looks fine."
- **Categories emitted in M1:** `text`, `pagination`, `structure`, `unsupported`. Style/indent/color/numbering come in M2 once the SuperDoc-side normalizer pulls resolved values out of `measures[]` and `runs[]`.

## Quick start

```bash
export WORD_MCP_URL="https://word-mcp.superdoc.workers.dev/mcp"
export WORD_MCP_TOKEN="<your-bearer-token>"

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
 ├── word adapter (POST run_powershell to word-mcp worker) ─► word.json (cached)
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
| `WORD_MCP_URL`   | HTTP endpoint of the word-mcp MCP worker             |
| `WORD_MCP_TOKEN` | Bearer token (same one you use in your `.mcp.json`)  |

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

- **M1** (this): CLI works end-to-end on paragraph-only docs. 3 categories. JSON + markdown output. Caching.
- **M2**: Pull resolved style fields out of SuperDoc's block schema. Taxonomy extends to `style`, `indent`, `font`, `color`, `alignment`, `spacing`, `numbering`.
- **M3**: Batch mode (`--input-dir`), nightly run against the paragraph-only subset of the corpus, per-category dashboard.
- **M4**: MCP wrapper `compare_rendering(docx_path)`. Agent dogfood with ECMA-spec MCP in context.
- **M5**: Table support. Non-trivial — needs parallel table walks on both sides.
