import { beforeEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import { initTestEditor } from '@tests/helpers/helpers.js';

import {
  getAdjacentTableEntrySelection,
  getTableBoundaryExitSelection,
  isAtEffectiveParagraphEnd,
  isAtEffectiveParagraphStart,
} from './tableBoundaryNavigation.js';

const DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'This is some text before the table' }] }],
    },
    {
      type: 'table',
      attrs: {
        tableProperties: {},
        grid: [{ col: 1500 }, { col: 1500 }, { col: 1500 }],
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Here' }] }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Is' }] }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'a' }] }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'table' }] }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'for' }] }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Testing' }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'This is more text after the table' }] }],
    },
  ],
};

function findTextPos(doc, search) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (!node.isText || !node.text) return true;
    const hit = node.text.indexOf(search);
    if (hit !== -1) {
      found = pos + hit;
      return false;
    }
    return true;
  });
  if (found == null) {
    throw new Error(`Unable to find text "${search}"`);
  }
  return found;
}

describe('tableBoundaryNavigation', () => {
  let editor;
  let doc;
  let beforePos;
  let herePos;
  let isPos;
  let testingPos;
  let afterPos;

  beforeEach(() => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: DOC }));
    doc = editor.state.doc;
    beforePos = findTextPos(doc, 'This is some text before the table');
    herePos = findTextPos(doc, 'Here');
    isPos = findTextPos(doc, 'Is');
    testingPos = findTextPos(doc, 'Testing');
    afterPos = findTextPos(doc, 'This is more text after the table');
  });

  it('treats the end of the last run in a paragraph as the effective paragraph end', () => {
    const endOfTesting = testingPos + 'Testing'.length;
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, endOfTesting)));

    expect(isAtEffectiveParagraphEnd(state.selection.$head)).toBe(true);
  });

  it('treats the start of the first run in a paragraph as the effective paragraph start', () => {
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, herePos)));

    expect(isAtEffectiveParagraphStart(state.selection.$head)).toBe(true);
  });

  it('does not treat an interior run boundary as the effective paragraph end', () => {
    const endOfIs = isPos + 'Is'.length;
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, endOfIs)));

    expect(isAtEffectiveParagraphEnd(state.selection.$head)).toBe(true);
    expect(getTableBoundaryExitSelection(state, 1)).toBeNull();
  });

  it('moves right from the end of the last cell to the paragraph after the table', () => {
    const endOfTesting = testingPos + 'Testing'.length;
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, endOfTesting)));

    const nextSelection = getTableBoundaryExitSelection(state, 1);
    expect(nextSelection).not.toBeNull();
    expect(nextSelection.from).toBe(afterPos);
    expect(nextSelection.to).toBe(afterPos);
  });

  it('moves left from the start of the first cell to the paragraph before the table', () => {
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, herePos)));

    const nextSelection = getTableBoundaryExitSelection(state, -1);
    expect(nextSelection).not.toBeNull();
    expect(nextSelection.from).toBe(beforePos + 'This is some text before the table'.length);
    expect(nextSelection.to).toBe(beforePos + 'This is some text before the table'.length);
  });

  it('moves left from the start of the paragraph after the table back into the last table cell', () => {
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, afterPos)));

    const nextSelection = getAdjacentTableEntrySelection(state, -1);
    expect(nextSelection).not.toBeNull();
    expect(nextSelection.from).toBe(testingPos + 'Testing'.length);
    expect(nextSelection.to).toBe(testingPos + 'Testing'.length);
  });

  it('moves right from the end of the paragraph before the table into the first table cell', () => {
    const endOfBefore = beforePos + 'This is some text before the table'.length;
    const state = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, endOfBefore)));

    const nextSelection = getAdjacentTableEntrySelection(state, 1);
    expect(nextSelection).not.toBeNull();
    expect(nextSelection.from).toBe(herePos);
    expect(nextSelection.to).toBe(herePos);
  });
});
