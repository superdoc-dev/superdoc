/**
 * Consumer typecheck: every public type from superdoc must resolve to
 * a real interface, not collapse to `any`, and not be missing.
 *
 * Each `AssertNotAny<T>` resolves to `never` when T is `any`, so the
 * `const _real_X: AssertNotAny<X> = true` lines fail to compile if X
 * has collapsed. A missing export shows up as TS2305 on the import.
 *
 * SD-3213a (post root facade flip): this file is no longer auto-generated
 * from `packages/superdoc/src/index.js`'s typedef block — that file is no
 * longer the canonical source of truth for the root contract after the
 * SD-3212 PR C root types flip. The canonical root surface is now
 * `packages/superdoc/src/public/index.ts`, locked by
 * `tests/consumer-typecheck/snapshots/superdoc-root-exports.json` and
 * classified at `tests/consumer-typecheck/snapshots/superdoc-root-classification.json`.
 *
 * When a new TYPE-ONLY root export lands (inDts true, inEsm/inCjs false
 * in the classification), add a corresponding
 * `import { X } from 'superdoc';` + `const _real_X: AssertNotAny<X> = true;`
 * line below. The `check-all-public-types-fixture.mjs` gate derives the
 * expected assertion set from the classification artifact and fails CI
 * if any type-only export is missing here, so you cannot silently land a
 * new root type without any-collapse coverage. The SD-2842 matrix
 * scenarios then exercise this file to catch the actual any-collapses.
 */
import type {
  BinaryData,
  BlockNavigationAddress,
  BlocksListResult,
  BookmarkAddress,
  BookmarkInfo,
  BoundingRect,
  CanObject,
  ChainableCommandObject,
  ChainedCommand,
  CollaborationConfig,
  CollaborationProvider,
  Command,
  CommandProps,
  Comment,
  CommentAddress,
  CommentConfig,
  CommentElement,
  CommentLocationsPayload,
  CommentsPayload,
  CommentsType,
  Config,
  ContextMenuConfig,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuSection,
  CoreCommandMap,
  DirectSurfaceRequest,
  DocRange,
  DocumentApi,
  DocumentMode,
  DocumentProtectionState,
  DocxFileEntry,
  EditorCommands,
  EditorEventMap,
  EditorExtension,
  EditorLifecycleState,
  EditorOptions,
  EditorState,
  EditorSurface,
  EditorTransactionEvent,
  EditorUpdateEvent,
  EditorView,
  EntityAddress,
  ExportDocxParams,
  ExportFormat,
  ExportOptions,
  ExportParams,
  ExportType,
  ExtensionCommandMap,
  ExternalPopoverRenderContext,
  ExternalSurfaceRenderContext,
  FieldValue,
  FindReplaceConfig,
  FindReplaceContext,
  FindReplaceHandle,
  FindReplaceRenderContext,
  FindReplaceResolution,
  FlowBlock,
  FlowMode,
  FontConfig,
  FontsResolvedPayload,
  ImageDeselectedEvent,
  ImageSelectedEvent,
  IntentSurfaceRequest,
  Layout,
  LayoutEngineOptions,
  LayoutError,
  LayoutFragment,
  LayoutMetrics,
  LayoutMode,
  LayoutPage,
  LayoutState,
  LayoutUpdatePayload,
  LinkPopoverContext,
  LinkPopoverResolution,
  LinkPopoverResolver,
  AwarenessState,
  ListDefinitionsPayload,
  Measure,
  Modules,
  NavigableAddress,
  OpenOptions,
  PageMargins,
  PageSize,
  PageStyles,
  PaginationPayload,
  PaintSnapshot,
  PartChangedEvent,
  PartId,
  PartSectionId,
  PasswordPromptAttemptResult,
  PasswordPromptConfig,
  PasswordPromptContext,
  PasswordPromptHandle,
  PasswordPromptRenderContext,
  PasswordPromptResolution,
  PermissionParams,
  PositionHit,
  PresenceOptions,
  PresentationEditorOptions,
  ProofingCapabilities,
  ProofingCheckRequest,
  ProofingCheckResult,
  ProofingConfig,
  ProofingError,
  ProofingIssue,
  ProofingIssueKind,
  ProofingProvider,
  ProofingSegment,
  ProofingSegmentMetadata,
  ProofingStatus,
  ProseMirrorJSON,
  ProtectionChangeSource,
  RangeRect,
  RemoteCursorState,
  RemoteCursorsRenderPayload,
  RemoteUserInfo,
  ResolveRangeOutput,
  ResolvedFindReplaceTexts,
  ResolvedPasswordPromptTexts,
  SaveOptions,
  Schema,
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
  SearchMatch,
  SectionMetadata,
  SelectionApi,
  SelectionCommandContext,
  SelectionCurrentInput,
  SelectionHandle,
  SelectionInfo,
  StoryLocator,
  SuperDocExceptionEditorPayload,
  SuperDocExceptionPayload,
  SuperDocExceptionRestorePayload,
  SuperDocExceptionStorePayload,
  SuperDocLayoutEngineOptions,
  SuperDocTelemetryConfig,
  SurfaceComponentProps,
  SurfaceFloatingPlacement,
  SurfaceHandle,
  SurfaceMode,
  SurfaceOutcome,
  SurfaceRequest,
  SurfaceResolution,
  SurfaceResolver,
  SurfacesModuleConfig,
  TelemetryEvent,
  TextAddress,
  TextSegment,
  TextTarget,
  TrackChangesModuleConfig,
  TrackedChangeAddress,
  TrackedChangesMode,
  TrackedChangesOverrides,
  Transaction,
  UnsupportedContentItem,
  UpgradeToCollaborationOptions,
  User,
  ViewLayout,
  ViewOptions,
  ViewingVisibilityConfig,
  VirtualizationOptions,
} from 'superdoc';

