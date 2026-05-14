# SuperDoc Public Type Facade

**Status:** Draft (SD-2966)  
**Owner:** Caio Pizzol  
**Last updated:** 2026-05-14

<!--
This file is generated from tests/consumer-typecheck/public-facade-policy.json.
Do not edit by hand. Run `node tests/consumer-typecheck/render-facade-doc.mjs --write` to regenerate.
CI runs `node tests/consumer-typecheck/render-facade-doc.mjs --check` to fail on drift.
-->

## Purpose

SD-2828 made the published TypeScript surface compile for consumers. The remaining problem is that the surface is still implicit: public types are whatever the current entry barrels re-export, plus whatever those types reference transitively.

That implicit surface is why declaration rollup failed in SD-2965. Both tested bundlers could close the graph, but API Extractor surfaced forgotten exports, mixed local and exported declarations, and unresolved public names. The package is bundleable in principle; it is not yet curated enough to bundle safely.

This document, generated from `tests/consumer-typecheck/public-facade-policy.json`, defines the facade that should exist before retrying declaration rollup or doing broad TypeScript migration.

## Goals

- Make `superdoc` the canonical import path for new customer code.
- Keep legacy public paths compiling without growing them.
- Give every supported public type a stable name and owner.
- Stop treating internal implementation types as public just because they are reachable.
- Make future declaration rollup a packaging change, not an API discovery exercise.

## Non-goals

- Removing `superdoc/super-editor` now.
- Publishing internal packages like `@superdoc/contracts`.
- Migrating the whole repository to TypeScript.
- Hiding existing legacy names in a patch or minor release.

## Visibility tiers

These are policy tiers, not necessarily source-code annotation tags.

| Policy tier | Meaning |
| --- | --- |
| public | Supported and documented. Stable contract; breaking changes require a deprecation window and a major or signposted minor release. |
| beta | Available from a public path but explicitly scoped to evolve. May change shape or be removed with notice; not yet documented as a stable contract. |
| legacy-root | Re-exported from the root `superdoc` facade for backward compatibility. Migration target exists. Not advertised in new docs. No-growth: new exports are not added through this classification. |
| internal | Reachable through some path today but not part of the contract. Must move behind the facade or be excluded from emitted declarations before strict gates can turn on. |

## Source annotation mapping

Source annotations are normalized in a follow-up PR. The policy tier remains the audit source of truth.

| Policy tier | Source annotation form | Notes |
| --- | --- | --- |
| public | @public | Supported stable contract. This is a real TSDoc release tag. |
| beta | @beta | Supported preview contract. This is a real TSDoc release tag. |
| legacy-root | @deprecated replaceWith=<target> removeIn=<version> or compat-indefinitely | `legacy-root` is a policy tier, not a TSDoc tag. Source annotations use the repository deprecation convention from comment-policy.md. |
| internal | @internal | Not part of the supported customer contract. This is a real TSDoc release tag. |

## Import Path Policy

| Import path | Kind | Tier for new exports | Decision |
| --- | --- | --- | --- |
| `superdoc` | canonical-facade | public | Canonical entry. New docs and support guidance point here. New runtime values and types are added through this facade unless they belong to a dedicated subpath. |
| `superdoc/types` | type-only-facade | public | Type-only entry for extension/schema authors. No runtime values. |
| `superdoc/ui` | public-subpath | public | Browser UI controller surface. Owns UI controller types; root re-exports only what top-level consumers need. |
| `superdoc/ui/react` | public-subpath | public | React bindings for `superdoc/ui`. |
| `superdoc/headless-toolbar` | public-subpath | public | Headless toolbar controller; owns toolbar contract types. |
| `superdoc/headless-toolbar/react` | public-subpath | public | React helper for the headless toolbar. |
| `superdoc/headless-toolbar/vue` | public-subpath | public | Vue helper for the headless toolbar. |
| `superdoc/style.css` | asset | public | Asset export. No type contract. |
| `superdoc/super-editor` | legacy-compat-subpath | legacy-root | Legacy public compatibility surface per `package-boundaries.md` Decision 1. Keep compiling. No new exports added here. Migration target for new code is `superdoc`. |
| `superdoc/converter` | legacy-compat-subpath | legacy-root | Legacy compatibility after SD-2953. Migrate to `SuperConverter` from `superdoc`. |
| `superdoc/docx-zipper` | legacy-compat-subpath | legacy-root | Legacy compatibility after SD-2953. Migrate to `DocxZipper` from `superdoc`. |
| `superdoc/file-zipper` | legacy-compat-subpath | legacy-root | Legacy compatibility after SD-2953. Migrate to `createZip` from `superdoc`. |

