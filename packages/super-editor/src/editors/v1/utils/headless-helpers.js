/**
 * Check if editor is in headless mode.
 * This is used to allow for the future movement of the headless mode config,
 * can update once here and fixed in all locations in the applicaiton.
 * @param {import('../core/Editor.js').Editor} editor - The editor instance.
 * @returns {boolean} - Whether the editor is in headless mode.
 */
export const isHeadless = (editor) => {
  return editor?.options?.isHeadless ?? false;
};

/**
 * Determine if the node view should be skipped in headless mode.
 * @param {import('../core/Editor.js').Editor} editor - The editor instance.
 * @returns {boolean} - Whether the node view should be skipped.
 */
export const shouldSkipNodeView = (editor) => {
  return isHeadless(editor);
};
