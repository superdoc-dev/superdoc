import {
  checkAndProcessImage,
  replaceSelectionWithImagePlaceholder,
  uploadAndInsertImage,
} from './startImageUpload.js';

/**
 * @typedef {'success' | 'skipped'} ProcessAndInsertResult
 */

/**
 * Processes a single image file and inserts it into the editor.
 *
 * Encapsulates the full 3-step image insertion pipeline:
 * 1. Validate and resize the file
 * 2. Insert a placeholder at the current selection
 * 3. Upload and swap the placeholder for the final image node
 *
 * Throws on failure — callers are responsible for error handling.
 *
 * @param {object} params
 * @param {File} params.file - The image file to process and insert.
 * @param {object} params.editor - The ProseMirror editor instance.
 * @param {object} params.view - The ProseMirror editor view.
 * @param {object} params.editorOptions - Editor options (for header/footer selection handling).
 * @param {() => { width?: number; height?: number }} params.getMaxContentSize - Returns max content dimensions.
 * @returns {Promise<'success' | 'skipped'>}
 */
export async function processAndInsertImageFile({ file, editor, view, editorOptions, getMaxContentSize }) {
  const { size, file: processedFile } = await checkAndProcessImage({ file, getMaxContentSize });

  if (!processedFile) {
    return 'skipped';
  }

  const id = {};

  replaceSelectionWithImagePlaceholder({ view, editorOptions, id });

  await uploadAndInsertImage({ editor, view, file: processedFile, size, id });

  return 'success';
}
