/**
 * Read-optimized document snapshot for action-primitive tools.
 *
 * The workflow tools repeatedly ask the same questions: "what is the first
 * heading?", "which table is table 2?", "what block owns this ref?", and so on.
 * This index converts the raw doc-api pagination surface into stable ordinal
 * lookups once per document revision so each workflow can stay deterministic
 * and avoid re-fetching broad document state.
 */
import type {
  BoundDocApi,
  DocBlocksListResult,
  DocInfoResult,
  DocListsListResult,
  DocTablesGetResult,
} from '../generated/client.js';
import type { InvokeOptions } from '../runtime/process.js';

const DEFAULT_PAGE_LIMIT = 250;

export type WorkflowIndexDiagnostic = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkflowIndexedBlock = {
  kind: 'block';
  ordinal: number;
  paragraphOrdinal?: number;
  bodyParagraphOrdinal?: number;
  headingOrdinal?: number;
  nodeId: string;
  nodeType: DocBlocksListResult['blocks'][number]['nodeType'];
  ref?: string;
  textPreview?: string | null;
  styleId?: string;
  styleName?: string;
  headingLevel?: number;
  tableOrdinal?: number;
};

export type WorkflowIndexedListItem = {
  kind: 'listItem';
  nodeId: string;
  listId: string;
  ref?: string;
  apiOrdinal?: number;
  indexOrdinal: number;
  level?: number;
  marker?: string;
  listKind?: 'ordered' | 'bullet';
  text?: string;
};

export type WorkflowIndexedTable = {
  kind: 'table';
  nodeId: string;
  tableOrdinal: number;
  blockOrdinal: number;
  ref?: string;
  rows?: number;
  columns?: number;
};

export type WorkflowIndexedEntity = WorkflowIndexedBlock | WorkflowIndexedListItem | WorkflowIndexedTable;

export type WorkflowDocIndex = {
  documentKey: string;
  revision: string;
  builtAtMs: number;
  counts: DocInfoResult['counts'];
  outline: DocInfoResult['outline'];
  blocks: WorkflowIndexedBlock[];
  lists: WorkflowIndexedListItem[];
  tables: WorkflowIndexedTable[];
  lookup: {
    byRef: Map<string, WorkflowIndexedEntity[]>;
    byNodeId: Map<string, WorkflowIndexedEntity[]>;
    byBlockOrdinal: Map<number, WorkflowIndexedBlock>;
    byParagraphOrdinal: Map<number, WorkflowIndexedBlock>;
    byBodyParagraphOrdinal: Map<number, WorkflowIndexedBlock>;
    byHeadingOrdinal: Map<number, WorkflowIndexedBlock>;
    byListOrdinal: Map<number, WorkflowIndexedListItem[]>;
    byTableOrdinal: Map<number, WorkflowIndexedTable>;
  };
  diagnostics: WorkflowIndexDiagnostic[];
};

export type BuildWorkflowDocIndexInput = {
  documentHandle: BoundDocApi;
  documentKey: string;
  invokeOptions?: InvokeOptions;
  pageLimit?: number;
  info?: DocInfoResult;
};

function pushLookup<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue): void {
  const existing = map.get(key);
  if (existing == null) {
    map.set(key, [value]);
    return;
  }
  existing.push(value);
}

function pushUniqueLookup<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue): void {
  const existing = map.get(key);
  if (existing == null) {
    map.set(key, [value]);
    return;
  }
  if (!existing.includes(value)) {
    existing.push(value);
  }
}

async function listAllBlocks(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
  pageLimit: number,
): Promise<DocBlocksListResult['blocks']> {
  const blocks: DocBlocksListResult['blocks'] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.blocks.list({ offset, limit: pageLimit, includeText: false }, invokeOptions);
    blocks.push(...page.blocks);
    offset += page.blocks.length;
    if (page.blocks.length === 0 || offset >= page.total) {
      break;
    }
  }
  return blocks;
}

async function listAllListItems(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
  pageLimit: number,
): Promise<DocListsListResult['items']> {
  const items: DocListsListResult['items'] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.lists.list({ offset, limit: pageLimit }, invokeOptions);
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) {
      break;
    }
  }
  return items;
}

function coerceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function getTableShape(
  documentHandle: BoundDocApi,
  nodeId: string,
  invokeOptions: InvokeOptions | undefined,
): Promise<Pick<DocTablesGetResult, 'rows' | 'columns'>> {
  const table = await documentHandle.tables.get({ nodeId }, invokeOptions);
  return { rows: table.rows, columns: table.columns };
}

