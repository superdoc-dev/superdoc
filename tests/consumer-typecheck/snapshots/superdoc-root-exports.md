# superdoc root export inventory (SD-3212 PR A0)

Generated: 2026-08-01T14:49:25.697Z
Source: packed and installed `tests/consumer-typecheck/node_modules/superdoc`

## Counts

| Source | Path | Count |
|---|---|---|
| types.import | `./dist/superdoc/src/public/index.d.ts` | 197 |
| types.require | `./dist/superdoc/src/public/index.d.cts` | 197 |
| import | `./dist/superdoc.es.js` | 10 |
| require | `./dist/superdoc.cjs` | 10 |
| **union** |  | **197** |

## Divergences

- types.import only (not in types.require): 0
- types.require only (not in types.import): 0
- ESM only (not in CJS): 0
- CJS only (not in ESM): 0
- typed but no runtime export (phantom risk): 187
- runtime export but not typed (silent shadow on root): 0

### Type-only names (no runtime)

- `AwarenessState`
- `AwarenessUser`
- `BlockNavigationAddress`
- `BlocksListResult`
- `BookmarkAddress`
- `BookmarkInfo`
- `BorrowedSuperDocUI`
- `CanPerformPermissionParams`
- `CollaborationConfig`
- `CommentAddress`
- `CommentsConfig`
- `CommentsType`
- `Config`
- `ContentControlActiveChangePayload`
- `ContentControlClickPayload`
- `ContentControlsConfig`
- `ContextMenuConfig`
- `ContextMenuContext`
- `ContextMenuItem`
- `ContextMenuSection`
- `ContextMenuSelectContext`
- `ContextMenuSelectPayload`
- `ContextMenuSelectReadiness`
- `DirectSurfaceRequest`
- `DocRange`
- `Document`
- `DocumentApi`
- `DocumentMode`
- `DocumentProtectionState`
- `EditorSurface`
- `EditorTransactionEvent`
- `EditorUpdateEvent`
- `EntityAddress`
- `ExportParams`
- `ExportType`
- `ExternalPopoverRenderContext`
- `ExternalSurfaceRenderContext`
- `FindReplaceConfig`
- `FindReplaceContext`
- `FindReplaceHandle`
- `FindReplaceRenderContext`
- `FindReplaceResolution`
- `FlowBlock`
- `FlowMode`
- `IntentSurfaceRequest`
- `InteractionConfig`
- `Layout`
- `LayoutEngineOptions`
- `LayoutFragment`
- `LayoutMetrics`
- `LayoutMode`
- `LayoutPage`
- `LinkPopoverConfig`
- `LinkPopoverContext`
- `LinkPopoverResolution`
- `LinkPopoverResolver`
- `Modules`
- `NavigableAddress`
- `PasswordPromptAttemptResult`
- `PasswordPromptConfig`
- `PasswordPromptContext`
- `PasswordPromptHandle`
- `PasswordPromptRenderContext`
- `PasswordPromptResolution`
- `PermissionResolverParams`
- `ResolveRangeOutput`
- `ResolvedFindReplaceTexts`
- `ResolvedPasswordPromptTexts`
- `SdtRef`
- `SearchMatch`
- `SelectionHandle`
- `SelectionInfo`
- `StoryLocator`
- `SuperDocActiveEditorExtensions`
- `SuperDocActiveEditorExtensionsCommands`
- `SuperDocActiveEditorExtensionsDiagnostics`
- `SuperDocAnchor`
- `SuperDocAnchorApi`
- `SuperDocAnchorCollection`
- `SuperDocAnchorStatus`
- `SuperDocAnchorTarget`
- `SuperDocAwarenessUpdatePayload`
- `SuperDocCharRange`
- `SuperDocCommandApi`
- `SuperDocCommandExecuteContext`
- `SuperDocCommandState`
- `SuperDocCommandStateContext`
- `SuperDocCommentsUpdatePayload`
- `SuperDocDecoration`
- `SuperDocDecorationApi`
- `SuperDocDecorationContext`
- `SuperDocDecorationData`
- `SuperDocDecorationProvider`
- `SuperDocDisposableBag`
- `SuperDocEditorPayload`
- `SuperDocExceptionEditorPayload`
- `SuperDocExceptionPayload`
- `SuperDocExceptionRestorePayload`
- `SuperDocExceptionStorePayload`
- `SuperDocExceptionToolbarPayload`
- `SuperDocExtension`
- `SuperDocExtensionActivateReturn`
- `SuperDocExtensionCapabilities`
- `SuperDocExtensionCommandHandle`
- `SuperDocExtensionCommandListEntry`
- `SuperDocExtensionCommandRegistration`
- `SuperDocExtensionCommandStateView`
- `SuperDocExtensionContext`
- `SuperDocExtensionDiagnostic`
- `SuperDocExtensionDiagnostics`
- `SuperDocExtensionDisposable`
- `SuperDocExtensionEventApi`
- `SuperDocExtensionPhase`
- `SuperDocExtensionSnapshot`
- `SuperDocExtensionStorage`
- `SuperDocFitWidthOptions`
- `SuperDocFontFace`
- `SuperDocFontFamily`
- `SuperDocFontsApi`
- `SuperDocGuardedDoc`
- `SuperDocGuardedDocQuery`
- `SuperDocGuardedDocSelection`
- `SuperDocLayoutEngineOptions`
- `SuperDocLockedPayload`
- `SuperDocMeasurementUnit`
- `SuperDocMeasurementUnitChangePayload`
- `SuperDocMutationAffect`
- `SuperDocMutationEvent`
- `SuperDocMutationFilter`
- `SuperDocMutationOrigin`
- `SuperDocPaintEvent`
- `SuperDocReadyPayload`
- `SuperDocReceiptSuccess`
- `SuperDocSaveEvent`
- `SuperDocSelectionEvent`
- `SuperDocSelectionPoint`
- `SuperDocSelectionTarget`
- `SuperDocState`
- `SuperDocStoryLocator`
- `SuperDocTelemetryConfig`
- `SuperDocTextAddress`
- `SuperDocTextTarget`
- `SuperDocUI`
- `SuperDocViewportChangePayload`
- `SuperDocViewportMetrics`
- `SuperDocVisibleRange`
- `SuperDocVisualApi`
- `SuperDocVisualHandle`
- `SuperDocVisualOptions`
- `SuperDocVisualTarget`
- `SuperDocZoomConfig`
- `SuperDocZoomMode`
- `SuperDocZoomPayload`
- `SuperDocZoomState`
- `SurfaceComponentProps`
- `SurfaceFloatingPlacement`
- `SurfaceHandle`
- `SurfaceMode`
- `SurfaceOutcome`
- `SurfaceRequest`
- `SurfaceResolution`
- `SurfaceResolver`
- `SurfacesConfig`
- `SurfacesModuleConfig`
- `TextAddress`
- `TextSegment`
- `TextTarget`
- `ToolbarCustomButton`
- `ToolbarCustomButtonContext`
- `ToolbarCustomButtonItem`
- `ToolbarCustomDropdownItem`
- `ToolbarCustomDropdownOption`
- `ToolbarCustomSeparatorItem`
- `TrackChangeAuthor`
- `TrackChangeHighlightColors`
- `TrackChangesAuthorColorsConfig`
- `TrackChangesModuleConfig`
- `TrackChangesSemanticColorsConfig`
- `TrackedChangeAddress`
- `TrackedChangeSemanticColorKey`
- `TrackedChangeSemanticColorResolverInput`
- `UIConfig`
- `UpgradeToCollaborationOptions`
- `User`
- `V2CollaborationConfig`
- `ViewOptions`
- `ViewingVisibilityConfig`

