# SD-3212 A1 — root classification

Generated: 2026-05-25T00:00:00.000Z
Input: tests/consumer-typecheck/snapshots/superdoc-root-exports.json (205 names, locked baseline)

## Summary

| Bucket | Count |
|---|---|
| supported-root | 137 |
| legacy-root | 60 |
| move-to-subpath | 0 |
| internal-candidate | 8 |
| NEEDS-REVIEW | 0 |
| **total** | **205** |

Confidence: high=102, medium=101, needs-review=0.

## supported-root (137)

| Name | Confidence | Source | Rationale |
|---|---|---|---|
| `AwarenessState` | medium | collab | Collaboration/awareness type defined in core/types/index.ts. Customer-facing for collab-provider integrations (e.g., AwarenessState types the documented onAwarenessUpdate callback). |
| `AwarenessUser` | medium | collab | Collaboration/awareness type defined in core/types/index.ts. Extends User with an optional `color` field for consumer-supplied awareness color; typed on Config.user so the runtime override in SuperDoc#assignUserColor() is consumer-typable. |
| `BinaryData` | high | locked | Shape of binary content used in documented import/export/open/save paths. Type-reachable through documented APIs. |
| `BlockNavigationAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `BlocksListResult` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `BookmarkAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `BookmarkInfo` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `CollaborationConfig` | medium | config-supported | Configuration type for a supported feature. |
| `CollaborationProvider` | medium | collab | Collaboration/awareness type defined in core/types/index.ts. Customer-facing for collab-provider integrations (e.g., AwarenessState types the documented onAwarenessUpdate callback). |
| `Comment` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `CommentAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `CommentConfig` | medium | config-supported | Configuration type for a supported feature. |
| `CommentElement` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `CommentLocationsPayload` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `CommentsPayload` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `CommentsType` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `Config` | medium | config-supported | Configuration type for a supported feature. |
| `DOCX` | high | locked | Content-format constant. Heavily documented (133 doc mentions). Customer-facing. |
| `DirectSurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `DocRange` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `DocumentApi` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `DocumentMode` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `DocumentProtectionState` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `DocxFileEntry` | low | conversion-shape | Document conversion shape used in public APIs. |
| `Editor` | high | locked | Wrapper class for the editor instance. Deprecated members are editor.commands/state/view (use Document API via editor.doc instead), not the class itself. |
| `EditorEventMap` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `EditorLifecycleState` | medium | lifecycle | Lifecycle state enum on the Editor class. Customer-facing for tracking editor state. |
| `EditorSurface` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `EditorTransactionEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `EditorUpdateEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `EntityAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `ExportDocxParams` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExportFormat` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExportOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExportParams` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ExportType` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `Extensions` | high | locked | Advanced extension API for authors defining custom nodes/marks. Not a generic first-class embed API. Default programmatic work is Document API; extension authors still need this. |
| `ExternalPopoverRenderContext` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `ExternalSurfaceRenderContext` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `FieldValue` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `FindReplaceContext` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceHandle` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceRenderContext` | medium | find-replace | FindReplace surface API type. Public. |
| `FindReplaceResolution` | medium | find-replace | FindReplace surface API type. Public. |
| `FontConfig` | medium | config-supported | Configuration type for a supported feature. |
| `FontsResolvedPayload` | high | locked | Types the documented onFontsResolved callback (apps/docs/editor/superdoc/events.mdx) and appears in core/types/index.ts. Public callback payload despite originating in layout-internal code. |
| `HTML` | high | locked | Content-format constant. Heavily used (85 docs, 204 demos). Customer-facing. |
| `ImageDeselectedEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ImageSelectedEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `IntentSurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `LinkPopoverContext` | medium | link-popover | LinkPopover surface API type. Public. |
| `LinkPopoverResolution` | medium | link-popover | LinkPopover surface API type. Public. |
| `LinkPopoverResolver` | medium | link-popover | LinkPopover surface API type. Public. |
| `Modules` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `NavigableAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `OpenOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `PDF` | high | locked | Content-format constant. Customer-facing import/export selector. |
| `PageMargins` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `PageSize` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `PageStyles` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `PartChangedEvent` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `PasswordPromptAttemptResult` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptConfig` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptContext` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptHandle` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptRenderContext` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PasswordPromptResolution` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `PermissionParams` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ProofingCapabilities` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingCheckRequest` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingCheckResult` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingConfig` | medium | config-supported | Configuration type for a supported feature. |
| `ProofingError` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingIssue` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingIssueKind` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingProvider` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingSegment` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingSegmentMetadata` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProofingStatus` | medium | proofing | Proofing module type. Public for proofing-provider integrations. |
| `ProtectionChangeSource` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ResolveRangeOutput` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `ResolvedFindReplaceTexts` | medium | find-replace | FindReplace surface API type. Public. |
| `ResolvedPasswordPromptTexts` | medium | password-prompt | PasswordPrompt surface API type. Public. |
| `SaveOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ScrollIntoViewInput` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `ScrollIntoViewOutput` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `SearchMatch` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `SelectionApi` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `SelectionCommandContext` | medium | selection | Selection API helper type used in command/handle contexts. |
| `SelectionCurrentInput` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `SelectionHandle` | medium | selection | Selection API helper type used in command/handle contexts. |
| `SelectionInfo` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `StoryLocator` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `SuperDoc` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `SuperDocLayoutEngineOptions` | high | locked | Types Config.layoutEngineOptions at core/types/index.ts:1350,1505. Documented Config field. |
| `SuperDocTelemetryConfig` | high | locked | Backs Config.telemetry; documented at apps/docs/resources/telemetry.mdx (enabled/endpoint/metadata/licenseKey). |
| `SurfaceComponentProps` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceFloatingPlacement` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceHandle` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceMode` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceOutcome` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceRequest` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceResolution` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfaceResolver` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `SurfacesModuleConfig` | medium | surface | Headless Surface API type. Public extension surface for custom UI integrations. |
| `TextAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `TextSegment` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `TextTarget` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `TrackChangesModuleConfig` | high | locked | Module config for track-changes (modules.trackChanges). Documented at the module-config layer. |
| `TrackedChangeAddress` | high | doc-api | Document API navigation/address/selection type. Promoted into the root facade by SD-3185. |
| `TrackedChangesMode` | medium | comments-track | Comments/track-changes type used by Document API consumers. |
| `UnsupportedContentItem` | low | conversion-shape | Document conversion shape used in public APIs. |
| `UpgradeToCollaborationOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `User` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ViewLayout` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ViewOptions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `ViewingVisibilityConfig` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `assertNodeType` | high | locked | Runtime assertion helper paired with isNodeType. Customer-facing. |
| `buildTheme` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `compareVersions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `createTheme` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `createZip` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `defineMark` | high | locked | Runtime helper for defining custom ProseMirror marks. superdoc/types is type-only and cannot replace. |
| `defineNode` | high | locked | Runtime helper for defining custom ProseMirror nodes. superdoc/types is type-only and cannot replace. |
| `getActiveFormatting` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getAllowedImageDimensions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getFileObject` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getMarksFromSelection` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getRichTextExtensions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getSchemaIntrospection` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `getStarterExtensions` | medium | core | Customer-facing core API type or runtime export. Type-reachable through documented config / callback / event / method surfaces; runtime exports are documented utilities. |
| `isMarkType` | high | locked | Runtime type guard for mark-type predicates. Customer-facing schema introspection helper. |
| `isNodeType` | high | locked | Runtime type guard for node-type predicates. Customer-facing schema introspection helper. |

