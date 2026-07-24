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
type TextExtractor = (payload: UnknownRecord) => string;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function childrenText(payload: UnknownRecord, ...keys: string[]): string {
  return keys
    .flatMap((key) => (Array.isArray(payload[key]) ? payload[key] : []))
    .map(textFromSdNode)
    .join('');
}

const TEXT_EXTRACTORS: Record<string, TextExtractor> = {
  run: (run) => String(run.text ?? ''),
  paragraph: (paragraph) => childrenText(paragraph, 'inlines'),
  heading: (heading) => childrenText(heading, 'inlines'),
  hyperlink: (hyperlink) => childrenText(hyperlink, 'inlines'),
  field: (field) => String(field.resultText ?? ''),
  sdt: (sdt) => childrenText(sdt, 'inlines', 'content'),
  customXml: (customXml) => childrenText(customXml, 'inlines', 'content'),
};

function textFromSdNode(value: unknown): string {
  const node = asRecord(value);
  if (!node) return '';
  const kind = typeof node.kind === 'string' ? node.kind : '';
  const payload = asRecord(node[kind]);
  return payload && TEXT_EXTRACTORS[kind]
    ? TEXT_EXTRACTORS[kind](payload)
    : childrenText(node, 'content');
}

function requireSuccess(result: TableMutationResult, operation: string): Extract<TableMutationResult, { success: true }> {
  if (result.success) return result;
  throw new Error(`${operation}: ${result.failure.message}`);
}

function nextTableId(result: TableMutationResult, operation: string, currentTableId: string): string {
  if (result.success) return result.table?.nodeId ?? currentTableId;
  if (result.failure.code === 'NO_OP') return currentTableId;
  throw new Error(`${operation}: ${result.failure.message}`);
}

function validateColumnIndexes(source: number, destination: number, columnCount: number): void {
  if (![source, destination].every(Number.isInteger)) throw new Error('Column indexes must be integers.');
  if (source < 0 || destination < 0) throw new Error('Column indexes cannot be negative.');
  if (source === destination) throw new Error('Source and destination columns must differ.');
  if (source >= columnCount || destination >= columnCount) {
    throw new Error(`Column index must be between 0 and ${columnCount - 1}.`);
  }
}

/** Best-effort public-API column reorder. Rich cell content is flattened to plain text. */
export class TableColumnReorder {
  // Stores the SuperDoc editor instance used for Document API operations.
  constructor(private readonly editor: Editor) {}

  // Finds and returns the node ID of the first table in the document.
  findFirstTableId(): string {
    const matches = this.editor.doc.query.match({ select: { type: 'node', nodeType: 'table' }, require: 'first' });
    const first = matches.items[0];
    if (!first || first.address.nodeType !== 'table') throw new Error('No table found in the document.');
    return first.address.nodeId;
  }

  // Moves a column beside another column by copying its text and deleting the original.
  moveColumn({ tableId, sourceColumn, destinationColumn, placement = 'after' }: MoveColumnInput): MoveColumnResult {
    const tableResult = this.editor.doc.getNodeById({ nodeId: tableId, nodeType: 'table' });
    if (tableResult.node.kind !== 'table') throw new Error('The selected node is not a table.');
    const table = tableResult.node.table;
    const columnCount = Math.max(table.columns?.length ?? 0, ...table.rows.map((row) => row.cells.length));
    validateColumnIndexes(sourceColumn, destinationColumn, columnCount);

    const sourceTextByRow = table.rows.map((row) => textFromSdNode(row.cells[sourceColumn]));
    const position = placement === 'after' ? 'right' : 'left';
    const insertedIndex = placement === 'after' ? destinationColumn + 1 : destinationColumn;
    const inserted = requireSuccess(
      this.editor.doc.tables.insertColumn({ nodeId: tableId, columnIndex: destinationColumn, position }),
      'tables.insertColumn',
    );
    let currentTableId = inserted.table?.nodeId ?? tableId;

    sourceTextByRow.forEach((text, rowIndex) => {
      currentTableId = nextTableId(
        this.editor.doc.tables.setCellText({ nodeId: currentTableId, rowIndex, columnIndex: insertedIndex, text }),
        `tables.setCellText(row ${rowIndex})`,
        currentTableId,
      );
    });

    const shiftedSourceIndex = sourceColumn >= insertedIndex ? sourceColumn + 1 : sourceColumn;
    const deleted = requireSuccess(
      this.editor.doc.tables.deleteColumn({ nodeId: currentTableId, columnIndex: shiftedSourceIndex }),
      'tables.deleteColumn',
    );
    return { tableId: deleted.table?.nodeId ?? currentTableId };
  }
}