## Evidence table

| Name | dts | dcts | esm | cjs | fixtures | jsdoc | docs | examples | demos |
|---|---|---|---|---|---|---|---|---|---|
| `AwarenessState` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `AwarenessUser` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `BlankDOCX` | ✓ | ✓ | ✓ | ✓ | 1 |   | 1 | 0 | 0 |
| `BlockNavigationAddress` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `BlocksListResult` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `BookmarkAddress` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `BookmarkInfo` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `BorrowedSuperDocUI` | ✓ | ✓ |   |   | 1 |   | 3 | 0 | 0 |
| `CanPerformPermissionParams` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `CollaborationConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `CommentAddress` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `CommentsConfig` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `CommentsType` | ✓ | ✓ |   |   | 1 |   | 0 | 2 | 0 |
| `Config` | ✓ | ✓ |   |   | 11 |   | 5 | 0 | 2 |
| `ContentControlActiveChangePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContentControlClickPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContentControlsConfig` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `ContextMenuConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContextMenuContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContextMenuItem` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 3 |
| `ContextMenuSection` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContextMenuSelectContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContextMenuSelectPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ContextMenuSelectReadiness` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `DOCX` | ✓ | ✓ | ✓ | ✓ | 1 |   | 257 | 25 | 6 |
| `DirectSurfaceRequest` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `DocRange` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `Document` | ✓ | ✓ |   |   | 2 |   | 112 | 54 | 57 |
| `DocumentApi` | ✓ | ✓ |   |   | 1 |   | 1 | 10 | 3 |
| `DocumentMode` | ✓ | ✓ |   |   | 2 |   | 1 | 20 | 4 |
| `DocumentProtectionState` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `EditorSurface` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `EditorTransactionEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `EditorUpdateEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `EntityAddress` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ExportParams` | ✓ | ✓ |   |   | 4 |   | 0 | 0 | 0 |
| `ExportType` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ExternalPopoverRenderContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ExternalSurfaceRenderContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FindReplaceConfig` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `FindReplaceContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FindReplaceHandle` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FindReplaceRenderContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FindReplaceResolution` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FlowBlock` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `FlowMode` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `HTML` | ✓ | ✓ | ✓ | ✓ | 1 |   | 10 | 10 | 12 |
| `IntentSurfaceRequest` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `InteractionConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `Layout` | ✓ | ✓ |   |   | 1 |   | 2 | 0 | 0 |
| `LayoutEngineOptions` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LayoutFragment` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LayoutMetrics` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LayoutMode` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LayoutPage` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LinkPopoverConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LinkPopoverContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LinkPopoverResolution` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `LinkPopoverResolver` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `Modules` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `NavigableAddress` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `PDF` | ✓ | ✓ | ✓ | ✓ | 1 |   | 1 | 0 | 0 |
| `PasswordPromptAttemptResult` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PasswordPromptConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PasswordPromptContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PasswordPromptHandle` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PasswordPromptRenderContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PasswordPromptResolution` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `PermissionResolverParams` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `ResolveRangeOutput` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ResolvedFindReplaceTexts` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ResolvedPasswordPromptTexts` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SdtRef` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SearchMatch` | ✓ | ✓ |   |   | 3 |   | 0 | 0 | 0 |
| `SelectionHandle` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SelectionInfo` | ✓ | ✓ |   |   | 1 |   | 1 | 0 | 3 |
| `StoryLocator` | ✓ | ✓ |   |   | 1 |   | 2 | 0 | 6 |
| `SuperDoc` | ✓ | ✓ | ✓ | ✓ | 18 |   | 227 | 173 | 101 |
| `SuperDocActiveEditorExtensions` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocActiveEditorExtensionsCommands` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocActiveEditorExtensionsDiagnostics` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAnchor` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAnchorApi` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAnchorCollection` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAnchorStatus` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAnchorTarget` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocAwarenessUpdatePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCharRange` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCommandApi` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCommandExecuteContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCommandState` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCommandStateContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocCommentsUpdatePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDecoration` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDecorationApi` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDecorationContext` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDecorationData` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDecorationProvider` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocDisposableBag` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocEditorPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExceptionEditorPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExceptionPayload` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocExceptionRestorePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExceptionStorePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExceptionToolbarPayload` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocExtension` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocExtensionActivateReturn` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionCapabilities` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionCommandHandle` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionCommandListEntry` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionCommandRegistration` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionCommandStateView` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionContext` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocExtensionDiagnostic` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionDiagnostics` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionDisposable` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionEventApi` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionPhase` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionSnapshot` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocExtensionStorage` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocFitWidthOptions` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocFontFace` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocFontFamily` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocFontsApi` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocGuardedDoc` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocGuardedDocQuery` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocGuardedDocSelection` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocLayoutEngineOptions` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocLockedPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocMeasurementUnit` | ✓ | ✓ |   |   | 3 |   | 0 | 0 | 0 |
| `SuperDocMeasurementUnitChangePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocMutationAffect` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocMutationEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocMutationFilter` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocMutationOrigin` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocPaintEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocReadyPayload` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocReceiptSuccess` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocSaveEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocSelectionEvent` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocSelectionPoint` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocSelectionTarget` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocState` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocStoryLocator` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocTelemetryConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocTextAddress` | ✓ | ✓ |   |   | 1 |   | 1 | 0 | 0 |
| `SuperDocTextTarget` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocUI` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 6 |
| `SuperDocViewportChangePayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocViewportMetrics` | ✓ | ✓ |   |   | 3 |   | 0 | 0 | 0 |
| `SuperDocVisibleRange` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocVisualApi` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocVisualHandle` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocVisualOptions` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocVisualTarget` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SuperDocZoomConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocZoomMode` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocZoomPayload` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SuperDocZoomState` | ✓ | ✓ |   |   | 3 |   | 0 | 0 | 0 |
| `SurfaceComponentProps` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SurfaceFloatingPlacement` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SurfaceHandle` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SurfaceMode` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SurfaceOutcome` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SurfaceRequest` | ✓ | ✓ |   |   | 3 |   | 0 | 0 | 0 |
| `SurfaceResolution` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SurfaceResolver` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `SurfacesConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `SurfacesModuleConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TextAddress` | ✓ | ✓ |   |   | 1 |   | 2 | 0 | 0 |
| `TextSegment` | ✓ | ✓ |   |   | 1 |   | 1 | 0 | 0 |
| `TextTarget` | ✓ | ✓ |   |   | 1 |   | 3 | 0 | 2 |
| `ToolbarCustomButton` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ToolbarCustomButtonContext` | ✓ | ✓ |   |   | 0 |   | 0 | 0 | 0 |
| `ToolbarCustomButtonItem` | ✓ | ✓ |   |   | 0 |   | 0 | 0 | 0 |
| `ToolbarCustomDropdownItem` | ✓ | ✓ |   |   | 0 |   | 0 | 0 | 0 |
| `ToolbarCustomDropdownOption` | ✓ | ✓ |   |   | 0 |   | 0 | 0 | 0 |
| `ToolbarCustomSeparatorItem` | ✓ | ✓ |   |   | 0 |   | 0 | 0 | 0 |
| `TrackChangeAuthor` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackChangeHighlightColors` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackChangesAuthorColorsConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackChangesModuleConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackChangesSemanticColorsConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackedChangeAddress` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackedChangeSemanticColorKey` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `TrackedChangeSemanticColorResolverInput` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `UIConfig` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `UpgradeToCollaborationOptions` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `User` | ✓ | ✓ |   |   | 1 |   | 2 | 7 | 29 |
| `V2CollaborationConfig` | ✓ | ✓ |   |   | 1 |   | 2 | 0 | 0 |
| `ViewOptions` | ✓ | ✓ |   |   | 1 |   | 0 | 0 | 0 |
| `ViewingVisibilityConfig` | ✓ | ✓ |   |   | 2 |   | 0 | 0 | 0 |
| `buildTheme` | ✓ | ✓ | ✓ | ✓ | 1 |   | 3 | 0 | 0 |
| `compareVersions` | ✓ | ✓ | ✓ | ✓ | 1 |   | 1 | 0 | 0 |
| `createTheme` | ✓ | ✓ | ✓ | ✓ | 1 |   | 2 | 6 | 0 |
| `defineSuperDocExtension` | ✓ | ✓ | ✓ | ✓ | 1 |   | 5 | 3 | 0 |
| `getFileObject` | ✓ | ✓ | ✓ | ✓ | 1 |   | 1 | 0 | 0 |
