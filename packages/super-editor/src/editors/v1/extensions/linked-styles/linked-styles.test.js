import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';

const findParagraphInfo = (doc, paragraphIndex) => {
  let match = null;
  let index = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      if (index === paragraphIndex) {
        match = { node, pos };
        return false;
      }
      index += 1;
    }
    return true;
  });

  return match;
};

const selectParagraph = (view, paragraphIndex) => {
  const info = findParagraphInfo(view.state.doc, paragraphIndex);
  expect(info, `expected paragraph index ${paragraphIndex} to exist`).toBeTruthy();

  const selection = NodeSelection.create(view.state.doc, info.pos);
  view.dispatch(view.state.tr.setSelection(selection));
  return info;
};

const setParagraphCursor = (view, paragraphIndex) => {
  const info = findParagraphInfo(view.state.doc, paragraphIndex);
  expect(info, `expected paragraph index ${paragraphIndex} to exist`).toBeTruthy();

  const position = info.pos + 1;
  const selection = TextSelection.create(view.state.doc, position, position);
  view.dispatch(view.state.tr.setSelection(selection));
};

const selectParagraphText = (view, paragraphIndex) => {
  const info = findParagraphInfo(view.state.doc, paragraphIndex);
  expect(info, `expected paragraph index ${paragraphIndex} to exist`).toBeTruthy();

  let from = null;
  let to = null;
  view.state.doc.nodesBetween(info.pos, info.pos + info.node.nodeSize, (node, pos) => {
    if (!node.isText || !node.text?.length) return true;
    if (from == null) from = pos;
    to = pos + node.text.length;
    return true;
  });

  expect(from).not.toBeNull();
  expect(to).not.toBeNull();

  const selection = TextSelection.create(view.state.doc, from, to);
  view.dispatch(view.state.tr.setSelection(selection));
  return { from, to };
};

const toggleLinkedStyleCommand = (editor, style, nodeType = 'paragraph') =>
  editor.chain().toggleLinkedStyle(style, nodeType).run();

const setStyleByIdCommand = (editor, styleId) => editor.chain().setStyleById(styleId).run();
const getParagraphProps = (node) => node.attrs.paragraphProperties || {};

