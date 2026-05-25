import { getAllHeaderFooterEditors } from '@core/helpers/annotator.js';
import { getAllFieldAnnotations } from './index.js';

/**
 * Get all field annotations across every header / footer sub-editor.
 *
 * @param {import('./types.js').Editor} editor - The main editor whose
 *   registered headers / footers are walked.
 * @returns {import('./types.js').FieldAnnotationEntry[]} `{ node, pos }`
 *   per annotation, flattened across all sub-editors.
 */
export const getHeaderFooterAnnotations = (editor) => {
  const editors = getAllHeaderFooterEditors(editor);

  const allAnnotations = [];
  editors.forEach(({ editor }) => {
    const annotations = getAllFieldAnnotations(editor.state);
    allAnnotations.push(...annotations);
  });
  return allAnnotations;
};
