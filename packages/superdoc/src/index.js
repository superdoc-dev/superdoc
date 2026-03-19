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
} from '@superdoc/super-editor';
import { DOCX, PDF, HTML, getFileObject, compareVersions } from '@superdoc/common';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';
import { getSchemaIntrospection } from './helpers/schema-introspection.js';

// ============================================
// TYPE RE-EXPORTS
// These types are defined in @superdoc/super-editor and re-exported for consumers
// ============================================

/**
 * @typedef {import('@superdoc/super-editor').EditorState} EditorState
 * @typedef {import('@superdoc/super-editor').Transaction} Transaction
 * @typedef {import('@superdoc/super-editor').Schema} Schema
 * @typedef {import('@superdoc/super-editor').EditorView} EditorView
 * @typedef {import('@superdoc/super-editor').EditorCommands} EditorCommands
 * @typedef {import('@superdoc/super-editor').ChainedCommand} ChainedCommand
 * @typedef {import('@superdoc/super-editor').ChainableCommandObject} ChainableCommandObject
 * @typedef {import('@superdoc/super-editor').PresentationEditorOptions} PresentationEditorOptions
 * @typedef {import('@superdoc/super-editor').LayoutEngineOptions} LayoutEngineOptions
 * @typedef {import('@superdoc/super-editor').PageSize} PageSize
 * @typedef {import('@superdoc/super-editor').PageMargins} PageMargins
 * @typedef {import('@superdoc/super-editor').Layout} Layout
 * @typedef {import('@superdoc/super-editor').LayoutPage} LayoutPage
 * @typedef {import('@superdoc/super-editor').LayoutFragment} LayoutFragment
 * @typedef {import('@superdoc/super-editor').RangeRect} RangeRect
 * @typedef {import('@superdoc/super-editor').BoundingRect} BoundingRect
 * @typedef {import('@superdoc/super-editor').OpenOptions} OpenOptions
 * @typedef {import('@superdoc/super-editor').DocxFileEntry} DocxFileEntry
 * @typedef {import('@superdoc/super-editor').Comment} Comment
 * @typedef {import('@superdoc/super-editor').CommentElement} CommentElement
 * @typedef {import('@superdoc/super-editor').CommentsLoadedEventData} CommentsLoadedEventData
 * @typedef {import('@superdoc/super-editor').FontConfig} FontConfig
 * @typedef {import('@superdoc/super-editor').FontSupportInfo} FontSupportInfo
 */

// Public exports
export { SuperDoc } from './core/SuperDoc.js';
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
};
