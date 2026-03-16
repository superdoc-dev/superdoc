import { decodeRPrFromMarks } from '@converter/styles.js';

/**
 * Finds the paragraph node and its position for a given resolved position.
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @returns {{ node: import('prosemirror-model').Node, pos: number } | null}
 */
function findParagraph($pos) {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      return { node, pos: $pos.before(depth) };
    }
  }
  return null;
}

/**
 * When the cursor is inside an empty paragraph, update
 * `paragraphProperties.runProperties` to match the current storedMarks
 * on the transaction.
 *
 * This keeps the paragraph's persisted run properties in sync with
 * what the user toggled via the toolbar, so that both the toolbar
 * (via getActiveFormatting) and wrapTextInRunsPlugin read the
 * correct formatting state.
 *
 * @param {import('prosemirror-state').Transaction} tr
 */
export function syncParagraphRunProperties(tr) {
  const { selection } = tr;
  if (!selection.empty) return;

  const $head = selection.$head;
  const result = findParagraph($head);
  if (!result) return;

  const { node: paragraph, pos: paragraphPos } = result;

  // Only act on empty paragraphs (no text content)
  if (paragraph.content.size > 0) return;

  const storedMarks = tr.storedMarks;
  const newRunProperties = storedMarks && storedMarks.length > 0 ? decodeRPrFromMarks(storedMarks) : null;

  const currentParagraphProperties = paragraph.attrs.paragraphProperties;

  tr.setNodeMarkup(paragraphPos, undefined, {
    ...paragraph.attrs,
    paragraphProperties: {
      ...(currentParagraphProperties || {}),
      runProperties: newRunProperties,
    },
  });
}
