# superdoc root export inventory (SD-3212 PR A0)

Generated: 2026-05-18T22:39:27.584Z
Source: packed and installed `tests/consumer-typecheck/node_modules/superdoc`

## Counts

| Source | Path | Count |
|---|---|---|
| types.import | `./dist/superdoc/src/index.d.ts` | 200 |
| types.require | `./dist/superdoc/src/index.d.cts` | 200 |
| import | `./dist/superdoc.es.js` | 41 |
| require | `./dist/superdoc.cjs` | 41 |
| **union** |  | **200** |

## Divergences

- types.import only (not in types.require): 0
- types.require only (not in types.import): 0
- ESM only (not in CJS): 0
- CJS only (not in ESM): 0
- typed but no runtime export (phantom risk): 159
- runtime export but not typed (silent shadow on root): 0

### Type-only names (no runtime)

- `AwarenessState`
- `BinaryData`
- `BlockNavigationAddress`
- `BlocksListResult`
- `BookmarkAddress`
- `BookmarkInfo`
- `BoundingRect`
- `CanObject`
- `ChainableCommandObject`
- `ChainedCommand`
- `CollaborationConfig`
- `CollaborationProvider`
- `Command`
- `CommandProps`
- `Comment`
- `CommentAddress`
- `CommentConfig`
- `CommentElement`
- `CommentLocationsPayload`
- `CommentsPayload`
- `CommentsType`
- `Config`
- `ContextMenuConfig`
- `ContextMenuContext`
- `ContextMenuItem`
- `ContextMenuSection`
- `CoreCommandMap`
- `DirectSurfaceRequest`
- `DocRange`
- `DocumentApi`
- `DocumentMode`
- `DocumentProtectionState`
- `DocxFileEntry`
- `EditorCommands`
- `EditorEventMap`
- `EditorExtension`
- `EditorLifecycleState`
- `EditorOptions`
- `EditorState`
- `EditorSurface`
- `EditorTransactionEvent`
- `EditorUpdateEvent`
- `EditorView`
- `EntityAddress`
- `ExportDocxParams`
- `ExportFormat`
- `ExportOptions`
- `ExportParams`
- `ExportType`
- `ExtensionCommandMap`
- `ExternalPopoverRenderContext`
- `ExternalSurfaceRenderContext`
- `FieldValue`
- `FindReplaceConfig`
- `FindReplaceContext`
- `FindReplaceHandle`
- `FindReplaceRenderContext`
- `FindReplaceResolution`
- `FlowBlock`
- `FlowMode`
- `FontConfig`
- `FontsResolvedPayload`
- `ImageDeselectedEvent`
- `ImageSelectedEvent`
- `IntentSurfaceRequest`
- `Layout`
- `LayoutEngineOptions`
- `LayoutError`
- `LayoutFragment`
- `LayoutMetrics`
- `LayoutMode`
- `LayoutPage`
- `LayoutState`
- `LayoutUpdatePayload`
- `LinkPopoverContext`
- `LinkPopoverResolution`
- `LinkPopoverResolver`
- `ListDefinitionsPayload`
- `Measure`
- `Modules`
- `NavigableAddress`
- `OpenOptions`
- `PageMargins`
- `PageSize`
- `PageStyles`
- `PaginationPayload`
- `PaintSnapshot`
- `PartChangedEvent`
- `PartId`
- `PartSectionId`
- `PasswordPromptAttemptResult`
- `PasswordPromptConfig`
- `PasswordPromptContext`
- `PasswordPromptHandle`
- `PasswordPromptRenderContext`
- `PasswordPromptResolution`
- `PermissionParams`
- `PositionHit`
- `PresenceOptions`
- `PresentationEditorOptions`
- `ProofingCapabilities`
- `ProofingCheckRequest`
- `ProofingCheckResult`
- `ProofingConfig`
- `ProofingError`
- `ProofingIssue`
- `ProofingIssueKind`
- `ProofingProvider`
- `ProofingSegment`
- `ProofingSegmentMetadata`
- `ProofingStatus`
- `ProseMirrorJSON`
- `ProtectionChangeSource`
- `RangeRect`
- `RemoteCursorState`
- `RemoteCursorsRenderPayload`
- `RemoteUserInfo`
- `ResolveRangeOutput`
- `ResolvedFindReplaceTexts`
- `ResolvedPasswordPromptTexts`
- `SaveOptions`
- `Schema`
- `ScrollIntoViewInput`
- `ScrollIntoViewOutput`
- `SearchMatch`
- `SectionMetadata`
- `SelectionApi`
- `SelectionCommandContext`
- `SelectionCurrentInput`
- `SelectionHandle`
- `SelectionInfo`
- `StoryLocator`
- `SuperDocLayoutEngineOptions`
- `SuperDocTelemetryConfig`
- `SurfaceComponentProps`
- `SurfaceFloatingPlacement`
- `SurfaceHandle`
- `SurfaceMode`
- `SurfaceOutcome`
- `SurfaceRequest`
- `SurfaceResolution`
- `SurfaceResolver`
- `SurfacesModuleConfig`
- `TelemetryEvent`
- `TextAddress`
- `TextSegment`
- `TextTarget`
- `TrackChangesModuleConfig`
- `TrackedChangeAddress`
- `TrackedChangesMode`
- `TrackedChangesOverrides`
- `Transaction`
- `UnsupportedContentItem`
- `UpgradeToCollaborationOptions`
- `User`
- `ViewLayout`
- `ViewOptions`
- `ViewingVisibilityConfig`
- `VirtualizationOptions`

