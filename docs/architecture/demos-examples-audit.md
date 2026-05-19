# Demos and examples audit

Status: discovery plan. This document classifies the current `demos/` and `examples/` surfaces. It does not move files or change manifests.

## Goal

Make the source gallery and copy-paste examples easier to reason about before doing any restructuring.

The current written rule is sound:

- `examples/` answers: "How do I use this one primitive or integration pattern?"
- `demos/` answers: "What can I build with SuperDoc?"

The problem is drift. Some entries are already examples living under `demos/`, some are compatibility shims, some are external live demos, and `demos/custom-ui` is a reference workspace rather than a single workflow demo.

## Proposed artifact types

Five types. A type answers "what is this?" (artifact shape, reader-facing). It does not answer "what should we do with it?" (action) or "where does it live?" (ownership/location). Those are separate concerns.

| Type | Question answered | Intended shape |
| --- | --- | --- |
| `minimal-example` | "How do I call this primitive?" | One concept, neutral UI, small README, copy-pasteable. |
| `integration-example` | "How do I wire SuperDoc into this framework/provider/runtime?" | Focused setup for one framework, backend, provider, or external library. |
| `workflow-demo` | "What does this use case look like as an app?" | Scenario-shaped, realistic UI, fake backend data is allowed. |
| `reference-workspace` | "How do several SuperDoc surfaces compose?" | Multi-surface reference app. Not judged by the one-workflow demo rule. |
| `compat-shim` | "Where did this old path move?" | README-only redirect kept temporarily for old links. |

`archive` is an action in the action vocabulary below, not a type: it tells you what to do with an entry, not what kind of artifact it is.

Externality is also not a type: the existing `sourceRepo` field already distinguishes monorepo source (`superdoc-dev/superdoc`) from externally hosted demos (`superdoc-dev/demos`). The 5 external entries in `demos/manifest.json` keep their reader-facing type (most are `workflow-demo`); their externality is captured by `sourceRepo`.

### Proposed action vocabulary

Each entry gets a proposed action, distinct from its type:

- `stay`: type is correct, location is correct, README is fine.
- `move-to-examples`: file path moves into `examples/`.
- `move-to-demos`: file path moves into `demos/` (unlikely; documented for symmetry).
- `merge-with-<id>`: fold into another entry; redirect from this id.
- `redirect-to-<path>`: replace this entry with a stub README pointing elsewhere.
- `archive`: remove the entry from the manifest and either delete or rename the directory.
- `needs-README`: entry exists, source likely exists, but README is missing.
- `needs-investigation`: open question; cannot decide without more context.

Recommendation: add a `type` field to `demos/manifest.json` and `examples/manifest.json` in a later execution PR. Do not infer type from folder name alone.

## Verified drift

- `demos/manifest.json` has 30 entries.
- `examples/manifest.json` has 31 entries.
- `demos/manifest.json` contains 11 explicit `review` notes asking for moves, rewrites, archival, or ownership decisions.
- `examples/manifest.json` has 9 entries whose advertised `sourcePath` has no README.
- Two monorepo demo entries have no local README: `demos/chrome-extension`, `demos/loading-from-json`.
- Four starter paths already exist as `compat-shim` entries under `demos/`: React, Vue, Vanilla, CDN. TypeScript is also a shim pointing to the React starter.
- Two advanced-extension demo paths are already `compat-shim` entries: custom mark and custom node.
- `demos/custom-ui` describes itself as a reference workspace. It is not a single workflow demo.
- `examples/advanced/headless-toolbar` is advertised as one example, but the runnable packages live under child workspaces (`vanilla`, `react-mui`, `react-shadcn`, `svelte-shadcn`, `vue-vuetify`).

## Demo inventory

