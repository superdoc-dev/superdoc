# SuperDoc Package Boundaries

**Status:** Draft (SD-2829)
**Owner:** Caio Pizzol
**Last updated:** 2026-04-30

## Why this exists

SuperDoc has accumulated more than two dozen workspace packages without a written rule for which are public, which are internal, and which can appear in published types. The same `@superdoc/*` prefix sits on packages with very different roles. Customers see the consequences: type errors that bounce off `_internal-shims.d.ts`, `any` collapses on Document API types, broken builds in Angular/strict-mode TypeScript projects.

The fix is not "convert the whole repo to TypeScript." Recent spike work (SD-2830) confirmed that the customer-visible problem is the published declaration boundary, not the source language. Until the team has a written taxonomy, every type that ends up in the public output is a judgment call, and judgment calls drift.

This document is that taxonomy.

## Tier definitions

Every workspace package and every `superdoc` subpath export sits in exactly one of these tiers.

| Tier | Consumer can install/import? | Types may appear in public `.d.ts`? | Stability commitment |
|---|---|---|---|
| **Supported public package** | Yes (real npm name) | Yes (its own surface) | Semver, breaking changes documented |
| **Supported public subpath** | Yes via `superdoc/<name>` | Yes (curated, gated) | Same as `superdoc` |
| **Supported public type contract** | Indirectly (types reachable through `superdoc`) | Yes | Versioned with `superdoc` |
| **Legacy public compatibility surface** | Yes today (existing customers may already depend on it) | Yes (minimal coverage to avoid breaking consumers) | Kept compiling, not expanded, not advertised. Removal only after a documented migration window |
| **Internal runtime** | No | No | None; refactor freely |
| **Internal implementation** | No | No | None; refactor freely |
| **Dev/test/generated** | No | No | None |

Three states matter to consumers and the audit gate:

1. **Supported public** (the first three rows). We document, test, version, and expect customers to build on it.
2. **Legacy public compatibility** (the fourth row). Customers may already use it, so we cannot break it casually, but we do not want new customers depending on it. It gets minimal type support and a migration path.
3. **Private** (the bottom three rows). Not for customers, not allowed to leak into public declarations.

The legacy tier is what makes this RFC actionable today. Some surfaces (notably `superdoc/super-editor`) were public out of necessity in earlier versions because there was no other way to run SuperDoc headlessly. That necessity is gone, but we cannot drop the surface immediately because customers built on it. Legacy public is the honest classification while a migration path is built and adopted.

### Handling legacy public surface

For any entry classified as legacy public:

1. **Stop advertising the old import path.** Update docs, support guidance, and example code to point at the supported replacement.
2. **Add or finish the supported replacement** if one is missing. Without a migration target, "legacy public" silently becomes "public forever."
3. **Keep the old path compiling.** No surprise breakage for existing consumers.
4. **Add type coverage only enough to avoid breaking consumers.** Not full type-governance; just enough that strict-mode TS compiles.
5. **Add deprecation docs or warnings where appropriate.** Optional console warning on first use, JSDoc `@deprecated`, or changelog notes.
6. **Remove only after a documented migration window**, if ever.

## Inventory

### In-scope: workspace packages that ship runtime or types into the customer surface

| Path | npm name | Tier | Decision |
|---|---|---|---|
| `packages/superdoc` | `superdoc` | Public package | Canonical entry point; stays public |
| `packages/super-editor` | `@superdoc/super-editor` | Legacy public compatibility surface | Was effectively public when no other headless path existed. Now superseded by exports from `superdoc` itself, including the relocated Document API types. Kept compiling for existing consumers; new use migrates to the supported replacements. See Decision 1 below. |
| `packages/document-api` | `@superdoc/document-api` | Supported public type contract | Types relocated into `superdoc`'s published declaration graph; the workspace package itself stays private. Publishing under a named npm artifact remains a future option. See Decision 2. |
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
| `packages/super-editor/src/editors/v1/core/layout-adapter` | (internal to `@superdoc/super-editor`) | Internal implementation | v1 ProseMirror → FlowBlock projection; owned by super-editor, not a standalone package |
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

