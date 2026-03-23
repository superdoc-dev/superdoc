import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

const resolveRunProperties = vi.fn(() => ({ bold: true }));

vi.mock('@superdoc/style-engine/ooxml', () => ({
  resolveRunProperties,
  TABLE_STYLE_ID_TABLE_GRID: 'TableGrid',
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  calculateResolvedParagraphProperties: vi.fn(() => ({})),
}));

describe('getSelectionFormattingState resolved mark fallback', () => {
  it('preserves inline highlight when resolved marks omit it', async () => {
    const { getSelectionFormattingState } = await import('./getMarksFromSelection.js');

    const schema = new Schema({
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
        highlight: {
          attrs: { color: { default: null } },
          toDOM() {
            return ['mark', 0];
          },
        },
      },
    });

    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', { runProperties: { highlight: { 'w:val': '#ECCF35' } } }, [schema.text('Hello')]),
      ]),
    ]);
    const baseState = EditorState.create({ schema, doc });
    const state = baseState.apply(baseState.tr.setSelection(TextSelection.create(doc, 2, 7)));

    const result = getSelectionFormattingState(state, { converter: { convertedXml: {} } });

    expect(resolveRunProperties).toHaveBeenCalled();
    expect(result.inlineMarks).toContainEqual(expect.objectContaining({ attrs: { color: '#ECCF35' } }));
    expect(result.resolvedMarks).toContainEqual(expect.objectContaining({ attrs: { value: true } }));
    expect(result.resolvedMarks).toContainEqual(expect.objectContaining({ attrs: { color: '#ECCF35' } }));
  });
});
