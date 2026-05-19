import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import { initTestEditor } from '@tests/helpers/helpers.js';

import {
  getAdjacentTableEntrySelection,
  getTableBoundaryExitSelection,
  isInProtectedTrailingTableParagraph,
  isAtEffectiveParagraphEnd,
  isAtEffectiveParagraphStart,
  createTableBoundaryNavigationPlugin,
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

const RTL_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'This is some text before the table' }] }],
    },
    {
      type: 'table',
      attrs: {
        tableProperties: { rightToLeft: true },
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

const DOC_WITH_PROTECTED_TRAILING_PARAGRAPH = {
  type: 'doc',
  content: [
    {
      type: 'table',
      attrs: {
        tableProperties: {},
        grid: [{ col: 1500 }],
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Cell' }] }] }],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
    },
  ],
};

/**
 * Same table layout as DOC, but the first cell has a leading bookmarkStart
 * and the last cell has a trailing bookmarkEnd. This simulates imported
 * documents where inline atom markers sit at paragraph edges.
 */
const DOC_WITH_INLINE_ATOMS = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'Before' }] }],
    },
    {
      type: 'table',
      attrs: {
        tableProperties: {},
        grid: [{ col: 1500 }],
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'bookmarkStart', attrs: { id: '0', name: 'bm1' } },
                    { type: 'run', content: [{ type: 'text', text: 'First' }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'run', content: [{ type: 'text', text: 'Last' }] },
                    { type: 'bookmarkEnd', attrs: { id: '0' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'After' }] }],
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

  it('does not exit the table from a non-edge cell even when the caret is at paragraph end', () => {
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

  it('detects the protected trailing empty paragraph after a final table', () => {
    const setup = initTestEditor({ loadFromSchema: true, content: DOC_WITH_PROTECTED_TRAILING_PARAGRAPH });
    const protectedDoc = setup.editor.state.doc;
    let trailingParagraphPos = null;
    protectedDoc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '') {
        trailingParagraphPos = pos;
        return false;
      }
      return true;
    });

    const state = setup.editor.state.apply(
      setup.editor.state.tr.setSelection(TextSelection.create(protectedDoc, trailingParagraphPos + 1)),
    );

    expect(isInProtectedTrailingTableParagraph(state)).toBe(true);
  });

  it('blocks Backspace inside the protected trailing paragraph', () => {
    const setup = initTestEditor({ loadFromSchema: true, content: DOC_WITH_PROTECTED_TRAILING_PARAGRAPH });
    const protectedDoc = setup.editor.state.doc;
    let protectedPos = null;
    protectedDoc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '') {
        protectedPos = pos;
        return false;
      }
      return true;
    });

    setup.editor.view.dispatch(
      setup.editor.state.tr.setSelection(TextSelection.create(protectedDoc, protectedPos + 1)),
    );

    const plugin = createTableBoundaryNavigationPlugin();
    const handled = plugin.props.handleKeyDown(setup.editor.view, {
      key: 'Backspace',
      defaultPrevented: false,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    });

    expect(handled).toBe(true);
  });

  it('blocks Delete inside the protected trailing paragraph', () => {
    const setup = initTestEditor({ loadFromSchema: true, content: DOC_WITH_PROTECTED_TRAILING_PARAGRAPH });
    const protectedDoc = setup.editor.state.doc;
    let protectedPos = null;
    protectedDoc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '') {
        protectedPos = pos;
        return false;
      }
      return true;
    });

    setup.editor.view.dispatch(
      setup.editor.state.tr.setSelection(TextSelection.create(protectedDoc, protectedPos + 1)),
    );

    const plugin = createTableBoundaryNavigationPlugin();
    const handled = plugin.props.handleKeyDown(setup.editor.view, {
      key: 'Delete',
      defaultPrevented: false,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    });

    expect(handled).toBe(true);
  });

  describe('inline atom markers at paragraph edges', () => {
    let atomEditor;
    let atomDoc;

    beforeEach(() => {
      ({ editor: atomEditor } = initTestEditor({ loadFromSchema: true, content: DOC_WITH_INLINE_ATOMS }));
      atomDoc = atomEditor.state.doc;
    });

    it('treats the end of the last run as paragraph end even with a trailing bookmarkEnd', () => {
      const lastPos = findTextPos(atomDoc, 'Last');
      const endOfLast = lastPos + 'Last'.length;
      const state = atomEditor.state.apply(atomEditor.state.tr.setSelection(TextSelection.create(atomDoc, endOfLast)));

      expect(isAtEffectiveParagraphEnd(state.selection.$head)).toBe(true);
    });

    it('treats the start of the first run as paragraph start even with a leading bookmarkStart', () => {
      const firstPos = findTextPos(atomDoc, 'First');
      const state = atomEditor.state.apply(atomEditor.state.tr.setSelection(TextSelection.create(atomDoc, firstPos)));

      expect(isAtEffectiveParagraphStart(state.selection.$head)).toBe(true);
    });

    it('exits the table rightward from the last cell despite a trailing bookmarkEnd', () => {
      const lastPos = findTextPos(atomDoc, 'Last');
      const endOfLast = lastPos + 'Last'.length;
      const afterPos = findTextPos(atomDoc, 'After');
      const state = atomEditor.state.apply(atomEditor.state.tr.setSelection(TextSelection.create(atomDoc, endOfLast)));

      const nextSelection = getTableBoundaryExitSelection(state, 1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(afterPos);
    });

    it('exits the table leftward from the first cell despite a leading bookmarkStart', () => {
      const firstPos = findTextPos(atomDoc, 'First');
      const beforeEnd = findTextPos(atomDoc, 'Before') + 'Before'.length;
      const state = atomEditor.state.apply(atomEditor.state.tr.setSelection(TextSelection.create(atomDoc, firstPos)));

      const nextSelection = getTableBoundaryExitSelection(state, -1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(beforeEnd);
    });
  });

  describe('RTL table boundary behavior', () => {
    let rtlEditor;
    let rtlDoc;
    let beforePosRtl;
    let herePosRtl;
    let testingPosRtl;
    let afterPosRtl;

    beforeEach(() => {
      ({ editor: rtlEditor } = initTestEditor({ loadFromSchema: true, content: RTL_DOC }));
      rtlDoc = rtlEditor.state.doc;
      beforePosRtl = findTextPos(rtlDoc, 'This is some text before the table');
      herePosRtl = findTextPos(rtlDoc, 'Here');
      testingPosRtl = findTextPos(rtlDoc, 'Testing');
      afterPosRtl = findTextPos(rtlDoc, 'This is more text after the table');
    });

    it('moves right from the start of the first logical cell to the paragraph before the table', () => {
      const state = rtlEditor.state.apply(rtlEditor.state.tr.setSelection(TextSelection.create(rtlDoc, herePosRtl)));

      const nextSelection = getTableBoundaryExitSelection(state, 1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(beforePosRtl + 'This is some text before the table'.length);
    });

    it('moves left from the end of the last logical cell to the paragraph after the table', () => {
      const endOfTesting = testingPosRtl + 'Testing'.length;
      const state = rtlEditor.state.apply(rtlEditor.state.tr.setSelection(TextSelection.create(rtlDoc, endOfTesting)));

      const nextSelection = getTableBoundaryExitSelection(state, -1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(afterPosRtl);
    });

    it('moves right from the end of the paragraph before the table into the last logical cell', () => {
      const endOfBefore = beforePosRtl + 'This is some text before the table'.length;
      const state = rtlEditor.state.apply(rtlEditor.state.tr.setSelection(TextSelection.create(rtlDoc, endOfBefore)));

      const nextSelection = getAdjacentTableEntrySelection(state, 1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(testingPosRtl + 'Testing'.length);
    });

    it('moves left from the start of the paragraph after the table into the first logical cell', () => {
      const state = rtlEditor.state.apply(rtlEditor.state.tr.setSelection(TextSelection.create(rtlDoc, afterPosRtl)));

      const nextSelection = getAdjacentTableEntrySelection(state, -1);
      expect(nextSelection).not.toBeNull();
      expect(nextSelection.from).toBe(herePosRtl);
    });

    it('does not exit table on Shift+ArrowRight from RTL edge cell when no adjacent cell exists', () => {
      rtlEditor.view.dispatch(rtlEditor.state.tr.setSelection(TextSelection.create(rtlDoc, herePosRtl)));
      const before = rtlEditor.state.selection.from;

      const plugin = createTableBoundaryNavigationPlugin();
      const handled = plugin.props.handleKeyDown(rtlEditor.view, {
        key: 'ArrowRight',
        defaultPrevented: false,
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
      });

      expect(handled).toBe(false);
      expect(rtlEditor.state.selection.from).toBe(before);
    });
  });
});