The `superdoc` package currently exposes the following entries via `package.json` `exports`. The "Matrix coverage" column lists the consumer-typecheck fixture file (`tests/consumer-typecheck/src/<file>`) that exercises the subpath under strict mode. Runtime-only subpaths have no `types` entry by design and therefore no fixture; the consumer matrix is a type-contract gate, and a subpath without a contract has nothing to assert.

| Subpath | Has `types`? | Tier | Matrix coverage | Decision |
|---|---|---|---|---|
| `.` | Yes | Public subpath | `imports-main.ts`, `headless-node.ts`, `all-public-types.ts`, `editor-doc-runtime.ts`, `customer-scenario.ts`, `prosemirror-coexistence.ts` | Main entry, stays |
| `./types` | Yes | Public type contract | `imports-types-entry.ts` | Type-only entry, stays |
| `./super-editor` | Yes | Legacy public compatibility surface | `imports-sub-export.ts` | Was effectively public when no other headless path existed. `Editor`, `PresentationEditor`, `getStarterExtensions`, `Extensions`, `SuperToolbar`, `SuperConverter`, `DocxZipper` and most of the surface are now exported from `superdoc` itself. Kept exported, not advertised, migration target is `superdoc`. See Decision 1. |
| `./ui` | Yes | Public subpath | `imports-ui.ts` | Stays |
| `./ui/react` | Yes | Public subpath | `imports-ui-react.ts` | Stays |
| `./headless-toolbar` | Yes | Legacy public compatibility surface | `imports-headless-toolbar.ts` | Kept exported, not advertised. New custom UI integrations should use `superdoc/ui`. See Decision 4. |
| `./headless-toolbar/react` | Yes | Legacy public compatibility surface | `imports-headless-toolbar-react.ts` | Framework helper for the legacy headless toolbar. Migration target is `superdoc/ui/react`. See Decision 4. |
| `./headless-toolbar/vue` | Yes | Legacy public compatibility surface | `imports-headless-toolbar-vue.ts` | Framework helper for the legacy headless toolbar. New work that needs a Vue UI controller should track that as a separate decision; the legacy entry is kept compiling. See Decision 4. |
| `./converter` | Yes (SD-2953) | Legacy public compatibility surface | `imports-converter.ts` | DOCX conversion is also reachable through `Editor.open` / `Editor.loadXmlData` / `SuperConverter` exported from `superdoc`. Kept exported, not advertised, migration target is `superdoc`. Types added in SD-2953 to satisfy strict-mode consumers. |
| `./docx-zipper` | Yes (SD-2953) | Legacy public compatibility surface | `imports-docx-zipper.ts` | `DocxZipper` is exported from `superdoc`. Kept exported, not advertised, migration target is `superdoc`. Types added in SD-2953. |
| `./file-zipper` | Yes (SD-2953) | Legacy public compatibility surface | `imports-file-zipper.ts` | `createZip` is exported from `superdoc`. Kept exported, not advertised, migration target is `superdoc`. Types added in SD-2953. |
| `./style.css` | N/A | Public asset | n/a (asset) | Stays |

When a new subpath is added to `package.json` `exports`, the change must update both this inventory and the consumer matrix in the same PR. SD-2861's matrix scenarios are the gate that fails CI when a typed subpath ships without coverage.

## Type ownership rules

Any type appearing in a public `.d.ts` (any file reachable from the entries above) must satisfy one of:

1. **Owned directly by `superdoc`.** Defined in `packages/superdoc/src/`, no internal package specifier in its declaration.
2. **Included in the published `superdoc` declaration graph under a `superdoc`-owned path, with no private package specifier exposed.** This is intentionally tool-agnostic; it covers a curated emit, generated public type files, declaration bundling, or any future delivery mechanism. The constraint is the output shape, not the tool.
3. **Re-exported from a real public package.** `@superdoc-dev/react` types coming through their own package.
4. **Re-exported from a published `@superdoc/*` (or `@superdoc-dev/*`) package.** Only applies to packages explicitly classified as a supported public package in the inventory above. Currently no `@superdoc/*` workspace package is in this tier; the Document API is delivered via relocation (Decision 2) rather than a separate published package, but moving to a published package remains a future option.

