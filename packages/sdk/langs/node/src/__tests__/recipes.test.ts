/**
 * Recipe runtime tests.
 *
 * Exercises the agent_recipe layer against in-memory mocks of the bound doc
 * handle. Recipes must lower flat product arguments into deterministic doc.*
 * calls and produce real pre/post evidence with verification.
 */
import { describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.ts';
import { agentRecipe, isRecipeName, RECIPE_NAMES_LIST } from '../agent/recipes.ts';
import { dispatchSuperDocTool } from '../tools.ts';

type Block = { ordinal: number; nodeId: string; nodeType: string; text: string };
type TableState = {
  nodeId: string;
  rows: number;
  columns: number;
  cells: string[][];
  cellBlockIds: string[][];
  shading?: string;
};
type ListState = {
  listId: string;
  kind: 'ordered' | 'bullet';
  items: Array<{ nodeId: string; text: string }>;
};

type TrackedChange = { id: string; type: string; author?: string };
type ImageRecord = { imageId: string; nodeId: string; alt?: string; caption?: string };
type BlockFormat = Record<string, unknown>;
type TableInsertCall = {
  kind: 'insertRow' | 'insertColumn' | 'deleteRow' | 'deleteColumn' | 'split';
  nodeId: string;
  dryRun?: boolean;
};

function createMockDoc(
  initialBlocks?: Block[],
  initialTrackedChanges?: TrackedChange[],
): {
  doc: BoundDocApi;
  state: {
    revision: string;
    blocks: Block[];
    comments: Array<{ id: string; text: string; nodeId: string }>;
    tables: TableState[];
    lists: ListState[];
    trackedChanges: TrackedChange[];
    images: ImageRecord[];
    formats: Map<string, BlockFormat>;
    tableCalls: TableInsertCall[];
    tocs: Array<{ nodeId: string }>;
  };
  calls: {
    paragraphCreates: number;
    replaceCalls: number;
    mutationCalls: number;
    commentCreates: number;
    tableCreates: number;
    listCreates: number;
    formatApplyCalls: number;
    trackedDecideCalls: number;
    blockListCalls: number;
  };
} {
  const state = {
    revision: 'rev-1',
    blocks: initialBlocks ?? [
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello world.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'Second paragraph.' },
    ],
    comments: [] as Array<{ id: string; text: string; nodeId: string }>,
    tables: [] as TableState[],
    lists: [] as ListState[],
    trackedChanges: (initialTrackedChanges ?? []) as TrackedChange[],
    images: [] as ImageRecord[],
    formats: new Map<string, BlockFormat>(),
    tableCalls: [] as TableInsertCall[],
    tocs: [] as Array<{ nodeId: string }>,
  };
  const calls = {
    paragraphCreates: 0,
    replaceCalls: 0,
    mutationCalls: 0,
    commentCreates: 0,
    tableCreates: 0,
    listCreates: 0,
    formatApplyCalls: 0,
    trackedDecideCalls: 0,
    blockListCalls: 0,
  };
  let nextRev = 1;
  let nextNode = state.blocks.length + 1;
  let nextComment = 1;
  let nextTable = 1;
  let nextList = 1;
  let nextImage = 1;
  let nextToc = 1;
  function bump() {
    nextRev += 1;
    state.revision = `rev-${nextRev}`;
  }

  function renumberBlocks() {
    state.blocks.forEach((b, i) => (b.ordinal = i + 1));
  }

  function insertBlock(block: Block, at?: { kind?: string; target?: { nodeId?: string } }) {
    if (at?.kind === 'after' && at.target?.nodeId) {
      const idx = state.blocks.findIndex((b) => b.nodeId === at.target.nodeId);
      if (idx >= 0) state.blocks.splice(idx + 1, 0, block);
      else state.blocks.push(block);
    } else if (at?.kind === 'before' && at.target?.nodeId) {
      const idx = state.blocks.findIndex((b) => b.nodeId === at.target.nodeId);
      if (idx >= 0) state.blocks.splice(idx, 0, block);
      else state.blocks.push(block);
    } else if (at?.kind === 'documentStart') {
      state.blocks.unshift(block);
    } else {
      state.blocks.push(block);
    }
    renumberBlocks();
  }

  function findTableCellByNodeId(nodeId: string) {
    for (const table of state.tables) {
      for (let rowIndex = 0; rowIndex < table.cellBlockIds.length; rowIndex += 1) {
        const row = table.cellBlockIds[rowIndex] ?? [];
        const columnIndex = row.findIndex((candidate) => candidate === nodeId);
        if (columnIndex >= 0) {
          return { table, rowIndex, columnIndex };
        }
      }
    }
    return null;
  }

  function ensureListForParagraph(
    targetNodeId: string,
    kind: 'ordered' | 'bullet',
    sequenceMode: 'new' | 'continuePrevious',
  ) {
    const targetBlock = state.blocks.find((block) => block.nodeId === targetNodeId);
    if (!targetBlock) return null;
    targetBlock.nodeType = 'listItem';
    const list =
      sequenceMode === 'continuePrevious' && state.lists.length > 0
        ? state.lists[state.lists.length - 1]!
        : (() => {
            const listId = `list${nextList}`;
            nextList += 1;
            const created: ListState = { listId, kind, items: [] };
            state.lists.push(created);
            return created;
          })();
    list.kind = kind;
    list.items.push({ nodeId: targetBlock.nodeId, text: targetBlock.text });
    return list;
  }

  const doc = {
    info: async () => ({
      counts: {
        paragraphs: state.blocks.filter((b) => b.nodeType === 'paragraph').length,
        headings: state.blocks.filter((b) => b.nodeType === 'heading').length,
        tables: state.tables.length,
        images: state.images.length,
        comments: state.comments.length,
        trackedChanges: state.trackedChanges.length,
        lists: state.lists.length,
      },
      outline: [],
      capabilities: {},
      revision: state.revision,
    }),
    blocks: {
      list: async (args?: { offset?: number; limit?: number }) => {
        calls.blockListCalls += 1;
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? state.blocks.length;
        const page = state.blocks.slice(offset, offset + limit);
        return {
          total: state.blocks.length,
          blocks: page.map((b) => ({
            ordinal: b.ordinal,
            nodeId: b.nodeId,
            nodeType: b.nodeType,
            text: b.text,
            textPreview: b.text,
          })),
          revision: state.revision,
        };
      },
    },
    create: {
      paragraph: async (args: { text: string; at?: { kind?: string; target?: { nodeId?: string } } }) => {
        calls.paragraphCreates += 1;
        const id = `n${nextNode}`;
        nextNode += 1;
        const block: Block = {
          ordinal: state.blocks.length + 1,
          nodeId: id,
          nodeType: 'paragraph',
          text: args.text,
        };
        insertBlock(block, args.at);
        bump();
        return { paragraph: { nodeId: id }, revision: { before: 'prev', after: state.revision } };
      },
      heading: async (args: { text: string; level: number; at?: { kind?: string; target?: { nodeId?: string } } }) => {
        calls.paragraphCreates += 1;
        const id = `n${nextNode}`;
        nextNode += 1;
        insertBlock(
          {
            ordinal: state.blocks.length + 1,
            nodeId: id,
            nodeType: 'heading',
            text: args.text,
          },
          args.at,
        );
        bump();
        return { heading: { nodeId: id, level: args.level }, revision: { before: 'prev', after: state.revision } };
      },
      table: async (args: { rows: number; columns: number; at?: { kind?: string; target?: { nodeId?: string } } }) => {
        calls.tableCreates += 1;
        const id = `tbl${nextTable}`;
        nextTable += 1;
        insertBlock(
          {
            ordinal: state.blocks.length + 1,
            nodeId: id,
            nodeType: 'table',
            text: '',
          },
          args.at,
        );
        state.tables.push({
          nodeId: id,
          rows: args.rows,
          columns: args.columns,
          cells: Array.from({ length: args.rows }, () => Array.from({ length: args.columns }, () => '')),
          cellBlockIds: Array.from({ length: args.rows }, (_, rowIndex) =>
            Array.from({ length: args.columns }, (_, columnIndex) => `${id}-r${rowIndex}c${columnIndex}`),
          ),
        });
        bump();
        return { table: { nodeId: id }, revision: { before: 'prev', after: state.revision } };
      },
      tableOfContents: async (args: { at?: { kind?: string; target?: { nodeId?: string } } }) => {
        const id = `toc${nextToc}`;
        nextToc += 1;
        insertBlock(
          {
            ordinal: state.blocks.length + 1,
            nodeId: id,
            nodeType: 'tableOfContents',
            text: '',
          },
          args.at,
        );
        state.tocs.push({ nodeId: id });
        bump();
        return { toc: { nodeId: id }, revision: { before: 'prev', after: state.revision } };
      },
      image: async (args: { src: string; alt?: string; at?: { kind?: string; target?: { nodeId?: string } } }) => {
        const nodeId = `img${nextImage}`;
        const imageId = `imgid${nextImage}`;
        nextImage += 1;
        insertBlock(
          {
            ordinal: state.blocks.length + 1,
            nodeId,
            nodeType: 'image',
            text: '',
          },
          args.at,
        );
        state.images.push({ imageId, nodeId, alt: args.alt });
        bump();
        return { image: { imageId, nodeId }, revision: { before: 'prev', after: state.revision } };
      },
    },
    mutations: {
      apply: async (args: {
        steps: Array<{
          op: string;
          where?: { select?: { pattern?: string }; nodeId?: string; by?: string };
          args?: { replacement?: { text?: string }; inline?: BlockFormat };
        }>;
      }) => {
        calls.mutationCalls += 1;
        for (const step of args.steps) {
          if (step.op === 'text.rewrite') {
            const pattern = step.where?.select?.pattern;
            const replacement = step.args?.replacement?.text ?? '';
            if (pattern) {
              for (const block of state.blocks) {
                block.text = block.text.split(pattern).join(replacement);
              }
            } else if (step.where?.nodeId) {
              const tableCell = findTableCellByNodeId(step.where.nodeId);
              if (tableCell) {
                tableCell.table.cells[tableCell.rowIndex]![tableCell.columnIndex] = replacement;
              } else {
                const target = state.blocks.find((b) => b.nodeId === step.where.nodeId);
                if (target) {
                  target.text = replacement;
                  for (const list of state.lists) {
                    const listItem = list.items.find((item) => item.nodeId === target.nodeId);
                    if (listItem) listItem.text = replacement;
                  }
                }
              }
            }
            calls.replaceCalls += 1;
          } else if (step.op === 'text.delete') {
            const pattern = step.where?.select?.pattern;
            if (pattern) {
              for (const block of state.blocks) {
                block.text = block.text.split(pattern).join('');
              }
            }
          } else if (step.op === 'format.apply') {
            const nodeId = step.where?.nodeId;
            const inline = step.args?.inline ?? {};
            if (nodeId) {
              const existing = state.formats.get(nodeId) ?? {};
              state.formats.set(nodeId, { ...existing, ...inline });
            }
          }
        }
        bump();
        return { revision: { before: 'prev', after: state.revision }, applied: args.steps.length };
      },
    },
    comments: {
      create: async (args: { text: string; target?: { blockId?: string; segments?: Array<{ blockId?: string }> } }) => {
        calls.commentCreates += 1;
        const id = `c${nextComment}`;
        nextComment += 1;
        state.comments.push({
          id,
          text: args.text,
          nodeId: args.target?.blockId ?? args.target?.segments?.[0]?.blockId ?? '',
        });
        bump();
        return { comment: { id }, revision: { before: 'prev', after: state.revision } };
      },
      list: async () => ({
        items: state.comments.map((c) => ({
          id: c.id,
          text: c.text,
          status: 'open',
          target: {
            segments: c.nodeId ? [{ blockId: c.nodeId, range: { start: 0, end: 1 } }] : [],
          },
        })),
      }),
    },
    lists: {
      list: async (args?: { offset?: number; limit?: number }) => {
        const allItems = state.lists.flatMap((list) =>
          list.items.map((item, index) => ({
            listId: list.listId,
            kind: list.kind,
            ordinal: index + 1,
            level: 0,
            text: item.text,
            address: { nodeId: item.nodeId },
          })),
        );
        const offset = args?.offset ?? 0;
        const limit = args?.limit ?? allItems.length;
        return {
          total: allItems.length,
          items: allItems.slice(offset, offset + limit),
        };
      },
      create: async (args: {
        mode: 'fromParagraphs';
        target: { nodeId: string };
        kind?: 'ordered' | 'bullet';
        sequence?: { mode?: 'new' | 'continuePrevious' };
      }) => {
        calls.listCreates += 1;
        const list = ensureListForParagraph(
          args.target.nodeId,
          args.kind ?? 'ordered',
          args.sequence?.mode === 'continuePrevious' ? 'continuePrevious' : 'new',
        );
        if (!list) throw new Error('target paragraph missing for list create');
        bump();
        return {
          listId: list.listId,
          item: list.items[list.items.length - 1],
          revision: { before: 'prev', after: state.revision },
        };
      },
      insert: async (args: { target: { nodeId: string }; position: 'after' | 'before'; text: string }) => {
        const list = state.lists.find((candidate) =>
          candidate.items.some((item) => item.nodeId === args.target.nodeId),
        );
        if (!list) throw new Error('target list item missing for list insert');
        const listIndex = list.items.findIndex((item) => item.nodeId === args.target.nodeId);
        const blockIndex = state.blocks.findIndex((block) => block.nodeId === args.target.nodeId);
        if (listIndex < 0 || blockIndex < 0) throw new Error('target list item index missing');
        const id = `n${nextNode}`;
        nextNode += 1;
        const item = { nodeId: id, text: args.text };
        const insertOffset = args.position === 'before' ? 0 : 1;
        list.items.splice(listIndex + insertOffset, 0, item);
        state.blocks.splice(blockIndex + insertOffset, 0, {
          ordinal: 0,
          nodeId: id,
          nodeType: 'listItem',
          text: args.text,
        });
        renumberBlocks();
        bump();
        return { item, revision: { before: 'prev', after: state.revision } };
      },
    },
    tables: {
      get: async (args: { nodeId: string }) => {
        const t = state.tables.find((tt) => tt.nodeId === args.nodeId);
        return t ? { rows: t.rows, columns: t.columns } : { rows: 0, columns: 0 };
      },
      setShading: async (args: { target?: { nodeId?: string }; nodeId?: string; color: string }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('setShading: table missing');
        t.shading = args.color;
        bump();
        return { success: true, table: { kind: 'block', nodeType: 'table', nodeId: t.nodeId } };
      },
      insertRow: async (args: {
        target?: { nodeId?: string };
        nodeId?: string;
        rowIndex: number;
        position: string;
        dryRun?: boolean;
      }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('insertRow: table missing');
        const insertAt = args.position === 'above' || args.position === 'before' ? args.rowIndex : args.rowIndex + 1;
        state.tableCalls.push({ kind: 'insertRow', nodeId: t.nodeId, dryRun: args.dryRun === true });
        if (!args.dryRun) {
          const newRow = Array.from({ length: t.columns }, () => '');
          const newRowIds = Array.from({ length: t.columns }, (_, col) => `${t.nodeId}-r${t.rows}c${col}-new`);
          t.cells.splice(insertAt, 0, newRow);
          t.cellBlockIds.splice(insertAt, 0, newRowIds);
          t.rows += 1;
          bump();
        }
        return { success: true, revision: { before: 'prev', after: state.revision } };
      },
      insertColumn: async (args: {
        target?: { nodeId?: string };
        nodeId?: string;
        columnIndex: number;
        position: string;
      }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('insertColumn: table missing');
        const insertAt = args.position === 'left' ? args.columnIndex : args.columnIndex + 1;
        for (let r = 0; r < t.rows; r += 1) {
          t.cells[r]!.splice(insertAt, 0, '');
          t.cellBlockIds[r]!.splice(insertAt, 0, `${t.nodeId}-r${r}c${t.columns}-new`);
        }
        t.columns += 1;
        state.tableCalls.push({ kind: 'insertColumn', nodeId: t.nodeId });
        bump();
        return { success: true, revision: { before: 'prev', after: state.revision } };
      },
      deleteRow: async (args: { target?: { nodeId?: string }; nodeId?: string; rowIndex: number }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('deleteRow: table missing');
        t.cells.splice(args.rowIndex, 1);
        t.cellBlockIds.splice(args.rowIndex, 1);
        t.rows = Math.max(0, t.rows - 1);
        state.tableCalls.push({ kind: 'deleteRow', nodeId: t.nodeId });
        bump();
        return { success: true, revision: { before: 'prev', after: state.revision } };
      },
      deleteColumn: async (args: { target?: { nodeId?: string }; nodeId?: string; columnIndex: number }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('deleteColumn: table missing');
        for (let r = 0; r < t.rows; r += 1) {
          t.cells[r]!.splice(args.columnIndex, 1);
          t.cellBlockIds[r]!.splice(args.columnIndex, 1);
        }
        t.columns = Math.max(0, t.columns - 1);
        state.tableCalls.push({ kind: 'deleteColumn', nodeId: t.nodeId });
        bump();
        return { success: true, revision: { before: 'prev', after: state.revision } };
      },
      split: async (args: { target?: { nodeId?: string }; nodeId?: string; rowIndex: number }) => {
        const id = args.target?.nodeId ?? args.nodeId;
        const t = state.tables.find((tt) => tt.nodeId === id);
        if (!t) throw new Error('split: table missing');
        state.tableCalls.push({ kind: 'split', nodeId: t.nodeId });
        bump();
        return { success: true, rowIndex: args.rowIndex, revision: { before: 'prev', after: state.revision } };
      },
    },
    trackChanges: {
      list: async () => ({
        evaluatedRevision: state.revision,
        total: state.trackedChanges.length,
        items: state.trackedChanges.map((c) => ({
          id: c.id,
          type: c.type,
          author: c.author,
          address: { story: { storyType: 'body' } },
        })),
        page: { limit: 250, offset: 0, returned: state.trackedChanges.length },
      }),
      decide: async (args: { decision: 'accept' | 'reject'; target: { id?: string; scope?: 'all' } }) => {
        calls.trackedDecideCalls += 1;
        if (args.target.scope === 'all') {
          state.trackedChanges = [];
        } else if (args.target.id) {
          state.trackedChanges = state.trackedChanges.filter((c) => c.id !== args.target.id);
        }
        bump();
        return { success: true, removed: [{ entityType: 'trackedChange', entityId: args.target.id ?? null }] };
      },
    },
    format: {
      apply: async (args: { blockId: string; start?: number; end?: number; inline?: BlockFormat }) => {
        calls.formatApplyCalls += 1;
        const existing = state.formats.get(args.blockId) ?? {};
        state.formats.set(args.blockId, {
          ...existing,
          ...(args.inline ?? {}),
          _range: { start: args.start, end: args.end },
        });
        bump();
        return { success: true };
      },
    },
    images: {
      insertCaption: async (args: { imageId: string; text: string }) => {
        const image = state.images.find((img) => img.imageId === args.imageId);
        if (image) image.caption = args.text;
        bump();
        return { success: true };
      },
    },
    extract: async () => ({
      blocks: state.tables.flatMap((table, tableOrdinal) =>
        table.cellBlockIds.flatMap((row, rowIndex) =>
          row.map((nodeId, columnIndex) => ({
            nodeId,
            type: 'paragraph',
            text: table.cells[rowIndex]?.[columnIndex] ?? '',
            tableContext: {
              tableOrdinal,
              rowIndex,
              columnIndex,
            },
          })),
        ),
      ),
    }),
    save: async () => ({ success: true }),
  } as unknown as BoundDocApi;

  return { doc, state, calls };
}

