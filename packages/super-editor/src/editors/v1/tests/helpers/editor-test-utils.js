import { initTestEditor } from './helpers.js';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';

/**
 * Create a test editor with custom extensions and options
 * @param {Object} options - Editor configuration options
 * @param {Array} options.extensions - Array of extensions to include
 * @param {Object} options.content - Initial content for the editor
 * @param {Object} options.editorOptions - Additional editor options
 * @returns {Editor} Configured test editor instance
 */
export const createTestEditor = (options = {}) => {
  const { extensions = getStarterExtensions(), content = null, editorOptions = {} } = options;

  const { editor } = initTestEditor({
    extensions,
    content,
    ...editorOptions,
  });

  return editor;
};

/**
 * Create a minimal test editor with only specified extensions
 * @param {Array} extensions - Extensions to include
 * @param {Object} options - Additional options
 * @returns {Editor} Test editor instance
 */
export const createMinimalTestEditor = (extensions = [], options = {}) => {
  return new Editor({
    mode: 'text',
    documentId: 'test-minimal',
    isHeadless: false,
    extensions,
    ...options,
  });
};

/**
 * Create a test editor with docx mode and full extensions
 * @param {Object} options - Editor options
 * @returns {Editor} Test editor instance
 */
export const createDocxTestEditor = (options = {}) => {
  return createTestEditor({
    editorOptions: {
      mode: 'docx',
      ...options,
    },
  });
};

/**
 * Helper to get node from editor state by type and position
 * @param {Editor} editor - Editor instance
 * @param {string} nodeType - Node type name
 * @param {number} pos - Position in document (default: 0 for first occurrence)
 * @returns {Node|null} Found node or null
 */
export const getNodeFromEditor = (editor, nodeType, pos = 0) => {
  let foundNode = null;
  let currentPos = 0;

  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === nodeType) {
      if (currentPos === pos) {
        foundNode = { node, pos: nodePos };
        return false; // Stop traversal
      }
      currentPos++;
    }
  });

  return foundNode;
};

/**
 * Helper to simulate user input in test editor
 * @param {Editor} editor - Editor instance
 * @param {string} text - Text to insert
 * @param {number} pos - Position to insert at (default: end of document)
 */
export const insertText = (editor, text, pos = null) => {
  const insertPos = pos !== null ? pos : editor.state.doc.content.size;
  const tr = editor.state.tr.insertText(text, insertPos);
  editor.dispatch(tr);
};

/**
 * Helper to create a transaction for testing
 * @param {Editor} editor - Editor instance
 * @returns {Transaction} New transaction
 */
export const createTransaction = (editor) => {
  return editor.state.tr;
};

/**
 * Helper to apply a transaction to test editor
 * @param {Editor} editor - Editor instance
 * @param {Transaction} tr - Transaction to apply
 */
export const applyTransaction = (editor, tr) => {
  editor.dispatch(tr);
};

/**
 * Helper to get editor JSON content for testing
 * @param {Editor} editor - Editor instance
 * @returns {Object} JSON representation of document
 */
export const getEditorJSON = (editor) => {
  return editor.getJSON();
};

/**
 * Helper to set editor content from JSON
 * @param {Editor} editor - Editor instance
 * @param {Object} content - JSON content to set
 */
export const setEditorContent = (editor, content) => {
  editor.commands.setContent(content);
};