export async function buildWorkflowDocIndex(input: BuildWorkflowDocIndexInput): Promise<WorkflowDocIndex> {
  const pageLimit = input.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const invokeOptions = input.invokeOptions;
  const info = input.info ?? (await input.documentHandle.info({}, invokeOptions));

  const [rawBlocks, rawListItems] = await Promise.all([
    listAllBlocks(input.documentHandle, invokeOptions, pageLimit),
    listAllListItems(input.documentHandle, invokeOptions, pageLimit),
  ]);

  const diagnostics: WorkflowIndexDiagnostic[] = [];
  let paragraphOrdinal = 0;
  let bodyParagraphOrdinal = 0;
  let headingOrdinal = 0;
  const blocks: WorkflowIndexedBlock[] = rawBlocks.map((block) => {
    const record = block as Record<string, unknown>;
    const textPreview = block.textPreview ?? undefined;
    const nonEmptyText = typeof textPreview === 'string' && textPreview.trim().length > 0;
    const indexed: WorkflowIndexedBlock = {
      kind: 'block',
      ordinal: block.ordinal,
      nodeId: block.nodeId,
      nodeType: block.nodeType,
      ref: block.ref ?? undefined,
      textPreview,
      styleId: typeof record.styleId === 'string' ? record.styleId : undefined,
      styleName: typeof record.styleName === 'string' ? record.styleName : undefined,
      headingLevel: block.headingLevel ?? undefined,
    };

    if (block.nodeType === 'paragraph') {
      paragraphOrdinal += 1;
      indexed.paragraphOrdinal = paragraphOrdinal;
      if (nonEmptyText) {
        bodyParagraphOrdinal += 1;
        indexed.bodyParagraphOrdinal = bodyParagraphOrdinal;
      }
    }

    if (block.nodeType === 'heading') {
      headingOrdinal += 1;
      indexed.headingOrdinal = headingOrdinal;
    }

    return indexed;
  });

  const tables: WorkflowIndexedTable[] = [];
  const tableBlocks = blocks.filter((block) => block.nodeType === 'table');
  for (let index = 0; index < tableBlocks.length; index++) {
    const tableBlock = tableBlocks[index];
    if (tableBlock == null) continue;

    const tableOrdinal = index + 1;
    tableBlock.tableOrdinal = tableOrdinal;

    let rows: number | undefined;
    let columns: number | undefined;
    try {
      const shape = await getTableShape(input.documentHandle, tableBlock.nodeId, invokeOptions);
      rows = shape.rows;
      columns = shape.columns;
    } catch (error) {
      diagnostics.push({
        code: 'TABLE_SHAPE_UNAVAILABLE',
        message: `Failed to resolve table shape for node ${tableBlock.nodeId}.`,
        details: {
          nodeId: tableBlock.nodeId,
          tableOrdinal,
          error: coerceErrorMessage(error),
        },
      });
    }

    tables.push({
      kind: 'table',
      nodeId: tableBlock.nodeId,
      tableOrdinal,
      blockOrdinal: tableBlock.ordinal,
      ref: tableBlock.ref,
      rows,
      columns,
    });
  }

  const lists: WorkflowIndexedListItem[] = rawListItems.map((item, index) => ({
    kind: 'listItem',
    nodeId: item.address.nodeId,
    listId: item.listId,
    ref: item.handle.ref,
    apiOrdinal: item.ordinal,
    indexOrdinal: index + 1,
    level: item.level,
    marker: item.marker,
    listKind: item.kind,
    text: item.text,
  }));

  const byRef = new Map<string, WorkflowIndexedEntity[]>();
  const byNodeId = new Map<string, WorkflowIndexedEntity[]>();
  const byBlockOrdinal = new Map<number, WorkflowIndexedBlock>();
  const byParagraphOrdinal = new Map<number, WorkflowIndexedBlock>();
  const byBodyParagraphOrdinal = new Map<number, WorkflowIndexedBlock>();
  const byHeadingOrdinal = new Map<number, WorkflowIndexedBlock>();
  const byListOrdinal = new Map<number, WorkflowIndexedListItem[]>();
  const byTableOrdinal = new Map<number, WorkflowIndexedTable>();

  for (const block of blocks) {
    if (block.ref != null && block.ref.length > 0) {
      pushLookup(byRef, block.ref, block);
    }
    pushLookup(byNodeId, block.nodeId, block);
    byBlockOrdinal.set(block.ordinal, block);
    if (typeof block.paragraphOrdinal === 'number') {
      byParagraphOrdinal.set(block.paragraphOrdinal, block);
    }
    if (typeof block.bodyParagraphOrdinal === 'number') {
      byBodyParagraphOrdinal.set(block.bodyParagraphOrdinal, block);
    }
    if (typeof block.headingOrdinal === 'number') {
      byHeadingOrdinal.set(block.headingOrdinal, block);
    }
  }

  for (const listItem of lists) {
    if (listItem.ref != null && listItem.ref.length > 0) {
      pushLookup(byRef, listItem.ref, listItem);
    }
    if (!byNodeId.has(listItem.nodeId)) {
      pushLookup(byNodeId, listItem.nodeId, listItem);
    }
    if (typeof listItem.apiOrdinal === 'number') {
      pushUniqueLookup(byListOrdinal, listItem.apiOrdinal, listItem);
    }
    pushUniqueLookup(byListOrdinal, listItem.indexOrdinal, listItem);
  }

  for (const table of tables) {
    if (!byNodeId.has(table.nodeId)) {
      pushLookup(byNodeId, table.nodeId, table);
    }
    if (table.ref != null && table.ref.length > 0 && !byRef.has(table.ref)) {
      pushLookup(byRef, table.ref, table);
    }
    byTableOrdinal.set(table.tableOrdinal, table);
  }

  return {
    documentKey: input.documentKey,
    revision: info.revision,
    builtAtMs: Date.now(),
    counts: info.counts,
    outline: info.outline,
    blocks,
    lists,
    tables,
    lookup: {
      byRef,
      byNodeId,
      byBlockOrdinal,
      byParagraphOrdinal,
      byBodyParagraphOrdinal,
      byHeadingOrdinal,
      byListOrdinal,
      byTableOrdinal,
    },
    diagnostics,
  };
}