## Evidence table

| Name | dts | dcts | esm | cjs | fixtures | jsdoc | docs | examples | demos | boundaries |
|---|---|---|---|---|---|---|---|---|---|---|
| `AIWriter` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 4 |   |
| `AnnotatorHelpers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
| `AwarenessState` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `BinaryData` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `BlankDOCX` | ✓ | ✓ | ✓ | ✓ | 0 |   | 0 | 0 | 1 |   |
| `BlockNavigationAddress` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `BlocksListResult` | ✓ | ✓ |   |   | 2 | ✓ | 1 | 0 | 1 | ✓ |
| `BookmarkAddress` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 1 |   |
| `BookmarkInfo` | ✓ | ✓ |   |   | 2 | ✓ | 1 | 0 | 1 | ✓ |
| `BoundingRect` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `CanObject` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `ChainableCommandObject` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `ChainedCommand` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `CollaborationConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `CollaborationProvider` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `Command` | ✓ | ✓ |   |   | 3 | ✓ | 78 | 0 | 8 | ✓ |
| `CommandProps` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `Comment` | ✓ | ✓ |   |   | 3 | ✓ | 28 | 3 | 45 |   |
| `CommentAddress` | ✓ | ✓ |   |   | 1 | ✓ | 4 | 0 | 3 |   |
| `CommentConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `CommentElement` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `CommentLocationsPayload` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `CommentsPayload` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `CommentsPluginKey` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 1 | ✓ |
| `CommentsType` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `Config` | ✓ | ✓ |   |   | 5 | ✓ | 2 | 1 | 2 | ✓ |
| `ContextMenu` | ✓ | ✓ | ✓ | ✓ | 1 |   | 7 | 0 | 31 |   |
| `ContextMenuConfig` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `ContextMenuContext` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `ContextMenuItem` | ✓ | ✓ |   |   | 2 | ✓ | 4 | 0 | 5 |   |
| `ContextMenuSection` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `CoreCommandMap` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 | ✓ |
| `DOCX` | ✓ | ✓ | ✓ | ✓ | 2 |   | 133 | 18 | 58 | ✓ |
| `DirectSurfaceRequest` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `DocRange` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `DocumentApi` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 4 | 4 | ✓ |
| `DocumentMode` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 10 | 3 |   |
| `DocumentProtectionState` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 1 |   |
| `DocxFileEntry` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `DocxZipper` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 1 | ✓ |
| `Editor` | ✓ | ✓ | ✓ | ✓ | 4 |   | 194 | 19 | 67 | ✓ |
| `EditorCommands` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `EditorEventMap` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorExtension` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorLifecycleState` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorOptions` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 2 |   |
| `EditorState` | ✓ | ✓ |   |   | 4 | ✓ | 7 | 0 | 1 | ✓ |
| `EditorSurface` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorTransactionEvent` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorUpdateEvent` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `EditorView` | ✓ | ✓ |   |   | 4 | ✓ | 2 | 0 | 0 | ✓ |
| `EntityAddress` | ✓ | ✓ |   |   | 2 | ✓ | 276 | 0 | 8 |   |
| `ExportDocxParams` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `ExportFormat` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `ExportOptions` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ExportParams` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `ExportType` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `ExtensionCommandMap` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 | ✓ |
| `Extensions` | ✓ | ✓ | ✓ | ✓ | 2 |   | 14 | 6 | 3 | ✓ |
| `ExternalPopoverRenderContext` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `ExternalSurfaceRenderContext` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `FieldValue` | ✓ | ✓ |   |   | 1 | ✓ | 7 | 0 | 0 |   |
| `FindReplaceConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `FindReplaceContext` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `FindReplaceHandle` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `FindReplaceRenderContext` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `FindReplaceResolution` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `FlowBlock` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 | ✓ |
| `FlowMode` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `FontConfig` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `FontsResolvedPayload` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `HTML` | ✓ | ✓ | ✓ | ✓ | 2 |   | 85 | 9 | 204 |   |
| `ImageDeselectedEvent` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ImageSelectedEvent` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `IntentSurfaceRequest` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `Layout` | ✓ | ✓ |   |   | 3 | ✓ | 9 | 0 | 22 | ✓ |
| `LayoutEngineOptions` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutError` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutFragment` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutMetrics` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutMode` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutPage` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutState` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LayoutUpdatePayload` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `LinkPopoverContext` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `LinkPopoverResolution` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `LinkPopoverResolver` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `ListDefinitionsPayload` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `Measure` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 1 |   |
| `Modules` | ✓ | ✓ |   |   | 1 | ✓ | 4 | 0 | 0 |   |
| `NavigableAddress` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `OpenOptions` | ✓ | ✓ |   |   | 3 | ✓ | 1 | 0 | 0 |   |
| `PDF` | ✓ | ✓ | ✓ | ✓ | 2 |   | 35 | 0 | 1 | ✓ |
| `PageMargins` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PageSize` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PageStyles` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PaginationPayload` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PaintSnapshot` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PartChangedEvent` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PartId` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PartSectionId` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PasswordPromptAttemptResult` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PasswordPromptConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PasswordPromptContext` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `PasswordPromptHandle` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PasswordPromptRenderContext` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `PasswordPromptResolution` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `PermissionParams` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `PositionHit` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PresenceOptions` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `PresentationEditor` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 40 | ✓ |
| `PresentationEditorOptions` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingCapabilities` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingCheckRequest` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingCheckResult` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingConfig` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingError` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingIssue` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingIssueKind` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingProvider` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingSegment` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProofingSegmentMetadata` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `ProofingStatus` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ProseMirrorJSON` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `ProtectionChangeSource` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `RangeRect` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `RemoteCursorState` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `RemoteCursorsRenderPayload` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `RemoteUserInfo` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `ResolveRangeOutput` | ✓ | ✓ |   |   | 3 | ✓ | 1 | 0 | 1 |   |
| `ResolvedFindReplaceTexts` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `ResolvedPasswordPromptTexts` | ✓ | ✓ |   |   | 1 | ✓ | 1 | 0 | 0 |   |
| `SaveOptions` | ✓ | ✓ |   |   | 4 | ✓ | 1 | 0 | 0 |   |
| `Schema` | ✓ | ✓ |   |   | 4 | ✓ | 5 | 0 | 4 | ✓ |
| `ScrollIntoViewInput` | ✓ | ✓ |   |   | 2 | ✓ | 1 | 0 | 0 |   |
| `ScrollIntoViewOutput` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `SearchMatch` | ✓ | ✓ |   |   | 2 | ✓ | 3 | 0 | 0 |   |
| `SectionHelpers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
| `SectionMetadata` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `SelectionApi` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `SelectionCommandContext` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `SelectionCurrentInput` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `SelectionHandle` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `SelectionInfo` | ✓ | ✓ |   |   | 2 | ✓ | 6 | 0 | 1 |   |
| `SlashMenu` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
| `StoryLocator` | ✓ | ✓ |   |   | 1 | ✓ | 116 | 0 | 3 |   |
| `SuperConverter` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 3 | ✓ |
| `SuperDoc` | ✓ | ✓ | ✓ | ✓ | 7 |   | 1001 | 159 | 243 | ✓ |
| `SuperDocLayoutEngineOptions` | ✓ | ✓ |   |   | 2 | ✓ | 0 | 0 | 0 |   |
| `SuperDocTelemetryConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SuperEditor` | ✓ | ✓ | ✓ | ✓ | 1 |   | 16 | 0 | 5 |   |
| `SuperInput` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 2 |   |
| `SuperToolbar` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 4 | ✓ |
| `SurfaceComponentProps` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceFloatingPlacement` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceHandle` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `SurfaceMode` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceOutcome` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceRequest` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceResolution` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfaceResolver` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `SurfacesModuleConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `TelemetryEvent` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `TextAddress` | ✓ | ✓ |   |   | 2 | ✓ | 404 | 0 | 7 |   |
| `TextSegment` | ✓ | ✓ |   |   | 2 | ✓ | 8 | 0 | 4 |   |
| `TextTarget` | ✓ | ✓ |   |   | 2 | ✓ | 41 | 0 | 8 |   |
| `Toolbar` | ✓ | ✓ | ✓ | ✓ | 1 |   | 35 | 7 | 18 |   |
| `TrackChangesBasePluginKey` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 1 | ✓ |
| `TrackChangesModuleConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `TrackedChangeAddress` | ✓ | ✓ |   |   | 1 | ✓ | 13 | 0 | 3 |   |
| `TrackedChangesMode` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `TrackedChangesOverrides` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `Transaction` | ✓ | ✓ |   |   | 3 | ✓ | 5 | 0 | 0 | ✓ |
| `UnsupportedContentItem` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `UpgradeToCollaborationOptions` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `User` | ✓ | ✓ |   |   | 3 | ✓ | 49 | 6 | 30 |   |
| `ViewLayout` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `ViewOptions` | ✓ | ✓ |   |   | 1 | ✓ | 2 | 0 | 0 |   |
| `ViewingVisibilityConfig` | ✓ | ✓ |   |   | 1 | ✓ | 0 | 0 | 0 |   |
| `VirtualizationOptions` | ✓ | ✓ |   |   | 3 | ✓ | 0 | 0 | 0 |   |
| `assertNodeType` | ✓ | ✓ | ✓ | ✓ | 1 |   | 2 | 0 | 1 | ✓ |
| `buildTheme` | ✓ | ✓ | ✓ | ✓ | 1 |   | 4 | 0 | 1 |   |
| `compareVersions` | ✓ | ✓ | ✓ | ✓ | 0 |   | 0 | 0 | 1 |   |
| `createTheme` | ✓ | ✓ | ✓ | ✓ | 1 |   | 21 | 8 | 1 |   |
| `createZip` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 1 | ✓ |
| `defineMark` | ✓ | ✓ | ✓ | ✓ | 2 |   | 3 | 0 | 1 | ✓ |
| `defineNode` | ✓ | ✓ | ✓ | ✓ | 2 |   | 4 | 0 | 1 | ✓ |
| `fieldAnnotationHelpers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 2 | 0 | 3 |   |
| `getActiveFormatting` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 2 |   |
| `getAllowedImageDimensions` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 1 |   |
| `getFileObject` | ✓ | ✓ | ✓ | ✓ | 0 |   | 0 | 0 | 7 |   |
| `getMarksFromSelection` | ✓ | ✓ | ✓ | ✓ | 2 |   | 0 | 0 | 2 |   |
| `getRichTextExtensions` | ✓ | ✓ | ✓ | ✓ | 2 |   | 1 | 0 | 1 | ✓ |
| `getSchemaIntrospection` | ✓ | ✓ | ✓ | ✓ | 0 |   | 3 | 0 | 1 |   |
| `getStarterExtensions` | ✓ | ✓ | ✓ | ✓ | 2 |   | 8 | 2 | 5 | ✓ |
| `isMarkType` | ✓ | ✓ | ✓ | ✓ | 2 |   | 2 | 0 | 1 | ✓ |
| `isNodeType` | ✓ | ✓ | ✓ | ✓ | 2 |   | 2 | 0 | 1 | ✓ |
| `registeredHandlers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
| `superEditorHelpers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
| `trackChangesHelpers` | ✓ | ✓ | ✓ | ✓ | 1 |   | 0 | 0 | 1 |   |