If a type does not satisfy one of these, it must not appear. The audit gate (SD-2832) enforces this.

## Dependency direction rules

1. **Published public declarations must not import private workspace packages.** Source code may still import internal packages at runtime; the constraint is on the emitted `.d.ts` reachable from a public entry.
2. **Internal packages may import other internal packages freely.** No restriction inward.
3. **Legacy public surfaces follow the same declaration rules as supported public surfaces.** They get minimal type coverage to avoid breaking existing consumers, but they must not leak private workspace packages.
4. **`shared/*` packages are internal runtime only.** Their types do not appear in any public declaration; values used by public code get inlined.

## Decisions and pending inputs

### Decision 1. `superdoc/super-editor` and `@superdoc/super-editor` are legacy public compatibility surface.

**Context.** The `super-editor` subpath was effectively public in earlier versions because there was no other way to use SuperDoc headlessly (server-side, AI agents, batch processing, custom toolbars). That necessity is gone: `superdoc` itself now re-exports `Editor`, `PresentationEditor`, `getStarterExtensions`, `getRichTextExtensions`, `Extensions`, `defineNode`, `defineMark`, `isNodeType`, `assertNodeType`, `isMarkType`, `SuperToolbar`, `CommentsPluginKey`, `TrackChangesBasePluginKey`, `SuperConverter`, `DocxZipper`, and `createZip`. Almost everything customers reached for from the subpath is now reachable from the main package.

**Decision.** Both the standalone `@superdoc/super-editor` package and the `superdoc/super-editor` subpath are classified as **legacy public compatibility surface**. We do not break them. We do not advertise them. New customer guidance, docs, and examples point at `superdoc`. Existing imports keep compiling with real types. A future "no growth" gate (no new exports added through this surface) is a follow-up; the audit script does not enforce that constraint today.

**Pending inputs that refine the migration plan but do not change the classification.**
- Usage scrape across Slack and public GitHub channels to confirm which symbols are actually depended on. (See deliverables below; first cut is captured in the SD-2829 thread comments.)
- A small list of symbols that exist on the subpath but not yet on `superdoc` (`Extension` class, `assembleDocumentApiAdapters`, `createDocumentApi`, `resolveSelectionTarget`, `resolveDefaultInsertTarget`, ProseMirror primitive type re-exports). Either add them to `superdoc`, or accept they migrate to a different supported home.
- Migration window length (the RFC recommends two to three minor versions, given how long we have actively pointed customers at this path; a longer window may be appropriate).

### Decision 2. Document API is a supported public type contract; types are relocated into `superdoc`'s published declaration graph.

**Context.** The package contains real, well-typed APIs (`DocumentApi`, `BookmarkInfo`, `BlocksListResult`, etc.) and is already promoted to customers through the documentation site, the SDK, the MCP, and AI agent guidance. It is functionally public; only the delivery mechanism is open.

**Decision (product).** Document API is a supported public type contract. Its types must be reachable to consumers without collapsing to `any`.

**Implemented delivery (SD-2842).** Source-rewrite curated emit, not bundler-based bundling. Specifically:

1. `vite-plugin-dts` `include` is extended to cover `@superdoc/document-api` (and a small allowlist of layout-engine sub-packages). Their declarations emit into `dist/document-api/` and `dist/layout-engine/...` inside `superdoc`'s published tree.
2. A postbuild rewrite step (`scripts/ensure-types.cjs`) replaces every `@superdoc/document-api` (and friends) bare specifier in emitted `.d.ts` with a relative path pointing at the local dist tree.
3. The `_internal-shims.d.ts` generator skips these packages, so they never collapse to `any`.
4. A build-time check fails the package if any relocated package leaks back into the shim file.

The customer-visible result: `import type { DocumentApi } from 'superdoc'` resolves to a real interface, and `editor.doc.<method>` returns real result types.

**Future paths still on the table.**

