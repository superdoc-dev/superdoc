# SuperDoc

A document editing and rendering library for the web.

## Architecture: Rendering

SuperDoc uses its own rendering pipeline. ProseMirror stores document state;
it is not the visual renderer.

```
.docx
  → super-converter parses OOXML into the hidden PM doc
  → pm-adapter reads PM state and resolved styles
  → FlowBlock[]
  → layout-engine paginates
  → ResolvedLayout
  → DomPainter paints DOM
```

- `PresentationEditor` wraps a hidden ProseMirror `Editor` instance for document state and editing commands
- The hidden Editor's contenteditable DOM is never shown to the user
- **DomPainter** (`layout-engine/painters/dom/`) owns all visual rendering
- Style-resolved properties (backgrounds, fonts, borders, etc.) must flow through `pm-adapter` → DomPainter, not through PM decorations

### Where To Put Your Change

| Concern | Where | Rule |
|---------|-------|------|
| DOCX import/export | `super-editor/src/editors/v1/core/super-converter/` | Parse and preserve OOXML, style refs, and inline properties. Do not bake inherited or style-resolved formatting into direct attrs. |
| Style cascade | `layout-engine/style-engine/` | Own defaults, styles, conditional formatting, and inline override resolution. |
| Static document visuals | `pm-adapter/` data + `layout-engine/painters/dom/` rendering | Feed typed data into DomPainter. Do not style static document content with PM decorations. |
| Direction-aware properties | One layer makes the flip; pm-adapter stores logical sides LTR-default | For `w:bidiVisual` table-visual properties, DomPainter mirrors once at paint time. Pre-mirroring upstream is a double-swap. Full taxonomy: `pm-adapter/src/direction/README.md`. |
| Editing behavior | `super-editor/src/editors/v1/extensions/` | Commands, keybindings, editor plugins, and active interaction state live here. Do not duplicate cascade logic or render document visuals here. |
| Ephemeral editor UI | `PresentationEditor` post-paint pipeline + overlay components | Selections, active comments, proofing marks, search highlights, resize handles, and other overlays. PM decorations are bridged to painted DOM only for eligible plugins; comments use `CommentHighlightDecorator` (painter metadata), search is excluded from the bridge, resize handles are Vue overlay components. When adding a plugin that emits decorations, decide whether to bridge (default) or stay PM-side (add a prefix to `EXCLUDED_PLUGIN_KEY_PREFIXES` in `DecorationBridge.ts`). |
| Interaction mapping | `layout-engine/layout-bridge/` | Map clicks, selections, resize handles, and visual coordinates back to document positions. RTL-aware as an inverse mapping (visual → logical), not a pre-mirror. |
| Geometry and pagination | `layout-engine/layout-engine/` | Compute layout from `FlowBlock[]`; do not read rendered DOM to recover missing data. |
| Final DOM rendering | `layout-engine/painters/dom/` | Render `ResolvedLayout`. Paint-time visual transforms, such as the `w:bidiVisual` mirror, belong here. |
| Presentation state bridge | `PresentationEditor.ts` | Bridge editor events into layout and paint state. Do not resolve OOXML semantics here. |
| New document-API operation | `packages/document-api/src/contract/operation-definitions.ts` | Contract-first; touches 4 files — see `packages/document-api/README.md`. |
| New consumer SDK / CLI surface | `apps/cli/src/` + regenerate SDK | Run `pnpm run generate:all` after. |

### Quick Boundary Checks

Use these searches before adding a new visual or direction-aware path:

```bash
# Painter should not import upstream packages.
rg "@superdoc/(pm-adapter|style-engine|layout-bridge|layout-resolved)" packages/layout-engine/painters/dom/src

# pm-adapter should not do DOM work.
rg "getBoundingClientRect|clientWidth|offsetWidth|document\\.|window\\." packages/layout-engine/pm-adapter/src

# Import should not bake style cascade into direct attrs.
rg "referencedStyles|resolve.*Properties|resolve.*Style" packages/super-editor/src/editors/v1/core/super-converter
```

### State Communication

State flows from super-editor → Layout Engine via:
- `PresentationEditor.ts` listens to editor events (`super-editor/src/editors/v1/core/presentation-editor/`)
- Calls DomPainter methods to update state
- DomPainter re-renders with new state

## Project Structure

```
packages/
  superdoc/          Main entry point (npm: superdoc)
  react/             React wrapper (@superdoc-dev/react)
  super-editor/      ProseMirror editor (@superdoc/super-editor)
  layout-engine/     Layout & pagination pipeline
    contracts/       - Shared type definitions
    pm-adapter/      - ProseMirror → Layout bridge
    layout-engine/   - Pagination algorithms
    layout-bridge/   - Pipeline orchestration
    painters/dom/    - DOM rendering
    style-engine/    - OOXML style resolution
  ai/                AI integration
  collaboration-yjs/ Collaboration server
shared/              Internal utilities
e2e-tests/           Playwright tests
tests/visual/        Visual regression tests (Playwright + R2 baselines)
```

