import {
  SuperConverter,
  Editor,
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

// Main entry point for SuperDoc library
export { SuperDoc } from './core/SuperDoc.js';
export {
  BlankDOCX,
  getFileObject,
  compareVersions,
  Editor,
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
  registeredHandlers,
};
