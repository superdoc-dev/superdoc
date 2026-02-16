import { Plugin, PluginKey } from 'prosemirror-state';
import { Fragment, DOMParser as PMDOMParser, Slice } from 'prosemirror-model';
import { CommandService } from './CommandService.js';
import { chainableEditorState } from './helpers/chainableEditorState.js';
import { getHTMLFromFragment } from './helpers/getHTMLFromFragment.js';
import { warnNoDOM } from './helpers/domWarnings.js';
import { getTextContentFromNodes } from './helpers/getTextContentFromNodes.js';
import { isRegExp } from './utilities/isRegExp.js';
import { handleDocxPaste, wrapTextsInRuns } from './inputRules/docx-paste/docx-paste.js';
import { flattenListsInHtml } from './inputRules/html/html-helpers.js';
import { handleGoogleDocsHtml } from './inputRules/google-docs-paste/google-docs-paste.js';

export class InputRule {
  match;
  handler;

  constructor(config) {
    this.match = config.match;
    this.handler = config.handler;
  }
}

const inputRuleMatcherHandler = (text, match) => {
  if (isRegExp(match)) {
    return match.exec(text);
  }

  const inputRuleMatch = match(text);

  if (!inputRuleMatch) {
    return null;
  }

  const result = [inputRuleMatch.text];

  result.index = inputRuleMatch.index;
  result.input = text;
  result.data = inputRuleMatch.data;

  if (inputRuleMatch.replaceWith) {
    if (!inputRuleMatch.text.includes(inputRuleMatch.replaceWith)) {
      console.warn('[super-editor warn]: "inputRuleMatch.replaceWith" must be part of "inputRuleMatch.text".');
    }

    result.push(inputRuleMatch.replaceWith);
  }

  return result;
};

const run = (config) => {
  const { editor, from, to, text, rules, plugin } = config;
  const { view } = editor;

  if (view.composing) {
    return false;
  }

  const $from = view.state.doc.resolve(from);

  if (
    $from.parent.type.spec.code ||
    !!($from.nodeBefore || $from.nodeAfter)?.marks.find((mark) => mark.type.spec.code)
  ) {
    return false;
  }

  let matched = false;
  const textBefore = getTextContentFromNodes($from) + text;

  rules.forEach((rule) => {
    if (matched) {
      return;
    }

    const match = inputRuleMatcherHandler(textBefore, rule.match);

    if (!match) {
      return;
    }

    const tr = view.state.tr;
    const state = chainableEditorState(tr, view.state);
    const range = {
      from: from - (match[0].length - text.length),
      to,
    };

    const { commands, chain, can } = new CommandService({
      editor,
      state,
    });

    const handler = rule.handler({
      state,
      range,
      match,
      commands,
      chain,
      can,
    });

    // stop if there are no changes
    if (handler === null || !tr.steps.length) {
      return;
    }

    // store transform as metadata
    // so we can undo input rules within the `undoInputRules` command
    tr.setMeta(plugin, {
      transform: tr,
      from,
      to,
      text,
    });

    view.dispatch(tr);
    matched = true;
  });

  return matched;
};

/**
 * Create an input rules plugin. When enabled, it will cause text
 * input that matches any of the given rules to trigger the rule’s
 * action.
 */
