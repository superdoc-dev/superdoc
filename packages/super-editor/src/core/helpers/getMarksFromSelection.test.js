import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { schema, doc, p, em, strong } from 'prosemirror-test-builder';
import { getMarksFromSelection } from './getMarksFromSelection.js';

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

  it('collects marks across a range selection', () => {
    const testDoc = doc(p(em('Hi '), strong('there')));
    const state = EditorState.create({ schema, doc: testDoc });
    const rangeState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1, testDoc.content.size - 1)));

    const result = getMarksFromSelection(rangeState);

    expect(result.filter((mark) => mark.type === schema.marks.em).length).toBeGreaterThan(0);
    expect(result.filter((mark) => mark.type === schema.marks.strong).length).toBeGreaterThan(0);
  });

  describe('inherited runProperties from paragraph', () => {
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

      const result = getMarksFromSelection(cursorState);

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

      const result = getMarksFromSelection(cursorState);

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

      const result = getMarksFromSelection(state);

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

      const result = getMarksFromSelection(cursorState);

      // The paragraph has text content, so the inherited runProperties fallback
      // does not activate — only empty paragraphs use it.
      expect(result.some((mark) => mark.type.name === 'bold')).toBe(false);
    });

    it('returns empty array when paragraph has no runProperties', () => {
      const testDoc = customSchema.node('doc', null, [customSchema.node('paragraph')]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState);

      expect(result).toEqual([]);
    });

    it('returns empty array when paragraphProperties is null', () => {
      const testDoc = customSchema.node('doc', null, [customSchema.node('paragraph', { paragraphProperties: null })]);
      const state = EditorState.create({ schema: customSchema, doc: testDoc });
      const cursorState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

      const result = getMarksFromSelection(cursorState);

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

      const result = getMarksFromSelection(cursorState);

      // bold exists in the schema, strike does not
      expect(result.some((mark) => mark.type.name === 'bold')).toBe(true);
      expect(result.every((mark) => mark.type.name !== 'strike')).toBe(true);
    });
  });
});