## legacy-root (60)

| Name | Confidence | Source | Rationale |
|---|---|---|---|
| `AIWriter` | high | locked | Internal Vue component used by AI UI. Real runtime export but no documented standalone import. |
| `BlankDOCX` | high | locked | Runtime-exported empty-DOCX builder. Used internally and possibly in demos; not a supported public concept. |
| `BoundingRect` | high | locked | PE geometry type. Not in core Config but reachable through PE rendering surface. Legacy compat. |
| `CanObject` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `ChainableCommandObject` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `ChainedCommand` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `Command` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `CommandProps` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `CommentsPluginKey` | high | locked | ProseMirror PluginKey for comments plugin state. Document API comments.* covers the higher-level use cases; the PluginKey is the lower-level access. |
| `ContextMenu` | high | locked | Legacy component. superdoc/ui exports ContextMenu controller types (ContextMenuContribution, ContextMenuItem) but not a replacement component. |
| `ContextMenuConfig` | medium | config-legacy | Configuration type for a feature with legacy surface (paired with a legacy component or older API). |
| `ContextMenuContext` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `ContextMenuItem` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `ContextMenuSection` | medium | context-menu | ContextMenu component-side type. Paired with the ContextMenu component (legacy-root). |
| `CoreCommandMap` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `DocxZipper` | high | locked | Legacy converter family entry. Same posture as ./docx-zipper subpath (package-boundaries Decision 1). |
| `EditorCommands` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `EditorExtension` | high | locked | Extension type. Extension helpers (defineNode/defineMark) are supported; this base type itself is under-documented. |
| `EditorOptions` | high | pm-internal | ProseMirror primitive type. Editor state/view/schema/transaction are deprecated direct-access surfaces (CLAUDE.md). Customers should use Document API. |
| `EditorState` | high | pm-internal | ProseMirror primitive type. Editor state/view/schema/transaction are deprecated direct-access surfaces (CLAUDE.md). Customers should use Document API. |
| `EditorView` | high | pm-internal | ProseMirror primitive type. Editor state/view/schema/transaction are deprecated direct-access surfaces (CLAUDE.md). Customers should use Document API. |
| `ExtensionCommandMap` | high | commands | Editor command typing infrastructure. editor.commands.* is deprecated; Document API (editor.doc.*) is the supported programmatic surface. Keep typed for compat. |
| `FindReplaceConfig` | medium | config-legacy | Configuration type for a feature with legacy surface (paired with a legacy component or older API). |
| `FlowBlock` | high | locked | In LayoutState.blocks. Layout-engine raw type that must not appear in public .d.ts per package-boundaries.md:64 — already leaks via PE closure. |
| `FlowMode` | high | locked | Types LayoutEngineOptions.flowMode (PE constructor). Legacy via PE closure. |
| `Layout` | high | locked | In PE.onLayoutUpdated payload (LayoutState & { layout: Layout; ... }). Layout-engine raw type that must not appear in public .d.ts per package-boundaries.md:64 — already leaks via PE legacy API. |
| `LayoutEngineOptions` | high | locked | Types PresentationEditorOptions.layoutEngineOptions. Legacy via PE constructor closure. |
| `LayoutError` | high | locked | Param/return of PE.onLayoutError / PE.getLayoutError. Legacy via PE closure. |
| `LayoutFragment` | high | locked | Part of LayoutPage shape; transitively required by PE.getPages() closure. |
| `LayoutMetrics` | high | locked | Optional in PE.onLayoutUpdated payload. Layout-engine raw; legacy via PE closure. |
| `LayoutMode` | high | locked | Param type of PresentationEditor.setLayoutMode (line 2940). Imported from @superdoc/painter-dom. Layout-engine raw type leaked through legacy PE API. |
| `LayoutPage` | high | locked | Return type of PresentationEditor.getPages() (line 1948); customer-scenario.ts:406 uses LayoutPage[]. Raw layout contract leaked through legacy PE API; keep typed for compat, replace with narrower API later. |
| `LayoutState` | high | locked | Payload of PresentationEditor.onLayoutUpdated (line 1932). Raw impl state leaked through legacy PE API. |
| `ListDefinitionsPayload` | high | locked | Types EditorEventMap.list-definitions-change (EditorEvents.ts:195) AND EditorConfig.onListDefinitionsChange (EditorConfig.ts:564). Legacy via Editor closure; root Config.onListDefinitionsChange is currently `{}` and docs do not advertise the payload shape. |
| `Measure` | high | locked | In LayoutState.measures. Layout-engine measurement type; legacy via PE closure. |
| `PaginationPayload` | high | locked | Types EditorEventMap.paginationUpdate (EditorEvents.ts:186). Editor extends EventEmitter<EditorEventMap>. Legacy via Editor closure; SuperDocs documented pagination event has a different shape ({totalPages, superdoc}). |
| `PaintSnapshot` | high | locked | Return type of PresentationEditor.getPaintSnapshot() (line 2861). Legacy via PE closure. |
| `PartId` | high | locked | Header/footer part addressing. OOXML part internal; legacy compat unless public custom-XML/header-footer APIs require it. |
| `PartSectionId` | high | locked | Companion to PartId; same posture. |
| `PositionHit` | high | locked | PE positioning type. Legacy compat, no docs. |
| `PresenceOptions` | high | locked | PE presence API surface type. Legacy via PE closure. (Presence feature is documented; type name itself is not.) |
| `PresentationEditor` | high | locked | Architecture-facing visual rendering bridge (per CLAUDE.md). Used by advanced/headless surfaces but not the recommended public API. |
| `PresentationEditorOptions` | high | presentation-editor-paired | Paired with PresentationEditor (legacy-root). Same posture. |
| `ProseMirrorJSON` | high | locked | Type of Config.jsonOverride (EditorConfig.ts:445). Already @deprecated in source (use ProseMirrorJSONNode). |
| `RangeRect` | high | locked | Return type of PresentationEditor.getSelectionRects(): RangeRect[]. Legacy via PE closure. |
| `RemoteCursorState` | high | locked | PE awareness/remote-cursor API surface type. Legacy via PE closure. |
| `RemoteUserInfo` | high | locked | PE awareness/remote-cursor API surface type. Legacy via PE closure. |
| `Schema` | high | pm-internal | ProseMirror primitive type. Editor state/view/schema/transaction are deprecated direct-access surfaces (CLAUDE.md). Customers should use Document API. |
| `SectionMetadata` | high | closure-gate-promoted | Return-type member of PresentationEditor.getLayoutSnapshot() (line 2744): { layout, blocks, measures, sectionMetadata: SectionMetadata[] }. Legacy via PE closure; caught by the SD-3212 a1b closure gate after manual analysis missed it. |
| `SlashMenu` | high | locked | Legacy component. Sparse public evidence (0 docs, 0 examples, 1 demo, 1 fixture) but currently typed. |
| `SuperConverter` | high | locked | Legacy converter family entry. Same posture as ./converter subpath. |
| `SuperEditor` | high | locked | Older naming, predates SuperDoc as the canonical entry. Keep compiling; new code should use SuperDoc. |
| `SuperInput` | high | locked | Internal/comment-input component. Companion to SuperDoc but not advertised as a separate entry. |
| `SuperToolbar` | high | locked | Legacy toolbar implementation. Future custom UI path is superdoc/ui (controller types), but no SuperToolbar replacement component exists today. |
| `Toolbar` | high | locked | Same family as SuperToolbar. Higher docs presence (35) makes removal more breaking. |
| `TrackChangesBasePluginKey` | high | locked | ProseMirror PluginKey for track-changes plugin state. trackChanges.* Document API ops (partial coverage) are the higher-level alternative. |
| `TrackedChangesOverrides` | high | locked | Param type of PresentationEditor.setTrackedChangesOverrides (line 1859). Legacy via PE closure. |
| `Transaction` | high | pm-internal | ProseMirror primitive type. Editor state/view/schema/transaction are deprecated direct-access surfaces (CLAUDE.md). Customers should use Document API. |
| `VirtualizationOptions` | high | locked | Types fields in PresentationEditorOptions. Legacy via PE closure. |
| `fieldAnnotationHelpers` | high | locked | Documented at apps/docs/extensions/field-annotation.mdx and demos/fields/src/App.vue. Real public surface today; should migrate after SD-3192 decides fieldAnnotations.* Document API. |

