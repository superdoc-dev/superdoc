# SuperDoc Package Boundaries

**Status:** Draft (SD-2829)
**Owner:** Caio Pizzol
**Last updated:** 2026-04-29

## Why this exists

SuperDoc has accumulated more than two dozen workspace packages without a written rule for which are public, which are internal, and which can appear in published types. The same `@superdoc/*` prefix sits on packages with very different roles. Customers see the consequences: type errors that bounce off `_internal-shims.d.ts`, `any` collapses on Document API types, broken builds in Angular/strict-mode TypeScript projects.

The fix is not "convert the whole repo to TypeScript." Recent spike work (SD-2830) confirmed that the customer-visible problem is the published declaration boundary, not the source language. Until the team has a written taxonomy, every type that ends up in the public output is a judgment call, and judgment calls drift.

This document is that taxonomy.

## Tier definitions

Every workspace package and every `superdoc` subpath export sits in exactly one of these tiers.

| Tier | Consumer can install/import? | Types may appear in public `.d.ts`? | Stability commitment |
|---|---|---|---|
| **Public package** | Yes (real npm name) | Yes (its own surface) | Semver, breaking changes documented |
| **Public subpath** | Yes via `superdoc/<name>` | Yes (curated, gated) | Same as `superdoc` |
| **Public type contract** | Indirectly (types reachable through `superdoc`) | Yes | Versioned with `superdoc` |
| **Internal runtime** | No | No | None; refactor freely |
| **Internal implementation** | No | No | None; refactor freely |
| **Dev/test/generated** | No | No | None |

The first three are public surface. The last three are private and must not leak through any published declaration file.

## Inventory

### In-scope: workspace packages that ship runtime or types into the customer surface

| Path | npm name | Tier | Decision |
|---|---|---|---|
| `packages/superdoc` | `superdoc` | Public package | Canonical entry point; stays public |
| `packages/super-editor` | `@superdoc/super-editor` | TBD | **Open question 1** below |
| `packages/document-api` | `@superdoc/document-api` | Public type contract | Document API is part of the public surface (see Q2a). Delivery shape is **Open question 2b** below |
| `packages/react` | `@superdoc-dev/react` | Public package | Already published |
| `packages/sdk/langs/node` | `@superdoc-dev/sdk` | Public package | Already published; the actual SDK npm artifact |
| `packages/sdk/langs/node/platforms/*` | `@superdoc-dev/sdk-<os>-<arch>` | Public package | Optional native binaries selected by the SDK package |
| `packages/esign` | `@superdoc-dev/esign` | Public package | Already published |
| `packages/template-builder` | `@superdoc-dev/template-builder` | Public package | Already published |
| `packages/collaboration-yjs` | `@superdoc-dev/superdoc-yjs-collaboration` | Public package | Already published |
| `packages/ai` | `@superdoc-dev/ai` | TBD | Currently `private: true`; clarify whether this is intended to be published |
| `packages/layout-engine/contracts` | `@superdoc/contracts` | Internal implementation | Layout pipeline shapes; types like `FlowBlock`, `Layout` must not appear raw in public `.d.ts` |
| `packages/layout-engine/dom-contract` | `@superdoc/dom-contract` | Internal implementation | DOM rendering contracts |
| `packages/layout-engine/painters/dom` | `@superdoc/painter-dom` | Internal implementation | DOM rendering pipeline |
| `packages/layout-engine/measuring/dom` | `@superdoc/measuring-dom` | Internal implementation | Measurement pipeline |
| `packages/layout-engine/pm-adapter` | `@superdoc/pm-adapter` | Internal implementation | ProseMirror to FlowBlock bridge |
| `packages/layout-engine/style-engine` | `@superdoc/style-engine` | Internal implementation | OOXML cascade resolution |
| `packages/layout-engine/layout-bridge` | `@superdoc/layout-bridge` | Internal implementation | Pipeline orchestration |
| `packages/layout-engine/layout-engine` | `@superdoc/layout-engine` | Internal implementation | Pagination algorithms |
| `packages/layout-engine/layout-resolved` | `@superdoc/layout-resolved` | Internal implementation | Layout output contract |
| `packages/layout-engine/geometry-utils` | `@superdoc/geometry-utils` | Internal implementation | Geometry math |
| `packages/word-layout` | `@superdoc/word-layout` | Internal implementation | Word-specific layout |
| `packages/preset-geometry` | `@superdoc/preset-geometry` | Internal implementation | Preset shape geometry |
| `packages/docx-evidence-contracts` | `@superdoc/docx-evidence-contracts` | Internal implementation | Test/evidence contracts |
| `shared/common` | `@superdoc/common` | Internal runtime | Shared utilities (DOCX/PDF MIME constants, helpers) |
| `shared/font-utils` | `@superdoc/font-utils` | Internal runtime | Font handling helpers |
| `shared/locale-utils` | `@superdoc/locale-utils` | Internal runtime | Locale helpers |
| `shared/url-validation` | `@superdoc/url-validation` | Internal runtime | URL validation helpers |

