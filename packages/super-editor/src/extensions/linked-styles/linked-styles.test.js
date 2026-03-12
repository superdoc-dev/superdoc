import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeSelection, TextSelection } from 'prosemirror-state';
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
    });

    describe('toggleLinkedStyle', () => {
      it('should return false for an empty selection', () => {
        setParagraphCursor(editor.view, 0); // Cursor selection at first paragraph
        const result = editor.commands.toggleLinkedStyle(headingStyle, 'paragraph');

        expect(result).toBe(false);
        const firstParagraph = findParagraphInfo(editor.state.doc, 0);
        expect(getParagraphProps(firstParagraph.node).styleId).toBeUndefined();
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
