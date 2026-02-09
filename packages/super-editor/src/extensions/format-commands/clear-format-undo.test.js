import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

/**
 * SD-1771: Formatting - Undo clear formatting leaves mixed formatting
 *
 * Root cause: run nodes (non-atom inline containers) can carry a textStyle
 * mark with all-null attrs.  ProseMirror's `tr.removeMark(from, to)` creates
 * RemoveMarkStep for marks on ALL inline nodes (including the run's
 * null-attrs textStyle).  On undo, AddMarkStep only applies to atom/text
 * nodes, so the run's null-attrs textStyle overwrites the text's correct
 * textStyle mark.
 *
 * Fix: unsetAllMarks now collects marks only from leaf/atom nodes and removes
 * each explicitly, avoiding RemoveMarkSteps for container-node marks.
 */
describe('SD-1771: Clear format + undo mark restoration', () => {
  it('should restore textStyle mark attrs after clear format + undo (simple doc)', () => {
    const { editor } = initTestEditor({
      loadFromSchema: true,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                attrs: {
                  runProperties: {
                    bold: true,
                    fontFamily: { ascii: 'Roboto', hAnsi: 'Roboto', cs: 'Roboto' },
                    fontSize: 44,
                    color: { val: '000000' },
                  },
                },
                content: [
                  {
                    type: 'text',
                    text: 'Hello World',
                    marks: [
                      { type: 'bold' },
                      {
                        type: 'textStyle',
                        attrs: { color: '#000000', fontFamily: 'Roboto, sans-serif', fontSize: '22pt' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const from = 2;
    const to = 2 + 'Hello World'.length;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
    editor.commands.clearFormat();
    editor.commands.undo();

    const marks = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) marks.push(...node.marks.map((m) => ({ type: m.type.name, attrs: { ...m.attrs } })));
    });
    const textStyle = marks.find((m) => m.type === 'textStyle');
    expect(textStyle).toBeDefined();
    expect(textStyle.attrs.color).toBe('#000000');
    expect(textStyle.attrs.fontFamily).toBe('Roboto, sans-serif');
    expect(textStyle.attrs.fontSize).toBe('22pt');
  });

  it('should restore textStyle marks correctly after clear format + undo (real DOCX)', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('sdpr.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    // Find first paragraph with styled text (textStyle marks with real values)
    let targetFrom = null;
    let targetTo = null;
    let expectedColor = null;
    let expectedFontFamily = null;
    let expectedFontSize = null;

    editor.state.doc.descendants((node, pos) => {
      if (targetFrom !== null) return false;
      if (node.type.name === 'paragraph' && node.textContent.length > 5) {
        node.descendants((child) => {
          if (targetFrom !== null) return false;
          if (child.isText) {
            const ts = child.marks.find((m) => m.type.name === 'textStyle');
            if (ts && (ts.attrs.fontFamily || ts.attrs.fontSize || ts.attrs.color)) {
              targetFrom = pos + 1;
              targetTo = pos + node.nodeSize - 1;
              expectedColor = ts.attrs.color;
              expectedFontFamily = ts.attrs.fontFamily;
              expectedFontSize = ts.attrs.fontSize;
              return false;
            }
          }
        });
      }
    });

    expect(targetFrom).not.toBeNull();

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, targetFrom, targetTo)));

    // Clear formatting then undo
    editor.commands.clearFormat();
    editor.commands.undo();

    // After undo, the first text node's textStyle should have the original attrs
    let textStyleAfterUndo = null;
    editor.state.doc.nodesBetween(targetFrom, Math.min(targetTo, editor.state.doc.content.size), (node) => {
      if (!textStyleAfterUndo && node.isText) {
        textStyleAfterUndo = node.marks.find((m) => m.type.name === 'textStyle');
      }
    });

    expect(textStyleAfterUndo).toBeDefined();
    expect(textStyleAfterUndo.attrs.color).toBe(expectedColor);
    expect(textStyleAfterUndo.attrs.fontFamily).toBe(expectedFontFamily);
    expect(textStyleAfterUndo.attrs.fontSize).toBe(expectedFontSize);
  });
});
