import { createNodeFromContent } from '../helpers/createNodeFromContent';
import { selectionToInsertionEnd } from '../helpers/selectionToInsertionEnd';

/**
 * @typedef {import("prosemirror-model").Node} ProseMirrorNode
 * @typedef {import("prosemirror-model").Fragment} ProseMirrorFragment
 */

/**
 * Checks if the given node or fragment is a ProseMirror Fragment.
 * @param {ProseMirrorNode|ProseMirrorFragment} nodeOrFragment
 * @returns {boolean}
 */
const isFragment = (nodeOrFragment) => {
  return !('type' in nodeOrFragment);
};

/**
 * Checks if a string looks like it contains HTML tags.
 * Matches complete tag pairs (e.g., <div>...</div>) or self-closing tags (e.g., <br/>, <img ...>).
 * @param {string} str
 * @returns {boolean}
 */
const looksLikeHTML = (str) =>
  /^\s*<[a-zA-Z][^>]*>.*<\/[a-zA-Z][^>]*>\s*$/s.test(str) || // Complete tag pair
  /^\s*<[a-zA-Z][^>]*\/>\s*$/.test(str) || // Self-closing tag
  /^\s*<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)\b[^>]*>\s*$/i.test(str); // Void elements

/**
 * Inserts content at the specified position.
 * - Bare strings with newlines → insertText (keeps literal \n)
 * - HTML-looking strings → parse and replaceWith
 * - Arrays of strings / {text} objects → insertText
 *
 * @param {import("prosemirror-model").ResolvedPos|number|{from:number,to:number}} position
 * @param {string|Array<string|{text?:string}>|ProseMirrorNode|ProseMirrorFragment} value
 * @param {Object} options
 * @param {boolean} [options.asText=false] - Force literal text insertion, bypassing HTML parsing
 * @param {boolean} [options.updateSelection=true] - Move cursor to end of inserted content
 * @param {boolean} [options.applyInputRules=false] - Trigger input rules after insertion
 * @param {boolean} [options.applyPasteRules=false] - Trigger paste rules after insertion
 * @param {Object} [options.parseOptions] - ProseMirror DOMParser options
 * @returns {boolean}
 */

// prettier-ignore
export const insertContentAt =
  (position, value, options) =>
  ({ tr, dispatch, editor }) => {
    if (!dispatch) return true;

    options = {
      parseOptions: {},
      updateSelection: true,
      applyInputRules: false,
      applyPasteRules: false,
      // optional escape hatch to force literal text insertion
      asText: false,
      ...options,
    };

    let { from, to } =
      typeof position === 'number'
        ? { from: position, to: position }
        : { from: position.from, to: position.to };

    // ─────────────────────────────────────────────────────────────────────────
    // FAST PATH: Plain text insertion (no HTML processing, no DOM required)
    // ─────────────────────────────────────────────────────────────────────────
    const isBareString = typeof value === 'string';
    const isArrayOfText = Array.isArray(value) && value.every((v) => typeof v === 'string' || (v && typeof v.text === 'string'));
    const isTextObject = !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.text === 'string';

    // Determine if we should use plain text insertion (skip HTML processing entirely)
    const usePlainTextPath =
      options.asText ||
      isArrayOfText ||
      isTextObject ||
      (isBareString && !looksLikeHTML(value));

    if (usePlainTextPath) {
      let textContent;
      if (isArrayOfText) {
        textContent = value.map((v) => (typeof v === 'string' ? v : (v && v.text) || '')).join('');
      } else if (isTextObject) {
        textContent = value.text;
      } else {
        textContent = typeof value === 'string' ? value : '';
      }

      tr.insertText(textContent, from, to);

      if (options.updateSelection) {
        selectionToInsertionEnd(tr, tr.steps.length - 1, -1);
      }

      if (options.applyInputRules) {
        tr.setMeta('applyInputRules', { from, text: textContent });
      }

      if (options.applyPasteRules) {
        tr.setMeta('applyPasteRules', { from, text: textContent });
      }

      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML PATH: Parse as HTML content (requires DOM for full list processing)
    // ─────────────────────────────────────────────────────────────────────────
    let content;

    try {
      content = createNodeFromContent(value, editor, {
        parseOptions: {
          preserveWhitespace: 'full',
          ...options.parseOptions,
        },
        errorOnInvalidContent: options.errorOnInvalidContent ?? editor.options.enableContentCheck,
      });
    } catch (e) {
      editor.emit('contentError', {
        editor,
        error: e,
        disableCollaboration: () => {
          console.error('[super-editor error]: Unable to disable collaboration at this point in time');
        },
      });
      return false;
    }

    // If HTML parsing failed (returned null), skip insertion entirely
    if (content === null) {
      // HTML parsing failed (no DOM available) - already warned in createNodeFromContent
      return false;
    }

    // Inspect parsed nodes to decide text vs block replacement
    let isOnlyTextContent = true;
    let isOnlyBlockContent = true;
    const nodes = isFragment(content) ? content : [content];

    nodes.forEach((node) => {
      // validate node
      node.check();

      // only-plain-text if every node is an unmarked text node
      isOnlyTextContent = isOnlyTextContent ? (node.isText && node.marks.length === 0) : false;

      isOnlyBlockContent = isOnlyBlockContent ? node.isBlock : false;
    });

    // Replace empty textblock wrapper when inserting blocks at a cursor
    if (from === to && isOnlyBlockContent) {
      const { parent } = tr.doc.resolve(from);
      const isEmptyTextBlock = parent.isTextblock && !parent.type.spec.code && !parent.childCount;

      if (isEmptyTextBlock) {
        from -= 1;
        to += 1;
      }
    }

    let newContent;

    // Use insertText for pure text content parsed from HTML
    if (isOnlyTextContent) {
      newContent = typeof value === 'string' ? value : '';
      tr.insertText(newContent, from, to);
    } else {
      newContent = content;
      tr.replaceWith(from, to, newContent);
    }

    // set cursor at end of inserted content
    if (options.updateSelection) {
      selectionToInsertionEnd(tr, tr.steps.length - 1, -1);
    }

    if (options.applyInputRules) {
      tr.setMeta('applyInputRules', { from, text: newContent });
    }

    if (options.applyPasteRules) {
      tr.setMeta('applyPasteRules', { from, text: newContent });
    }

    return true;
  };