### Out of scope: workspace entries that do not affect the customer type surface

These are listed for completeness so the inventory above can be treated as exhaustive within its scope. They follow their own rules and are not governed by this RFC.

| Path | npm name | Reason |
|---|---|---|
| `apps/cli` + `apps/cli/platforms/*` | `@superdoc-dev/cli` (+ binaries) | Standalone CLI app, separate distribution |
| `apps/create` | `@superdoc-dev/create` | Project scaffolder, separate distribution |
| `apps/mcp` | `@superdoc-dev/mcp` | MCP server, separate distribution |
| `apps/vscode-ext` | `superdoc-vscode-ext` | VS Code extension |
| `apps/docs` | `@superdoc/docs` | Mintlify docs site, never published |
| `packages/sdk` (root) | `@superdoc-dev/sdk-workspace` | Private workspace coordinator, never published |
| `packages/sdk/codegen` | `@superdoc-dev/sdk-codegen` | Private codegen tool |
| `packages/layout-engine` (root) | `@superdoc/layout-engine-workspace` | Private workspace coordinator |
| `packages/layout-engine/tests` | `@superdoc/layout-tests` | Test harness |
| `packages/superdoc/tests/cdn-smoke` | `@superdoc/cdn-smoke-test` | CDN smoke test |
| `packages/esign/demo`, `packages/template-builder/demo` | various | Demo scaffolding |
| `tests/*`, `evals/`, `devtools/*`, `demos/*`, `examples/*` | various | Tests, evals, devtools, demos, examples |

### `superdoc` subpath exports

The `superdoc` package currently exposes the following entries via `package.json` `exports`:

| Subpath | Has `types`? | Tier | Decision |
|---|---|---|---|
| `.` | Yes | Public subpath | Main entry, stays |
| `./types` | Yes | Public type contract | Type-only entry, stays |
| `./super-editor` | Yes | TBD | **Open question 1** |
| `./ui` | Yes | Public subpath | Stays |
| `./headless-toolbar` | Yes | Public subpath | Stays |
| `./headless-toolbar/react` | Yes | Public subpath | Stays |
| `./headless-toolbar/vue` | Yes | Public subpath | Stays |
| `./converter` | No (runtime-only) | TBD | **Open question 4** |
| `./docx-zipper` | No (runtime-only) | TBD | **Open question 4** |
| `./file-zipper` | No (runtime-only) | TBD | **Open question 4** |
| `./style.css` | N/A | Public asset | Stays |

## Type ownership rules

Any type appearing in a public `.d.ts` (any file reachable from the entries above) must satisfy one of:

1. **Owned directly by `superdoc`.** Defined in `packages/superdoc/src/`, no internal package specifier in its declaration.
2. **Included in the published `superdoc` declaration graph under a `superdoc`-owned path, with no private package specifier exposed.** This is intentionally tool-agnostic; it covers a curated emit, generated public type files, declaration bundling, or any future delivery mechanism. The constraint is the output shape, not the tool.
3. **Re-exported from a real public package.** `@superdoc-dev/react` types coming through their own package.
4. **Re-exported from a published `@superdoc/*` package.** Only applies to packages explicitly classified as public package above (currently none; see open question 2).