- **Publishing as a named `@superdoc-dev/document-api` package** remains the cleaner long-term shape if and when the team wants Document API to have its own version stream and surface. Requires migrating import sites and accepting a separate release cadence; this RFC does not block that move.
- **Bundler-based bundling** (api-extractor, `rollup-plugin-dts`) was tested as part of SD-2830. The toolchain inlines types correctly in principle but corrupts the `declare module '...' { ... }` augmentation patterns the codebase uses for command-map type augmentation, producing malformed `.d.ts` that fails `tsc --noEmit`. Parked, not the path that shipped.

The relocation pattern is what `superdoc` currently uses for several internal-but-public-via-types packages. The `RELOCATION_RULES` table in `ensure-types.cjs` is the extension point; future packages join the list when their types appear on the public surface.

### Decision 3. The layout-engine sub-packages stay separate.

**Context.** `packages/layout-engine/` contains nine sub-packages (`contracts`, `dom-contract`, `geometry-utils`, `layout-bridge`, `layout-engine`, `layout-resolved`, `style-engine`, `painters/dom`, `measuring/dom`), all private, all internal implementation. (The v1 ProseMirror → FlowBlock adapter is no longer here; it is owned by `@superdoc/super-editor` at `src/editors/v1/core/layout-adapter`.)

**Decision.** Keep as-is. The audit gate (SD-2832) plus the type ownership rules remove the customer-visible cost of the split. Restructuring without a strong forcing function is scope creep. Revisit only if the audit gate proves expensive to maintain because of the package count.

### Decision 4. Legacy public-compatibility `superdoc` subpaths.

**Context.** `./converter`, `./docx-zipper`, `./file-zipper` are exported subpaths whose functionality (DOCX conversion, zipping) is also reachable through `superdoc`'s main entry: `Editor.open`, `Editor.loadXmlData`, `SuperConverter`, `DocxZipper`, `createZip` are all exported from `superdoc`.

`./headless-toolbar` is the same shape with a different migration target: the next-generation custom UI story is `superdoc/ui` and `superdoc/ui/react` (the typed UI controller). Existing consumers of the headless-toolbar surface keep compiling; new integrations should use the UI controller entries.

**Decision.** `./converter`, `./docx-zipper`, `./file-zipper`, and the `./headless-toolbar` family (`./headless-toolbar`, `./headless-toolbar/react`, `./headless-toolbar/vue`) are classified as **legacy public compatibility surface**.

| Subpath | Migration target |
| --- | --- |
| `./converter` | `SuperConverter` from `superdoc` |
| `./docx-zipper` | `DocxZipper` from `superdoc` |
| `./file-zipper` | `createZip` from `superdoc` |
| `./headless-toolbar` | `superdoc/ui` |
| `./headless-toolbar/react` | `superdoc/ui/react` |
| `./headless-toolbar/vue` | Track a Vue UI controller as a separate decision; the legacy entry is kept compiling. |

We keep them exported, stop advertising them, and point new use at the migration target. SD-2953 added `types` fields and matrix fixtures so strict-mode consumers no longer hit TS7016; the export-coverage audit (`check-export-coverage.cjs`) now enforces that every `package.json` exports entry carries types, an asset classification, or a documented runtime-only allowlist entry. SD-3179 lands the source-side facade for `./headless-toolbar` under `packages/superdoc/src/public/legacy/` and extends SD-3176's no-growth snapshot list to cover `./headless-toolbar`, `./headless-toolbar/react`, and `./headless-toolbar/vue` so these subpaths cannot expand silently.

### Decision 5. Document API is the supported programmatic surface; editor commands and ProseMirror internals are legacy compatibility.

**Context.** Two coexisting paths for programmatic interaction with the editor exist in the codebase today:

- `editor.doc.*` — the Document API (`packages/document-api/`). Contract-first: `OPERATION_DEFINITIONS` → operation registry → typed dispatch table → adapters. 300+ operations spanning reads (`get`, `find`, `query.match`, `extract`, etc.) and mutations (`insert`, `replace`, `delete`, `format.*`, `comments.*`, `tables.*`, `blocks.*`, etc.). Compile-time parity checks tie all four layers together.
- `editor.commands.*` — the older command system on the editor instance. Typed by `CoreCommandMap`, `ExtensionCommandMap`, `EditorCommands`, `CoreCommands`, `ExtensionCommands`, `CommandProps`, `Command`, `ChainedCommand`, `ChainableCommandObject`, `CanCommand`, `CanObject`.