No other `superdoc/*` subpath should be added without updating `public-facade-policy.json`, `package.json` exports, the export-coverage audit, and the consumer matrix in the same PR.

## Supported runtime values

| Group | Names | Notes |
| --- | --- | --- |
| Core document UI | `SuperDoc` | Imported from `superdoc`. `SuperDoc` - Primary browser editor entry. |
| Headless editor | `Editor`, `PresentationEditor` | Imported from `superdoc`. `Editor` - Headless and server-side workflows. Prefer Document API for state mutation.; `PresentationEditor` - Bridges editor events into layout/paint state. |
| Import and export | `SuperConverter`, `DocxZipper`, `createZip`, `BlankDOCX`, `DOCX`, `PDF`, `HTML`, `getFileObject` | Imported from `superdoc`. |
| Extension authoring | `Extensions`, `getStarterExtensions`, `getRichTextExtensions`, `defineNode`, `defineMark`, `isNodeType`, `assertNodeType`, `isMarkType` | Imported from `superdoc`. |
| Theming | `createTheme`, `buildTheme` | Imported from `superdoc`. |
| UI components | `SuperEditor`, `Toolbar`, `ContextMenu`, `AIWriter` | Imported from `superdoc`. |
| UI components | `SuperToolbar` | Imported from `superdoc`. `SuperToolbar` - Supported direct-instantiation surface; keep in the root facade with real constructor/config types. |

## Legacy and internal runtime values

These currently appear or are reachable but are not part of the supported contract.

| Group | Tier | Names | Migration / evidence |
| --- | --- | --- | --- |
| UI components | legacy-root | `SlashMenu` | Migration target: ContextMenu from `superdoc`. |
| Helpers | legacy-root | `fieldAnnotationHelpers`, `trackChangesHelpers`, `SectionHelpers`, `superEditorHelpers` | Migration target: superdoc Document API or dedicated helper subpath (TBD) |
| Plugin keys | legacy-root | `TrackChangesBasePluginKey`, `CommentsPluginKey` | Migration target: Document API or UI controller (Comments/TrackChanges slices) |
| Low-level editor helpers | legacy-root | `getMarksFromSelection`, `getActiveFormatting`, `getAllowedImageDimensions` | Migration target: Document API |
| Converter internals | internal | `registeredHandlers` | Currently reachable; not documented; no known consumer use case. |
| Annotator helpers | legacy-root | `AnnotatorHelpers` | Migration target: Document API or Annotator-specific subpath (TBD) |

## Public type groups

Public types are named from the customer workflow they support, not from the internal package that happens to define them.

