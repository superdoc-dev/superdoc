# SD-3256 Phase 3A: `superdoc/super-editor` export inventory

**Status:** Discovery / proposed classification. **No code changes in this PR.**
**Audience:** SuperDoc team. Reviewers: please comment on individual rows where the proposed classification needs change.

## What this is

Phase 3 of SD-3256 will curate the `./super-editor` subpath through a real facade at `packages/superdoc/src/public/legacy/super-editor.ts`, the same way every other legacy subpath already routes through `src/public/legacy/**`. Today, `./super-editor` is the only `legacy-raw` entry: its types resolve directly to `dist/superdoc/src/super-editor.d.ts`, which `export *`s from the raw v1 barrel and exposes whatever happens to be there.

Before any code change, this PR proposes a classification for every export the subpath currently exposes. Phase 3B will implement the facade based on what the team approves here.

## Proposed tiers

| Tier | Meaning | Action in Phase 3B |
|---|---|---|
| **keep** | Public, supported, no reason to remove | Re-export from curated facade |
| **deprecate** | Public today, on a removal path, but still works | Re-export with `@deprecated` JSDoc + a target removal version |
| **hide** | Already marked `@internal`, no documented consumer use case, accidental surface | Do NOT re-export from facade (consumers who reach into dist directly today will need a migration note) |
| **unknown** | Needs a team decision before classifying | Defer to Phase 3B review |

The `@internal` JSDoc markers already in the v1 barrel are the team's existing "not for consumers" signal. The default proposal mirrors them: `@internal` → **hide**, everything else → **keep**. Exceptions are called out per row.

## Inventory: value exports

Source: `packages/super-editor/src/editors/v1/index.js` (the barrel re-exported by `superdoc/super-editor`).

### Classes

| Export | `@internal` marker today | Proposed | Notes |
|---|---|---|---|
| `Editor` | no | **keep** | Primary editor class. Documented consumer surface. |
| `SuperToolbar` | no | **keep** | Public toolbar API. |
| `SuperConverter` | yes | **hide** | Internal converter. Customers should not construct directly. Already `@internal`. |
| `DocxZipper` | yes | **hide** | Available via `./docx-zipper` subpath; redundant here. |
| `PresentationEditor` | yes | **hide** | Internal hidden-editor wrapper. Already `@internal`. |
| `DocxEncryptionError` | no | **keep** | Public error class consumers catch. |
| `DocxEncryptionErrorCode` | no | **keep** | Public enum-like for the error codes. |

### Vue components

| Export | `@internal` marker | Proposed | Notes |
|---|---|---|---|
| `SuperEditor` | no | **keep** | Main Vue editor component. |
| `Toolbar` | no | **keep** | Vue toolbar component. |
| `AIWriter` | no | **keep** | AI-writer Vue component. **Open question:** is this still actively shipped / used? If not, candidate for **deprecate**. |
| `ContextMenu` | no | **keep** | Replaces `SlashMenu`. |
| `SlashMenu` | no (but source has `@deprecated`) | **deprecate** | Already marked `@deprecated` with "Use ContextMenu instead". Keep with the marker. |
| `SuperInput` | yes | **hide** | Already `@internal`. |

### Helper bundles / namespaces

| Export | `@internal` marker | Proposed | Notes |
|---|---|---|---|
| `helpers` | no | **keep** | Bundle re-export from `core/index.js`. |
| `fieldAnnotationHelpers` | no | **keep** | Public namespace; typed in SD-2980 PR A. |
| `trackChangesHelpers` | no | **keep** | Public namespace; typed in SD-2980 PRs B + C. |
| `SectionHelpers` | no | **keep** | Public section helpers. |
| `Extensions` (namespace) | n/a | **keep** | Bundle of `Node`, `Attribute`, `Extension`, `Mark`, PM `Plugin`, `PluginKey`, `Decoration`, `DecorationSet`. Required for extension authors. |
| `AnnotatorHelpers` | yes | **hide** | Already `@internal`. |

### Functions / utilities

| Export | `@internal` marker | Proposed | Notes |
|---|---|---|---|
| `createHeadlessToolbar` | no | **keep** | Public headless toolbar factory. |
| `headlessToolbarConstants` | no | **keep** | |
| `headlessToolbarHelpers` | no | **keep** | |
| `createSuperDocUI` | no | **keep** | Public UI factory. |
| `shallowEqual` | no | **keep** | Public utility. **Open question:** is this documented anywhere or just leaked? Candidate for **hide** if no consumer surfaces it. |
| `getStarterExtensions` | no | **keep** | Public extension list builder. |
| `getRichTextExtensions` | yes | **hide** | Already `@internal`. |
| `createZip` | no | **keep** | Also exposed via `./file-zipper` subpath; both keep. |
| `getAllowedImageDimensions` | yes | **hide** | Already `@internal`. |
| `registeredHandlers` | yes | **hide** | Already `@internal`. |
| `isNodeType` / `assertNodeType` | no | **keep** | Public type guards. |
| `isMarkType` | no | **keep** | Public type guard. |
| `defineNode` / `defineMark` | no | **keep** | Public extension builders. |
| `getMarksFromSelection` | yes | **hide** | Already `@internal`. |
| `getActiveFormatting` | yes | **unknown** | Currently `@internal` BUT we just typed it in SD-3245 (`ActiveFormattingEntry` discriminated union). **Team decision needed:** is this internal-only (headless toolbar uses it) or is it on a path to becoming public? Either keep typed for internal use only, or promote to public. |

