import {
  SuperConverter,
  Editor,
  PresentationEditor,
  getStarterExtensions,
  getRichTextExtensions,
  createZip,
  Extensions,
  registeredHandlers,
  helpers as superEditorHelpers,
  fieldAnnotationHelpers,
  trackChangesHelpers,
  AnnotatorHelpers,
  SectionHelpers,
  // Additional runtime exports
  DocxZipper,
  SuperToolbar,
  getMarksFromSelection,
  getActiveFormatting,
  getAllowedImageDimensions,
  isNodeType,
  assertNodeType,
  isMarkType,
  defineNode,
  defineMark,
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  // Vue components
  SuperEditor,
  SuperInput,
  BasicUpload,
  Toolbar,
  AIWriter,
  ContextMenu,
  SlashMenu,
} from '@superdoc/super-editor';
import { DOCX, PDF, HTML, getFileObject, compareVersions } from '@superdoc/common';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';
import { getSchemaIntrospection } from './helpers/schema-introspection.js';

// ============================================
// TYPE RE-EXPORTS
// These types are defined in @superdoc/super-editor and ./core/types/, and
// re-exported for consumers. vite-plugin-dts picks up these JSDoc @typedef
// imports and generates corresponding `export type` declarations in the
// consumer-facing .d.ts.
// ============================================