export const inputRulesPlugin = ({ editor, rules }) => {
  const plugin = new Plugin({
    key: new PluginKey('inputRulesPlugin'),

    state: {
      init() {
        return null;
      },

      apply(tr, prev, state) {
        const stored = tr.getMeta(plugin);

        if (stored) {
          return stored;
        }

        // if InputRule is triggered by insertContent()
        const simulatedInputMeta = tr.getMeta('applyInputRules');
        const isSimulatedInput = !!simulatedInputMeta;

        if (isSimulatedInput) {
          setTimeout(() => {
            let { text } = simulatedInputMeta;

            if (typeof text !== 'string') {
              const domDocument =
                editor?.options?.document ??
                editor?.options?.mockDocument ??
                (typeof document !== 'undefined' ? document : null);

              if (!domDocument) {
                warnNoDOM('HTML conversion for input rules');
                return;
              }

              text = getHTMLFromFragment(Fragment.from(text), state.schema, domDocument);
            }

            const { from } = simulatedInputMeta;
            const to = from + text.length;

            run({
              editor,
              from,
              to,
              text,
              rules,
              plugin,
            });
          });
        }

        return tr.selectionSet || tr.docChanged ? null : prev;
      },
    },

    props: {
      handleTextInput(view, from, to, text) {
        return run({
          editor,
          from,
          to,
          text,
          rules,
          plugin,
        });
      },

      // add support for input rules to trigger on enter
      // this is useful for example for code blocks
      handleKeyDown(view, event) {
        if (event.key !== 'Enter') {
          return false;
        }

        const { $cursor } = view.state.selection;

        if ($cursor) {
          return run({
            editor,
            from: $cursor.pos,
            to: $cursor.pos,
            text: '\n',
            rules,
            plugin,
          });
        }

        return false;
      },

      // Paste handler
      handlePaste(view, event, slice) {
        const clipboard = event.clipboardData;
        const html = clipboard.getData('text/html');

        // Allow specialised plugins (e.g., field-annotation) first shot.
        const fieldAnnotationContent = slice.content.content.filter((item) => item.type.name === 'fieldAnnotation');
        if (fieldAnnotationContent.length) {
          return false;
        }

        const result = handleClipboardPaste({ editor, view }, html);
        return result;
      },
    },

    isInputRules: true,
  });
  return plugin;
};

export function isWordHtml(html) {
  return /class=["']?Mso|xmlns:o=["']?urn:schemas-microsoft-com|<!--\[if gte mso|<meta[^>]+name=["']?Generator["']?[^>]+Word/i.test(
    html,
  );
}

function isGoogleDocsHtml(html) {
  return /docs-internal-guid-/.test(html);
}

/**
 * Finds the first paragraph ancestor of a resolved position.
 *
 * @param {ResolvedPos} $from The resolved position to search from.
 * @returns {{ node: Node | null, depth: number }} The paragraph node and its depth, or null if not found.
 */
function findParagraphAncestor($from) {
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph') {
      return { node, depth: d };
    }
  }
  return { node: null, depth: -1 };
}

/**
 * Handle HTML paste events.
 *
 * @param {String} html The HTML string to be pasted.
 * @param {Editor} editor The editor instance.
 * @param {String} source HTML content source
 * @returns {Boolean} Returns true if the paste was handled.
 */
export function handleHtmlPaste(html, editor, source) {
  let cleanedHtml;
  if (source === 'google-docs') cleanedHtml = handleGoogleDocsHtml(html, editor);
  else cleanedHtml = htmlHandler(html, editor);

  let doc = PMDOMParser.fromSchema(editor.schema).parse(cleanedHtml);

  doc = wrapTextsInRuns(doc);

  const { dispatch, state } = editor.view;
  if (!dispatch) {
    return false;
  }

  // Check if we're pasting into an existing paragraph
  // Need to check ancestors since cursor might be inside a run node within a paragraph
  const { $from } = state.selection;

  // Find if any ancestor is a paragraph
  const { node: paragraphNode } = findParagraphAncestor($from);

  const isInParagraph = paragraphNode !== null;

  // Check if the pasted content is a single paragraph
  const isSingleParagraph = doc.childCount === 1 && doc.firstChild.type.name === 'paragraph';

  if (isInParagraph && isSingleParagraph) {
    // Extract the contents of the paragraph and paste only those
    const paragraphContent = doc.firstChild.content;
    const tr = state.tr.replaceSelectionWith(paragraphContent, false);
    dispatch(tr);
  } else if (isInParagraph) {
    // For multi-paragraph paste, use replaceSelection with a proper Slice
    // This preserves the paragraph structure instead of flattening with \n
    // Create a slice from the doc's content (the paragraphs)
    const slice = new Slice(doc.content, 0, 0);

    const tr = state.tr.replaceSelection(slice);
    dispatch(tr);
  } else {
    // Use the original behavior for other cases
    dispatch(state.tr.replaceSelectionWith(doc, true));
  }

  return true;
}
/**
 * Handle HTML content before it is inserted into the editor.
 * This function is used to clean and sanitize HTML content,
 * converting em units to pt and removing unnecessary tags.
 * @param {String} html The HTML string to be processed.
 * @param {Editor} editor The editor instance.
 * @returns {DocumentFragment} The processed HTML string.
 */