### Plugin keys / collaboration / tracked-change anchors

| Export | `@internal` marker | Proposed | Notes |
|---|---|---|---|
| `TrackChangesBasePluginKey` | yes | **hide** | Already `@internal`. |
| `CommentsPluginKey` | yes | **hide** | Already `@internal`. |
| `createOrUpdateTrackedChangeComment` | yes | **hide** | Already `@internal`. |
| `seedEditorStateToYDoc` | yes | **hide** | Already `@internal`. Collaboration bootstrap. |
| `onCollaborationProviderSynced` | yes | **hide** | Already `@internal`. |
| `resolveSelectionTarget` | yes | **hide** | Already `@internal`. CLI/document-api bridge helper. |
| `resolveDefaultInsertTarget` | yes | **hide** | Already `@internal`. |
| `resolveTrackedChangeInStory` | yes | **hide** | Already `@internal`. |
| `syncCommentEntitiesFromCollaboration` | yes (SD-3214) | **hide** | Already `@internal`. |
| `getTrackedChangeIndex` | yes | **hide** | Already `@internal`. |
| `makeTrackedChangeAnchorKey` | yes | **hide** | Already `@internal`. |
| `makeCommentAnchorKey` | yes | **hide** | Already `@internal`. |
| `isTrackedChangeAnchorKey` | yes | **hide** | Already `@internal`. |
| `isCommentAnchorKey` | yes | **hide** | Already `@internal`. |
| `parseTrackedChangeAnchorKey` | yes | **hide** | Already `@internal`. |
| `TRACKED_CHANGE_ANCHOR_KEY_PREFIX` | yes | **hide** | Already `@internal`. |
| `COMMENT_ANCHOR_KEY_PREFIX` | yes | **hide** | Already `@internal`. |

### Bridge re-exports (added at `packages/superdoc/src/super-editor.js`, not in the v1 barrel)

| Export | Proposed | Notes |
|---|---|---|
| `BLANK_DOCX_BASE64` | **keep** | Used by consumers needing a blank document seed. |
| `getDocumentApiAdapters` | **keep** | Document API integration bridge. |
| `markdownToPmDoc` | **keep** | Markdown import bridge. |
| `initPartsRuntime` | **keep** | Parts runtime initialization. |

## Inventory: type-only exports

Source: `packages/super-editor/src/index.d.ts` (the type-side barrel; `./super-editor` consumers reach these via `import type`).

### ProseMirror types — marked `@deprecated` in source

| Export | Proposed | Notes |
|---|---|---|
| `EditorView` | **deprecate** | Source already marks `@deprecated`: "Direct ProseMirror access will be removed in a future version. Use the Document API instead." |
| `EditorState` | **deprecate** | Same `@deprecated` source marker. |
| `Transaction` | **deprecate** | Same `@deprecated` source marker. |
| `Schema` | **deprecate** | Same `@deprecated` source marker. |

### Document API types

All from `packages/document-api/src/index.js`. **All keep** unless team flags otherwise:

`ResolveRangeOutput`, `DocumentApi`, `DocumentProtectionState`, `SelectionApi`, `SelectionInfo`, `SelectionCurrentInput`, `ScrollIntoViewInput`, `ScrollIntoViewOutput`, `StoryLocator`, `TextAddress`, `TextTarget`, `TextSegment`, `EntityAddress`, `BlockNavigationAddress`, `CommentAddress`, `TrackedChangeAddress`, `NavigableAddress`, `BlocksListResult`, `BookmarkInfo`, `BookmarkAddress`

### Selection types

| Export | Proposed | Notes |
|---|---|---|
| `SelectionHandle` | **keep** | Public selection handle type. |
| `SelectionCommandContext` | **keep** | Public selection command context. |

### Command types — marked `@deprecated` in source

| Export | Proposed | Notes |
|---|---|---|
| `EditorCommands`, `CommandProps`, `Command`, `ChainedCommand`, `ChainableCommandObject`, `CanObject`, `CoreCommandMap`, `ExtensionCommandMap` | **deprecate** | All marked `@deprecated`: "Editor commands will be removed in a future version. Use the Document API instead." |

### Event types

**All keep:** `Comment`, `CommentElement`, `CommentsPayload`, `CommentLocationsPayload`, `FontsResolvedPayload`, `PaginationPayload`, `ListDefinitionsPayload`, `TrackedChangesChangedPayload`, `ProtectionChangeSource`, `EditorEventMap`.

### Parts types

