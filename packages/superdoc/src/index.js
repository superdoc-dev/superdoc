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
// These types are defined in @superdoc/super-editor and re-exported for consumers.
// vite-plugin-dts picks up these JSDoc @typedef imports and generates
// corresponding `export type` declarations in the consumer-facing .d.ts.
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
 * @typedef {import('@superdoc/super-editor').LayoutUpdatePayload} LayoutUpdatePayload
 * @typedef {import('@superdoc/super-editor').CoreCommandMap} CoreCommandMap
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 *
 * @typedef {import('@superdoc/super-editor').ExtensionCommandMap} ExtensionCommandMap
 * @deprecated Editor commands will be removed in a future version. Use the Document API instead.
 * @typedef {import('@superdoc/super-editor').Comment} Comment
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
 * @typedef {import('@superdoc/super-editor').EditorExtension} EditorExtension
 * @typedef {import('@superdoc/super-editor').ViewLayout} ViewLayout
 * @typedef {import('@superdoc/super-editor').ViewOptions} ViewOptions
 * @typedef {import('@superdoc/super-editor').CommentConfig} CommentConfig
 * @typedef {import('@superdoc/super-editor').CollaborationProvider} CollaborationProvider
 * @typedef {import('@superdoc/super-editor').LinkPopoverResolver} LinkPopoverResolver
 * @typedef {import('@superdoc/super-editor').LinkPopoverContext} LinkPopoverContext
 * @typedef {import('@superdoc/super-editor').LinkPopoverResolution} LinkPopoverResolution
 * @typedef {import('@superdoc/super-editor').PermissionParams} PermissionParams
 * @typedef {import('@superdoc/super-editor').FieldValue} FieldValue
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
