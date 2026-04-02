// Runtime re-exports — delegates to the v1 barrel
export * from './editors/v1/index.js';

// ============================================
// TYPE RE-EXPORTS
// Auto-generated types — sourced from actual TS implementations
// ============================================

// ProseMirror core types
/** @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead. */
export type { EditorView } from 'prosemirror-view';
/** @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead. */
export type { EditorState, Transaction } from 'prosemirror-state';
/** @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead. */
export type { Schema } from 'prosemirror-model';

// Document API types
export type { ResolveRangeOutput, DocumentApi, DocumentProtectionState } from '@superdoc/document-api';

// Selection handle types
export type { SelectionHandle } from './editors/v1/core/selection-state.js';
export type { SelectionCommandContext } from './editors/v1/core/presentation-editor/PresentationEditor.js';

// Command types
/** @deprecated Editor commands will be removed in a future version. Use the Document API instead. */
export type {
  EditorCommands,
  CommandProps,
  Command,
  ChainedCommand,
  ChainableCommandObject,
  CanObject,
  CoreCommandMap,
  ExtensionCommandMap,
} from './editors/v1/core/types/ChainedCommands.js';

// Editor event types (used by consumers to type event handlers)
export type {
  Comment,
  CommentsPayload,
  CommentLocationsPayload,
  FontsResolvedPayload,
  PaginationPayload,
  ListDefinitionsPayload,
  ProtectionChangeSource,
  EditorEventMap,
} from './editors/v1/core/types/EditorEvents.js';

// Parts system types (used by partChanged event handler)
export type { PartChangedEvent, PartId, PartSectionId } from './editors/v1/core/parts/types.js';

// Editor configuration and data types
export type {
  EditorOptions,
  User,
  FieldValue,
  DocxFileEntry,
  ViewLayout,
  ViewOptions,
  EditorExtension,
  CollaborationProvider,
  Awareness,
  CommentConfig,
  CommentHighlightColors,
  CommentHighlightOpacity,
  PermissionParams,
  LinkPopoverResolver,
  LinkPopoverContext,
  LinkPopoverResolution,
  ExternalPopoverRenderContext,
} from './editors/v1/core/types/EditorConfig.js';
export type {
  BinaryData,
  UnsupportedContentItem,
  ProseMirrorJSON,
  ExportFormat,
  PageStyles,
} from './editors/v1/core/types/EditorTypes.js';
export type {
  OpenOptions,
  SaveOptions,
  ExportOptions,
  ExportDocxParams,
  EditorLifecycleState,
} from './editors/v1/core/Editor.js';

// PresentationEditor public types
export type {
  PageSize,
  PageMargins,
  VirtualizationOptions,
  RemoteUserInfo,
  RemoteCursorState,
  PresenceOptions,
  TrackedChangesOverrides,
  LayoutEngineOptions,
  PresentationEditorOptions,
  LayoutMetrics,
  LayoutError,
  RangeRect,
  BoundingRect,
  LayoutUpdatePayload,
} from './editors/v1/core/presentation-editor/types.js';

// Layout engine types
export type { PositionHit } from '@superdoc/layout-bridge';
export type { PaintSnapshot, LayoutMode } from '@superdoc/painter-dom';
export type { FlowBlock, Layout, Measure, SectionMetadata, TrackedChangesMode } from '@superdoc/contracts';
export type { Page as LayoutPage, Fragment as LayoutFragment } from '@superdoc/contracts';

// Headless toolbar public types
export type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  HeadlessToolbarSurface,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarCommandState,
  ToolbarCommandStates,
  ToolbarContext,
  ToolbarExecuteFn,
  ToolbarPayloadMap,
  ToolbarSnapshot,
  ToolbarTarget,
  ToolbarValueMap,
} from './headless-toolbar/types.js';