describe('agent_recipe', () => {
  test('RECIPE_NAMES_LIST is non-empty and isRecipeName works', () => {
    expect(RECIPE_NAMES_LIST.length).toBeGreaterThan(15);
    expect(isRecipeName('insert_paragraph')).toBe(true);
    expect(isRecipeName('accept_tracked_changes')).toBe(true);
    expect(isRecipeName('color_text')).toBe(true);
    expect(isRecipeName('insert_toc')).toBe(true);
    expect(isRecipeName('not_a_recipe')).toBe(false);
  });

  test('insert_paragraph appends a paragraph and verifies revision change', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_paragraph',
      text: 'Reviewed by counsel on 19 May 2026.',
    });
    expect(receipt.status).toBe('ok');
    expect(calls.paragraphCreates).toBe(1);
    expect(state.blocks.at(-1)?.text).toBe('Reviewed by counsel on 19 May 2026.');
    expect(receipt.verification.every((v) => v.passed)).toBe(true);
  });

  test('insert_paragraph honors placement: document_start', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_paragraph',
      text: 'Top.',
      placement: { at: 'document_start' },
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('Top.');
  });

  test('insert_paragraphs creates multiple paragraphs in order', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_paragraphs',
      texts: ['First added.', 'Second added.', 'Third added.'],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.paragraphCreates).toBe(3);
    expect(state.blocks.slice(-3).map((b) => b.text)).toEqual(['First added.', 'Second added.', 'Third added.']);
    expect(calls.blockListCalls).toBe(1);
  });

  test('insert_paragraphs with headingLevel starts with a heading', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_paragraphs',
      texts: ['Risk Summary', 'Several risks identified.'],
      headingLevel: 1,
    });
    expect(receipt.status).toBe('ok');
    const added = state.blocks.slice(-2);
    expect(added[0]?.nodeType).toBe('heading');
    expect(added[0]?.text).toBe('Risk Summary');
    expect(added[1]?.nodeType).toBe('paragraph');
  });

  test('insert_heading uses a single block snapshot when only revision verification is needed', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_heading',
      text: 'Execution Summary',
      level: 2,
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks.at(-1)?.nodeType).toBe('heading');
    expect(state.blocks.at(-1)?.text).toBe('Execution Summary');
    expect(calls.blockListCalls).toBe(1);
  });

  test('replace_text rewrites matching content via mutations.apply', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'The lender is happy.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'lender approved.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      edits: [{ find: 'lender', replace: 'financier' }],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.mutationCalls).toBe(1);
    expect(state.blocks.map((b) => b.text).join(' ')).toContain('financier');
    expect(state.blocks.map((b) => b.text).join(' ')).not.toContain('lender');
    expect(calls.blockListCalls).toBe(0);
  });

  test('replace_text can scope multiple replacements to one selected block', async () => {
    const { doc, state } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'n1',
        nodeType: 'paragraph',
        text: 'The Lender is a director and shareholder of the Company.',
      },
      {
        ordinal: 2,
        nodeId: 'n2',
        nodeType: 'paragraph',
        text: 'The Lender approved the extension.',
      },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      edits: [
        { find: 'Lender', replace: 'Borrower' },
        { find: 'Company', replace: 'Corporation' },
      ],
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toContain('Borrower');
    expect(state.blocks[0]?.text).toContain('Corporation');
    expect(state.blocks[1]?.text).toBe('The Lender approved the extension.');
  });

  test('replace_text can target the first block matching multiple terms via textSearch', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'The Lender approved the extension.' },
      {
        ordinal: 2,
        nodeId: 'n2',
        nodeType: 'paragraph',
        text: 'The Lender is a director and shareholder of the Company.',
      },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      selector: {
        kind: 'textSearch',
        terms: ['Lender', 'Company'],
        match: 'all',
      },
      edits: [
        { find: 'Lender', replace: 'Borrower' },
        { find: 'Company', replace: 'Corporation' },
      ],
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('The Lender approved the extension.');
    expect(state.blocks[1]?.text).toBe('The Borrower is a director and shareholder of the Corporation.');
  });

  test('replace_text can target an inspected table cell by coordinates', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'h1', nodeType: 'heading', text: 'Master services agreement' },
      { ordinal: 2, nodeId: 'tbl1', nodeType: 'table', text: '' },
    ]);
    state.tables.push({
      nodeId: 'tbl1',
      rows: 2,
      columns: 2,
      cells: [
        ['1.1', 'Definitions'],
        ['1.2', 'Confidential Information means any non-public information disclosed by one party.'],
      ],
      cellBlockIds: [
        ['tbl1-r0c0', 'tbl1-r0c1'],
        ['tbl1-r1c0', 'tbl1-r1c1'],
      ],
    });
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      selector: { kind: 'tableCell', tableOrdinal: 1, rowIndex: 1, columnIndex: 1 },
      edits: [{ find: 'Confidential Information', replace: 'Proprietary Data' }],
    });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]?.cells[1]?.[1]).toContain('Proprietary Data');
    expect(state.tables[0]?.cells[1]?.[1]).not.toContain('Confidential Information');
  });

  test('replace_text applies only matching global multi-edit replacements in one mutation call', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'The lender is happy.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'The guarantor approved.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      edits: [
        { find: 'lender', replace: 'financier' },
        { find: 'missing phrase', replace: 'unused replacement' },
      ],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.mutationCalls).toBe(1);
    expect(calls.replaceCalls).toBe(1);
    expect(state.blocks[0]?.text).toBe('The financier is happy.');
    expect(state.blocks[1]?.text).toBe('The guarantor approved.');
    expect(receipt.executedOperations[0]?.rationale).toContain('"missing phrase"');
  });

  test('replace_text fails without mutating when no global multi-edit replacements match', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'The lender is happy.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'The guarantor approved.' },
    ]);
    const beforeTexts = state.blocks.map((block) => block.text);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      edits: [
        { find: 'missing one', replace: 'unused replacement' },
        { find: 'missing two', replace: 'another unused replacement' },
      ],
    });
    expect(receipt.status).toBe('failed');
    expect(calls.mutationCalls).toBe(0);
    expect(calls.replaceCalls).toBe(0);
    expect(state.blocks.map((block) => block.text)).toEqual(beforeTexts);
    expect(receipt.errors?.[0]?.message).toMatch(/none of the requested text replacements matched/i);
  });

  test('replace_text remains strict for selector-scoped missing text', async () => {
    const { doc, state, calls } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'n1',
        nodeType: 'paragraph',
        text: 'The Lender is a director and shareholder of the Company.',
      },
      {
        ordinal: 2,
        nodeId: 'n2',
        nodeType: 'paragraph',
        text: 'The Lender approved the extension.',
      },
    ]);
    const beforeTexts = state.blocks.map((block) => block.text);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_text',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      edits: [
        { find: 'Lender', replace: 'Borrower' },
        { find: 'Missing Term', replace: 'Corporation' },
      ],
    });
    expect(receipt.status).toBe('failed');
    expect(calls.mutationCalls).toBe(0);
    expect(state.blocks.map((block) => block.text)).toEqual(beforeTexts);
  });

  test('delete_text removes matching content', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello — world — here.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'delete_text',
      finds: ['—'],
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('Hello  world  here.');
  });

  test('replace_top_date updates the first date-like paragraph near the top', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'SHAREHOLDER LOAN AGREEMENT' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'DATE: 30 March 2026' },
      { ordinal: 3, nodeId: 'n3', nodeType: 'paragraph', text: 'Body paragraph.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'replace_top_date',
      date: '19 May 2026',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[1]?.text).toBe('DATE: 19 May 2026');
  });

  test('append_list creates a list with the requested items', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'append_list',
      items: ['Review scope.', 'Confirm signatories.', 'Capture risk register.', 'Notify counsel.'],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.listCreates).toBe(1);
    expect(state.lists.at(-1)?.items.map((item) => item.text)).toEqual([
      'Review scope.',
      'Confirm signatories.',
      'Capture risk register.',
      'Notify counsel.',
    ]);
  });

  test('create_table inserts a table with the requested shape', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'create_table',
      rows: 2,
      columns: 2,
      cellTexts: [
        ['Owner', 'Stage'],
        ['', ''],
      ],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.tableCreates).toBe(1);
    expect(state.tables.at(-1)?.rows).toBe(2);
    expect(state.tables.at(-1)?.columns).toBe(2);
    expect(state.tables.at(-1)?.cells[0]?.[0]).toBe('Owner');
    expect(state.tables.at(-1)?.cells[0]?.[1]).toBe('Stage');
  });

  test('set_table_shading colors the first table by default', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'tbl1', nodeType: 'table', text: '' }]);
    state.tables.push({
      nodeId: 'tbl1',
      rows: 1,
      columns: 1,
      cells: [['Value']],
      cellBlockIds: [['tbl1-r0c0']],
    });
    const receipt = await agentRecipe(doc, {
      recipe: 'set_table_shading',
      color: 'light grey',
    });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]?.shading).toBe('#D3D3D3');
  });

  test('comment_paragraphs adds one comment per body paragraph', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'First clause.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second clause.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'comment_paragraphs',
      commentText: 'Reviewer needs a second pass here.',
    });
    expect(receipt.status).toBe('ok');
    expect(state.comments.length).toBe(2);
    expect(state.comments.every((c) => c.text === 'Reviewer needs a second pass here.')).toBe(true);
  });

  test('add_comment targets a specific paragraph by selector', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'First.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'add_comment',
      commentText: 'Note',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 2 },
    });
    expect(receipt.status).toBe('ok');
    expect(state.comments.length).toBe(1);
    expect(state.comments[0]?.nodeId).toBe('p2');
  });

  test('rewrite_block replaces the text of a selected block', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Old text.' }]);
    const receipt = await agentRecipe(doc, {
      recipe: 'rewrite_block',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      text: 'New text.',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('New text.');
  });

  test('rewrite_block normalizes an all-caps title phrase into display title case', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'SHAREHOLDER LOAN AGREEMENT' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'rewrite_block',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      text: 'This magnificent shareholder loan agreement sets out the terms.',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toContain('Shareholder Loan Agreement');
    expect(state.blocks[0]?.text).not.toContain('shareholder loan agreement');
  });

  test('agent_recipe rejects unknown recipe name', async () => {
    const { doc } = createMockDoc();
    await expect(agentRecipe(doc, { recipe: 'bogus_thing' })).rejects.toThrow(/unknown recipe/);
  });

  test('agent_recipe rejects missing required arguments', async () => {
    const { doc } = createMockDoc();
    await expect(agentRecipe(doc, { recipe: 'insert_paragraph' })).rejects.toThrow(/text/);
  });

  test('accept_tracked_changes removes all changes via doc.trackChanges.decide', async () => {
    const { doc, state, calls } = createMockDoc(undefined, [
      { id: 't1', type: 'insert', author: 'Alice' },
      { id: 't2', type: 'delete', author: 'Bob' },
    ]);
    const receipt = await agentRecipe(doc, { recipe: 'accept_tracked_changes' });
    expect(receipt.status).toBe('ok');
    expect(state.trackedChanges.length).toBe(0);
    expect(calls.trackedDecideCalls).toBe(1);
  });

  test('reject_tracked_changes by author only removes that author', async () => {
    const { doc, state } = createMockDoc(undefined, [
      { id: 't1', type: 'insert', author: 'Alice' },
      { id: 't2', type: 'delete', author: 'Bob' },
      { id: 't3', type: 'insert', author: 'alice' },
    ]);
    const receipt = await agentRecipe(doc, { recipe: 'reject_tracked_changes', author: 'Alice' });
    expect(receipt.status).toBe('ok');
    expect(state.trackedChanges.map((c) => c.id)).toEqual(['t2']);
  });

  test('accept_tracked_changes is a no-op when there are no tracked changes', async () => {
    const { doc, calls } = createMockDoc();
    const receipt = await agentRecipe(doc, { recipe: 'accept_tracked_changes' });
    expect(receipt.status).toBe('ok');
    expect(calls.trackedDecideCalls).toBe(0);
  });

  test('normalize_body_font_size applies format.apply to every body block', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'A.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'B.' },
      { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: '   ' },
    ]);
    const receipt = await agentRecipe(doc, { recipe: 'normalize_body_font_size', fontSize: 11 });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('p1')?.fontSize).toBe(11);
    expect(state.formats.get('p2')?.fontSize).toBe(11);
    // empty paragraph is excluded
    expect(state.formats.has('p3')).toBe(false);
  });

  test('color_text by targetText applies format.apply to every match across body', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'urgent matter to resolve.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'no urgent items here.' },
      { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: 'unrelated.' },
    ]);
    const receipt = await agentRecipe(doc, { recipe: 'color_text', color: 'red', targetText: 'urgent' });
    expect(receipt.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(2);
    expect(state.formats.get('p1')?.color).toBe('FF0000');
    expect(state.formats.get('p2')?.color).toBe('FF0000');
    expect(state.formats.has('p3')).toBe(false);
  });

  test('color_text by selector colors only the selected block', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'one.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'two.' },
    ]);
    const receipt = await agentRecipe(doc, {
      recipe: 'color_text',
      color: '#00B050',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 2 },
    });
    expect(receipt.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(1);
    expect(state.formats.get('p2')?.color).toBe('00B050');
    expect(state.formats.has('p1')).toBe(false);
  });

  test('apply_letter_spacing applies inline letterSpacing to the selected block', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'h1', nodeType: 'heading', text: 'Title' }]);
    const receipt = await agentRecipe(doc, {
      recipe: 'apply_letter_spacing',
      selector: { kind: 'ordinal', ordinalKind: 'headingOrdinal', value: 1 },
      letterSpacing: 3,
    });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('h1')?.letterSpacing).toBe(3);
  });

  test('insert_toc inserts a TOC at document start with optional title', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await agentRecipe(doc, { recipe: 'insert_toc', title: 'Contents' });
    expect(receipt.status).toBe('ok');
    expect(state.tocs.length).toBe(1);
    expect(state.blocks.some((b) => b.nodeType === 'heading' && b.text === 'Contents')).toBe(true);
    expect(state.blocks.some((b) => b.nodeType === 'tableOfContents')).toBe(true);
  });

  test('insert_image_with_caption creates an image and attaches a caption', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_image_with_caption',
      src: 'https://example.com/a.png',
      caption: 'Figure 1: example.',
    });
    expect(receipt.status).toBe('ok');
    expect(state.images.length).toBe(1);
    expect(state.images[0]?.caption).toBe('Figure 1: example.');
  });

  test('insert_table_row appends a row to the only table and populates cells', async () => {
    const { doc, state } = createMockDoc();
    await agentRecipe(doc, {
      recipe: 'create_table',
      rows: 2,
      columns: 2,
      cellTexts: [
        ['Owner', 'Stage'],
        ['', ''],
      ],
    });
    const beforeRows = state.tables[0]!.rows;
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_table_row',
      cellTexts: ['Alice', 'Draft'],
    });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]!.rows).toBe(beforeRows + 1);
    const lastRow = state.tables[0]!.cells[state.tables[0]!.rows - 1]!;
    expect(lastRow[0]).toBe('Alice');
    expect(lastRow[1]).toBe('Draft');
  });

  test('insert_table_row dryRun previews without mutating the table', async () => {
    const { doc, state } = createMockDoc();
    await agentRecipe(doc, {
      recipe: 'create_table',
      rows: 2,
      columns: 2,
    });
    const beforeRevision = state.revision;
    const beforeRows = state.tables[0]!.rows;
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_table_row',
      rowIndex: 0,
      position: 'above',
      cellTexts: ['Preview row (magnificent)'],
      dryRun: true,
    });
    expect(receipt.status).toBe('ok');
    expect(state.revision).toBe(beforeRevision);
    expect(state.tables[0]!.rows).toBe(beforeRows);
    expect(state.tableCalls.at(-1)?.dryRun).toBe(true);
    expect(receipt.verification.every((entry) => entry.passed)).toBe(true);
  });

  test('insert_table_column adds a column and optional header text', async () => {
    const { doc, state } = createMockDoc();
    await agentRecipe(doc, { recipe: 'create_table', rows: 2, columns: 2 });
    const receipt = await agentRecipe(doc, {
      recipe: 'insert_table_column',
      headerText: 'Notes',
    });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]!.columns).toBe(3);
    expect(state.tables[0]!.cells[0]![2]).toBe('Notes');
  });

  test('delete_table_row removes the requested row', async () => {
    const { doc, state } = createMockDoc();
    await agentRecipe(doc, { recipe: 'create_table', rows: 3, columns: 2 });
    const receipt = await agentRecipe(doc, { recipe: 'delete_table_row', rowIndex: 1 });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]!.rows).toBe(2);
  });

  test('split_table calls tables.split with the requested rowIndex', async () => {
    const { doc, state } = createMockDoc();
    await agentRecipe(doc, { recipe: 'create_table', rows: 4, columns: 2 });
    const receipt = await agentRecipe(doc, {
      recipe: 'split_table',
      rowIndex: 2,
      separatorText: 'Continued',
    });
    expect(receipt.status).toBe('ok');
    expect(state.tableCalls.some((c) => c.kind === 'split')).toBe(true);
    expect(state.blocks.some((b) => b.nodeType === 'paragraph' && b.text === 'Continued')).toBe(true);
  });

  test('color_text fails closed if targetText is not found anywhere', async () => {
    const { doc } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'plain text.' }]);
    const receipt = await agentRecipe(doc, { recipe: 'color_text', color: 'red', targetText: 'missing' });
    expect(receipt.status).toBe('failed');
  });

  test('dispatchSuperDocTool routes agent_recipe in the product profile', async () => {
    const { doc, state } = createMockDoc();
    const result = (await dispatchSuperDocTool(
      doc,
      'agent_recipe',
      { recipe: 'insert_paragraph', text: 'Dispatched.' },
      { toolsetProfile: 'product' },
    )) as {
      status: string;
      executedOperations: Array<{ operationId: string; result?: Record<string, unknown> }>;
      verificationPassed: boolean;
    };
    expect(result.status).toBe('ok');
    expect(result.verificationPassed).toBe(true);
    expect(result.executedOperations[0]?.operationId).toBe('doc.create.paragraph');
    expect(result.executedOperations[0]?.result).not.toHaveProperty('data');
    expect(state.blocks.at(-1)?.text).toBe('Dispatched.');
  });
});