| Group | Names | Notes |
| --- | --- | --- |
| Configuration | `Config`, `Modules`, `User`, `Document`, `CollaborationConfig`, `SuperDocTelemetryConfig`, `AwarenessState` | Imported from `superdoc`. `AwarenessState` - Added in SD-2834. |
| Document API | `DocumentApi`, `SelectionApi`, `SelectionInfo`, `TextTarget`, `TextAddress`, `EntityAddress`, `BlocksListResult`, `BookmarkInfo` | Imported from `superdoc`. |
| Editor lifecycle | `EditorOptions`, `EditorLifecycleState`, `OpenOptions`, `SaveOptions`, `ExportOptions`, `ExportDocxParams`, `EditorEventMap`, `EditorTransactionEvent` | Imported from `superdoc`. `EditorTransactionEvent` - Transaction field narrowed to real `Transaction` in SD-2834. |
| Comments and track changes | `Comment`, `CommentElement`, `CommentsPayload`, `TrackChangesModuleConfig` | Imported from `superdoc`. |
| UI controller | `SuperDocUI`, `SuperDocUIOptions`, `SuperDocUIState`, `SelectionSlice`, `CommentsSlice`, `TrackChangesSlice`, `ViewportHandle`, `DocumentHandle` | Imported from `superdoc/ui`. |
| Toolbar | `CreateHeadlessToolbarOptions`, `HeadlessToolbarController`, `PublicToolbarItemId`, `ToolbarSnapshot` | Imported from `superdoc/headless-toolbar`. |
| Proofing | `ProofingProvider`, `ProofingCheckRequest`, `ProofingCheckResult`, `ProofingIssue`, `ProofingConfig`, `ProofingError` | Imported from `superdoc`. `ProofingError` - `cause` field narrowed from `any` to `unknown` in SD-2834. |
| Theming and surfaces | `ContextMenuConfig`, `SurfaceResolver`, `SurfaceHandle` | Imported from `superdoc`. |
| Extension authoring (types) | `EditorExtension`, `NodeName`, `NodeAttrs`, `MarkName`, `MarkAttrs` | Imported from `superdoc/types`. |

## Legacy and internal type groups

Exported for compatibility or reachable as implementation detail. Not part of the supported contract.

| Group | Tier | Names | Migration / evidence |
| --- | --- | --- | --- |
| ProseMirror primitives | legacy-root | `EditorState`, `Transaction`, `Schema`, `EditorView`, `ProseMirrorJSON` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| Command internals | legacy-root | `EditorCommands`, `CommandProps`, `Command`, `ChainedCommand`, `CoreCommandMap`, `ExtensionCommandMap` | Migration target: Document API or UI command controller |
| Layout internals | internal | `FlowBlock`, `Layout`, `LayoutPage`, `LayoutFragment`, `Measure`, `SectionMetadata`, `PaintSnapshot`, `PositionHit` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| Plugin key types | legacy-root | `TrackChangesBasePluginKey`, `CommentsPluginKey` | Migration target: Document API or UI controller |

## Symbol policy

This flat list is the machine-readable contract the audit will consume. Grouped sections above are for review ergonomics.

