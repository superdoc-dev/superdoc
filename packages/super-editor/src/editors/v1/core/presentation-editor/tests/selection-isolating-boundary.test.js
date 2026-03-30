/**
 * Tests for selection behavior at isolating node boundaries (tables).
 *
 * When drag-selecting text in a paragraph near a table, the selection head
 * must not resolve inside the table. If it does, ProseMirror-tables'
 * appendTransaction converts the TextSelection into a CellSelection,
 * causing the anchor to jump into the table — visually the selection
 * "flickers" or jumps away from where the user started dragging.
 *
 * These tests verify the behavioral contract:
 * 1. A TextSelection from a paragraph position to inside a table should
 *    be clamped so the head stays outside the table.
 * 2. A TextSelection that spans PAST a table (anchor before, head after)
 *    should be allowed — only heads INSIDE isolating nodes are clamped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TextSelection, Selection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

/**
 * Replicates the clamping logic from EditorInputManager.#clampHeadAtIsolatingBoundary.
 * Extracted here as a pure function for testability.
 */
function clampHeadAtIsolatingBoundary(doc, anchor, head) {
  const forward = head >= anchor;

  try {
    const $head = doc.resolve(head);
    // Find the outermost isolating ancestor
    let isolatingDepth = -1;
    for (let d = $head.depth; d > 0; d--) {
      const node = $head.node(d);
      if (node.type.spec.isolating || node.type.spec.tableRole === 'table') {
        isolatingDepth = d;
      }
    }

    if (isolatingDepth > 0) {
      const boundary = forward ? $head.before(isolatingDepth) : $head.after(isolatingDepth);
      const near = Selection.near(doc.resolve(boundary), forward ? -1 : 1);
      if (near instanceof TextSelection) return near.head;
      return anchor;
    }
  } catch {
    /* position resolution failed */
  }

  return head;
}

// Document structure:
//   doc
//     paragraph "Before the table"       (positions ~1-19)
//     table                              (isolating node)
//       tableRow
//         tableCell
//           paragraph "Cell content"
//         tableCell
//           paragraph "Cell two"
//     paragraph "After the table"        (positions after table end)
const docJson = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'Before the table' }] }],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell content' }] }],
                },
              ],
            },
            {
              type: 'tableCell',
              attrs: { colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell two' }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'After the table' }] }],
    },
  ],
};

describe('selection clamping at isolating boundaries (SD-2024)', () => {
  let editor;
  let doc;
  let tableStart;
  let tableEnd;
  let beforeParaStart;
  let afterParaStart;

  beforeAll(() => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: docJson }));
    doc = editor.state.doc;

    // Find table boundaries
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        tableStart = pos;
        tableEnd = pos + node.nodeSize;
      }
    });

    // First paragraph content starts at pos 1+1 = 2 (doc boundary + paragraph boundary)
    // But we need a text position — let's find it
    doc.descendants((node, pos) => {
      if (beforeParaStart == null && node.isText && node.text.includes('Before')) {
        beforeParaStart = pos;
      }
    });

    // Find text position after table
    let pastTable = false;
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') pastTable = true;
      if (afterParaStart == null && pastTable && node.isText && node.text.includes('After')) {
        afterParaStart = pos;
      }
    });
  });

  afterAll(() => {
    editor.destroy();
  });

  it('document has expected structure: paragraph, table, paragraph', () => {
    const topLevelTypes = [];
    doc.forEach((node) => topLevelTypes.push(node.type.name));
    expect(topLevelTypes).toEqual(['paragraph', 'table', 'paragraph']);
  });

  it('clamps head when it resolves inside a table (forward drag)', () => {
    // Simulate: anchor in first paragraph, head inside a table cell
    const anchor = beforeParaStart + 3; // somewhere in "Before the table"
    const headInsideTable = tableStart + 5; // inside the table

    const clamped = clampHeadAtIsolatingBoundary(doc, anchor, headInsideTable);

    // Clamped head should be outside the table (before it)
    expect(clamped).toBeLessThan(tableStart);
    // Should still be a valid text position
    expect(clamped).toBeGreaterThan(0);
  });

  it('clamps head when it resolves inside a table (backward drag)', () => {
    // Simulate: anchor after table, head inside table (dragging backwards)
    const anchor = afterParaStart + 3;
    const headInsideTable = tableStart + 5;

    const clamped = clampHeadAtIsolatingBoundary(doc, anchor, headInsideTable);

    // Clamped head should be outside the table (after it)
    expect(clamped).toBeGreaterThan(tableEnd - 1);
  });

  it('does NOT clamp head when it is outside the table (after it)', () => {
    // Simulate: anchor in first paragraph, head in paragraph after table
    // This selection spans PAST the table — should be allowed
    const anchor = beforeParaStart + 3;
    const headAfterTable = afterParaStart + 3;

    const clamped = clampHeadAtIsolatingBoundary(doc, anchor, headAfterTable);

    // Head should remain unchanged — it's not inside the table
    expect(clamped).toBe(headAfterTable);
  });

  it('does NOT clamp head when it is in the same paragraph as anchor', () => {
    // Simulate: both anchor and head in the first paragraph
    const anchor = beforeParaStart + 1;
    const head = beforeParaStart + 10;

    const clamped = clampHeadAtIsolatingBoundary(doc, anchor, head);

    // Head should remain unchanged
    expect(clamped).toBe(head);
  });

  it('TextSelection spanning past table includes content after table', () => {
    // Verify that ProseMirror allows a TextSelection from before to after a table
    const anchor = beforeParaStart + 3;
    const head = afterParaStart + 3;

    const sel = TextSelection.create(doc, anchor, head);
    expect(sel.from).toBeLessThan(tableStart);
    expect(sel.to).toBeGreaterThan(tableEnd - 1);
  });
});