export function htmlHandler(html, editor, domDocument) {
  const resolvedDocument =
    domDocument ??
    editor?.options?.document ??
    editor?.options?.mockDocument ??
    (typeof document !== 'undefined' ? document : null);

  const flatHtml = flattenListsInHtml(html, editor, resolvedDocument);
  const htmlWithPtSizing = convertEmToPt(flatHtml);
  return sanitizeHtml(htmlWithPtSizing, undefined, resolvedDocument);
}

/**
 * Process the HTML string to convert em units to pt units in font-size
 *
 * @param {String} html The HTML string to be processed.
 * @returns {String} The processed HTML string with em units converted to pt units.
 */
export const convertEmToPt = (html) => {
  return html.replace(/font-size\s*:\s*([\d.]+)em/gi, (_, emValue) => {
    const em = parseFloat(emValue);
    const pt = Math.round(em * 12 * 100) / 100; // e.g. 1.5×12 = 18.00
    return `font-size: ${pt}pt`;
  });
};

/**
 *  Cleans and sanitizes HTML content by removing unnecessary tags, entities, and extra whitespace.
 *
 * @param {String} html The HTML string to be processed.
 * @returns {String} The processed HTML string with em units converted to pt units.
 */
export function cleanHtmlUnnecessaryTags(html) {
  return html
    .replace(/<o:p>.*?<\/o:p>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<span[^>]*>\s*<\/span>/gi, '')
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .trim();
}

/**
 * Recursive function to sanitize HTML and remove forbidden tags.
 * @param {string} html The HTML string to be sanitized.
 * @param {string[]} forbiddenTags The list of forbidden tags to remove from the HTML.
 * @returns {DocumentFragment} The sanitized HTML as a DocumentFragment.
 */
export function sanitizeHtml(html, forbiddenTags = ['meta', 'svg', 'script', 'style', 'button'], domDocument) {
  const resolvedDocument = domDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!resolvedDocument) {
    console.warn(
      '[super-editor] HTML sanitization requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment. Skipping sanitization.',
    );
    return null;
  }

  const container = resolvedDocument.createElement('div');
  container.innerHTML = html;

  const walkAndClean = (node) => {
    for (const child of [...node.children]) {
      if (forbiddenTags.includes(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }

      // Internal/runtime-only attributes must not be preserved across paste.
      if (child.hasAttribute('linebreaktype')) {
        child.removeAttribute('linebreaktype');
      }
      if (child.hasAttribute('data-sd-block-id')) {
        child.removeAttribute('data-sd-block-id');
      }

      walkAndClean(child);
    }
  };

  walkAndClean(container);
  return container;
}

/**
 * Reusable paste-handling utility that replicates the logic formerly held only
 * inside the `inputRulesPlugin` paste handler. This allows other components
 * (e.g. slash-menu items) to invoke the same paste logic without duplicating
 * code.
 *
 * @param {Object}   params
 * @param {Editor}   params.editor  The SuperEditor instance.
 * @param {View}     params.view    The ProseMirror view associated with the editor.
 * @param {String}   html           HTML clipboard content (may be empty).
 * @returns {Boolean}               Whether the paste was handled.
 */
export function handleClipboardPaste({ editor, view }, html) {
  let source;

  if (!html) {
    source = 'plain-text';
  } else if (isWordHtml(html)) {
    source = 'word-html';
  } else if (isGoogleDocsHtml(html)) {
    source = 'google-docs';
  } else {
    source = 'browser-html';
  }

  switch (source) {
    case 'plain-text':
      // Let native/plain text paste fall through so ProseMirror handles it.
      // Will hit the Fallback when boolean is returned false
      return false;
    case 'word-html':
      if (editor.options.mode === 'docx') {
        return handleDocxPaste(html, editor, view);
      }
      break;
    case 'google-docs':
      return handleGoogleDocsHtml(html, editor, view);
    // falls through to browser-html handling when not in DOCX mode
    case 'browser-html':
      return handleHtmlPaste(html, editor);
  }

  return false;
}