`packages/superdoc/AGENTS.md` already documents the policy: "For reading and mutating documents programmatically, use the Document API (`editor.doc`). Direct access to ProseMirror internals (`editor.state`, `editor.view`) and editor commands (`editor.commands`) is deprecated and will be removed." Source-side, `editor.commands`, `editor.chain`, `editor.can`, `editor.state`, `editor.view`, `editor.schema`, and `editor.dispatch` all carry `@deprecated` JSDoc tags in `packages/super-editor/src/editors/v1/core/Editor.ts` (lines 268, 275, 1344, 1411, 1597, 1605, 2813) pointing at the Document API as the replacement.

**Decision.**

- **Supported public surface for document reads and mutations.** `editor.doc.*` (the Document API). `DocumentApi` plus the supporting selection / address / range / bookmark / block / protection types are first-class in the `superdoc` root facade. New programmatic document features land as Document API operations.
- **Legacy public compatibility surface.** `editor.commands.*` and its 11 typing infrastructure types remain exported from the facade so existing TypeScript consumers keep compiling. The re-export at the facade carries `@deprecated` JSDoc. SD-3147's classification is corrected to label these as `legacy/public-compat`, not `public`.
- **Legacy ProseMirror internals.** `editor.state`, `editor.view`, `editor.schema`, `editor.dispatch`, and direct ProseMirror types (`EditorState`, `Transaction`, `Schema`, `EditorView`, etc.) follow the same posture: typed, exported, deprecated, not advertised.
- **Out of scope for this decision.** SuperDoc-level config and lifecycle methods (the `SuperDoc` constructor, `Config`, instance lifecycle like `setMode`, `getDocument`, `destroy`) are unrelated. They are not document-mutation API and remain `public`.

**Coverage caveat.** This decision aligns the messaging — Document API is the supported programmatic surface, editor commands are legacy compat — but does **not** assert that today's Document API operations cover every legacy editor command 1:1. A direct comparison of the typed `editor.commands.*` surface against the Document API's 300+ operations finds real gaps: field annotations, document section management commands, search-session UI state, AI marks, diff/comparison helpers, and format-clearing helpers all exist as runtime commands without a 1:1 Document API analogue today. Some of those belong on a future UI/navigation API surface rather than Document API; some are real Document API operation gaps. A separate audit ticket enumerates the typed + runtime command surface against the Document API's `OPERATION_DEFINITIONS`, classifies each gap (Document API covered / UI-navigation API needed / internal editor primitive / legacy compatibility only / missing Document API operation), and produces child tickets for the actual gaps. That audit must complete before any deprecation escalation or removal of `editor.commands.*`.

**Status.** SD-3185 promotes the Document API types into the root facade and adds `@deprecated` tags at the legacy re-exports. The facade verifier's command-signature probe is reframed as a legacy compatibility regression check, not a supported-API guarantee. No removals — `EditorCommands` and PM internals stay exported; removal blocks on the coverage audit (separate ticket) and then a deprecation cycle on a future major.

## Deliverables

This RFC is "done" when the following are produced and reviewed:

1. **This document, merged**, with the four decisions accepted by the team and any team-level adjustments captured in the decisions log.
2. **A migration plan for `superdoc/super-editor`**. The classification (legacy public compatibility) is decided; what remains is the concrete plan: which symbols missing from `superdoc` get added vs migrated to a different home, the deprecation window length, the docs and changelog updates that retire the old import path. First-cut data is in the SD-2829 thread; the plan is the deliverable.
3. **A clarification on `@superdoc-dev/ai`**. Currently `private: true`; either keep private and remove from the in-scope inventory, or commit to publishing.
4. **A short list of guarded public types** for the audit gate (Document API entry types, `Config`, command props, layout-facing types if any are kept public). This list is the input the audit gate (SD-2832) checks for `any` regressions.

