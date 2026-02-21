//@ts-check
import { processContent } from '../helpers/contentProcessor.js';

/**
 * Command to insert content at the current selection or replace the current selection.
 * If contentType is specified in options, it will use the unified content processor to handle
 * 'html', 'markdown', 'text', or 'schema' content types. Otherwise, it will use the original
 * behavior for backward compatibility.
 *
 * @param {string|Object} value - The content to insert. Can be a string (for text/html/markdown)
 *                                or a ProseMirror JSON object (for schema).
 * @param {Object} [options={}] - Options for insertion.
 * @param {string} [options.contentType] - The type of content being inserted: 'html', 'markdown', 'text', or 'schema'.
 * @param {boolean} [options.parseOptions] - Additional options for parsing (if applicable).
 * @param {((items: Array<{tagName: string, outerHTML: string, count: number}>) => void) | null} [options.onUnsupportedContent] - Callback for unsupported HTML elements. Falls back to editor.options.onUnsupportedContent.
 * @param {boolean} [options.warnOnUnsupportedContent] - When true, emits console.warn for unsupported content. Falls back to editor.options.warnOnUnsupportedContent.
 * @returns {function} A command function that can be executed by the editor.
 */
export const insertContent =
  (value, options = {}) =>
  ({ tr, commands, editor }) => {
    // If contentType is specified, use the new processor
    if (options.contentType) {
      const validTypes = ['html', 'markdown', 'text', 'schema'];
      if (!validTypes.includes(options.contentType)) {
        console.error(`[insertContent] Invalid contentType: "${options.contentType}". Use: ${validTypes.join(', ')}`);
        return false;
      }

      try {
        const processedDoc = processContent({
          content: value,
          type: options.contentType,
          editor,
          onUnsupportedContent: options.onUnsupportedContent ?? editor.options?.onUnsupportedContent,
          warnOnUnsupportedContent: options.warnOnUnsupportedContent ?? editor.options?.warnOnUnsupportedContent,
        });

        const jsonContent = processedDoc.toJSON();
        const ok = commands.insertContentAt({ from: tr.selection.from, to: tr.selection.to }, jsonContent, options);

        // Schedule list migration right after the insert transaction dispatches
        if (ok && (options.contentType === 'html' || options.contentType === 'markdown')) {
          Promise.resolve().then(() => editor.migrateListsToV2?.());
        }

        return ok;
      } catch (error) {
        console.error(`[insertContent] Failed to process ${options.contentType}:`, error);
        return false;
      }
    }

    // Otherwise use the original behavior for backward compatibility
    return commands.insertContentAt({ from: tr.selection.from, to: tr.selection.to }, value, options);
  };