## internal-candidate (8)

| Name | Confidence | Source | Rationale |
|---|---|---|---|
| `AnnotatorHelpers` | high | locked | Implementation helper in packages/super-editor/.../helpers/annotator.js, used internally by Editor.ts. No source-side public usage. |
| `LayoutUpdatePayload` | high | locked | Layout engine update payload. PE-internal; NOT used in any public Editor/PE method signature (the closure goes through `LayoutState & { layout; metrics? }`, not this named alias). |
| `RemoteCursorsRenderPayload` | high | locked | PresentationEditor render-payload event. PE-internal; not in any public PE method signature. |
| `SectionHelpers` | high | locked | Implementation helper in packages/super-editor/.../document-section/helpers.js, used by structured-content internals. |
| `TelemetryEvent` | high | locked | PresentationEditor layout/error/remoteCursorsRender event union. Source file marks adjacent types as "Internal Types". No public docs. |
| `registeredHandlers` | high | locked | Registry side-effect; 0 docs, 0 examples. Not customer-facing API. |
| `superEditorHelpers` | high | locked | Helper namespace bag. 0 docs, 0 examples. Likely accidental export. |
| `trackChangesHelpers` | high | locked | Track-changes helpers. Document API trackChanges.* has partial coverage; helpers are the lower-level access; no public docs. |