If a type does not satisfy one of these, it must not appear. The audit gate (SD-2832) enforces this.

## Dependency direction rules

1. **Published public declarations must not import private workspace packages.** Source code may still import internal packages at runtime; the constraint is on the emitted `.d.ts` reachable from a public entry.
2. **Internal packages may import other internal packages freely.** No restriction inward.
3. **`superdoc/super-editor` (if it stays public) must follow the same declaration rules as `superdoc` itself.** Currently it leaks the most.
4. **`shared/*` packages are internal runtime only.** Their types do not appear in any public declaration; values used by public code get inlined.

## Open questions

### 1. Is `superdoc/super-editor` supported public API or an unsupported escape hatch?

**Context.** The `superdoc/super-editor` subpath re-exports a large surface from `@superdoc/super-editor` (about 1,878 JS source files behind it, plus type re-exports of ProseMirror primitives). Multiple consumers actively import from it today; it is de-facto public.

The ambiguity has two layers, and both need a decision. The `@superdoc/super-editor` workspace package itself does not carry `private: true`, but is also not actively published or documented as a standalone npm package. Consumers reach its surface through the `superdoc/super-editor` subpath instead. The RFC needs to decide whether the standalone package is publishable, internal-only, or formally deprecated in favor of the subpath facade. The subpath classification (Options A/B/C below) inherits from that decision.

**Options.**
- **A. Promote to supported public surface.** Curate the re-export list, type-govern it like `superdoc`, document it. Commits the team to ProseMirror primitives in the public API.
- **B. Mark as unsupported escape hatch.** Document that anything imported from `superdoc/super-editor` may break without notice. Customers using it migrate to `superdoc` or the Document API.
- **C. Narrow to a curated facade.** Pick the small subset of `super-editor` that customers genuinely need (a list of editor commands, the headless renderer, etc.) and ship only that. Drop the rest.

**Recommendation tentative: Option C, pending usage data.** Option C is probably right but the input is missing. Before committing, run a usage scrape (Slack threads, GitHub issues, customer code samples) for actual `superdoc/super-editor` imports. The result of that scrape is a deliverable of this RFC.

### 2a. Is `@superdoc/document-api` part of the public surface?

**Context.** The package contains real, well-typed APIs (`DocumentApi`, `BookmarkInfo`, `BlocksListResult`, etc.) and is already promoted to customers as a stable surface (the Document API documentation site, the SDK, the MCP). It is functionally public; the only question is mechanism.

**Decision: Yes.** Document API is a public type contract. Its types must be reachable to consumers without collapsing to `any`. The package itself stays in the workspace; the delivery shape is question 2b.

### 2b. Does `@superdoc/document-api` ship as its own published package, or get included in `superdoc`'s declaration graph?

**Context.** Given 2a's answer, two delivery paths are open. The SD-2830 spike confirmed that api-extractor-based bundling is not viable on the current codebase, but other curated-emit paths exist.

**Options.**
- **A. Publish `@superdoc/document-api` as a real npm package.** Drop `private: true`. The leak becomes a legitimate dependency. Faster fix; commits the package name and its API shape as long-term public surface.
- **B. Include the types in `superdoc`'s declaration graph** under a `superdoc`-owned path. Keep the package private. Requires a curated-emit pipeline (path rewrites or generated type files); see SD-2830 for what that costs.

**Recommendation: pending SD-2830.** This is the implementation question that SD-2830 owns; this RFC only commits to 2a. Whichever delivery path SD-2830 produces, the customer-visible result is the same: real Document API types resolvable to consumers, no `any` collapse.

### 3. Do the eight layout-engine sub-packages stay separate, or collapse into one internal package?

**Context.** `packages/layout-engine/` contains: `contracts`, `dom-contract`, `geometry-utils`, `layout-bridge`, `layout-engine`, `layout-resolved`, `pm-adapter`, `style-engine`, plus `painters/dom` and `measuring/dom`. Ten sub-packages, all private, all `@superdoc/*`. The split predates this RFC and was driven by build/test isolation concerns at the time.