describe('LinkedStyles Extension', () => {
  const filename = 'paragraph_spacing_missing.docx';
  let docx, media, mediaFiles, fonts, editor;
  let headingStyle;
  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));
  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    headingStyle = editor.helpers.linkedStyles.getStyleById('Heading1');
    vi.clearAllMocks();
  });

  describe('Commands', () => {
    describe('setLinkedStyle', () => {
      it('should call applyLinkedStyleToTransaction with the correct style', () => {
        setParagraphCursor(editor.view, 0);
        const result = editor.commands.setLinkedStyle(headingStyle);

        expect(result).toBe(true);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading1');
      });

      it('clears carried formatting marks when applying a new linked style on an empty cursor selection', () => {
        const alternateStyle = editor.helpers.linkedStyles.getStyleById('Heading2');
        const { bold } = editor.schema.marks;

        setParagraphCursor(editor.view, 0);
        editor.view.dispatch(editor.state.tr.setStoredMarks([bold.create()]));

        const result = editor.commands.setLinkedStyle(alternateStyle);

        expect(result).toBe(true);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading2');
        expect((editor.state.storedMarks || []).map((mark) => mark.type.name)).not.toContain('bold');
      });

      it('removes bold marks from selected text when applying a linked style', () => {
        const { from, to } = selectParagraphText(editor.view, 0);
        editor.view.dispatch(editor.state.tr.addMark(from, to, editor.schema.marks.bold.create()));

        let firstParagraph = findParagraphInfo(editor.state.doc, 0);
        let boldTextNodes = [];
        editor.state.doc.nodesBetween(firstParagraph.pos, firstParagraph.pos + firstParagraph.node.nodeSize, (node) => {
          if (node.isText && node.marks.some((mark) => mark.type.name === 'bold')) {
            boldTextNodes.push(node);
          }
          return true;
        });
        expect(boldTextNodes.length).toBeGreaterThan(0);

        selectParagraphText(editor.view, 0);
        const result = editor.commands.setLinkedStyle(headingStyle);

        expect(result).toBe(true);
        firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading1');

        boldTextNodes = [];
        editor.state.doc.nodesBetween(firstParagraph.pos, firstParagraph.pos + firstParagraph.node.nodeSize, (node) => {
          if (node.isText && node.marks.some((mark) => mark.type.name === 'bold')) {
            boldTextNodes.push(node);
          }
          return true;
        });
        expect(boldTextNodes).toHaveLength(0);
      });

      it('applies linked character style to a partial selection without restyling the whole paragraph', () => {
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        let innerFrom;
        let innerTo;
        editor.state.doc.nodesBetween(
          firstParagraph.pos,
          firstParagraph.pos + firstParagraph.node.nodeSize,
          (node, pos) => {
            if (node.isText && node.text.length >= 4) {
              innerFrom = pos + 1;
              innerTo = pos + node.text.length - 1;
              return false;
            }
            return true;
          },
        );
        expect(innerFrom).toBeDefined();
        expect(innerTo).toBeGreaterThan(innerFrom);

        const prevParaStyleId = getParagraphProps(firstParagraph.node).styleId;

        const styleWithLink = {
          ...headingStyle,
          type: 'paragraph',
          definition: {
            ...headingStyle.definition,
            attrs: { ...headingStyle.definition.attrs, link: 'Emphasis' },
          },
        };

        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, innerFrom, innerTo)));
        const result = editor.commands.setLinkedStyle(styleWithLink);
        expect(result).toBe(true);

        const paraAfter = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(paraAfter.node).styleId).toBe(prevParaStyleId);

        let sawEmphasisInSelection = false;
        editor.state.doc.nodesBetween(innerFrom, innerTo, (node) => {
          if (!node.isText) return;
          const ts = node.marks.find((m) => m.type.name === 'textStyle');
          if (ts?.attrs?.styleId === 'Emphasis') sawEmphasisInSelection = true;
        });
        expect(sawEmphasisInSelection).toBe(true);
      });

      it('partial linked character apply clears formatting only inside the selection', () => {
        const minimalDoc = editor.schema.nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'run',
                  content: [{ type: 'text', text: 'Hello world' }],
                },
              ],
            },
          ],
        });
        editor.setState(EditorState.create({ schema: editor.schema, doc: minimalDoc }));

        let lineFrom;
        let lineTo;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === 'Hello world') {
            lineFrom = pos;
            lineTo = pos + node.nodeSize;
            return false;
          }
          return true;
        });
        expect(lineFrom).toBeDefined();

        const { bold } = editor.schema.marks;
        editor.view.dispatch(editor.view.state.tr.addMark(lineFrom, lineTo, bold.create()));

        const world = 'world';
        const selFrom = lineFrom + 'Hello world'.indexOf(world);
        const selTo = selFrom + world.length;

        const styleWithLink = {
          ...headingStyle,
          type: 'paragraph',
          definition: {
            ...headingStyle.definition,
            attrs: { ...headingStyle.definition.attrs, link: 'Emphasis' },
          },
        };
        editor.view.dispatch(
          editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, selFrom, selTo)),
        );
        expect(editor.commands.setLinkedStyle(styleWithLink)).toBe(true);

        const insidePrefix = selFrom - 1;
        expect(insidePrefix).toBeGreaterThanOrEqual(lineFrom);
        expect(
          editor.state.doc
            .resolve(insidePrefix)
            .marks()
            .some((m) => m.type.name === 'bold'),
        ).toBe(true);
      });

      it('applies character style as stored marks on collapsed cursor without modifying paragraph', () => {
        const prevStyleId = getParagraphProps(findParagraphInfo(editor.state.doc, 0).node).styleId;

        setParagraphCursor(editor.view, 0);

        const characterStyle = {
          ...headingStyle,
          id: 'EmphasisChar',
          type: 'character',
          definition: {
            ...headingStyle.definition,
            attrs: { ...headingStyle.definition.attrs, name: 'Emphasis Char' },
          },
        };

        const result = editor.commands.setLinkedStyle(characterStyle);
        expect(result).toBe(true);

        // Paragraph style must NOT change
        const paraAfter = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(paraAfter.node).styleId).toBe(prevStyleId);

        // Stored marks should include textStyle with the character styleId
        const stored = editor.state.storedMarks || [];
        const ts = stored.find((m) => m.type.name === 'textStyle');
        expect(ts).toBeDefined();
        expect(ts?.attrs?.styleId).toBe('EmphasisChar');
      });

      it('applies character style to a text selection without modifying the paragraph style', () => {
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        const prevStyleId = getParagraphProps(firstParagraph.node).styleId;

        const { from, to } = selectParagraphText(editor.view, 0);

        const characterStyle = {
          ...headingStyle,
          id: 'EmphasisChar',
          type: 'character',
          definition: {
            ...headingStyle.definition,
            attrs: { ...headingStyle.definition.attrs, name: 'Emphasis Char' },
          },
        };

        const result = editor.commands.setLinkedStyle(characterStyle);
        expect(result).toBe(true);

        // Paragraph style unchanged
        const paraAfter = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(paraAfter.node).styleId).toBe(prevStyleId);

        // Character style mark applied to the selected range
        let sawCharStyle = false;
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (!node.isText) return;
          const ts = node.marks.find((m) => m.type.name === 'textStyle');
          if (ts?.attrs?.styleId === 'EmphasisChar') sawCharStyle = true;
        });
        expect(sawCharStyle).toBe(true);
      });

      it('applies paragraph style to both paragraphs when selection spans two paragraphs with a linked style', () => {
        const twoParagraphDoc = editor.schema.nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'run', content: [{ type: 'text', text: 'First paragraph' }] }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'run', content: [{ type: 'text', text: 'Second paragraph' }] }],
            },
          ],
        });
        editor.setState(EditorState.create({ schema: editor.schema, doc: twoParagraphDoc }));

        // Find text positions in both paragraphs
        let firstTextPos = null;
        let secondTextEnd = null;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === 'First paragraph' && firstTextPos === null) {
            firstTextPos = pos + 3; // mid-word "st paragraph"
          }
          if (node.isText && node.text === 'Second paragraph') {
            secondTextEnd = pos + node.text.length - 3; // mid-word "Second paragra"
          }
        });
        expect(firstTextPos).not.toBeNull();
        expect(secondTextEnd).not.toBeNull();

        const styleWithLink = {
          ...headingStyle,
          type: 'paragraph',
          definition: {
            ...headingStyle.definition,
            attrs: { ...headingStyle.definition.attrs, link: 'Heading1Char' },
          },
        };

        editor.view.dispatch(
          editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, firstTextPos, secondTextEnd)),
        );
        expect(editor.commands.setLinkedStyle(styleWithLink)).toBe(true);

        // Both paragraphs should have the paragraph style (not character mark)
        const para0 = findParagraphInfo(editor.state.doc, 0);
        const para1 = findParagraphInfo(editor.state.doc, 1);
        expect(getParagraphProps(para0.node).styleId).toBe('Heading1');
        expect(getParagraphProps(para1.node).styleId).toBe('Heading1');
      });

      it('applies paragraph style when the paragraph has no text (e.g. break-only)', () => {
        const minimalDoc = editor.schema.nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'run',
                  content: [{ type: 'hardBreak', attrs: {} }],
                },
              ],
            },
          ],
        });
        editor.setState(EditorState.create({ schema: editor.schema, doc: minimalDoc }));

        const info = findParagraphInfo(editor.state.doc, 0);
        expect(info).toBeTruthy();
        const innerFrom = info.pos + 1;
        const innerTo = info.pos + info.node.nodeSize - 1;
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, innerFrom, innerTo)));

        expect(editor.commands.setLinkedStyle(headingStyle)).toBe(true);
        const para = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(para.node).styleId).toBe('Heading1');
      });
    });

    describe('toggleLinkedStyle', () => {
      it('should apply style with a cursor (empty) selection', () => {
        setParagraphCursor(editor.view, 0); // Cursor selection at first paragraph
        const result = editor.commands.toggleLinkedStyle(headingStyle, 'paragraph');

        expect(result).toBe(true);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading1');
      });

      it('should toggle off style with a cursor (empty) selection', () => {
        // Apply style first
        setParagraphCursor(editor.view, 0);
        editor.commands.setLinkedStyle(headingStyle);
        let firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading1');

        // Toggle off with cursor
        setParagraphCursor(editor.view, 0);
        const result = editor.commands.toggleLinkedStyle(headingStyle, 'paragraph');

        expect(result).toBe(true);
        firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe(null);
      });

      it('should apply style when no style is currently set', () => {
        selectParagraph(editor.view, 0); // Select "First paragraph"
        const applied = toggleLinkedStyleCommand(editor, headingStyle);

        expect(applied).toBe(true);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe(headingStyle.id);
      });

      it('should remove style when the same style is already applied', () => {
        selectParagraph(editor.view, 1); // Select "Second paragraph"
        toggleLinkedStyleCommand(editor, headingStyle);
        let secondParagraph = findParagraphInfo(editor.state.doc, 1);
        expect(getParagraphProps(secondParagraph.node).styleId).toBe(headingStyle.id);

        selectParagraph(editor.view, 1);
        const toggledOff = toggleLinkedStyleCommand(editor, headingStyle);
        expect(toggledOff).toBe(true);
        secondParagraph = findParagraphInfo(editor.state.doc, 1);
        expect(getParagraphProps(secondParagraph.node).styleId).toBe(null);
      });

      it('should apply new style when a different style is already applied', () => {
        const alternateStyle = editor.helpers.linkedStyles.getStyleById('Heading2');

        selectParagraph(editor.view, 1); // Select "Second paragraph"
        toggleLinkedStyleCommand(editor, alternateStyle);
        let secondParagraph = findParagraphInfo(editor.state.doc, 1);
        expect(getParagraphProps(secondParagraph.node).styleId).toBe(alternateStyle.id);

        selectParagraph(editor.view, 1);
        const switched = toggleLinkedStyleCommand(editor, headingStyle);
        expect(switched).toBe(true);
        secondParagraph = findParagraphInfo(editor.state.doc, 1);
        expect(getParagraphProps(secondParagraph.node).styleId).toBe('Heading1');
      });
    });

    describe('setStyleById', () => {
      it('should apply style if styleId is valid', () => {
        setParagraphCursor(editor.view, 0); // Cursor inside "First paragraph"

        const result = setStyleByIdCommand(editor, 'Heading1');

        expect(result).toBe(true);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBe('Heading1');
      });

      it('should return false if styleId is not found', () => {
        selectParagraph(editor.view, 0); // Select "First paragraph"

        const result = setStyleByIdCommand(editor, 'invalid-id');

        expect(result).toBe(false);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBeUndefined();
      });
    });
  });

  describe('Helpers', () => {
    let linkedStylesHelpers;

    beforeEach(() => {
      linkedStylesHelpers = editor.helpers.linkedStyles;
    });

    describe('getStyles', () => {
      it('should return all styles from the plugin state', () => {
        const styles = linkedStylesHelpers.getStyles();
        expect(styles).toEqual(editor.state.linkedStyles$.styles);
      });
    });

    describe('getStyleById', () => {
      it('should return the correct style by its ID', () => {
        const style = linkedStylesHelpers.getStyleById('Heading1');
        expect(style.id).toEqual('Heading1');
      });

      it('should return undefined if style is not found', () => {
        const style = linkedStylesHelpers.getStyleById('non-existent');
        expect(style).toBeUndefined();
      });
    });

    describe('getLinkedStyleString', () => {
      it('should call generateLinkedStyleString for a valid style ID', () => {
        const result = linkedStylesHelpers.getLinkedStyleString('Title');
        expect(result).toBe('font-family: Aptos Display, Arial, sans-serif;letter-spacing: -0.5pt;font-size: 28pt');
      });

      it('should return an empty string for an invalid style ID', () => {
        const result = linkedStylesHelpers.getLinkedStyleString('invalid-id');
        expect(result).toBe('');
      });
    });
  });
});