| ID | Current path | Proposed type | Action | Rationale |
| --- | --- | --- | --- | --- |
| `contract-templates` | `demos/contract-templates` | `workflow-demo` | Stay. | Product-shaped runtime contract-template workflow backed by content controls. Already links to the minimal content-control example. |
| `custom-ui` | `demos/custom-ui` | `reference-workspace` | Stay for now, add `type: "reference-workspace"`, and keep the README explicit. Revisit homepage treatment after onboarding review. | It intentionally composes toolbar, comments, track changes, context menu, commands, citations, import, and export. Judging it as one workflow demo is the source of confusion. |
| `grading-papers` | `demos/grading-papers` | `workflow-demo` | Stay, then modernize README in a later cleanup. | Customer-shaped paper review workflow, even though README calls it an example. |
| `slack-redlining` | `demos/slack-redlining` | `workflow-demo` | Stay, then refresh README/setup status. | Product-shaped Slack plus AI redlining workflow. |
| `chrome-extension` | `demos/chrome-extension` | `workflow-demo` (provisional) | `needs-README` plus `needs-investigation`: do we need a sixth `integration-demo` type for full integrations like this? | Gallery entry points to local source with no README. Integration-shaped scenario, sits between `integration-example` (one wire-up) and `workflow-demo` (one product story). See open question on `integration-demo`. |
| `word-addin` | `demos/word-addin` | `workflow-demo` (provisional) | `needs-investigation`: same `integration-demo` question. | Word add-in synchronization is a full integration workflow with real-time sync architecture. Either keep as `workflow-demo` or promote a new `integration-demo` type. |
| `rag` | external `superdoc-dev/demos/rag` | `workflow-demo` | Stay as external live demo. | Live scenario hosted outside this monorepo. |
| `esign` | external `superdoc-dev/demos/esign` | `workflow-demo` | Stay as external live demo. | Solution workflow, not a monorepo example. |
| `template-builder` | external `superdoc-dev/demos/template-builder` | `workflow-demo` | Stay as external live demo. | Solution workflow. |
| `pdf-sign` | external `superdoc-dev/demos/pdf-sign` | `workflow-demo` | Stay as external live demo. | Solution workflow, related to eSign but distinct enough for live gallery. |
| `fields-live` | external `superdoc-dev/demos/fields` | `workflow-demo` | Stay as external live demo. | Public live workflow for field placement/replacement. |
| `docx-from-html` | `demos/docx-from-html` | `integration-example` | Move to examples, likely under `examples/document-engine/docx-from-html` or an import/export examples group. | README says "example"; teaches one initialization/import pattern rather than a workflow app. |
| `docxtemplater` | `demos/docxtemplater` | `integration-example` | Move to an integration example or archive if not maintained. | External-library wiring, not a composed SuperDoc workflow. |
| `fields-source` | `demos/fields` | `workflow-demo` or `archive` | Decide with Template Builder owner: keep as source workflow only if it still backs docs, otherwise archive in favor of `fields-live` / Template Builder. | Manifest already flags unclear ownership. README is too thin for a source workflow. |
| `linked-sections` | `demos/linked-sections` | `minimal-example` | Move to advanced examples if document sections are supported public surface; otherwise archive. | README says "example" and demonstrates one advanced primitive. |
| `text-selection` | `demos/text-selection` | `minimal-example` | Replace or move under `examples/editor/custom-ui/` after comparing with current selection/viewport APIs. | Existing README teaches low-level programmatic selection. It may be stale now that `ui.selection` and `ui.viewport` exist. |
| `html-editor` | `demos/html-editor` | `integration-example` | `needs-investigation`, then `archive` or `move-to-examples`. | Legacy direct-`SuperEditor` HTML mode. Not a shim today (has actual source). Pending support confirmation (is HTML mode still a public path?). |
| `loading-from-json` | `demos/loading-from-json` | `archive` until proven | Remove from manifest or add README and support statement. | Manifest asks whether JSON import remains supported; local README is missing. |
| `nextjs-ssr` | `demos/nextjs-ssr` | `compat-shim` | Convert to shim or merge into `examples/getting-started/nextjs` after adding that README. | Getting-started framework wiring belongs in examples. |
| `nodejs` | `demos/nodejs` | `integration-example` | `archive` (and replace with a Document Engine SDK/CLI example as a separate piece of work, if not already covered by `examples/editor/collaboration/backends/node-sdk`). | Not a shim today (has actual source). Uses legacy Editor commands; the modern equivalent already exists under `examples/`. Confirm no callers before removing. |
| `replace-content` | `demos/replace-content` | `minimal-example` | Update to Document API first, then move under `examples/document-api/replace-content`. | README calls it an example and teaches one mutation pattern. |
| `toolbar` | `demos/toolbar` | split | Split into a built-in-toolbar custom-button example plus custom-node advanced example, then remove the demo. | Manifest already notes two concepts are mixed. |
| `shim-react` | `demos/react` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/getting-started/react`. |
| `shim-vue` | `demos/vue` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/getting-started/vue`. |
| `shim-vanilla` | `demos/vanilla` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/getting-started/vanilla`. |
| `shim-cdn` | `demos/cdn` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/getting-started/cdn`. |
| `shim-typescript` | `demos/typescript` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to React TypeScript starter. |
| `shim-custom-mark` | `demos/custom-mark` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/advanced/extensions/custom-mark`. |
| `shim-custom-node` | `demos/custom-node` | `compat-shim` | Keep temporarily, then remove after redirect window. | Correctly points to `examples/advanced/extensions/custom-node`. |
| `collaborative-agent` | `demos/collaborative-agent` | `workflow-demo` | Stay. | Composed AI agent plus collaboration workflow with client/server pieces. |

## Example inventory

| ID | Current path | Proposed type | Action | Rationale |
| --- | --- | --- | --- | --- |
| `getting-started-react` | `examples/getting-started/react` | `integration-example` | Stay. | Framework starter. |
| `getting-started-vue` | `examples/getting-started/vue` | `integration-example` | Stay. | Framework starter. |
| `getting-started-vanilla` | `examples/getting-started/vanilla` | `integration-example` | Stay. | Framework starter. |
| `getting-started-cdn` | `examples/getting-started/cdn` | `integration-example` | Stay. | Framework/runtime starter. |
| `getting-started-angular` | `examples/getting-started/angular` | `integration-example` | Stay. | Framework starter. |
| `getting-started-nextjs` | `examples/getting-started/nextjs` | `integration-example` | Add README. | Manifest advertises it, but there is no local README. |
| `getting-started-nuxt` | `examples/getting-started/nuxt` | `integration-example` | Stay. | Framework starter. |
| `getting-started-laravel` | `examples/getting-started/laravel` | `integration-example` | Stay. | Framework starter. |
| `editor-built-in-comments` | `examples/editor/built-in-ui/comments` | `minimal-example` | Add README. | Manifest advertises it, but there is no local README. |
| `editor-built-in-track-changes` | `examples/editor/built-in-ui/track-changes` | `minimal-example` | Add README. | Manifest advertises it, but there is no local README. |
| `editor-built-in-toolbar` | `examples/editor/built-in-ui/toolbar` | `minimal-example` | Add README. | Manifest advertises it, but there is no local README. |
| `editor-custom-ui-selection-capture` | `examples/editor/custom-ui/selection-capture` | `minimal-example` | Stay. | Good example shape: one custom-UI primitive, explicit non-goals. |
| `editor-custom-ui-configurable-toolbar` | `examples/editor/custom-ui/configurable-toolbar` | `minimal-example` | Stay. | Good example shape: one custom toolbar pattern. |
| `document-api-content-controls-tagged-inline-text` | `examples/document-api/content-controls/tagged-inline-text` | `minimal-example` | Stay. | Good Document API primitive example. |
| `document-api-metadata-anchors` | `examples/document-api/metadata-anchors` | `minimal-example` | Stay. | Good Document API primitive example backing source-grounded citation docs. |
| `editor-theming` | `examples/editor/theming` | `minimal-example` | Add README. | Manifest advertises it, but there is no local README. |
| `editor-spell-check-typo-js` | `examples/editor/spell-check/typo-js` | `integration-example` | Stay. | Provider-specific spell-check integration. |
| `editor-spell-check-languagetool` | `examples/editor/spell-check/language-tool-self-hosted` | `integration-example` | Stay. | Provider-specific spell-check integration. |
| `editor-collaboration-superdoc-yjs` | `examples/editor/collaboration/providers/superdoc-yjs` | `integration-example` | Stay. | Collaboration provider integration. |
| `editor-collaboration-hocuspocus` | `examples/editor/collaboration/providers/hocuspocus` | `integration-example` | Stay. | Collaboration provider integration. |
| `editor-collaboration-liveblocks` | `examples/editor/collaboration/providers/liveblocks` | `integration-example` | Stay. | Collaboration provider integration. |
| `editor-collaboration-node-sdk-backend` | `examples/editor/collaboration/backends/node-sdk` | `integration-example` | Stay. | Backend integration example. |
| `editor-collaboration-fastapi-backend` | `examples/editor/collaboration/backends/fastapi` | `integration-example` | Stay. | Backend integration example. |
| `document-engine-diffing` | `examples/document-engine/diffing` | `minimal-example` | Add README. | Manifest advertises it, but there is no local README. |
| `ai-bedrock` | `examples/ai/bedrock` | `integration-example` | Stay. | AI provider integration. |
| `ai-streaming` | `examples/ai/streaming` | `integration-example` | Stay. | AI streaming integration pattern. |
| `ai-redlining` | `examples/ai/redlining` | `workflow-demo` candidate | Add README and decide if it belongs in `examples/ai` or `demos/`. | Manifest marks it as example, but AI redlining may be workflow-shaped. Needs content review. |
| `document-engine-ai-redlining` | `examples/document-engine/ai-redlining` | `workflow-demo` candidate | Add README and decide if it duplicates `ai-redlining`. | Same concept appears in two categories; needs owner decision. |
| `advanced-headless-toolbar` | `examples/advanced/headless-toolbar` | `integration-example` group | Add parent README or change manifest to point at child workspaces. | Runnable packages live in subfolders; parent path has no README. |
| `advanced-extension-custom-mark` | `examples/advanced/extensions/custom-mark` | `minimal-example` | Stay, consider README refresh. | Advanced extension primitive. |
| `advanced-extension-custom-node` | `examples/advanced/extensions/custom-node` | `minimal-example` | Stay, consider README refresh. | Advanced extension primitive. |

## Review-note resolutions

| Existing review note | Resolution |
| --- | --- |
| `docx-from-html`: candidate for import/export or Document Engine example. | Move to examples after choosing final path. |
| `docxtemplater`: decide monorepo demos or live integrations. | Move to integration example or archive if not maintained. |
| `fields-source`: decide Template Builder, Editor, Advanced, or live demo repo. | Treat as Template Builder/source workflow only if owner still needs it; otherwise archive in favor of live solution. |
| `linked-sections`: move to Advanced unless document sections become primary docs surface. | Move to advanced examples if still public. |
| `text-selection`: review against Custom UI selection and viewport APIs. | Replace with current `ui.selection`/`ui.viewport` example or archive old low-level editor-state pattern. |
| `html-editor`: move to Advanced or archive. | Archive unless direct `SuperEditor` HTML mode is still an intentional public advanced path. |
| `loading-from-json`: keep only if JSON import remains supported public path. | Remove from manifest until support is confirmed and README exists. |
| `nextjs-ssr`: compare with examples/getting-started/nextjs. | Collapse into the getting-started Next.js example. |
| `nodejs`: rewrite or replace with Document Engine SDK/CLI examples. | Replace with SDK/CLI example. |
| `replace-content`: update to Document API before moving. | Update then move to Document API examples. |
| `toolbar`: split toolbar configuration from custom node authoring. | Split into two examples, then remove demo entry. |

## Proposed manifest schema delta

Add one required field and one optional field. No directory moves required to add them.

```jsonc
{
  "id": "custom-ui",
  "type": "reference-workspace",       // new, required after follow-up A
  "title": "Custom UI with source-grounded citations",
  // ...existing fields...
}
```

`type` is one of the five taxonomy labels (`minimal-example`, `integration-example`, `workflow-demo`, `reference-workspace`, `compat-shim`). A sixth `integration-demo` may be added if the open question below resolves that way.

```jsonc
{
  "id": "fields-live",
  "type": "workflow-demo",
  "pairId": "fields-source",           // new, optional
  "sourceRepo": "superdoc-dev/demos",
  // ...existing fields...
}
```

`pairId` is optional; set it when an externally hosted demo (`sourceRepo: "superdoc-dev/demos"`) has a paired monorepo source entry (today only `fields-live` ↔ `fields-source`). It documents the pairing so future audits don't re-discover it.

Externality stays captured by the existing `sourceRepo` field. A separate `sourceKind` flag is not needed: `sourceRepo !== "superdoc-dev/superdoc"` is sufficient to identify externally hosted entries. Validator scripts and gallery rendering can key off that.

A follow-up after the typing PR adds a `validate-examples-demos.ts` rule that requires every entry to declare a `type`.

## Proposed execution plan

Each execution PR should be small enough to review without re-litigating the whole taxonomy.

1. **Manifest typing only.** Add a `type` field and validate allowed values. No moves.
2. **README gaps.** Add READMEs for advertised examples and the two monorepo demos missing READMEs, or remove entries that should not be advertised.
3. **Starter duplicate cleanup.** Keep `examples/getting-started/*` as canonical. Retain or remove `demos/*` shims according to the redirect window.
4. **Review-note cleanup, batch 1.** Move obvious examples out of demos: `docx-from-html`, `linked-sections`, `replace-content`.
5. **Review-note cleanup, batch 2.** Resolve advanced/legacy entries: `text-selection`, `html-editor`, `loading-from-json`, `nodejs`, `toolbar`.
6. **Integration ownership.** Decide `docxtemplater`, `chrome-extension`, `word-addin`, and external live entries with owners.
7. **Custom UI decision.** Keep `demos/custom-ui` as a `reference-workspace` unless the source-grounded citation onboarding review shows that a dedicated workflow demo is needed.

## Open decisions

- **Do we need a sixth `integration-demo` type?** `chrome-extension` and `word-addin` sit between `integration-example` (one wire-up, neutral UI) and `workflow-demo` (one product story, composed UI). They are *composed* integrations that ship as full apps. Either fold them into `workflow-demo` (simpler, matches today), or add `integration-demo` as a distinct type for "full integration apps." Affects: `chrome-extension`, `word-addin`. Has knock-on effects on `docxtemplater`, which is a different shape (third-party library wiring, not a full app).
- How long should `compat-shim` entries stay in `demos/` before removal?
- Should `demos/custom-ui` remain homepage-visible after it is typed as `reference-workspace`?
- Are `examples/ai/redlining` and `examples/document-engine/ai-redlining` distinct enough to keep both?
- Is direct JSON loading still supported as a public path?
- Is direct `SuperEditor` HTML mode still a supported public advanced path?