## CI enforcement

Once this RFC lands, the audit gate (SD-2832) becomes a literal encoding of the rules above:

- No private `@superdoc/*` specifier in any `.d.ts` reachable from a public entry. (`@superdoc-dev/*` published packages are allowed; that is the convention for public packages.)
- No public type may resolve through `_internal-shims.d.ts`. The shim file may exist for legacy or internal-only declaration reachability while internal packages still appear in non-public emitted `.d.ts` files; the build-time check enforces that no relocated package (Document API, contracts, layout-bridge, painter-dom) leaks back into it.
- No package-manager-internal paths.
- No collapse to `any` on a guarded list of public types (Document API, configuration, command props).
- Pack-and-install consumer typecheck (SD-2831) with `skipLibCheck: false` across resolution modes and frameworks.

Once strict mode is enabled (the audit script defaults to informational while a small set of pre-existing leaks is being closed), future PRs that violate these rules fail CI with a message that points back to this document.

If we adopt D1 (curated emit) for any portion of the surface in the future, an additional audit rule applies: **no private implementation concept exposed as a named public type unless deliberately allowed.** Inlining a type via the bundler removes the package specifier from the import but does not make the inlined shape publicly contracted. The audit gate would maintain an explicit allowlist of types that are intentionally part of the public surface (e.g. `FlowBlock` if we choose to expose it) so that an accidental inline of an implementation-detail type fails CI even when the package-name leak rule is satisfied.

## Recommended sequencing

The order in which the work lands matters. The RFC and the gate tickets are useful only if the customer-acute fixes happen on top of them, and the structural follow-ups happen on top of green gates.

**Done:**

1. **Boundary and gate work merged together** (SD-2829 RFC, SD-2831 consumer matrix, SD-2832 audit script). The RFC defines the contract; the matrix proves the published package compiles for consumers; the audit reports declaration drift. Bundled into a single integration PR so the contract is documented and immediately exercised by CI.
2. **Document API types resolvable from `superdoc`** (SD-2842). `editor.doc.<method>` returns real types; `import type { DocumentApi } from 'superdoc'` resolves to a real interface. Implementation per Decision 2 (relocation into `superdoc`'s published declaration graph). Publishing as a named package remains a future option.

**In progress:**

3. **Drive the supported entries to fully green** against the gates. The audit defaults to informational mode while a small set of pre-existing leaks is closed: an `@superdoc/common` reference the inlining missed, and two deep `@superdoc/super-editor/converter/internal/...` paths the rewrite missed. Once those are fixed, strict mode is the default.

**Future work:**

4. **Folder reorganization** (SD-2835). The structural change becomes lower risk after step 3 because the gates catch any regression that the move might introduce. See SD-2835 for the proposed shape.
5. **Surgical TypeScript migration** of the public contract files: configuration, command surfaces, toolbar/UI types, the supported `superdoc/super-editor` facade. Do not start with a 1,800-file repo-wide migration; that is expensive and would not on its own guarantee the published artifact works.
6. **Long-tail TypeScript migration** opportunistically, where new work touches a file or `checkJs` surfaces real drift between JSDoc and implementation.

Step 4 should wait for at least one release running with strict gates, so the team has confidence the boundary holds before moving files. Steps 5-6 run on their own cadence, evidence-driven rather than calendar-driven.

## Out of scope

- Physical reorganization (renaming or moving packages) is **out of scope for the current type-contract PRs**, but recommended as the next structural follow-up once the gates are passing on the supported entries. Tracked as SD-2835.
- Migrating internal source from JS to TS. The customer-visible problem is the published declaration boundary, not the source language.
- The internal taxonomies of the other `@superdoc-dev/*` published packages (`react`, `esign`, `template-builder`, `sdk`, `collaboration-yjs`). The inventory above acknowledges they exist as public packages with their own version streams; this RFC governs the `superdoc` package and the workspace packages whose types might leak into `superdoc`'s published surface, not the internals of the other public packages.

## Decisions log

This section accumulates decisions as the RFC is reviewed and merged. Each entry: date, decision, who decided, rationale.

_(Empty until first review.)_
