import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

const resolveRunProperties = vi.fn((params, inlineRunProperties, resolvedPpr, tableInfo) => ({
  ...(inlineRunProperties || {}),
  _tableInfo: tableInfo,
}));

vi.mock('@superdoc/style-engine/ooxml', () => ({
  resolveRunProperties,
  TABLE_STYLE_ID_TABLE_GRID: 'TableGrid',
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  calculateResolvedParagraphProperties: vi.fn(() => ({})),
}));

describe('getInheritedRunProperties table context', () => {
  beforeEach(() => {
    resolveRunProperties.mockClear();
  });

  it('passes tableInfo when resolving formatting inside a table cell', async () => {
    const { getSelectionFormattingState } = await import('./getMarksFromSelection.js');

    const schema = new Schema({
      nodes: {
        doc: { content: 'table' },
        table: {
          content: 'tableRow+',
          tableRole: 'table',
          attrs: { tableProperties: { default: null } },
          toDOM() {
            return ['table', ['tbody', 0]];
          },
        },
        tableRow: {
          content: 'tableCell+',
          tableRole: 'row',
          toDOM() {
            return ['tr', 0];
          },
        },
        tableCell: {
          content: 'paragraph+',
          tableRole: 'cell',
          toDOM() {
            return ['td', 0];
          },
        },
        paragraph: {
          content: 'run+',
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
      },
    });

    const doc = schema.node('doc', null, [
      schema.node('table', { tableProperties: { styleId: 'TableGrid' } }, [
        schema.node('tableRow', null, [
          schema.node('tableCell', null, [
            schema.node('paragraph', null, [
              schema.node('run', { runProperties: { bold: true } }, [schema.text('Cell')]),
            ]),
          ]),
        ]),
      ]),
    ]);

    const state = EditorState.create({ schema, doc }).apply(
      EditorState.create({ schema, doc }).tr.setSelection(TextSelection.create(doc, 6)),
    );

    getSelectionFormattingState(state, { converter: {} });

    expect(resolveRunProperties).toHaveBeenCalled();
    const tableInfoArg = resolveRunProperties.mock.calls[0][3];
    expect(tableInfoArg).toMatchObject({
      tableProperties: { styleId: 'TableGrid' },
      rowIndex: 0,
      cellIndex: 0,
      numCells: 1,
      numRows: 1,
    });
  });
});