// Helper: IsAny<T> resolves to `true` when T is `any`, otherwise false.
type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

// One assertion per type. If T is `any`, AssertNotAny<T> is `never` and
// the line below fails to compile with "Type 'true' is not assignable
// to type 'never'". If T is real, it compiles silently.
const _real_BinaryData: AssertNotAny<BinaryData> = true;
const _real_BlockNavigationAddress: AssertNotAny<BlockNavigationAddress> = true;
const _real_BlocksListResult: AssertNotAny<BlocksListResult> = true;
const _real_BookmarkAddress: AssertNotAny<BookmarkAddress> = true;
const _real_BookmarkInfo: AssertNotAny<BookmarkInfo> = true;
const _real_BoundingRect: AssertNotAny<BoundingRect> = true;
const _real_CanObject: AssertNotAny<CanObject> = true;
const _real_ChainableCommandObject: AssertNotAny<ChainableCommandObject> = true;
const _real_ChainedCommand: AssertNotAny<ChainedCommand> = true;
const _real_CollaborationConfig: AssertNotAny<CollaborationConfig> = true;
const _real_CollaborationProvider: AssertNotAny<CollaborationProvider> = true;
const _real_Command: AssertNotAny<Command> = true;
const _real_CommandProps: AssertNotAny<CommandProps> = true;
const _real_Comment: AssertNotAny<Comment> = true;
const _real_CommentAddress: AssertNotAny<CommentAddress> = true;
const _real_CommentConfig: AssertNotAny<CommentConfig> = true;
const _real_CommentElement: AssertNotAny<CommentElement> = true;
const _real_CommentLocationsPayload: AssertNotAny<CommentLocationsPayload> = true;
const _real_CommentsPayload: AssertNotAny<CommentsPayload> = true;
const _real_CommentsType: AssertNotAny<CommentsType> = true;
const _real_Config: AssertNotAny<Config> = true;
const _real_ContextMenuConfig: AssertNotAny<ContextMenuConfig> = true;
const _real_ContextMenuContext: AssertNotAny<ContextMenuContext> = true;
const _real_ContextMenuItem: AssertNotAny<ContextMenuItem> = true;
const _real_ContextMenuSection: AssertNotAny<ContextMenuSection> = true;
const _real_CoreCommandMap: AssertNotAny<CoreCommandMap> = true;
const _real_DirectSurfaceRequest: AssertNotAny<DirectSurfaceRequest> = true;
const _real_DocRange: AssertNotAny<DocRange> = true;
const _real_DocumentApi: AssertNotAny<DocumentApi> = true;
const _real_DocumentMode: AssertNotAny<DocumentMode> = true;
const _real_DocumentProtectionState: AssertNotAny<DocumentProtectionState> = true;
const _real_DocxFileEntry: AssertNotAny<DocxFileEntry> = true;
const _real_EditorCommands: AssertNotAny<EditorCommands> = true;
const _real_EditorEventMap: AssertNotAny<EditorEventMap> = true;
const _real_EditorExtension: AssertNotAny<EditorExtension> = true;
const _real_EditorLifecycleState: AssertNotAny<EditorLifecycleState> = true;
const _real_EditorOptions: AssertNotAny<EditorOptions> = true;
const _real_EditorState: AssertNotAny<EditorState> = true;
const _real_EditorSurface: AssertNotAny<EditorSurface> = true;
const _real_EditorTransactionEvent: AssertNotAny<EditorTransactionEvent> = true;
const _real_EditorUpdateEvent: AssertNotAny<EditorUpdateEvent> = true;
const _real_EditorView: AssertNotAny<EditorView> = true;
const _real_EntityAddress: AssertNotAny<EntityAddress> = true;
const _real_ExportDocxParams: AssertNotAny<ExportDocxParams> = true;
const _real_ExportFormat: AssertNotAny<ExportFormat> = true;
const _real_ExportOptions: AssertNotAny<ExportOptions> = true;
const _real_ExportParams: AssertNotAny<ExportParams> = true;
const _real_ExportType: AssertNotAny<ExportType> = true;
const _real_ExtensionCommandMap: AssertNotAny<ExtensionCommandMap> = true;
const _real_ExternalPopoverRenderContext: AssertNotAny<ExternalPopoverRenderContext> = true;
const _real_ExternalSurfaceRenderContext: AssertNotAny<ExternalSurfaceRenderContext> = true;
const _real_FieldValue: AssertNotAny<FieldValue> = true;
const _real_FindReplaceConfig: AssertNotAny<FindReplaceConfig> = true;
const _real_FindReplaceContext: AssertNotAny<FindReplaceContext> = true;
const _real_FindReplaceHandle: AssertNotAny<FindReplaceHandle> = true;
const _real_FindReplaceRenderContext: AssertNotAny<FindReplaceRenderContext> = true;
const _real_FindReplaceResolution: AssertNotAny<FindReplaceResolution> = true;
const _real_FlowBlock: AssertNotAny<FlowBlock> = true;
const _real_FlowMode: AssertNotAny<FlowMode> = true;
const _real_FontConfig: AssertNotAny<FontConfig> = true;
const _real_FontsResolvedPayload: AssertNotAny<FontsResolvedPayload> = true;
const _real_ImageDeselectedEvent: AssertNotAny<ImageDeselectedEvent> = true;
const _real_ImageSelectedEvent: AssertNotAny<ImageSelectedEvent> = true;
const _real_IntentSurfaceRequest: AssertNotAny<IntentSurfaceRequest> = true;
const _real_Layout: AssertNotAny<Layout> = true;
const _real_LayoutEngineOptions: AssertNotAny<LayoutEngineOptions> = true;
const _real_LayoutError: AssertNotAny<LayoutError> = true;
const _real_LayoutFragment: AssertNotAny<LayoutFragment> = true;
const _real_LayoutMetrics: AssertNotAny<LayoutMetrics> = true;
const _real_LayoutMode: AssertNotAny<LayoutMode> = true;
const _real_LayoutPage: AssertNotAny<LayoutPage> = true;
const _real_LayoutState: AssertNotAny<LayoutState> = true;
const _real_LayoutUpdatePayload: AssertNotAny<LayoutUpdatePayload> = true;
const _real_LinkPopoverContext: AssertNotAny<LinkPopoverContext> = true;
const _real_LinkPopoverResolution: AssertNotAny<LinkPopoverResolution> = true;
const _real_LinkPopoverResolver: AssertNotAny<LinkPopoverResolver> = true;
const _real_AwarenessState: AssertNotAny<AwarenessState> = true;
const _real_ListDefinitionsPayload: AssertNotAny<ListDefinitionsPayload> = true;
const _real_Measure: AssertNotAny<Measure> = true;
const _real_Modules: AssertNotAny<Modules> = true;
const _real_NavigableAddress: AssertNotAny<NavigableAddress> = true;
const _real_OpenOptions: AssertNotAny<OpenOptions> = true;
const _real_PageMargins: AssertNotAny<PageMargins> = true;
const _real_PageSize: AssertNotAny<PageSize> = true;
const _real_PageStyles: AssertNotAny<PageStyles> = true;
const _real_PaginationPayload: AssertNotAny<PaginationPayload> = true;
const _real_PaintSnapshot: AssertNotAny<PaintSnapshot> = true;
const _real_PartChangedEvent: AssertNotAny<PartChangedEvent> = true;
const _real_PartId: AssertNotAny<PartId> = true;
const _real_PartSectionId: AssertNotAny<PartSectionId> = true;
const _real_PasswordPromptAttemptResult: AssertNotAny<PasswordPromptAttemptResult> = true;
const _real_PasswordPromptConfig: AssertNotAny<PasswordPromptConfig> = true;
const _real_PasswordPromptContext: AssertNotAny<PasswordPromptContext> = true;
const _real_PasswordPromptHandle: AssertNotAny<PasswordPromptHandle> = true;
const _real_PasswordPromptRenderContext: AssertNotAny<PasswordPromptRenderContext> = true;
const _real_PasswordPromptResolution: AssertNotAny<PasswordPromptResolution> = true;
const _real_PermissionParams: AssertNotAny<PermissionParams> = true;
const _real_PositionHit: AssertNotAny<PositionHit> = true;
const _real_PresenceOptions: AssertNotAny<PresenceOptions> = true;
const _real_PresentationEditorOptions: AssertNotAny<PresentationEditorOptions> = true;
const _real_ProofingCapabilities: AssertNotAny<ProofingCapabilities> = true;
const _real_ProofingCheckRequest: AssertNotAny<ProofingCheckRequest> = true;
const _real_ProofingCheckResult: AssertNotAny<ProofingCheckResult> = true;
const _real_ProofingConfig: AssertNotAny<ProofingConfig> = true;
const _real_ProofingError: AssertNotAny<ProofingError> = true;
const _real_ProofingIssue: AssertNotAny<ProofingIssue> = true;
const _real_ProofingIssueKind: AssertNotAny<ProofingIssueKind> = true;
const _real_ProofingProvider: AssertNotAny<ProofingProvider> = true;
const _real_ProofingSegment: AssertNotAny<ProofingSegment> = true;
const _real_ProofingSegmentMetadata: AssertNotAny<ProofingSegmentMetadata> = true;
const _real_ProofingStatus: AssertNotAny<ProofingStatus> = true;
const _real_ProseMirrorJSON: AssertNotAny<ProseMirrorJSON> = true;
const _real_ProtectionChangeSource: AssertNotAny<ProtectionChangeSource> = true;
const _real_RangeRect: AssertNotAny<RangeRect> = true;
const _real_RemoteCursorState: AssertNotAny<RemoteCursorState> = true;
const _real_RemoteCursorsRenderPayload: AssertNotAny<RemoteCursorsRenderPayload> = true;
const _real_RemoteUserInfo: AssertNotAny<RemoteUserInfo> = true;
const _real_ResolveRangeOutput: AssertNotAny<ResolveRangeOutput> = true;
const _real_ResolvedFindReplaceTexts: AssertNotAny<ResolvedFindReplaceTexts> = true;
const _real_ResolvedPasswordPromptTexts: AssertNotAny<ResolvedPasswordPromptTexts> = true;
const _real_SaveOptions: AssertNotAny<SaveOptions> = true;
const _real_Schema: AssertNotAny<Schema> = true;
const _real_ScrollIntoViewInput: AssertNotAny<ScrollIntoViewInput> = true;
const _real_ScrollIntoViewOutput: AssertNotAny<ScrollIntoViewOutput> = true;
const _real_SearchMatch: AssertNotAny<SearchMatch> = true;
const _real_SectionMetadata: AssertNotAny<SectionMetadata> = true;
const _real_SelectionApi: AssertNotAny<SelectionApi> = true;
const _real_SelectionCommandContext: AssertNotAny<SelectionCommandContext> = true;
const _real_SelectionCurrentInput: AssertNotAny<SelectionCurrentInput> = true;
const _real_SelectionHandle: AssertNotAny<SelectionHandle> = true;
const _real_SelectionInfo: AssertNotAny<SelectionInfo> = true;
const _real_StoryLocator: AssertNotAny<StoryLocator> = true;
const _real_SuperDocExceptionEditorPayload: AssertNotAny<SuperDocExceptionEditorPayload> = true;
const _real_SuperDocExceptionPayload: AssertNotAny<SuperDocExceptionPayload> = true;
const _real_SuperDocExceptionRestorePayload: AssertNotAny<SuperDocExceptionRestorePayload> = true;
const _real_SuperDocExceptionStorePayload: AssertNotAny<SuperDocExceptionStorePayload> = true;
const _real_SuperDocLayoutEngineOptions: AssertNotAny<SuperDocLayoutEngineOptions> = true;
const _real_SuperDocTelemetryConfig: AssertNotAny<SuperDocTelemetryConfig> = true;
const _real_SurfaceComponentProps: AssertNotAny<SurfaceComponentProps> = true;
const _real_SurfaceFloatingPlacement: AssertNotAny<SurfaceFloatingPlacement> = true;
const _real_SurfaceHandle: AssertNotAny<SurfaceHandle> = true;
const _real_SurfaceMode: AssertNotAny<SurfaceMode> = true;
const _real_SurfaceOutcome: AssertNotAny<SurfaceOutcome> = true;
const _real_SurfaceRequest: AssertNotAny<SurfaceRequest> = true;
const _real_SurfaceResolution: AssertNotAny<SurfaceResolution> = true;
const _real_SurfaceResolver: AssertNotAny<SurfaceResolver> = true;
const _real_SurfacesModuleConfig: AssertNotAny<SurfacesModuleConfig> = true;
const _real_TelemetryEvent: AssertNotAny<TelemetryEvent> = true;
const _real_TextAddress: AssertNotAny<TextAddress> = true;
const _real_TextSegment: AssertNotAny<TextSegment> = true;
const _real_TextTarget: AssertNotAny<TextTarget> = true;
const _real_TrackChangesModuleConfig: AssertNotAny<TrackChangesModuleConfig> = true;
const _real_TrackedChangeAddress: AssertNotAny<TrackedChangeAddress> = true;
const _real_TrackedChangesMode: AssertNotAny<TrackedChangesMode> = true;
const _real_TrackedChangesOverrides: AssertNotAny<TrackedChangesOverrides> = true;
const _real_Transaction: AssertNotAny<Transaction> = true;
const _real_UnsupportedContentItem: AssertNotAny<UnsupportedContentItem> = true;
const _real_UpgradeToCollaborationOptions: AssertNotAny<UpgradeToCollaborationOptions> = true;
const _real_User: AssertNotAny<User> = true;
const _real_ViewLayout: AssertNotAny<ViewLayout> = true;
const _real_ViewOptions: AssertNotAny<ViewOptions> = true;
const _real_ViewingVisibilityConfig: AssertNotAny<ViewingVisibilityConfig> = true;
const _real_VirtualizationOptions: AssertNotAny<VirtualizationOptions> = true;