**All keep:** `PartChangedEvent`, `PartId`, `PartSectionId`.

### Editor config types

**All keep:** `EditorOptions`, `User`, `FontConfig`, `FieldValue`, `DocxFileEntry`, `ViewLayout`, `ViewOptions`, `EditorExtension`, `CollaborationProvider`, `Awareness`, `CommentConfig`, `CommentHighlightColors`, `CommentHighlightOpacity`, `PermissionParams`, `LinkPopoverResolver`, `LinkPopoverContext`, `LinkPopoverResolution`, `ExternalPopoverRenderContext`.

### Generic editor types

**All keep:** `BinaryData`, `UnsupportedContentItem`, `ProseMirrorJSON`, `ExportFormat`, `PageStyles`.

### Editor lifecycle types

**All keep:** `OpenOptions`, `SaveOptions`, `ExportOptions`, `ExportDocxParams`, `EditorLifecycleState`.

### Presentation editor types

**All keep:** `PageSize`, `PageMargins`, `VirtualizationOptions`, `RemoteUserInfo`, `RemoteCursorState`, `PresenceOptions`, `TrackedChangesOverrides`, `LayoutEngineOptions`, `PresentationEditorOptions`, `LayoutMetrics`, `LayoutError`, `LayoutState`, `RangeRect`, `BoundingRect`, `LayoutUpdatePayload`, `ImageSelectedEvent`, `ImageDeselectedEvent`, `TelemetryEvent`, `RemoteCursorsRenderPayload`, `FlowMode`.

### Proofing types

**All keep:** `ProofingProvider`, `ProofingCapabilities`, `ProofingCheckRequest`, `ProofingCheckResult`, `ProofingSegment`, `ProofingSegmentMetadata`, `ProofingIssue`, `ProofingIssueKind`, `ProofingConfig`, `ProofingStatus`, `ProofingError`.

### Layout types (from internal packages, exposed publicly here)

**All keep:** `PositionHit`, `PaintSnapshot`, `LayoutMode`, `FlowBlock`, `Layout`, `Measure`, `SectionMetadata`, `TrackedChangesMode`, `LayoutPage`, `LayoutFragment`.

### Headless toolbar types

**All keep:** `CreateHeadlessToolbarOptions`, `HeadlessToolbarController`, `HeadlessToolbarSurface`, `HeadlessToolbarSuperdocHost`, `PublicToolbarItemId`, `ToolbarCommandState`, `ToolbarCommandStates`, `ToolbarContext`, `ToolbarExecuteFn`, `ToolbarPayloadMap`, `ToolbarSnapshot`, `ToolbarTarget`, `ToolbarValueMap`.

### UI types

**All keep:** `CommentsHandle`, `CommentsSlice`, `EqualityFn`, `SelectorFn`, `SelectionSlice`, `Subscribable`, `SuperDocEditorLike`, `SuperDocLike`, `SuperDocUI`, `SuperDocUIOptions`, `SuperDocUIState`, `TrackChangesHandle`, `TrackChangesItem`, `TrackChangesSlice`, `ViewportGetRectInput`, `ViewportHandle`, `ViewportRect`, `ViewportRectResult`.

## Summary

| Tier | Value exports | Type exports |
|---|---|---|
| keep | ~25 | ~90 |
| deprecate | 1 (`SlashMenu`) | 12 (ProseMirror types + Editor command types) |
| hide | ~22 (all currently `@internal`) | 0 |
| unknown | 1 (`getActiveFormatting`) | 0 |

## Open questions for the team

1. **`getActiveFormatting`** — currently `@internal` but typed in SD-3245. Hide (keep internal-only) or promote to public?
2. **`AIWriter`** — still shipped / supported? Or quietly deprecated?
3. **`shallowEqual`** — public utility or accidental surface? If no documented consumer use case, candidate for **hide**.
4. **Deprecation timeline** — for the 1 + 12 entries marked `deprecate`, do we want a target removal version (e.g., `v1.36`, `v2.0`) in the JSDoc? The current source markers don't specify.
5. **Bridge re-exports** — confirm all 4 (`BLANK_DOCX_BASE64`, `getDocumentApiAdapters`, `markdownToPmDoc`, `initPartsRuntime`) stay public; none flagged as `@internal` today.
6. **Hidden-but-reachable risk** — consumers who reach into the raw `dist/superdoc/src/super-editor.d.ts` today see the `@internal` exports. After curation they will not. Should Phase 3B include a one-version transition where the curated facade still re-exports the `@internal` set with a `@deprecated` marker, or hide hard?

## Next steps

- **Team review** of this document. Comment on specific rows or open questions.
- After sign-off, **Phase 3B** creates `packages/superdoc/src/public/legacy/super-editor.ts` with the approved keep + deprecate set, updates `package.json#exports` to point `./super-editor` at it, runs `pnpm check:public-contract`, and updates the `publicContract` config entry from `legacy-raw` to `legacy`.
- **Phase 3C** (optional, only if approved): hide the `@internal`-marked exports hard, with release-note coordination.
