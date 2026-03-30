//@ts-check
import { DOMParser } from 'prosemirror-model';
import { createDocFromHTML } from './importHtml.js';
import { createDocFromMarkdown } from './importMarkdown.js';
import { wrapTextsInRuns } from '../inputRules/docx-paste/docx-paste.js';

/**
 * @typedef {import('./catchAllSchema.js').UnsupportedContentItem} UnsupportedContentItem
 */

/**
 * Unified content processor that handles all content types.
 *
 * This function validates inputs and converts various content formats
 * (HTML, Markdown, plain text, ProseMirror JSON) into ProseMirror documents.
 *
 * @param {Object} params - Processing parameters
 * @param {string} params.content - The content to process (required, must not be null/undefined)
 * @param {string} params.type - Content type: 'html', 'markdown', 'text', or 'schema'
 * @param {Object} params.editor - The editor instance (required, must have schema)
 * @param {((items: UnsupportedContentItem[]) => void) | null} [params.onUnsupportedContent] - Callback invoked with unsupported items
 * @param {boolean} [params.warnOnUnsupportedContent] - When true and no callback is provided, emits console.warn
 * @returns {Object} Processed ProseMirror document node
 * @throws {Error} If editor is missing or invalid
 * @throws {Error} If content is null/undefined
 * @throws {Error} If DOM is required but not available (for HTML/markdown/text types)
 * @throws {Error} If content type is unknown
 */
export function processContent({ content, type, editor, onUnsupportedContent, warnOnUnsupportedContent }) {
  // Validate editor instance
  if (!editor) {
    throw new Error('[processContent] Editor instance is required');
  }

  if (!editor.schema) {
    throw new Error('[processContent] Editor schema is not initialized');
  }

  // Validate content
  if (content === null || content === undefined) {
    throw new Error('[processContent] Content is required and cannot be null or undefined');
  }

  const domDocument =
    editor?.options?.document ?? editor?.options?.mockDocument ?? (typeof document !== 'undefined' ? document : null);

  let doc;

  switch (type) {
    case 'html':
      // Validate DOM availability for HTML processing
      if (!domDocument) {
        throw new Error(
          '[processContent] HTML processing requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
        );
      }
      doc = createDocFromHTML(content, editor, {
        isImport: true,
        document: domDocument,
        onUnsupportedContent,
        warnOnUnsupportedContent,
      });
      break;

    case 'markdown':
      // Validate DOM availability for Markdown processing
      if (!domDocument) {
        throw new Error(
          '[processContent] Markdown processing requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
        );
      }
      doc = createDocFromMarkdown(content, editor, {
        isImport: true,
        document: domDocument,
        onUnsupportedContent,
        warnOnUnsupportedContent,
      });
      break;

    case 'text':
      // Validate DOM availability for text processing
      if (!domDocument) {
        throw new Error(
          '[processContent] Text processing requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
        );
      }

      const wrapper = domDocument.createElement('div');
      wrapper.dataset.superdocImport = 'true';
      const para = domDocument.createElement('p');
      para.textContent = content;
      wrapper.appendChild(para);
      doc = DOMParser.fromSchema(editor.schema).parse(wrapper);
      doc = wrapTextsInRuns(doc);
      break;

    case 'schema':
      // Schema processing doesn't require DOM
      doc = editor.schema.nodeFromJSON(content);
      doc = wrapTextsInRuns(doc);
      break;

    default:
      throw new Error(
        `[processContent] Unknown content type: ${type}. Expected 'html', 'markdown', 'text', or 'schema'.`,
      );
  }

  return doc;
}
