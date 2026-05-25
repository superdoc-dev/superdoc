import { findChildren } from '@core/helpers/findChildren.js';
import { getAllHeaderFooterEditors } from '../../../core/helpers/annotator.js';

/**
 * Find field annotations across all header / footer sub-editors that
 * match the given field ID(s). If the active section editor's
 * `documentId` matches a sub-editor, that sub-editor's live state is
 * used instead of its snapshot state.
 *
 * @param {string | string[]} fieldIdOrArray - Field ID or array of IDs
 *   to match against `node.attrs.fieldId`.
 * @param {import('./types.js').Editor} editor - The main editor whose
 *   registered headers / footers are walked.
 * @param {import('./types.js').Editor} activeSectionEditor - The
 *   currently-focused section sub-editor; its `state` overrides the
 *   snapshot state for a matching `documentId`.
 * @returns {import('./types.js').FieldAnnotationEntry[]} `{ node, pos }`
 *   per match across all header / footer sub-editors.
 */
export function findHeaderFooterAnnotationsByFieldId(fieldIdOrArray, editor, activeSectionEditor) {
  const sectionEditors = getAllHeaderFooterEditors(editor);
  const annotations = [];
  sectionEditors.forEach(({ editor: sectionEditor }) => {
    const state =
      activeSectionEditor.options.documentId === sectionEditor.options.documentId
        ? activeSectionEditor.state
        : sectionEditor.state;
    const fieldAnnotations = findChildren(state.doc, (node) => {
      let isFieldAnnotation = node.type.name === 'fieldAnnotation';
      if (Array.isArray(fieldIdOrArray)) {
        return isFieldAnnotation && fieldIdOrArray.includes(node.attrs.fieldId);
      } else {
        return isFieldAnnotation && node.attrs.fieldId === fieldIdOrArray;
      }
    });
    annotations.push(...fieldAnnotations);
  });

  return annotations;
}