/**
 * @typedef {import('@superdoc/super-editor').EditorState} EditorState
 * @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').Transaction} Transaction
 * @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').Schema} Schema
 * @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').EditorView} EditorView
 * @deprecated Direct ProseMirror access will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').EditorCommands} EditorCommands
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').ChainedCommand} ChainedCommand
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').ChainableCommandObject} ChainableCommandObject
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').CommandProps} CommandProps
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').Command} Command
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').CanObject} CanObject
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 * @typedef {import('@superdoc/super-editor').PresentationEditorOptions} PresentationEditorOptions
 * @typedef {import('@superdoc/super-editor').LayoutEngineOptions} LayoutEngineOptions
 * @typedef {import('@superdoc/super-editor').PageSize} PageSize
 * @typedef {import('@superdoc/super-editor').PageMargins} PageMargins
 * @typedef {import('@superdoc/super-editor').VirtualizationOptions} VirtualizationOptions
 * @typedef {import('@superdoc/super-editor').TrackedChangesMode} TrackedChangesMode
 * @typedef {import('@superdoc/super-editor').TrackedChangesOverrides} TrackedChangesOverrides
 * @typedef {import('@superdoc/super-editor').LayoutMode} LayoutMode
 * @typedef {import('@superdoc/super-editor').PresenceOptions} PresenceOptions
 * @typedef {import('@superdoc/super-editor').RemoteUserInfo} RemoteUserInfo
 * @typedef {import('@superdoc/super-editor').RemoteCursorState} RemoteCursorState
 * @typedef {import('@superdoc/super-editor').Layout} Layout
 * @typedef {import('@superdoc/super-editor').LayoutPage} LayoutPage
 * @typedef {import('@superdoc/super-editor').LayoutFragment} LayoutFragment
 * @typedef {import('@superdoc/super-editor').RangeRect} RangeRect
 * @typedef {import('@superdoc/super-editor').BoundingRect} BoundingRect
 * @typedef {import('@superdoc/super-editor').LayoutError} LayoutError
 * @typedef {import('@superdoc/super-editor').LayoutMetrics} LayoutMetrics
 * @typedef {import('@superdoc/super-editor').PositionHit} PositionHit
 * @typedef {import('@superdoc/super-editor').FlowBlock} FlowBlock
 * @typedef {import('@superdoc/super-editor').Measure} Measure
 * @typedef {import('@superdoc/super-editor').SectionMetadata} SectionMetadata
 * @typedef {import('@superdoc/super-editor').PaintSnapshot} PaintSnapshot
 * @typedef {import('@superdoc/super-editor').OpenOptions} OpenOptions
 * @typedef {import('@superdoc/super-editor').DocxFileEntry} DocxFileEntry
 * @typedef {import('@superdoc/super-editor').BinaryData} BinaryData
 * @typedef {import('@superdoc/super-editor').UnsupportedContentItem} UnsupportedContentItem
 * @typedef {import('@superdoc/super-editor').SaveOptions} SaveOptions
 * @typedef {import('@superdoc/super-editor').ExportOptions} ExportOptions
 * @typedef {import('@superdoc/super-editor').SelectionHandle} SelectionHandle
 * @typedef {import('@superdoc/super-editor').SelectionCommandContext} SelectionCommandContext
 * @typedef {import('@superdoc/super-editor').ResolveRangeOutput} ResolveRangeOutput
 * @typedef {import('@superdoc/super-editor').SelectionApi} SelectionApi
 * @typedef {import('@superdoc/super-editor').SelectionInfo} SelectionInfo
 * @typedef {import('@superdoc/super-editor').SelectionCurrentInput} SelectionCurrentInput
 * @typedef {import('@superdoc/super-editor').ScrollIntoViewInput} ScrollIntoViewInput
 * @typedef {import('@superdoc/super-editor').ScrollIntoViewOutput} ScrollIntoViewOutput
 * @typedef {import('@superdoc/super-editor').TextTarget} TextTarget
 * @typedef {import('@superdoc/super-editor').TextAddress} TextAddress
 * @typedef {import('@superdoc/super-editor').TextSegment} TextSegment
 * @typedef {import('@superdoc/super-editor').EntityAddress} EntityAddress
 * @typedef {import('@superdoc/super-editor').DocumentApi} DocumentApi
 * @typedef {import('@superdoc/super-editor').BlocksListResult} BlocksListResult
 * @typedef {import('@superdoc/super-editor').BookmarkInfo} BookmarkInfo
 * @typedef {import('@superdoc/super-editor').LayoutUpdatePayload} LayoutUpdatePayload
 * @typedef {import('@superdoc/super-editor').CoreCommandMap} CoreCommandMap
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').ExtensionCommandMap} ExtensionCommandMap
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 * @typedef {import('@superdoc/super-editor').Comment} Comment
 * @typedef {import('@superdoc/super-editor').CommentElement} CommentElement
 * @typedef {import('@superdoc/super-editor').CommentsPayload} CommentsPayload
 * @typedef {import('@superdoc/super-editor').CommentLocationsPayload} CommentLocationsPayload
 * @typedef {import('@superdoc/super-editor').FontsResolvedPayload} FontsResolvedPayload
 * @typedef {import('@superdoc/super-editor').PaginationPayload} PaginationPayload
 * @typedef {import('@superdoc/super-editor').EditorEventMap} EditorEventMap
 * @typedef {import('@superdoc/super-editor').ListDefinitionsPayload} ListDefinitionsPayload
 * @typedef {import('@superdoc/super-editor').ProtectionChangeSource} ProtectionChangeSource
 * @typedef {import('@superdoc/super-editor').DocumentProtectionState} DocumentProtectionState
 * @typedef {import('@superdoc/super-editor').PartChangedEvent} PartChangedEvent
 * @typedef {import('@superdoc/super-editor').PartId} PartId
 * @typedef {import('@superdoc/super-editor').PartSectionId} PartSectionId
 * @typedef {import('@superdoc/super-editor').EditorOptions} EditorOptions
 * @typedef {import('@superdoc/super-editor').EditorLifecycleState} EditorLifecycleState
 * @typedef {import('@superdoc/super-editor').User} User
 * @typedef {import('@superdoc/super-editor').ProseMirrorJSON} ProseMirrorJSON
 * @deprecated ProseMirror JSON format will be removed in a future version. Use the Document API instead.
 * @typedef {import('@superdoc/super-editor').ExportFormat} ExportFormat
 * @typedef {import('@superdoc/super-editor').ExportDocxParams} ExportDocxParams
 * @typedef {import('@superdoc/super-editor').EditorExtension} EditorExtension
 * @typedef {import('@superdoc/super-editor').ViewLayout} ViewLayout
 * @typedef {import('@superdoc/super-editor').ViewOptions} ViewOptions
 * @typedef {import('@superdoc/super-editor').CommentConfig} CommentConfig
 * @typedef {import('@superdoc/super-editor').CollaborationProvider} CollaborationProvider
 * @typedef {import('@superdoc/super-editor').LinkPopoverResolver} LinkPopoverResolver
 * @typedef {import('@superdoc/super-editor').LinkPopoverContext} LinkPopoverContext
 * @typedef {import('@superdoc/super-editor').LinkPopoverResolution} LinkPopoverResolution
 * @typedef {import('@superdoc/super-editor').PermissionParams} PermissionParams
 * @typedef {import('@superdoc/super-editor').FontConfig} FontConfig
 * @typedef {import('@superdoc/super-editor').FieldValue} FieldValue
 * @typedef {import('@superdoc/super-editor').LayoutState} LayoutState
 * @typedef {import('@superdoc/super-editor').ImageSelectedEvent} ImageSelectedEvent
 * @typedef {import('@superdoc/super-editor').ImageDeselectedEvent} ImageDeselectedEvent
 * @typedef {import('@superdoc/super-editor').TelemetryEvent} TelemetryEvent
 * @typedef {import('@superdoc/super-editor').RemoteCursorsRenderPayload} RemoteCursorsRenderPayload
 * @typedef {import('@superdoc/super-editor').FlowMode} FlowMode
 * @typedef {import('@superdoc/super-editor').ProofingProvider} ProofingProvider
 * @typedef {import('@superdoc/super-editor').ProofingCapabilities} ProofingCapabilities
 * @typedef {import('@superdoc/super-editor').ProofingCheckRequest} ProofingCheckRequest
 * @typedef {import('@superdoc/super-editor').ProofingCheckResult} ProofingCheckResult
 * @typedef {import('@superdoc/super-editor').ProofingSegment} ProofingSegment
 * @typedef {import('@superdoc/super-editor').ProofingSegmentMetadata} ProofingSegmentMetadata
 * @typedef {import('@superdoc/super-editor').ProofingIssue} ProofingIssue
 * @typedef {import('@superdoc/super-editor').ProofingIssueKind} ProofingIssueKind
 * @typedef {import('@superdoc/super-editor').ProofingConfig} ProofingConfig
 * @typedef {import('@superdoc/super-editor').ProofingStatus} ProofingStatus
 * @typedef {import('@superdoc/super-editor').ProofingError} ProofingError
 * @typedef {import('@superdoc/super-editor').PageStyles} PageStyles
 *
 * @typedef {import('./core/types/index.js').ContextMenuContext} ContextMenuContext
 * @typedef {import('./core/types/index.js').ContextMenuItem} ContextMenuItem
 * @typedef {import('./core/types/index.js').ContextMenuSection} ContextMenuSection
 * @typedef {import('./core/types/index.js').ContextMenuConfig} ContextMenuConfig
 * @typedef {import('./core/types/index.js').DocumentMode} DocumentMode
 * @typedef {import('./core/types/index.js').StoryLocator} StoryLocator
 * @typedef {import('./core/types/index.js').BookmarkAddress} BookmarkAddress
 * @typedef {import('./core/types/index.js').BlockNavigationAddress} BlockNavigationAddress
 * @typedef {import('./core/types/index.js').CommentAddress} CommentAddress
 * @typedef {import('./core/types/index.js').TrackedChangeAddress} TrackedChangeAddress
 * @typedef {import('./core/types/index.js').NavigableAddress} NavigableAddress
 *
 * @typedef {import('./core/types/index.js').Config} Config
 * @typedef {import('./core/types/index.js').Modules} Modules
 * @typedef {import('./core/types/index.js').CollaborationConfig} CollaborationConfig
 * @typedef {import('./core/types/index.js').UpgradeToCollaborationOptions} UpgradeToCollaborationOptions
 * @typedef {import('./core/types/index.js').ExternalPopoverRenderContext} ExternalPopoverRenderContext
 * @typedef {import('./core/types/index.js').IntentSurfaceRequest} IntentSurfaceRequest
 * @typedef {import('./core/types/index.js').DirectSurfaceRequest} DirectSurfaceRequest
 * @typedef {import('./core/types/index.js').SurfaceRequest} SurfaceRequest
 * @typedef {import('./core/types/index.js').SurfaceResolution} SurfaceResolution
 * @typedef {import('./core/types/index.js').SurfaceResolver} SurfaceResolver
 * @typedef {import('./core/types/index.js').SurfaceOutcome} SurfaceOutcome
 * @typedef {import('./core/types/index.js').SurfaceHandle} SurfaceHandle
 * @typedef {import('./core/types/index.js').SurfaceComponentProps} SurfaceComponentProps
 * @typedef {import('./core/types/index.js').ExternalSurfaceRenderContext} ExternalSurfaceRenderContext
 * @typedef {import('./core/types/index.js').SurfacesModuleConfig} SurfacesModuleConfig
 * @typedef {import('./core/types/index.js').SurfaceMode} SurfaceMode
 * @typedef {import('./core/types/index.js').SurfaceFloatingPlacement} SurfaceFloatingPlacement
 * @typedef {import('./core/types/index.js').ResolvedPasswordPromptTexts} ResolvedPasswordPromptTexts
 * @typedef {import('./core/types/index.js').PasswordPromptAttemptResult} PasswordPromptAttemptResult
 * @typedef {import('./core/types/index.js').PasswordPromptHandle} PasswordPromptHandle
 * @typedef {import('./core/types/index.js').PasswordPromptContext} PasswordPromptContext
 * @typedef {import('./core/types/index.js').PasswordPromptRenderContext} PasswordPromptRenderContext
 * @typedef {import('./core/types/index.js').PasswordPromptResolution} PasswordPromptResolution
 * @typedef {import('./core/types/index.js').PasswordPromptConfig} PasswordPromptConfig
 * @typedef {import('./core/types/index.js').DocRange} DocRange
 * @typedef {import('./core/types/index.js').SearchMatch} SearchMatch
 * @typedef {import('./core/types/index.js').ResolvedFindReplaceTexts} ResolvedFindReplaceTexts
 * @typedef {import('./core/types/index.js').FindReplaceHandle} FindReplaceHandle
 * @typedef {import('./core/types/index.js').FindReplaceContext} FindReplaceContext
 * @typedef {import('./core/types/index.js').FindReplaceRenderContext} FindReplaceRenderContext
 * @typedef {import('./core/types/index.js').FindReplaceResolution} FindReplaceResolution
 * @typedef {import('./core/types/index.js').FindReplaceConfig} FindReplaceConfig
 * @typedef {import('./core/types/index.js').TrackChangesModuleConfig} TrackChangesModuleConfig
 * @typedef {import('./core/types/index.js').ViewingVisibilityConfig} ViewingVisibilityConfig
 * @typedef {import('./core/types/index.js').SuperDocLayoutEngineOptions} SuperDocLayoutEngineOptions
 * @typedef {import('./core/types/index.js').EditorSurface} EditorSurface
 * @typedef {import('./core/types/index.js').EditorUpdateEvent} EditorUpdateEvent
 * @typedef {import('./core/types/index.js').EditorTransactionEvent} EditorTransactionEvent
 * @typedef {import('./core/types/index.js').ExportType} ExportType
 * @typedef {import('./core/types/index.js').CommentsType} CommentsType
 * @typedef {import('./core/types/index.js').ExportParams} ExportParams
 * @typedef {import('./core/types/index.js').SuperDocTelemetryConfig} SuperDocTelemetryConfig
 */