| Symbol | Kind | Group | Tier | Import path | Migration / evidence |
| --- | --- | --- | --- | --- | --- |
| `SuperDoc` | runtime_value | Core document UI | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Editor` | runtime_value | Headless editor | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `PresentationEditor` | runtime_value | Headless editor | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperConverter` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `DocxZipper` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `createZip` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `BlankDOCX` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `DOCX` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `PDF` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `HTML` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `getFileObject` | runtime_value | Import and export | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Extensions` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `getStarterExtensions` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `getRichTextExtensions` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `defineNode` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `defineMark` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `isNodeType` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `assertNodeType` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `isMarkType` | runtime_value | Extension authoring | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `createTheme` | runtime_value | Theming | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `buildTheme` | runtime_value | Theming | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperEditor` | runtime_value | UI components | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Toolbar` | runtime_value | UI components | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ContextMenu` | runtime_value | UI components | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SlashMenu` | runtime_value | UI components | legacy-root | `superdoc` | Migration target: ContextMenu from `superdoc`. |
| `AIWriter` | runtime_value | UI components | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperToolbar` | runtime_value | UI components | public | `superdoc` | Direct consumer fixture instantiates `new SuperToolbar(...)` in tests/consumer-typecheck/src/customer-scenario.ts:661 and asserts assignability at line 671. |
| `fieldAnnotationHelpers` | runtime_value | Helpers | legacy-root | `superdoc` | Migration target: superdoc Document API or dedicated helper subpath (TBD) |
| `trackChangesHelpers` | runtime_value | Helpers | legacy-root | `superdoc` | Migration target: superdoc Document API or dedicated helper subpath (TBD) |
| `SectionHelpers` | runtime_value | Helpers | legacy-root | `superdoc` | Migration target: superdoc Document API or dedicated helper subpath (TBD) |
| `superEditorHelpers` | runtime_value | Helpers | legacy-root | `superdoc` | Migration target: superdoc Document API or dedicated helper subpath (TBD) |
| `TrackChangesBasePluginKey` | runtime_value | Plugin keys | legacy-root | `superdoc` | Migration target: Document API or UI controller (Comments/TrackChanges slices) |
| `CommentsPluginKey` | runtime_value | Plugin keys | legacy-root | `superdoc` | Migration target: Document API or UI controller (Comments/TrackChanges slices) |
| `getMarksFromSelection` | runtime_value | Low-level editor helpers | legacy-root | `superdoc` | Migration target: Document API |
| `getActiveFormatting` | runtime_value | Low-level editor helpers | legacy-root | `superdoc` | Migration target: Document API |
| `getAllowedImageDimensions` | runtime_value | Low-level editor helpers | legacy-root | `superdoc` | Migration target: Document API |
| `registeredHandlers` | runtime_value | Converter internals | internal | `superdoc` | Currently reachable; not documented; no known consumer use case. |
| `AnnotatorHelpers` | runtime_value | Annotator helpers | legacy-root | `superdoc` | Migration target: Document API or Annotator-specific subpath (TBD) |
| `Config` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Modules` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `User` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Document` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `CollaborationConfig` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperDocTelemetryConfig` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `AwarenessState` | type | Configuration | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `DocumentApi` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SelectionApi` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SelectionInfo` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `TextTarget` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `TextAddress` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EntityAddress` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `BlocksListResult` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `BookmarkInfo` | type | Document API | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorOptions` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorLifecycleState` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `OpenOptions` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SaveOptions` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ExportOptions` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ExportDocxParams` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorEventMap` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorTransactionEvent` | type | Editor lifecycle | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `Comment` | type | Comments and track changes | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `CommentElement` | type | Comments and track changes | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `CommentsPayload` | type | Comments and track changes | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `TrackChangesModuleConfig` | type | Comments and track changes | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperDocUI` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperDocUIOptions` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SuperDocUIState` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SelectionSlice` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `CommentsSlice` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `TrackChangesSlice` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ViewportHandle` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `DocumentHandle` | type | UI controller | public | `superdoc/ui` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `CreateHeadlessToolbarOptions` | type | Toolbar | public | `superdoc/headless-toolbar` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `HeadlessToolbarController` | type | Toolbar | public | `superdoc/headless-toolbar` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `PublicToolbarItemId` | type | Toolbar | public | `superdoc/headless-toolbar` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ToolbarSnapshot` | type | Toolbar | public | `superdoc/headless-toolbar` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingProvider` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingCheckRequest` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingCheckResult` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingIssue` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingConfig` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ProofingError` | type | Proofing | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `ContextMenuConfig` | type | Theming and surfaces | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SurfaceResolver` | type | Theming and surfaces | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `SurfaceHandle` | type | Theming and surfaces | public | `superdoc` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorExtension` | type | Extension authoring (types) | public | `superdoc/types` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `NodeName` | type | Extension authoring (types) | public | `superdoc/types` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `NodeAttrs` | type | Extension authoring (types) | public | `superdoc/types` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `MarkName` | type | Extension authoring (types) | public | `superdoc/types` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `MarkAttrs` | type | Extension authoring (types) | public | `superdoc/types` | Classified by SD-2966 as part of the supported customer facade; covered by consumer typecheck fixtures or existing package-boundary policy. |
| `EditorState` | type | ProseMirror primitives | legacy-root | `superdoc` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| `Transaction` | type | ProseMirror primitives | legacy-root | `superdoc` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| `Schema` | type | ProseMirror primitives | legacy-root | `superdoc` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| `EditorView` | type | ProseMirror primitives | legacy-root | `superdoc` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| `ProseMirrorJSON` | type | ProseMirror primitives | legacy-root | `superdoc` | Migration target: Document API for state mutation. ProseMirror types remain accessible for advanced consumers that explicitly need them. |
| `EditorCommands` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `CommandProps` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `Command` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `ChainedCommand` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `CoreCommandMap` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `ExtensionCommandMap` | type | Command internals | legacy-root | `superdoc` | Migration target: Document API or UI command controller |
| `FlowBlock` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `Layout` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `LayoutPage` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `LayoutFragment` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `Measure` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `SectionMetadata` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `PaintSnapshot` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `PositionHit` | type | Layout internals | internal | `superdoc` | Reachable but not documented for consumer use; layout is a paint-time concern owned by `layout-engine/`. |
| `TrackChangesBasePluginKey` | type | Plugin key types | legacy-root | `superdoc` | Migration target: Document API or UI controller |
| `CommentsPluginKey` | type | Plugin key types | legacy-root | `superdoc` | Migration target: Document API or UI controller |

## Legacy `superdoc/super-editor` facade

`superdoc/super-editor` is a compatibility facade. Rules:

- Existing exports keep compiling.
- No new export is added through `superdoc/super-editor` unless there is no supported replacement.
- New docs avoid this path except migration and advanced pages.
- Each symbol kept here has a migration target: usually `superdoc`, `superdoc/ui`, or Document API.
- A no-growth audit (future) snapshots this subpath; new names appearing on it fail CI.

Known symbols and their migration decisions:

| Symbols | Current use | Proposed target |
| --- | --- | --- |
| `Editor`, `PresentationEditor`, `SuperConverter`, `DocxZipper`, `createZip` | Headless and conversion workflows. | Already available from `superdoc`. |
| `getStarterExtensions`, `getRichTextExtensions`, `Extensions`, `defineNode`, `defineMark`, `isNodeType`, `assertNodeType`, `isMarkType` | Extension authoring. | Already available from `superdoc`. |
| `Extension`, `Node`, `Mark`, `Attribute`, `Plugin`, `PluginKey` | Advanced custom extension docs. | Decide whether to promote to `superdoc` or keep legacy-only (Open Decision 1). |
| `resolveSelectionTarget`, `resolveDefaultInsertTarget` | CLI and internal Document API bridge. | Keep internal or expose a documented Document API helper home. |
| `trackChangesHelpers`, `fieldAnnotationHelpers`, `SectionHelpers` | Existing advanced integrations. | Keep typed as legacy-supported. Do not expand. |

## Implementation shape

Recommended source layout:

```text
packages/superdoc/src/public/
  index.ts                 # canonical top-level value + type facade
  types.ts                 # type-only facade for superdoc/types
  super-editor-compat.ts   # legacy compatibility facade
  ui.ts                    # superdoc/ui facade
  ui-react.ts              # superdoc/ui/react facade
  headless-toolbar.ts      # toolbar facade
  headless-toolbar-react.ts
  headless-toolbar-vue.ts
