import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { schema, doc, p, em, strong } from 'prosemirror-test-builder';
import { getMarksFromSelection, getSelectionFormattingState } from './getMarksFromSelection.js';

describe('getMarksFromSelection', () => {
  it('returns marks for a collapsed selection including stored marks', () => {
    const testDoc = doc(p(em('Hi')));
    const baseState = EditorState.create({ schema, doc: testDoc });
    const tr = baseState.tr.setSelection(TextSelection.create(testDoc, 2));
    tr.setStoredMarks([schema.marks.strong.create()]);
    const state = baseState.apply(tr);

    const result = getMarksFromSelection(state);

    expect(result.some((mark) => mark.type === schema.marks.strong)).toBe(true);
    expect(result.some((mark) => mark.type === schema.marks.em)).toBe(true);
  });

  it('returns only marks shared across a range selection', () => {
    const testDoc = doc(p(em('Hi '), strong('there')));
    const state = EditorState.create({ schema, doc: testDoc });
    const rangeState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1, testDoc.content.size - 1)));

    const result = getMarksFromSelection(rangeState);

    expect(result).toEqual([]);
  });

  describe('inherited runProperties from paragraph', () => {
    const mockEditor = {};

    // Custom schema with a paragraph that supports paragraphProperties attrs
    const customSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          attrs: { paragraphProperties: { default: null } },
          toDOM() {
            return ['p', 0];
          },
        },
        text: { group: 'inline' },
      },
      marks: {
        bold: {
          attrs: { value: { default: true } },
          toDOM() {
            return ['strong', 0];
          },
        },
        italic: {
          attrs: { value: { default: true } },
          toDOM() {
            return ['em', 0];
          },
        },
      },
    });

    it('returns marks from paragraphProperties.runProperties for an empty paragraph', () => {
      const testDoc = customSchema.node('doc', null, [
        customSchema.node('paragraph', { paragraphProperties: { runProperties: { bold: true } } }),
      ]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      expect(result.some((mark) => mark.type.name === 'bold')).toBe(true);
    });

    it('returns multiple marks from runProperties', () => {
      const testDoc = customSchema.node('doc', null, [
        customSchema.node('paragraph', {
          paragraphProperties: { runProperties: { bold: true, italic: true } },
        }),
      ]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      expect(result.some((mark) => mark.type.name === 'bold')).toBe(true);
      expect(result.some((mark) => mark.type.name === 'italic')).toBe(true);
    });

    it('does not return inherited marks when storedMarks are present', () => {
      const testDoc = customSchema.node('doc', null, [
        customSchema.node('paragraph', { paragraphProperties: { runProperties: { bold: true } } }),
      ]);
      const baseState = EditorState.create({ schema: customSchema, doc: testDoc });
      const tr = baseState.tr.setSelection(TextSelection.create(testDoc, 1));
      tr.setStoredMarks([customSchema.marks.italic.create()]);
      const state = baseState.apply(tr);

      const result = getMarksFromSelection(state, mockEditor);

      expect(result.some((mark) => mark.type.name === 'italic')).toBe(true);
      // storedMarks take precedence; inherited bold should not appear
      expect(result.some((mark) => mark.type.name === 'bold')).toBe(false);
    });

    it('does not return inherited marks when paragraph has text content', () => {
      const testDoc = customSchema.node('doc', null, [
        customSchema.node('paragraph', { paragraphProperties: { runProperties: { bold: true } } }, [
          customSchema.text('Hello'),
        ]),
      ]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 3)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      // The paragraph has text content, so the inherited runProperties fallback
      // does not activate — only empty paragraphs use it.
      expect(result.some((mark) => mark.type.name === 'bold')).toBe(false);
    });

    it('returns empty array when paragraph has no runProperties', () => {
      const testDoc = customSchema.node('doc', null, [customSchema.node('paragraph')]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      expect(result).toEqual([]);
    });

    it('returns empty array when paragraphProperties is null', () => {
      const testDoc = customSchema.node('doc', null, [customSchema.node('paragraph', { paragraphProperties: null })]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      expect(result).toEqual([]);
    });

    it('skips unknown mark types in runProperties gracefully', () => {
      const testDoc = customSchema.node('doc', null, [
        customSchema.node('paragraph', {
          paragraphProperties: { runProperties: { bold: true, strike: true } },
        }),
      ]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState, mockEditor);

      // bold exists in the schema, strike does not
      expect(result.some((mark) => mark.type.name === 'bold')).toBe(true);
      expect(result.every((mark) => mark.type.name !== 'strike')).toBe(true);
    });
  });

  it('reads inline run properties from the surrounding run node instead of decoding visible marks', () => {
    const runSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          toDOM() {
            return ['p', 0];
          },
        },
        run: {
          content: 'text*',
          group: 'inline',
          inline: true,
          attrs: { runProperties: { default: null } },
          toDOM() {
            return ['span', 0];
          },
        },
        text: { group: 'inline' },
      },
      marks: {
        bold: {
          attrs: { value: { default: true } },
          toDOM() {
            return ['strong', 0];
          },
        },
      },
    });
    const textNode = runSchema.text('Hello', [runSchema.marks.bold.create()]);
    const testDoc = runSchema.node('doc', null, [
      runSchema.node('paragraph', null, [
        runSchema.node('run', { runProperties: { styleId: 'Heading1Char' } }, [textNode]),
      ]),
    ]);
    const state = EditorState.create({ schema: runSchema, doc: testDoc });
    const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 3)));

    const result = getSelectionFormattingState(cursorState);

    expect(result.inlineRunProperties).toEqual({ styleId: 'Heading1Char' });
  });

  it('reconstructs highlight marks from hash-prefixed runProperties values', () => {
    const runSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          toDOM() {
            return ['p', 0];
          },
        },
        run: {
          content: 'text*',
          group: 'inline',
          inline: true,
          attrs: { runProperties: { default: null } },
          toDOM() {
            return ['span', 0];
          },
        },
        text: { group: 'inline' },
      },
      marks: {
        highlight: {
          attrs: { color: { default: null } },
          toDOM() {
            return ['mark', 0];
          },
        },
      },
    });
    const testDoc = runSchema.node('doc', null, [
      runSchema.node('paragraph', null, [
        runSchema.node('run', { runProperties: { highlight: { 'w:val': '#ECCF35' } } }, [runSchema.text('Hello')]),
      ]),
    ]);
    const state = EditorState.create({ schema: runSchema, doc: testDoc });
    const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 3)));

    const result = getSelectionFormattingState(cursorState);

    expect(result.inlineRunProperties).toEqual({ highlight: { 'w:val': '#ECCF35' } });
    expect(result.inlineMarks).toContainEqual(expect.objectContaining({ attrs: { color: '#ECCF35' } }));
    expect(result.resolvedMarks).toContainEqual(expect.objectContaining({ attrs: { color: '#ECCF35' } }));
  });

  it('falls back to cursor marks when the surrounding run has no explicit runProperties', () => {
    const runSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          toDOM() {
            return ['p', 0];
          },
        },
        run: {
          content: 'text*',
          group: 'inline',
          inline: true,
          attrs: { runProperties: { default: null } },
          toDOM() {
            return ['span', 0];
          },
        },
        text: { group: 'inline' },
      },
      marks: {
        bold: {
          attrs: { value: { default: true } },
          toDOM() {
            return ['strong', 0];
          },
        },
      },
    });
    const textNode = runSchema.text('Hello', [runSchema.marks.bold.create()]);
    const testDoc = runSchema.node('doc', null, [
      runSchema.node('paragraph', null, [runSchema.node('run', null, [textNode])]),
    ]);
    const state = EditorState.create({ schema: runSchema, doc: testDoc });
    const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 3)));

    const result = getSelectionFormattingState(cursorState);

    expect(result.inlineRunProperties).toEqual({ bold: true });
    expect(result.inlineMarks.some((mark) => mark.type.name === 'bold')).toBe(true);
    expect(result.resolvedMarks.some((mark) => mark.type.name === 'bold')).toBe(true);
  });

  it('resolves non-empty selections through the style cascade', () => {
    const rangeSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: { paragraphProperties: { default: null } },
          toDOM() {
            return ['p', 0];
          },
        },
        run: {
          content: 'text*',
          group: 'inline',
          inline: true,
          attrs: { runProperties: { default: null } },
          toDOM() {
            return ['span', 0];
          },
        },
        text: { group: 'inline' },
      },
      marks: {
        bold: {
          attrs: { value: { default: true } },
          toDOM() {
            return ['strong', 0];
          },
        },
        textStyle: {
          attrs: { styleId: { default: null } },
          toDOM() {
            return ['span', 0];
          },
        },
      },
    });
    const testDoc = rangeSchema.node('doc', null, [
      rangeSchema.node('paragraph', null, [
        rangeSchema.node('run', { runProperties: { styleId: 'Heading1Char' } }, [rangeSchema.text('Hello')]),
        rangeSchema.node('run', { runProperties: { styleId: 'Heading1Char' } }, [rangeSchema.text('World')]),
      ]),
    ]);
    const baseState = EditorState.create({ schema: rangeSchema, doc: testDoc });
    const state = baseState.apply(statefulSelection(baseState, testDoc, 2, testDoc.content.size - 2));
    const editor = {
      converter: {
        translatedLinkedStyles: {
          docDefaults: {
            runProperties: {},
            paragraphProperties: {},
          },
          latentStyles: {},
          styles: {
            Normal: {
              styleId: 'Normal',
              type: 'paragraph',
              default: true,
              name: 'Normal',
              runProperties: {},
              paragraphProperties: {},
            },
            Heading1Char: {
              styleId: 'Heading1Char',
              type: 'character',
              name: 'Heading 1 Char',
              runProperties: { bold: true },
              paragraphProperties: {},
            },
          },
        },
        numbering: {},
        translatedNumbering: {},
        convertedXml: {},
      },
    };

    const result = getSelectionFormattingState(state, editor);

    expect(result.resolvedRunProperties).toMatchObject({ bold: true });
    expect(result.resolvedMarks.some((mark) => mark.type.name === 'bold')).toBe(true);
    expect(result.inlineRunProperties).toEqual({ styleId: 'Heading1Char' });
  });
});

function statefulSelection(state, testDoc, from, to) {
  return state.tr.setSelection(TextSelection.create(testDoc, from, to));
}