**Options.**
- **A. Keep as-is.** Each sub-package keeps its own `package.json`, tsconfig, tests. Internal-only.
- **B. Collapse into one internal `@superdoc/layout` package.** Lower navigation cost, fewer `@superdoc/*` names to track. Loses the dependency-direction benefits the split currently encodes.
- **C. Move to a `private/` subdirectory** outside `packages/` to make the internal status visually obvious.

**Recommendation: A for now.** The audit gate (SD-2832) plus the type ownership rules above remove the customer-visible cost of the split. Restructuring without a strong forcing function is scope-creep risk. Revisit if the audit gate proves expensive to maintain because of the package count.

### 4. Which runtime-only `superdoc` subpaths stay supported?

**Context.** `./converter`, `./docx-zipper`, `./file-zipper` are exported as runtime entries with no `types` field. Customers using them today get no type information. "Public but untyped" conflicts with the goal of this project; under strict TS settings, those imports fail to resolve cleanly. Each subpath needs a clean classification.

**Options for each subpath.**
- **A. Supported public subpath with a minimal explicit type contract.** Pick the small, intentional API surface and own it.
- **B. Legacy unsupported subpath with a deprecation and migration plan.** Add a deprecation notice in the docs, set a removal version, point users at the supported alternative.
- **C. Remove immediately.** Only if usage is verifiably zero.

**Recommendation.**
- `./converter`: **Option A.** DOCX import/export is core SuperDoc functionality. The supported surface should expose the small set of conversion entry points customers actually need (open, save, the converter instance), not the whole `SuperConverter` class.
- `./docx-zipper` and `./file-zipper`: **Option B.** These are internal-shaped utilities that ended up exported. Mark them deprecated, set a removal target (one or two minor versions out), document the supported alternative (probably the `./converter` API after Option A lands), and remove on schedule.

Note: Option B requires the deprecation actually goes somewhere. Without a migration target, Option B becomes "public forever, just with a sad note." If we cannot identify a supported alternative within Option A's surface, the honest choice is to escalate `docx-zipper` / `file-zipper` to Option A as well.

## Deliverables

This RFC is "done" when the following are produced and reviewed:

1. **This document, merged**, with the open questions either decided or labeled with their concrete next step.
2. **A `superdoc/super-editor` usage scrape** (Slack threads, GitHub issues, customer code samples) that lists the symbols actually imported today. Input to the Q1 decision.
3. **A clarification on `@superdoc-dev/ai`**. Currently `private: true`; either keep private and remove from the in-scope inventory, or commit to publishing.
4. **A short list of guarded public types** for the audit gate (Document API entry types, `Config`, command props, layout-facing types like `Layout` if any of them stay public). This list is the input the audit gate (SD-2832) checks for `any` regressions.

## CI enforcement

Once this RFC lands, the audit gate (SD-2832) becomes a literal encoding of the rules above:

- No private `@superdoc/*` specifier in any `.d.ts` reachable from a public entry.
- No `_internal-shims.d.ts` in `dist/`.
- No package-manager-internal paths.
- No collapse to `any` on a guarded list of public types (Document API, configuration, command props).
- Pack-and-install consumer typecheck (SD-2831) with `skipLibCheck: false` across resolution modes and frameworks.

Future PRs that violate these rules fail CI with a message that points back to this document.

## Out of scope

- Physical reorganization (renaming or moving packages). Tracked as SD-2835, blocked by this RFC plus the bundling and gate work.
- Migrating internal source from JS to TS. The customer-visible problem is the published declaration boundary, not the source language.
- The internal taxonomies of the other `@superdoc-dev/*` published packages (`react`, `esign`, `template-builder`, `sdk`, `collaboration-yjs`). The inventory above acknowledges they exist as public packages with their own version streams; this RFC governs the `superdoc` package and the workspace packages whose types might leak into `superdoc`'s published surface, not the internals of the other public packages.

## Decisions log

This section accumulates decisions as the RFC is reviewed and merged. Each entry: date, decision, who decided, rationale.

_(Empty until first review.)_