## Where to Look

| Task | Location |
|------|----------|
| React integration | `packages/react/src/SuperDocEditor.tsx` |
| Editing features | `super-editor/src/editors/v1/extensions/` |
| Presentation mode visuals | `layout-engine/painters/dom/src/features/feature-registry.ts` → feature module |
| Rendering orchestration | `layout-engine/painters/dom/src/renderer.ts` |
| DOCX import/export | `super-editor/src/editors/v1/core/super-converter/` |
| Style resolution | `layout-engine/style-engine/` |
| Main entry point (Vue) | `superdoc/src/SuperDoc.vue` |
| Visual regression tests | `tests/visual/` (see its CLAUDE.md) |
| Document API contract | `packages/document-api/src/contract/operation-definitions.ts` |
| Adding a doc-api operation | See `packages/document-api/README.md` § "Adding a new operation" |
| Theming (`createTheme()`) | `packages/superdoc/src/core/theme/create-theme.js` |
| CSS variable defaults | `packages/superdoc/src/assets/styles/helpers/variables.css` |
| Preset themes | `packages/superdoc/src/assets/styles/helpers/themes.css` |
| Consumer-facing agent guide | `packages/superdoc/AGENTS.md` (ships with npm package) |

## Style Resolution Boundary

**The importer stores raw OOXML properties. The style-engine resolves them at render time.**

- The converter (`super-converter/`) should only parse and store what is explicitly in the XML (inline properties, style references). It must not resolve style cascades, conditional formatting, or inherited properties.
- The style-engine (`layout-engine/style-engine/`) is the single source of truth for cascade logic. All style resolution (defaults → table style → conditional formatting → inline overrides) happens here.
- Both rendering systems call the style-engine to compute final visual properties.

**Why**: Resolving styles during import bakes them into node attributes as inline properties. On export, these get written as direct formatting instead of style references, losing the original document intent.

## When to Modify Which System

- **Visual rendering**: Check `painters/dom/src/features/feature-registry.ts` to find the feature module, then modify it. If no module exists yet, create one (see layout-engine CLAUDE.md). Feed data via `pm-adapter/`
- **Style resolution**: Modify `style-engine/` — called by pm-adapter during conversion
- **Editing commands/behavior**: Modify `super-editor/src/editors/v1/extensions/`
- **State bridging**: Modify `PresentationEditor.ts`

## Document API Contract

The `packages/document-api/` package uses a contract-first pattern with a single source of truth.

- **`operation-definitions.ts`** — canonical object defining every operation's key, metadata, member path, reference doc path, and group. All downstream maps are projected from this file automatically.
- **`operation-registry.ts`** — type-level registry mapping each operation to its `input`, `options`, and `output` types.
- **`invoke.ts`** — `TypedDispatchTable` validates dispatch wiring against the registry at compile time.

Adding a new operation touches 4 files: `operation-definitions.ts`, `operation-registry.ts`, `invoke.ts` (dispatch table), and the implementation. See `packages/document-api/README.md` for the full guide.

Do not hand-edit `COMMAND_CATALOG`, `OPERATION_MEMBER_PATH_MAP`, `OPERATION_REFERENCE_DOC_PATH_MAP`, or `REFERENCE_OPERATION_GROUPS` — they are derived from `OPERATION_DEFINITIONS`.

## JSDoc types

Many packages use `.js` files with JSDoc `@typedef` for type definitions (e.g., `packages/superdoc/src/core/types/index.js`). These typedefs ARE the published type declarations — `vite-plugin-dts` generates `.d.ts` files from them.

- **Keep JSDoc typedefs in sync with code.** If a function destructures `{ a, b, c }`, the `@typedef` must include all three properties. Missing properties become type errors for consumers.
- **Verify types after adding parameters.** When adding a parameter to a function, update its `@typedef` or `@param` JSDoc. Build with `pnpm run --filter superdoc build:es` and check the generated `.d.ts` in `dist/`.
- **Workspace packages don't publish types.** `@superdoc/common`, `@superdoc/contracts`, etc. are private. If a public API references their types, those types must be inlined or resolved through path aliases — consumers can't resolve workspace packages.

## Commands

- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm dev` - Start dev server (from examples/)
- `pnpm run generate:all` - Generate all derived artifacts (schemas, SDK clients, tool catalogs, reference docs)

## AI Eval Suite

The `evals/` directory contains a Promptfoo-based evaluation suite with three levels of evaluation.

### Level 1: Deterministic Evals (tool selection + argument accuracy)

| Command | What it does | Cost |
|---------|-------------|------|
| `pnpm --filter @superdoc-testing/evals run eval` | Run deterministic evals (reading + argument tests) | ~$0.30 |
| `pnpm --filter @superdoc-testing/evals run eval:reading` | Run reading tool tests only | ~$0.15 |
| `pnpm --filter @superdoc-testing/evals run eval:view` | Open Promptfoo web UI with results | Free |
| `pnpm --filter @superdoc-testing/evals run baseline:save <label>` | Save versioned results snapshot | Free |

Tool definitions are extracted from `packages/sdk/tools/` via `evals/tools/extract.mjs`. Run `pnpm run generate:all` first if SDK artifacts are missing.

Test files are YAML in `evals/tests/`. Each test has a `vars.task` prompt and JavaScript assertions that check tool call structure (tool selection + argument accuracy, not execution).

The system prompt at `evals/prompts/agent.txt` is a copy of the proven prompt from `examples/eval-demo/lib/agent.ts`. Update both when changing the prompt.

### Level 2: GDPval Benchmark (Model+SuperDoc vs Model-Only)

| Command | What it does | Cost |
|---------|-------------|------|
| `pnpm --filter @superdoc-testing/evals run eval:gdpval` | Run GDPval benchmark | ~$1-2 |

### Level 3: DOCX Agent Benchmark (real agents, real documents)

Runs actual Claude Code and Codex CLIs against DOCX tasks, comparing their performance with and without SuperDoc tools. 4 conditions x 2 agents x N tasks.

**Conditions:**

| Condition | What the agent gets |
|-----------|-------------------|
| baseline | No skill, agent figures out DOCX on its own |
| baseline-with-docx-skill | Anthropic's DOCX skill (unzip + XML editing) |
| superdoc-mcp | SuperDoc MCP server (`superdoc_open`, `superdoc_get_content`, etc.) |
| superdoc-cli | SuperDoc CLI on PATH |

**Tasks:** 3 reading (extract headings, entity names, financial figures) + 3 editing (replace entity name, insert section, fill placeholders).

**Metrics per task:** correctness (pass/fail), collateral (no unintended changes), steps (agent turn count), latency (seconds), tokens (input + output), path (which DOCX approach was used).

| Command | What it does | Cost |
|---------|-------------|------|
| `pnpm --filter @superdoc-testing/evals run eval:benchmark` | Run full benchmark | ~15 min |
| `pnpm --filter @superdoc-testing/evals run eval:benchmark:codex` | Run Codex conditions only | ~8 min |
| `pnpm --filter @superdoc-testing/evals run eval:benchmark:claude` | Run Claude Code conditions only | ~8 min |
| `pnpm --filter @superdoc-testing/evals run eval:benchmark:report` | Generate comparison report (Markdown + CSV) | Free |

**Prerequisites:**
- `OPENAI_API_KEY` in `evals/.env` (for Codex; use `codex login --with-api-key` for API key auth)
- Claude Code installed locally (uses local auth, no API key needed in `.env`)
- MCP server built: `cd apps/mcp && pnpm run build`
- CLI built: check `apps/cli/dist/index.js` exists

**Key files:**

| File | Purpose |
|------|---------|
| `evals/config/benchmark.promptfoo.yaml` | Level 3 Promptfoo config (8 providers) |
| `evals/suites/benchmark/tests/agent-benchmark-v2.yaml` | Benchmark tasks with assertions |
| `evals/providers/claude-code-agent.mjs` | Claude Agent SDK provider |
| `evals/providers/codex-agent.mjs` | Codex SDK provider |
| `evals/suites/benchmark/reports/benchmark-report.mjs` | Markdown + CSV report generator |
| `evals/fixtures/vendor/vendor-docx-skill.md` | Anthropic's DOCX skill for baseline-with-docx-skill condition |

## Generated Artifacts

These directories are produced by `pnpm run generate:all`:

| Directory | In git? | What it contains |
|-----------|---------|-----------------|
| `packages/document-api/generated/` | No (gitignored) | Agent artifacts, JSON schemas |
| `apps/cli/generated/` | No (gitignored) | SDK contract JSON exported from CLI metadata |
| `packages/sdk/langs/node/src/generated/` | No (gitignored) | Node SDK generated client code |
| `packages/sdk/langs/python/superdoc/generated/` | No (gitignored) | Python SDK generated client code |
| `packages/sdk/tools/*.json` | No (gitignored) | Tool catalogs for all providers (catalog.json, tools.openai.json, etc.) |
| `apps/docs/document-api/reference/` | Yes (Mintlify deploys from git) | Reference doc pages generated from contract |

After a fresh clone, run `pnpm run generate:all` before working on SDK, CLI, or doc-api code.

Note: `packages/sdk/tools/__init__.py` is a manual file (Python package marker) and stays committed.

## Testing

| What to verify | Command | Speed |
|---|---|---|
| Logic works? | `pnpm test` | seconds |
| Editing works? | `pnpm test:behavior` | minutes |
| Layout regressed? | `pnpm test:layout` | ~10 min |
| Pixel diff? | `pnpm test:visual` | ~5 min |

### Unit Tests (Vitest)

Co-located with source code as `feature.test.ts` next to `feature.ts`. Test pure logic, data transformations, and utilities in isolation.

- Framework: **Vitest** (config at `vitest.config.mjs`)
- Most coverage in `packages/super-editor/` (526 files) and `packages/layout-engine/` (150 files)
- Run a single package: `pnpm --filter <package> test`

### Behavior Tests (Playwright)

End-to-end tests that exercise editing features through the browser. Located in `tests/behavior/`.

- Framework: **Playwright** (Chromium, Firefox, WebKit)
- Tests editing commands, formatting, tables, comments, tracked changes, lists, toolbar
- Asserts on document state, not pixels — see `tests/behavior/README.md`

### Layout Comparison (`pnpm test:layout`)

Compares layout engine output (JSON structure) across ~382 test documents against a published npm version. This is the primary tool for catching rendering regressions.

- Run: `pnpm test:layout` (interactive — prompts for reference version)
- Flags: `--reference <version>`, `--match <pattern>`, `--limit <n>`
- Handles auth, corpus download, build, and comparison automatically
- Reports written to `tests/layout/reports/`
- Lower-level access: `pnpm layout:compare` (same engine, no interactive UX)
- One-time setup: `npx wrangler login` (for corpus download from R2)

### Visual Comparison (`pnpm test:visual`)

Pixel-level before/after comparison for documents that failed layout comparison. Reads the latest layout report and generates an HTML diff report.

- Run `pnpm test:layout` first to generate a comparison report
- Then `pnpm test:visual` to see pixel differences for changed docs
- HTML report output in `devtools/visual-testing/results/`

### Uploading Test Documents to Corpus

Test documents for layout and visual tests are stored in R2. Rendering tests auto-discover all `.docx` files in the corpus — just upload a file and it becomes a test case.

**Interactive** (prompts for issue ID and description):
```bash
pnpm corpus:upload ~/Downloads/my-file.docx
```

**Non-interactive** (for scripts and agents):
```bash
pnpm corpus:upload ~/Downloads/my-file.docx --issue SD-1234 --description short-kebab-desc
```

Files are uploaded to `rendering/<issue-id>-<description>.docx`. After uploading:
```bash
pnpm corpus:pull    # sync the new file locally
pnpm test:visual    # verify it renders
```

One-time setup: `npx wrangler login` (for R2 access). If the token expires, run it again. Note: wrangler may write to `~/.wrangler/config/` while the corpus scripts read from `~/Library/Preferences/.wrangler/config/` — copy the token if you get auth errors after a fresh login.

## Brand & Design System

Brand guidelines, voice, and design tokens live in `brand/`.
Token contract source is `packages/superdoc/src/assets/styles/helpers/variables.css` (`:root` defaults).
Preset theme overrides are defined in `packages/superdoc/src/assets/styles/helpers/themes.css`.

**When creating or modifying UI components:**
- Use `--sd-*` CSS custom properties — never hardcode hex values.
- Treat `variables.css` as the canonical token contract; add new tokens there.
- Keep preset themes in `themes.css` (`.sd-theme-*`) and override only the tokens that need theme-specific values.
- Tokens are organized by layers: primitive (`--sd-color-blue-500`) → UI/document tokens (`--sd-ui-*`, `--sd-comments-*`, etc.) → component usage.
- Expose UI component-specific variables as `--sd-ui-{component}-*` so consumers can customize via CSS.

**When writing copy or content:** see `brand.md` for the full brand identity — strategy, voice, and visual guidelines. Product name is always **SuperDoc** (capital S, capital D).

## Comments

**Always check for `comment-policy.md` at the repo root (or any ancestor of files you're touching) before adding, removing, or rewording comments.** The policy overrides defaults. Run `/comment-audit` to validate comment changes against it before commit.

Short version: write comments only when they encode information the code cannot express (invariants, business rules, non-local coupling, refactor-sensitive rationale). Don't paraphrase the next line. Use `AIDEV-NOTE:` anchors for rules that must survive future agent edits. Treat stale comments as bugs.
