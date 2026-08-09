# SD-3212 A1 — root classification

Generated: derived from superdoc-root-classification.json (aligned with current root export inventory)
Input: tests/consumer-typecheck/snapshots/superdoc-root-exports.json (176 names)

## Summary

| Bucket | Count |
|---|---|
| supported-root | 170 |
| legacy-root | 6 |
| move-to-subpath | 0 |
| internal-candidate | 0 |
| NEEDS-REVIEW | 0 |
| **total** | **176** |

Confidence: high=124, medium=52, low=0, needs-review=0.

## supported-root (170)

| Name | Confidence | Source | Rationale |
|---|---|---|---|
| `AwarenessState` | medium | collab | Collaboration/awareness type defined in core/types/index.ts. Customer-facing for collab-provider integrations (e.g., AwarenessState types the documented onAwarenessUpdate callback). |
| `AwarenessUser` | medium | collab | Collaboration/awareness type defined in core/types/index.ts. Extends User with an optional `color` field for consumer-supplied awareness color; typed on Config.user so the runtime override in SuperDoc#assignUserColor() is consumer-typable. |
| `BlockNavigationAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `BlocksListResult` | high | doc-api | Document API result type returned by activeEditor.doc.blocks.list(); useful for consumers typing block-listing workflows from the root package. |
| `BookmarkAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `BookmarkInfo` | high | doc-api | Document API result type returned by activeEditor.doc.bookmarks.get(); useful for consumers typing bookmark workflows from the root package. |
| `CanPerformPermissionParams` | high | config-supported | Configuration type for a supported feature. Input shape for SuperDoc#canPerformPermission, promoted from an anonymous inline parameter to a named public type so consumers get IDE help and the contract is stable across migrations. |
| `CollaborationConfig` | medium | config-supported | Configuration type for a supported feature. |
| `CommentAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `CommentsType` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `Config` | medium | config-supported | Configuration type for a supported feature. |
| `ContentControlActiveChangePayload` | high | config-supported | Payload for Config.onContentControlActiveChange. Customer-facing content-control callback type exported from src/public/index.ts. |
| `ContentControlClickPayload` | high | config-supported | Payload for Config.onContentControlClick. Customer-facing content-control callback type exported from src/public/index.ts. |
| `DOCX` | high | locked | Content-format constant. Heavily documented (133 doc mentions). Customer-facing. |
| `DirectSurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `DocRange` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `Document` | high | core | Customer-facing core API type or runtime export. Consumer-supplied document descriptor used in Config.documents and now SuperDocState.documents; the public counterpart to the internal RuntimeDocument (which carries runtime-only fields and stays internal). |
| `DocumentApi` | high | doc-api | Customer-facing Document API handle type exposed through activeEditor.doc and used by public examples that type programmatic document operations from the root package. |
| `DocumentMode` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `DocumentProtectionState` | high | doc-api | Document API result type returned by activeEditor.doc.protection.get(); useful for consumers typing document-protection workflows from the root package. |
| `EditorSurface` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `EditorTransactionEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `EditorUpdateEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `EntityAddress` | high | doc-api | Document API entity navigation/address type for comments and tracked changes; used by receipts, navigation, and superdoc/ui viewport surfaces. |
| `ExportParams` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExportType` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExternalPopoverRenderContext` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `ExternalSurfaceRenderContext` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `FindReplaceContext` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceHandle` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceRenderContext` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceResolution` | medium | find-replace | FindReplace surface API type. Public. |
| `FlowBlock` | high | layout-engine | Current shared layout-engine input contract exported from @superdoc/contracts and consumed by the v2 layout adapter, v2 host, layout bridge, and layout-engine tests. Useful for consumers typing custom layout projections and layout-engine integrations. |
| `FlowMode` | high | layout-engine | Current layout flow-mode union exported from @superdoc/contracts and used by Config.layoutEngineOptions.flowMode and the v2 layout runtime to select paginated versus semantic flow. |
| `HTML` | high | locked | Content-format constant. Heavily used (85 docs, 204 demos). Customer-facing. |
| `IntentSurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `Layout` | high | layout-engine | Current shared layout output contract exported from @superdoc/contracts and consumed by the v2 render surface, layout bridge, painter, and layout-engine tests. Useful for consumers typing layout inspection and render integrations. |
| `LayoutEngineOptions` | high | layout-engine | Backwards-compatible public type alias to the current v2 SuperDocLayoutEngineOptions contract for Config.layoutEngineOptions. This preserves the useful customer-facing name without restoring the old PresentationEditor implementation. |
| `LayoutFragment` | high | layout-engine | Public alias of the current @superdoc/contracts Fragment layout contract. v2 layout and hit-testing code use this fragment shape for page render geometry and text mapping. |
| `InteractionConfig` | high | config | Interaction policy type split out of modules. Customer-facing. |
| `LayoutMetrics` | high | layout-bridge | Current layout-bridge instrumentation metrics contract with timing fields for measurement, pagination, token resolution, and header/footer layout. Useful for consumers typing layout performance diagnostics. |
| `LayoutMode` | high | layout-painter | Current @superdoc/painter-dom layout display mode union (vertical, horizontal, book). This remains part of the page rendering/display layer used by v2. |
| `LayoutPage` | high | layout-engine | Public alias of the current @superdoc/contracts Page layout contract. v2 layout output and render surfaces use this page shape for pagination, geometry, and hit-testing workflows. |
| `LinkPopoverContext` | high | link-popover | Custom link popover resolver context type. Public extension surface for modules.links.popoverResolver integrations. |
| `LinkPopoverResolution` | high | link-popover | Custom link popover resolver return type. Public extension surface for modules.links.popoverResolver integrations. |
| `LinkPopoverResolver` | high | link-popover | Custom link popover resolver callback type. Public extension surface for modules.links.popoverResolver integrations. |
| `Modules` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `NavigableAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `PDF` | high | locked | Content-format constant. Customer-facing import/export selector. |
| `PasswordPromptAttemptResult` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptConfig` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptContext` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptHandle` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptRenderContext` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptResolution` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PermissionResolverParams` | high | config-supported | Payload passed to permission resolver callbacks registered via Config.permissionResolver or Modules.comments.permissionResolver; promoted from a non-exported helper to a named public type so resolver authors can import the contract. |
| `ResolveRangeOutput` | high | doc-api | Document API ranges.resolve result type implemented by the v2 range resolver adapter; useful for consumers typing range handles, targets, and preview metadata from the root package. |
| `ResolvedFindReplaceTexts` | medium | find-replace | FindReplace surface API type. Public. |
| `ResolvedPasswordPromptTexts` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `SdtRef` | high | config-supported | Structured document tag reference used by public content-control callback payloads. |
| `SearchMatch` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `SelectionHandle` | high | ui-controller | v2-native superdoc/ui selection handle type with current/capture/restore/anchor-rect methods; the supported migration path for deferred selection UI flows. |
| `SelectionInfo` | high | doc-api | Document API selection result returned by doc.selection.current(); v2 host and adapter expose the shape for selection-aware custom UI, comments, and extension workflows. |
| `StoryLocator` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `SuperDoc` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `SuperDocActiveEditorExtensions` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocActiveEditorExtensionsCommands` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocActiveEditorExtensionsDiagnostics` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAnchor` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAnchorApi` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAnchorCollection` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAnchorStatus` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAnchorTarget` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocAwarenessUpdatePayload` | high | core | Payload emitted with the awareness-update event and passed to Config.onAwarenessUpdate; promoted to a named public type so callback signatures stop using inline shapes. |
| `SuperDocCharRange` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocCommandApi` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocCommandExecuteContext` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocCommandState` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocCommandStateContext` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocCommentsUpdatePayload` | high | core | Payload emitted with the comments-update event and passed to Config.onCommentsUpdate; promoted to a named public type so callback signatures stop using inline shapes. |
| `SuperDocDecoration` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocDecorationApi` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocDecorationContext` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocDecorationData` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocDecorationProvider` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocDisposableBag` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocEditorPayload` | high | core | Wrapper payload emitted with editorBeforeCreate / editorCreate / collaboration-ready events; promoted to a named public type so callback signatures match the runtime wrapper instead of a bare Editor. |
| `SuperDocExceptionEditorPayload` | high | locked | Member of the SuperDocExceptionPayload union; named so consumers can discriminate the editor-lifecycle shape. SD-673 Phase 4D. |
| `SuperDocExceptionPayload` | high | locked | Public Config.onException callback parameter. Union of the three runtime emit shapes. SD-673 Phase 4D. |
| `SuperDocExceptionRestorePayload` | high | locked | Member of the SuperDocExceptionPayload union; named so consumers can discriminate the restore-failure shape. SD-673 Phase 4D. |
| `SuperDocExceptionStorePayload` | high | locked | Member of the SuperDocExceptionPayload union; named so consumers can discriminate the store-init shape via `'stage' in payload`. SD-673 Phase 4D. |
| `SuperDocExtension` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionActivateReturn` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionCapabilities` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionCommandHandle` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionCommandListEntry` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionCommandRegistration` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionCommandStateView` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionContext` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionDiagnostic` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionDiagnostics` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionDisposable` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionEventApi` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionPhase` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionSnapshot` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocExtensionStorage` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocFitWidthOptions` | high | core | Bounds and padding for the fit-width zoom policy (Config.zoom.fitWidth); named so consumers can type fit policies outside the inline config literal. |
| `SuperDocFontFace` | high | locked | Public font-face shape for superdoc.fonts.add (URL source + optional weight/style). |
| `SuperDocFontFamily` | high | locked | Public font-family shape for superdoc.fonts.add (family name + faces). |
| `SuperDocFontsApi` | high | locked | Return type of the public superdoc.fonts read + write surface (getReport/getMissingFonts/getDocumentFonts/onReport + map/unmap/add/preload). |
| `SuperDocGuardedDoc` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocGuardedDocQuery` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocGuardedDocSelection` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocLayoutEngineOptions` | high | locked | Types Config.layoutEngineOptions at core/types/index.ts:1350,1505. Documented Config field. |
| `SuperDocLockedPayload` | high | core | Payload emitted with the locked event and passed to Config.onLocked; promoted to a named public type so the lockedBy: User | null contract is consumer-typable. |
| `SuperDocMutationAffect` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocMutationEvent` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocMutationFilter` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocMutationOrigin` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocPaintEvent` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocReadyPayload` | high | core | Payload emitted with the ready event and passed to Config.onReady; promoted to a named public type for consistency with the other event payloads. |
| `SuperDocReceiptSuccess` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocSaveEvent` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocSelectionEvent` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocSelectionPoint` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocSelectionTarget` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SurfacesConfig` | high | config | Surface infrastructure type split out of modules. Customer-facing. |
| `SuperDocState` | high | core | Public return shape of the SuperDoc#state getter; introduced to replace an inline anonymous return that leaked the internal RuntimeDocument type. Exposes `documents` as Document[] (the public view). |
| `SuperDocStoryLocator` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocTelemetryConfig` | high | locked | Backs Config.telemetry (enabled/endpoint/metadata/licenseKey). |
| `SuperDocTextAddress` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocTextTarget` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocViewportChangePayload` | high | core | Payload emitted with the viewport-change event and passed to Config.onViewportChange; named so custom fit-to-width consumers can type handlers. |
| `SuperDocViewportMetrics` | high | core | Return type of getViewportMetrics(); alias of the viewport-change payload so reads and events share one shape. |
| `SuperDocVisualApi` | high | extensions | Easy visual authoring layer exposed as ctx.visuals on the v2 extension context (highlight/decorate). Public extension-authoring type defined in core/extensions/types.ts. |
| `SuperDocVisualHandle` | high | extensions | Handle returned by ctx.visuals.highlight/decorate (replace/add/clear/invalidate/dispose). Public extension-authoring type defined in core/extensions/types.ts. |
| `SuperDocVisualOptions` | high | extensions | Options for ctx.visuals.highlight/decorate (className/data/scope). Public extension-authoring type defined in core/extensions/types.ts. |
| `SuperDocVisualTarget` | high | extensions | Target accepted by SuperDocVisualHandle.replace/add (anchor, Document API target, or per-target override). Public extension-authoring type defined in core/extensions/types.ts. |
| `SuperDocVisibleRange` | high | core | v2 SuperDoc extension authoring API (defineSuperDocExtension contract). Customer-facing public type exported from src/public/index.ts; reachable through Config.extensions and the activeEditor.extensions facet. |
| `SuperDocZoomConfig` | high | core | Config.zoom domain object (initial + fitToContainer); named so consumers can build zoom configuration values with a public type. |
| `SuperDocZoomMode` | high | core | Closed zoom mode union (manual | fit-width) used by Config.zoom.mode, setZoomMode, and the zoomChange payload. |
| `SuperDocZoomPayload` | high | core | Payload emitted with the zoomChange event and passed to Config.onZoomChange; promoted from an internal interface when the config callback made it consumer-facing. |
| `SuperDocZoomState` | high | core | Return type of getZoomState(); snapshot of mode, value, fit zoom, and effective bounds for zoom UI. |
| `SurfaceComponentProps` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceFloatingPlacement` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceHandle` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceMode` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceOutcome` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceResolution` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceResolver` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfacesModuleConfig` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `TextAddress` | high | doc-api | Document API text target accepted by v2 comments, formatting, insertion, and replace-style operations; resolved and validated by the v2 Document API adapter. |
| `TextSegment` | high | doc-api | Document API text-range segment used inside TextTarget.segments; needed for consumers typing multi-segment text targets from the root package. |
| `TextTarget` | high | doc-api | Document API range target used by v2 comments, tracked-change decisions, fields, and selection flows; resolved by the v2 Document API adapter. |
| `TrackChangeAuthor` | high | locked | Structured author identity passed to modules.trackChanges.authorColors.resolve. |
| `TrackChangesAuthorColorsConfig` | high | locked | Module config for per-author tracked-change colors (modules.trackChanges.authorColors). Documented at the module-config layer. |
| `TrackChangesModuleConfig` | high | locked | Module config for track-changes (modules.trackChanges). Documented at the module-config layer. |
| `TrackChangesSemanticColorsConfig` | high | locked | Module config for semantic tracked-change colors (modules.trackChanges.semanticColors). Documented at the module-config layer. |
| `TrackedChangeAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `TrackedChangeSemanticColorKey` | high | locked | Semantic key union used by modules.trackChanges.semanticColors overrides and resolver input. Named so consumers can type supported tracked-change color keys. |
| `TrackedChangeSemanticColorResolverInput` | high | locked | Resolver input passed to modules.trackChanges.semanticColors.resolve. Named so consumers can type semantic color resolver callbacks. |
| `UIConfig` | high | config | Built-in UI configuration type for Config.ui. Names which built-in surfaces SuperDoc renders. |
| `UpgradeToCollaborationOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `User` | high | config-supported | Customer-facing user identity type used by v2 config, collaboration/awareness, shared-user management, and locking methods. |
| `V2CollaborationConfig` | medium | config-supported | Configuration type for SuperDoc v2's document-level single-doc y-websocket collaboration handoff. |
| `ViewOptions` | high | config-supported | Customer-facing view configuration type; Config.viewOptions.layout drives v2 print/web layout behavior. |
| `ViewingVisibilityConfig` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `buildTheme` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `compareVersions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `createTheme` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `defineSuperDocExtension` | high | core | v2 SuperDoc extension factory/validation helper. Documented runtime export used to author extensions passed to Config.extensions. |
| `getFileObject` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |

## legacy-root (6)

| Name | Confidence | Source | Rationale |
|---|---|---|---|
| `BlankDOCX` | high | locked | Runtime-exported empty-DOCX builder. Used internally and possibly in demos; not a supported public concept. |
| `ContextMenuConfig` | medium | config-legacy | Configuration type for a feature with legacy surface (paired with a legacy component or older API). |
| `ContextMenuContext` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `ContextMenuItem` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `ContextMenuSection` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `FindReplaceConfig` | medium | config-legacy | Configuration type for a feature with legacy surface (paired with a legacy component or older API). |

## Presence matrix

| Name | dts | dcts | esm | cjs |
|---|---|---|---|---|
| `AwarenessState` | ✓ | ✓ |   |   |
| `AwarenessUser` | ✓ | ✓ |   |   |
| `BlankDOCX` | ✓ | ✓ | ✓ | ✓ |
| `BlockNavigationAddress` | ✓ | ✓ |   |   |
| `BlocksListResult` | ✓ | ✓ |   |   |
| `BookmarkAddress` | ✓ | ✓ |   |   |
| `BookmarkInfo` | ✓ | ✓ |   |   |
| `CanPerformPermissionParams` | ✓ | ✓ |   |   |
| `CollaborationConfig` | ✓ | ✓ |   |   |
| `CommentAddress` | ✓ | ✓ |   |   |
| `CommentsType` | ✓ | ✓ |   |   |
| `Config` | ✓ | ✓ |   |   |
| `ContentControlActiveChangePayload` | ✓ | ✓ |   |   |
| `ContentControlClickPayload` | ✓ | ✓ |   |   |
| `ContextMenuConfig` | ✓ | ✓ |   |   |
| `ContextMenuContext` | ✓ | ✓ |   |   |
| `ContextMenuItem` | ✓ | ✓ |   |   |
| `ContextMenuSection` | ✓ | ✓ |   |   |
| `DOCX` | ✓ | ✓ | ✓ | ✓ |
| `DirectSurfaceRequest` | ✓ | ✓ |   |   |
| `DocRange` | ✓ | ✓ |   |   |
| `Document` | ✓ | ✓ |   |   |
| `DocumentApi` | ✓ | ✓ |   |   |
| `DocumentMode` | ✓ | ✓ |   |   |
| `DocumentProtectionState` | ✓ | ✓ |   |   |
| `EditorSurface` | ✓ | ✓ |   |   |
| `EditorTransactionEvent` | ✓ | ✓ |   |   |
| `EditorUpdateEvent` | ✓ | ✓ |   |   |
| `EntityAddress` | ✓ | ✓ |   |   |
| `ExportParams` | ✓ | ✓ |   |   |
| `ExportType` | ✓ | ✓ |   |   |
| `ExternalPopoverRenderContext` | ✓ | ✓ |   |   |
| `ExternalSurfaceRenderContext` | ✓ | ✓ |   |   |
| `FindReplaceConfig` | ✓ | ✓ |   |   |
| `FindReplaceContext` | ✓ | ✓ |   |   |
| `FindReplaceHandle` | ✓ | ✓ |   |   |
| `FindReplaceRenderContext` | ✓ | ✓ |   |   |
| `FindReplaceResolution` | ✓ | ✓ |   |   |
| `FlowBlock` | ✓ | ✓ |   |   |
| `FlowMode` | ✓ | ✓ |   |   |
| `HTML` | ✓ | ✓ | ✓ | ✓ |
| `IntentSurfaceRequest` | ✓ | ✓ |   |   |
| `Layout` | ✓ | ✓ |   |   |
| `LayoutEngineOptions` | ✓ | ✓ |   |   |
| `LayoutFragment` | ✓ | ✓ |   |   |
| `LayoutMetrics` | ✓ | ✓ |   |   |
| `LayoutMode` | ✓ | ✓ |   |   |
| `LayoutPage` | ✓ | ✓ |   |   |
| `LinkPopoverContext` | ✓ | ✓ |   |   |
| `LinkPopoverResolution` | ✓ | ✓ |   |   |
| `LinkPopoverResolver` | ✓ | ✓ |   |   |
| `Modules` | ✓ | ✓ |   |   |
| `NavigableAddress` | ✓ | ✓ |   |   |
| `PDF` | ✓ | ✓ | ✓ | ✓ |
| `PasswordPromptAttemptResult` | ✓ | ✓ |   |   |
| `PasswordPromptConfig` | ✓ | ✓ |   |   |
| `PasswordPromptContext` | ✓ | ✓ |   |   |
| `PasswordPromptHandle` | ✓ | ✓ |   |   |
| `PasswordPromptRenderContext` | ✓ | ✓ |   |   |
| `PasswordPromptResolution` | ✓ | ✓ |   |   |
| `PermissionResolverParams` | ✓ | ✓ |   |   |
| `ResolveRangeOutput` | ✓ | ✓ |   |   |
| `ResolvedFindReplaceTexts` | ✓ | ✓ |   |   |
| `ResolvedPasswordPromptTexts` | ✓ | ✓ |   |   |
| `SdtRef` | ✓ | ✓ |   |   |
| `SearchMatch` | ✓ | ✓ |   |   |
| `SelectionHandle` | ✓ | ✓ |   |   |
| `SelectionInfo` | ✓ | ✓ |   |   |
| `StoryLocator` | ✓ | ✓ |   |   |
| `SuperDoc` | ✓ | ✓ | ✓ | ✓ |
| `SuperDocActiveEditorExtensions` | ✓ | ✓ |   |   |
| `SuperDocActiveEditorExtensionsCommands` | ✓ | ✓ |   |   |
| `SuperDocActiveEditorExtensionsDiagnostics` | ✓ | ✓ |   |   |
| `SuperDocAnchor` | ✓ | ✓ |   |   |
| `SuperDocAnchorApi` | ✓ | ✓ |   |   |
| `SuperDocAnchorCollection` | ✓ | ✓ |   |   |
| `SuperDocAnchorStatus` | ✓ | ✓ |   |   |
| `SuperDocAnchorTarget` | ✓ | ✓ |   |   |
| `SuperDocAwarenessUpdatePayload` | ✓ | ✓ |   |   |
| `SuperDocCharRange` | ✓ | ✓ |   |   |
| `SuperDocCommandApi` | ✓ | ✓ |   |   |
| `SuperDocCommandExecuteContext` | ✓ | ✓ |   |   |
| `SuperDocCommandState` | ✓ | ✓ |   |   |
| `SuperDocCommandStateContext` | ✓ | ✓ |   |   |
| `SuperDocCommentsUpdatePayload` | ✓ | ✓ |   |   |
| `SuperDocDecoration` | ✓ | ✓ |   |   |
| `SuperDocDecorationApi` | ✓ | ✓ |   |   |
| `SuperDocDecorationContext` | ✓ | ✓ |   |   |
| `SuperDocDecorationData` | ✓ | ✓ |   |   |
| `SuperDocDecorationProvider` | ✓ | ✓ |   |   |
| `SuperDocDisposableBag` | ✓ | ✓ |   |   |
| `SuperDocEditorPayload` | ✓ | ✓ |   |   |
| `SuperDocExceptionEditorPayload` | ✓ | ✓ |   |   |
| `SuperDocExceptionPayload` | ✓ | ✓ |   |   |
| `SuperDocExceptionRestorePayload` | ✓ | ✓ |   |   |
| `SuperDocExceptionStorePayload` | ✓ | ✓ |   |   |
| `SuperDocExtension` | ✓ | ✓ |   |   |
| `SuperDocExtensionActivateReturn` | ✓ | ✓ |   |   |
| `SuperDocExtensionCapabilities` | ✓ | ✓ |   |   |
| `SuperDocExtensionCommandHandle` | ✓ | ✓ |   |   |
| `SuperDocExtensionCommandListEntry` | ✓ | ✓ |   |   |
| `SuperDocExtensionCommandRegistration` | ✓ | ✓ |   |   |
| `SuperDocExtensionCommandStateView` | ✓ | ✓ |   |   |
| `SuperDocExtensionContext` | ✓ | ✓ |   |   |
| `SuperDocExtensionDiagnostic` | ✓ | ✓ |   |   |
| `SuperDocExtensionDiagnostics` | ✓ | ✓ |   |   |
| `SuperDocExtensionDisposable` | ✓ | ✓ |   |   |
| `SuperDocExtensionEventApi` | ✓ | ✓ |   |   |
| `SuperDocExtensionPhase` | ✓ | ✓ |   |   |
| `SuperDocExtensionSnapshot` | ✓ | ✓ |   |   |
| `SuperDocExtensionStorage` | ✓ | ✓ |   |   |
| `SuperDocFitWidthOptions` | ✓ | ✓ |   |   |
| `SuperDocFontFace` | ✓ | ✓ |   |   |
| `SuperDocFontFamily` | ✓ | ✓ |   |   |
| `SuperDocFontsApi` | ✓ | ✓ |   |   |
| `SuperDocGuardedDoc` | ✓ | ✓ |   |   |
| `SuperDocGuardedDocQuery` | ✓ | ✓ |   |   |
| `SuperDocGuardedDocSelection` | ✓ | ✓ |   |   |
| `SuperDocLayoutEngineOptions` | ✓ | ✓ |   |   |
| `SuperDocLockedPayload` | ✓ | ✓ |   |   |
| `SuperDocMutationAffect` | ✓ | ✓ |   |   |
| `SuperDocMutationEvent` | ✓ | ✓ |   |   |
| `SuperDocMutationFilter` | ✓ | ✓ |   |   |
| `SuperDocMutationOrigin` | ✓ | ✓ |   |   |
| `SuperDocPaintEvent` | ✓ | ✓ |   |   |
| `SuperDocReadyPayload` | ✓ | ✓ |   |   |
| `SuperDocReceiptSuccess` | ✓ | ✓ |   |   |
| `SuperDocSaveEvent` | ✓ | ✓ |   |   |
| `SuperDocSelectionEvent` | ✓ | ✓ |   |   |
| `SuperDocSelectionPoint` | ✓ | ✓ |   |   |
| `SuperDocSelectionTarget` | ✓ | ✓ |   |   |
| `SuperDocState` | ✓ | ✓ |   |   |
| `SuperDocStoryLocator` | ✓ | ✓ |   |   |
| `SuperDocTelemetryConfig` | ✓ | ✓ |   |   |
| `SuperDocTextAddress` | ✓ | ✓ |   |   |
| `SuperDocTextTarget` | ✓ | ✓ |   |   |
| `SuperDocViewportChangePayload` | ✓ | ✓ |   |   |
| `SuperDocViewportMetrics` | ✓ | ✓ |   |   |
| `SuperDocVisualApi` | ✓ | ✓ |   |   |
| `SuperDocVisualHandle` | ✓ | ✓ |   |   |
| `SuperDocVisualOptions` | ✓ | ✓ |   |   |
| `SuperDocVisualTarget` | ✓ | ✓ |   |   |
| `SuperDocVisibleRange` | ✓ | ✓ |   |   |
| `SuperDocZoomConfig` | ✓ | ✓ |   |   |
| `SuperDocZoomMode` | ✓ | ✓ |   |   |
| `SuperDocZoomPayload` | ✓ | ✓ |   |   |
| `SuperDocZoomState` | ✓ | ✓ |   |   |
| `SurfaceComponentProps` | ✓ | ✓ |   |   |
| `SurfaceFloatingPlacement` | ✓ | ✓ |   |   |
| `SurfaceHandle` | ✓ | ✓ |   |   |
| `SurfaceMode` | ✓ | ✓ |   |   |
| `SurfaceOutcome` | ✓ | ✓ |   |   |
| `SurfaceRequest` | ✓ | ✓ |   |   |
| `SurfaceResolution` | ✓ | ✓ |   |   |
| `SurfaceResolver` | ✓ | ✓ |   |   |
| `SurfacesModuleConfig` | ✓ | ✓ |   |   |
| `TextAddress` | ✓ | ✓ |   |   |
| `TextSegment` | ✓ | ✓ |   |   |
| `TextTarget` | ✓ | ✓ |   |   |
| `TrackChangeAuthor` | ✓ | ✓ |   |   |
| `TrackChangesAuthorColorsConfig` | ✓ | ✓ |   |   |
| `TrackChangesModuleConfig` | ✓ | ✓ |   |   |
| `TrackChangesSemanticColorsConfig` | ✓ | ✓ |   |   |
| `TrackedChangeAddress` | ✓ | ✓ |   |   |
| `TrackedChangeSemanticColorKey` | ✓ | ✓ |   |   |
| `TrackedChangeSemanticColorResolverInput` | ✓ | ✓ |   |   |
| `InteractionConfig` | ✓ | ✓ |   |   |
| `SurfacesConfig` | ✓ | ✓ |   |   |
| `UIConfig` | ✓ | ✓ |   |   |
| `UpgradeToCollaborationOptions` | ✓ | ✓ |   |   |
| `User` | ✓ | ✓ |   |   |
| `V2CollaborationConfig` | ✓ | ✓ |   |   |
| `ViewOptions` | ✓ | ✓ |   |   |
| `ViewingVisibilityConfig` | ✓ | ✓ |   |   |
| `buildTheme` | ✓ | ✓ | ✓ | ✓ |
| `compareVersions` | ✓ | ✓ | ✓ | ✓ |
| `createTheme` | ✓ | ✓ | ✓ | ✓ |
| `defineSuperDocExtension` | ✓ | ✓ | ✓ | ✓ |
| `getFileObject` | ✓ | ✓ | ✓ | ✓ |