```

- Existing entry files can stay as thin wrappers during migration.
- Public exports are explicit lists, not `export *` from implementation barrels.
- Each exported name carries one tier classification recorded in `public-facade-policy.json`. Source-side annotations (TSDoc tags) are normalized in PR 2 to match the policy.

## Audit consumption

The audit (`deep-type-audit.mjs`) reads `public-facade-policy.json` as the authoritative classification source. Source JSDoc tags are normalized in PR 2 but are not the contract.

**Rationale.**

- TSDoc release tags (`@public`, `@beta`, `@internal`) do not survive `.d.ts` emission in our current pipeline. The audit walks emitted declarations and cannot recover tags from them.
- Source files today carry malformed JSDoc (multi-typedef blocks, missing `replaceWith`/`removeIn` on `@deprecated`). Treating source as the authority would freeze that malformed shape into CI.
- JSON is reviewable in a single PR, diffable, and exposes intent. Source annotations follow in PR 2 once the policy is the established contract.

**Future state.**

- PR 2 normalizes source JSDoc to match the policy.
- PR 3 wires `deep-type-audit.mjs` to read the policy: each tier gets a strict gate appropriate to its level (public must not collapse to `any`; legacy-root tolerated; internal must not be reachable from a public path).
- If API Extractor or a similar tool starts preserving TSDoc tags in emitted declarations later, the audit can prefer source tags and use the JSON only for legacy-root and internal classifications.

## CI gates after the facade exists

Existing SD-2828 gates stay. Add these once the facade is implemented:

| # | Gate | Description |
| --- | --- | --- |
| 1 | No wildcard public re-exports | Files under `packages/superdoc/src/public/**` must not use `export *`. Compatibility files (`super-editor-compat.ts`) are explicitly allowlisted. |
| 2 | No-growth snapshot for `superdoc/super-editor` | Snapshot of names exported through the legacy subpath. New names appearing fail CI. |
| 3 | Public type snapshot | Top-level `superdoc` supported names tracked against a snapshot. Additions are intentional (PR adds the row to the policy). |
| 4 | Reachability ratio gate | After rollup or curated-emit path is in place: emitted declarations reachable only through declared public paths. |
| 5 | Consumer matrix authoritative | Pack-and-install consumer typecheck across `bundler`, `node16`, `nodenext` with `skipLibCheck: false`. Unchanged from SD-2828. |

## Sequencing

1. Land this policy + renderer + reconciled RFC (PR 1).
2. Normalize source JSDoc to match the policy: split multi-typedef blocks, standard tags only, complete `@deprecated replaceWith=X removeIn=Y` per `comment-policy.md` (PR 2).
3. Implement explicit facade files under `packages/superdoc/src/public/` without changing runtime behavior.
4. Update docs and examples to point new code at `superdoc`, `superdoc/ui`, and `superdoc/headless-toolbar`.
5. Wire the audit to read the policy JSON; turn on per-tier strict gates (PR 3, sibling of SD-3046).
6. Retry declaration rollup against the facade input.
7. Migrate public-contract files to TypeScript only where the facade or rollup still needs cleaner input.

## Open decisions

| # | Question | Default if unresolved |
| --- | --- | --- |
| 1 | Promote `Extension`, `Node`, `Mark`, `Attribute` classes to top-level `superdoc` extension-authoring surface? | Keep legacy-only. Extension authoring proceeds through the existing factory functions. |
| 2 | Are layout types (`FlowBlock`, `Layout`, `PaintSnapshot`) customer-supported, or internal/debug-only? | Internal. Layout is owned by `layout-engine/` and is not part of the public contract today. |
| 3 | Promote helper namespaces (`superEditorHelpers`, `trackChangesHelpers`, `fieldAnnotationHelpers`, `SectionHelpers`) to documented stable, or keep as legacy? | Legacy-root. Keep typed; do not expand. Document API is the strategic path. |
| 4 | Should `registeredHandlers` remain exported at all? | Internal. Move behind the facade unless a consumer surfaces a real use case. |
| 5 | Deprecation window length for `superdoc/super-editor` once migration docs are complete? | Compat-indefinitely. Per `package-boundaries.md` Decision 1: keep compiling, do not advertise. No removal date until usage data justifies one. |

## RFC reconciliation

### 1. `docs/architecture/package-boundaries.md` near line 228

**Issue.** Calls `superdoc/super-editor` a 'supported facade'; Decision 1 (line 144) classifies it as legacy public compatibility surface.

**Current text.**

> Surgical TypeScript migration of the public contract files: configuration, command surfaces, toolbar/UI types, the supported `superdoc/super-editor` facade.

**Proposed text.**

> Surgical TypeScript migration of the public contract files: configuration, command surfaces, toolbar/UI types, and the legacy `superdoc/super-editor` compatibility facade.

**Rationale.** Decision 1 is the single source of truth for the classification. The migration item should describe the facade by its actual tier so the policy in this document and the RFC say the same thing.

**Source of truth.** package-boundaries.md Decision 1 (line 144-148).
