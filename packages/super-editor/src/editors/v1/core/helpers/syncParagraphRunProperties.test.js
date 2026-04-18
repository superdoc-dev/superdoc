import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

import { addParagraphRunProperty, removeParagraphRunProperty } from './syncParagraphRunProperties.js';

const testSchema = new Schema({
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

describe('syncParagraphRunProperties', () => {
  it('preserves inherited paragraph run properties when adding a new stored mark', () => {
    const doc = testSchema.node('doc', null, [
      testSchema.node('paragraph', {
        paragraphProperties: {
          runProperties: { italic: true, styleId: 'Heading1Char' },
        },
      }),
    ]);
    const state = EditorState.create({ schema: testSchema, doc });
    const tr = state.tr.setSelection(TextSelection.create(doc, 1));
    addParagraphRunProperty(tr, testSchema.marks.bold.create({ value: true }));

    expect(tr.doc.firstChild?.attrs.paragraphProperties?.runProperties).toEqual({
      italic: true,
      styleId: 'Heading1Char',
      bold: true,
    });
  });

  it('removes only the unset mark while preserving other inherited run properties', () => {
    const doc = testSchema.node('doc', null, [
      testSchema.node('paragraph', {
        paragraphProperties: {
          runProperties: { italic: true, styleId: 'Heading1Char', bold: true },
        },
      }),
    ]);
    const state = EditorState.create({ schema: testSchema, doc });
    const tr = state.tr.setSelection(TextSelection.create(doc, 1));

    removeParagraphRunProperty(tr, { type: testSchema.marks.bold, attrs: { value: true } });

    expect(tr.doc.firstChild?.attrs.paragraphProperties?.runProperties).toEqual({
      italic: true,
      styleId: 'Heading1Char',
    });
  });

  it('removes only the targeted textStyle attributes', () => {
    const textStyleSchema = new Schema({
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
        textStyle: {
          attrs: {
            color: { default: null },
            fontSize: { default: null },
            styleId: { default: null },
          },
          toDOM() {
            return ['span', 0];
          },
        },
      },
    });
    const doc = textStyleSchema.node('doc', null, [
      textStyleSchema.node('paragraph', {
        paragraphProperties: {
          runProperties: { color: { val: 'FF0000' }, fontSize: 24, styleId: 'Heading1Char' },
        },
      }),
    ]);
    const state = EditorState.create({ schema: textStyleSchema, doc });
    const tr = state.tr.setSelection(TextSelection.create(doc, 1));

    removeParagraphRunProperty(tr, {
      type: textStyleSchema.marks.textStyle,
      attrs: { color: '#FF0000' },
    });

    expect(tr.doc.firstChild?.attrs.paragraphProperties?.runProperties).toEqual({
      fontSize: 24,
      styleId: 'Heading1Char',
    });
  });
});