// Public exports
export { SuperDoc } from './core/SuperDoc.js';
export { createTheme, buildTheme } from './core/theme/create-theme.ts';
export {
  BlankDOCX,
  getFileObject,
  compareVersions,
  Editor,
  PresentationEditor,
  getStarterExtensions,
  getRichTextExtensions,
  getSchemaIntrospection,

  // Allowed types
  DOCX,
  PDF,
  HTML,

  // Helpers
  superEditorHelpers,
  fieldAnnotationHelpers,
  trackChangesHelpers,
  AnnotatorHelpers,
  SectionHelpers,

  // Super Editor
  SuperConverter,
  createZip,

  // Custom extensions
  Extensions,
  /** @internal */
  registeredHandlers,

  // Additional classes
  DocxZipper,
  SuperToolbar,

  // Helper functions
  getMarksFromSelection,
  getActiveFormatting,
  getAllowedImageDimensions,

  // Type guards and extension helpers
  isNodeType,
  assertNodeType,
  isMarkType,
  defineNode,
  defineMark,

  // Plugin keys
  TrackChangesBasePluginKey,
  CommentsPluginKey,

  // Vue components
  SuperEditor,
  SuperInput,
  BasicUpload,
  Toolbar,
  AIWriter,
  ContextMenu,
  SlashMenu,
};
