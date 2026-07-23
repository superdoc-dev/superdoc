import type { Editor } from '@superdoc-dev/react';

export interface MoveColumnInput {
  tableId: string;
  sourceColumn: number;
  destinationColumn: number;
  placement?: 'before' | 'after';
}

export interface MoveColumnResult { tableId: string }

type TableMutationResult =
  | { success: true; table?: { nodeId: string } }
  | { success: false; failure: { code: string; message: string } };
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function textFromSdNode(value: unknown): string {
  const node = asRecord(value);
  if (!node) return '';
  if (node.kind === 'run') return String(asRecord(node.run)?.text ?? '');
  if (node.kind === 'paragraph') return list(asRecord(node.paragraph)?.inlines).map(textFromSdNode).join('');
  if (node.kind === 'heading') return list(asRecord(node.heading)?.inlines).map(textFromSdNode).join('');
  if (node.kind === 'hyperlink') return list(asRecord(node.hyperlink)?.inlines).map(textFromSdNode).join('');
  if (node.kind === 'field') return String(asRecord(node.field)?.resultText ?? '');
  if (node.kind === 'sdt') {
    const sdt = asRecord(node.sdt);
    return [...list(sdt?.inlines), ...list(sdt?.content)].map(textFromSdNode).join('');
  }
  if (node.kind === 'customXml') {
    const customXml = asRecord(node.customXml);
    return [...list(customXml?.inlines), ...list(customXml?.content)].map(textFromSdNode).join('');
  }
  return list(node.content).map(textFromSdNode).join('');
}

function requireSuccess(result: TableMutationResult, operation: string): Extract<TableMutationResult, { success: true }> {
  if (result.success) return result;
  throw new Error(`${operation}: ${result.failure.message}`);
}

function allowNoOp(result: TableMutationResult, operation: string): TableMutationResult {
  if (result.success || result.failure.code === 'NO_OP') return result;
  throw new Error(`${operation}: ${result.failure.message}`);
}

/** Best-effort public-API column reorder. Rich cell content is flattened to plain text. */
export class TableColumnReorder {
  constructor(private readonly editor: Editor) {}

  findFirstTableId(): string {
    const matches = this.editor.doc.query.match({ select: { type: 'node', nodeType: 'table' }, require: 'first' });
    const first = matches.items[0];
    if (!first || first.address.nodeType !== 'table') throw new Error('No table found in the document.');
    return first.address.nodeId;
  }

  moveColumn({ tableId, sourceColumn, destinationColumn, placement = 'after' }: MoveColumnInput): MoveColumnResult {
    if (!Number.isInteger(sourceColumn) || !Number.isInteger(destinationColumn)) throw new Error('Column indexes must be integers.');
    if (sourceColumn < 0 || destinationColumn < 0) throw new Error('Column indexes cannot be negative.');
    if (sourceColumn === destinationColumn) throw new Error('Source and destination columns must differ.');

    const tableResult = this.editor.doc.getNodeById({ nodeId: tableId, nodeType: 'table' });
    if (tableResult.node.kind !== 'table') throw new Error('The selected node is not a table.');
    const table = tableResult.node.table;
    const columnCount = Math.max(table.columns?.length ?? 0, ...table.rows.map((row) => row.cells.length));
    if (sourceColumn >= columnCount || destinationColumn >= columnCount) throw new Error(`Column index must be between 0 and ${columnCount - 1}.`);

    const sourceTextByRow = table.rows.map((row) => textFromSdNode(row.cells[sourceColumn]));
    const position = placement === 'after' ? 'right' : 'left';
    const insertedIndex = placement === 'after' ? destinationColumn + 1 : destinationColumn;
    const inserted = requireSuccess(
      this.editor.doc.tables.insertColumn({ nodeId: tableId, columnIndex: destinationColumn, position }),
      'tables.insertColumn',
    );
    let currentTableId = inserted.table?.nodeId ?? tableId;

    sourceTextByRow.forEach((text, rowIndex) => {
      const updated = allowNoOp(
        this.editor.doc.tables.setCellText({ nodeId: currentTableId, rowIndex, columnIndex: insertedIndex, text }),
        `tables.setCellText(row ${rowIndex})`,
      );
      if (updated.success) currentTableId = updated.table?.nodeId ?? currentTableId;
    });

    const shiftedSourceIndex = sourceColumn >= insertedIndex ? sourceColumn + 1 : sourceColumn;
    const deleted = requireSuccess(
      this.editor.doc.tables.deleteColumn({ nodeId: currentTableId, columnIndex: shiftedSourceIndex }),
      'tables.deleteColumn',
    );
    return { tableId: deleted.table?.nodeId ?? currentTableId };
  }
}
