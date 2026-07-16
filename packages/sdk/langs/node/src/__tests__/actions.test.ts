/**
 * Action runtime tests.
 *
 * Exercises the superdoc_perform_action layer against in-memory mocks of the bound doc
 * handle. Actions must lower flat product arguments into deterministic doc.*
 * calls and produce real pre/post evidence with verification.
 */
import { describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.ts';
import {
  superdocPerformAction,
  isActionName,
  ACTION_GROUPS,
  ACTION_HINTS,
  ACTION_NAMES_LIST,
} from '../agent/actions.ts';
import { dispatchSuperDocTool } from '../tools.ts';

type Block = {
  ordinal: number;
  nodeId: string;
  nodeType: string;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  styleId?: string;
  headingLevel?: number;
  numbering?: { marker?: string | null; path?: number[] | null } | null;
};
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
    /** Raw create payloads — shape assertions must see exactly what was sent. */
    commentCreateCalls: Array<Record<string, any>>;
    tableCreates: number;
    listCreates: number;
    formatApplyCalls: number;
    trackedDecideCalls: number;
    blockListCalls: number;
    listSplits: number;
    /** Second (MutationOptions) arg captured from create.paragraph — the dual-dialect channel. */
    paragraphCreateOptions: Array<Record<string, unknown> | undefined>;
    /** Second (MutationOptions) arg captured from create.heading. */
    headingCreateOptions: Array<Record<string, unknown> | undefined>;
    /** Second (MutationOptions) arg captured from blocks.deleteRange. */
    deleteRangeOptions: Array<Record<string, unknown> | undefined>;
    /** Second (MutationOptions) arg captured from lists.create. */
    listCreateOptions: Array<Record<string, unknown> | undefined>;
    /** lists.attach calls with both dialect channels captured. */
    listAttachCalls: Array<{ args: Record<string, any>; options?: Record<string, unknown> }>;
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
    commentCreateCalls: [] as Array<Record<string, any>>,
    tableCreates: 0,
    listCreates: 0,
    formatApplyCalls: 0,
    trackedDecideCalls: 0,
    blockListCalls: 0,
    listSplits: 0,
    paragraphCreateOptions: [] as Array<Record<string, unknown> | undefined>,
    headingCreateOptions: [] as Array<Record<string, unknown> | undefined>,
    deleteRangeOptions: [] as Array<Record<string, unknown> | undefined>,
    listCreateOptions: [] as Array<Record<string, unknown> | undefined>,
    listAttachCalls: [] as Array<{ args: Record<string, any>; options?: Record<string, unknown> }>,
  };
  let nextRev = 1;
  // Simple history model: undo always succeeds (pretend infinite back-history)
  // and grows the redo budget; redo consumes it. Enough to exercise
  // undo_changes/redo_changes without a full ProseMirror history stack.
  let histRedoBudget = 0;
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
            ...(b.fontFamily ? { fontFamily: b.fontFamily } : {}),
            ...(typeof b.fontSize === 'number' ? { fontSize: b.fontSize } : {}),
            ...(b.bold ? { bold: b.bold } : {}),
            ...(b.color ? { color: b.color } : {}),
            ...(b.styleId ? { styleId: b.styleId } : {}),
            ...(typeof b.headingLevel === 'number' ? { headingLevel: b.headingLevel } : {}),
            numbering: b.numbering ?? null,
          })),
          revision: state.revision,
        };
      },
      // Inclusive block-range delete by nodeId, used by the structure move
      // workflow (move_range). Returns the count removed; renumbers + bumps.
      deleteRange: async (
        args: {
          start?: { nodeId?: string };
          end?: { nodeId?: string };
          force?: boolean;
          changeMode?: string;
        },
        options?: Record<string, unknown>,
      ) => {
        calls.deleteRangeOptions.push(options);
        const startId = args.start?.nodeId;
        const endId = args.end?.nodeId;
        const startIdx = state.blocks.findIndex((b) => b.nodeId === startId);
        const endIdx = state.blocks.findIndex((b) => b.nodeId === endId);
        if (startIdx < 0 || endIdx < 0) {
          return { success: true as const, deletedCount: 0 };
        }
        const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const removed = state.blocks.splice(lo, hi - lo + 1);
        renumberBlocks();
        bump();
        return {
          success: true as const,
          deletedCount: removed.length,
          deleted: removed.map((b) => ({ kind: 'block', nodeType: b.nodeType, nodeId: b.nodeId })),
          revision: { before: 'prev', after: state.revision },
        };
      },
    },
    create: {
      paragraph: async (
        args: { text: string; at?: { kind?: string; target?: { nodeId?: string } } },
        options?: Record<string, unknown>,
      ) => {
        calls.paragraphCreates += 1;
        calls.paragraphCreateOptions.push(options);
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
      heading: async (
        args: { text: string; level: number; at?: { kind?: string; target?: { nodeId?: string } } },
        options?: Record<string, unknown>,
      ) => {
        calls.paragraphCreates += 1;
        calls.headingCreateOptions.push(options);
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
          where?: {
            select?: { pattern?: string };
            nodeId?: string;
            by?: string;
            target?: {
              kind?: string;
              start?: { blockId?: string; offset?: number };
              end?: { blockId?: string; offset?: number };
            };
          };
          args?: { replacement?: { text?: string }; inline?: BlockFormat };
        }>;
      }) => {
        calls.mutationCalls += 1;
        // Span-targeted rewrites (scoped replace) carry original-text offsets;
        // apply them right-to-left so earlier spans stay valid, like the real
        // engine's atomic position mapping.
        const selectionRewrites = args.steps
          .filter((step) => step.op === 'text.rewrite' && step.where?.target?.kind === 'selection')
          .sort((a, b) => (b.where!.target!.start!.offset ?? 0) - (a.where!.target!.start!.offset ?? 0));
        for (const step of selectionRewrites) {
          const blockId = step.where!.target!.start!.blockId!;
          const start = step.where!.target!.start!.offset ?? 0;
          const end = step.where!.target!.end!.offset ?? start;
          const replacement = step.args?.replacement?.text ?? '';
          const tableCell = findTableCellByNodeId(blockId);
          if (tableCell) {
            const current = tableCell.table.cells[tableCell.rowIndex]![tableCell.columnIndex]!;
            tableCell.table.cells[tableCell.rowIndex]![tableCell.columnIndex] =
              current.slice(0, start) + replacement + current.slice(end);
          } else {
            const target = state.blocks.find((b) => b.nodeId === blockId);
            if (target) target.text = target.text.slice(0, start) + replacement + target.text.slice(end);
          }
          calls.replaceCalls += 1;
        }
        for (const step of args.steps) {
          if (step.where?.target?.kind === 'selection') continue;
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
    history: {
      undo: async () => {
        histRedoBudget += 1;
        bump();
        return { noop: false };
      },
      redo: async () => {
        if (histRedoBudget <= 0) return { noop: true };
        histRedoBudget -= 1;
        bump();
        return { noop: false };
      },
    },
    comments: {
      // create threads a REPLY when parentCommentId is given (no separate
      // `reply` op — mirrors the real document-API contract).
      create: async (args: {
        text: string;
        target?: { blockId?: string; segments?: Array<{ blockId?: string }> };
        parentCommentId?: string;
      }) => {
        calls.commentCreates += 1;
        calls.commentCreateCalls.push({ ...args });
        const id = `c${nextComment}`;
        nextComment += 1;
        const parentNodeId = args.parentCommentId
          ? state.comments.find((c) => c.id === args.parentCommentId)?.nodeId
          : undefined;
        state.comments.push({
          id,
          text: args.text,
          nodeId: args.target?.blockId ?? args.target?.segments?.[0]?.blockId ?? parentNodeId ?? '',
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
      split: async (args: { target: { nodeId: string }; restartNumbering?: boolean }) => {
        calls.listSplits += 1;
        bump();
        return {
          success: true,
          listId: 'list-new',
          numId: 99,
          restartedAt: args.restartNumbering === false ? null : 1,
        };
      },
      attach: async (
        args: { target: { nodeId: string }; attachTo: { nodeId: string }; level: number },
        options?: Record<string, unknown>,
      ) => {
        calls.listAttachCalls.push({ args: { ...args }, options });
        const block = state.blocks.find((b) => b.nodeId === args.target.nodeId);
        if (block) {
          block.nodeType = 'listItem';
          // Reflect the requested outline level as a path of that depth so the
          // action's read-back reports level = path.length - 1.
          block.numbering = { marker: `L${args.level}`, path: Array.from({ length: args.level + 1 }, () => 1) };
        }
        bump();
        return { success: true, item: { nodeId: args.target.nodeId, level: args.level } };
      },
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
      create: async (
        args: {
          mode: 'fromParagraphs';
          target: { nodeId?: string; from?: { nodeId?: string }; to?: { nodeId?: string } };
          kind?: 'ordered' | 'bullet';
          sequence?: { mode?: 'new' | 'continuePrevious' };
        },
        options?: Record<string, unknown>,
      ) => {
        calls.listCreates += 1;
        calls.listCreateOptions.push(options);
        // Range form ({from,to}) converts each paragraph in the span.
        if (args.target.from?.nodeId != null) {
          const fromIdx = state.blocks.findIndex((b) => b.nodeId === args.target.from!.nodeId);
          const toIdx = args.target.to?.nodeId
            ? state.blocks.findIndex((b) => b.nodeId === args.target.to!.nodeId)
            : fromIdx;
          if (fromIdx < 0 || toIdx < fromIdx) throw new Error('bad fromParagraphs range');
          let rangeList: ListState | null = null;
          for (let i = fromIdx; i <= toIdx; i += 1) {
            rangeList = ensureListForParagraph(
              state.blocks[i]!.nodeId,
              args.kind ?? 'ordered',
              rangeList == null ? 'new' : 'continuePrevious',
            );
          }
          bump();
          return { listId: rangeList!.listId, revision: { before: 'prev', after: state.revision } };
        }
        const list = ensureListForParagraph(
          args.target.nodeId!,
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

describe('superdoc_perform_action', () => {
  test('ACTION_NAMES_LIST is non-empty and isActionName works', () => {
    expect(ACTION_NAMES_LIST.length).toBeGreaterThan(15);
    expect(isActionName('insert_paragraphs')).toBe(true);
    expect(isActionName('insert_paragraph')).toBe(false);
    expect(isActionName('replace_top_date')).toBe(false);
    expect(isActionName('accept_tracked_changes')).toBe(true);
    expect(isActionName('format_text')).toBe(true);
    expect(isActionName('color_text')).toBe(false);
    expect(isActionName('insert_toc')).toBe(true);
    expect(isActionName('convert_list')).toBe(true);
    expect(isActionName('undo_changes')).toBe(true);
    expect(isActionName('attach_numbering')).toBe(true);
    expect(isActionName('not_a_action')).toBe(false);
  });

  test('ACTION_GROUPS and ACTION_HINTS cover ACTION_NAMES_LIST exactly', () => {
    // The advertised tool description is rendered from these tables; a action
    // missing here is a action the model never learns about.
    const grouped = ACTION_GROUPS.flatMap((group) => group.actions);
    expect([...grouped].sort()).toEqual([...ACTION_NAMES_LIST].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const name of ACTION_NAMES_LIST) {
      expect(ACTION_HINTS[name]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('system prompt ACTIONS section stays in sync with the registry (no drift)', async () => {
    // The shipped system prompt hand-documents every action. Drift is a real
    // failure mode: a PHANTOM entry teaches the model to call an action that
    // does not exist ("unknown action"), and a MISSING entry hides a real
    // capability. This guard failed to exist when the prompt shipped 2 phantom
    // actions (insert_image_with_caption, set_table_shading) and omitted 8
    // real ones.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // BOTH bundled prompt variants must document exactly the registry: the
    // full prompt and the actions-only variant returned when
    // superdoc_execute_code is excluded.
    for (const file of ['system-prompt.md']) {
      const prompt = readFileSync(join(import.meta.dir, '..', 'prompts', file), 'utf8');
      // Per-action entries render as "- name: …" (or "- a / b: …" for pairs).
      const listed = [...prompt.matchAll(/^- ([a-z_]+)(?: \/ ([a-z_]+))?:/gm)]
        .flatMap((m) => [m[1], m[2]])
        .filter((n): n is string => Boolean(n));
      const missing = ACTION_NAMES_LIST.filter((n) => !listed.includes(n));
      const phantom = listed.filter((n) => !ACTION_NAMES_LIST.includes(n as (typeof ACTION_NAMES_LIST)[number]));
      expect(missing, file).toEqual([]);
      expect(phantom, file).toEqual([]);
    }
  });

  test('convert_list without kind returns a teaching failure receipt', async () => {
    const { doc } = createMockDoc();
    const receipt = await superdocPerformAction(doc, { action: 'convert_list' });
    expect(receipt.status).toBe('failed');
    expect(receipt.errors?.[0]?.code).toBe('INVALID_ARGUMENT');
    expect(receipt.errors?.[0]?.message).toContain('ordered');
  });

  test('attach_numbering without likeMarker returns a teaching failure receipt', async () => {
    const { doc } = createMockDoc();
    const receipt = await superdocPerformAction(doc, { action: 'attach_numbering', anchorText: 'Hello' });
    expect(receipt.status).toBe('failed');
    expect(receipt.errors?.[0]?.message).toContain('likeMarker');
  });

  test('attach_numbering tracked threads changeMode through BOTH dialect channels', async () => {
    // Regression (numbering-001): changeMode rode only the 2nd MutationOptions
    // arg, which the CLI transport does not encode — tracked numbering ran
    // direct and no w:pPrChange was recorded. Both channels must carry it.
    const { doc, calls } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'n1',
        nodeType: 'listItem',
        text: 'First obligation.',
        numbering: { marker: '1.', path: [1] },
      },
      {
        ordinal: 2,
        nodeId: 'n2',
        nodeType: 'listItem',
        text: 'Second obligation.',
        numbering: { marker: '2.', path: [2] },
      },
      { ordinal: 3, nodeId: 'n3', nodeType: 'paragraph', text: 'Third obligation shall also apply.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'attach_numbering',
      anchorText: 'Third obligation shall also apply.',
      likeMarker: '2.',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    const attach = calls.listAttachCalls.at(-1);
    expect(attach?.args.changeMode).toBe('tracked');
    expect((attach?.options as { changeMode?: string } | undefined)?.changeMode).toBe('tracked');
  });

  test('insert_paragraphs with a single text appends a paragraph and verifies revision change', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_paragraphs',
      text: 'Reviewed by counsel on 19 May 2026.',
    });
    expect(receipt.status).toBe('ok');
    expect(calls.paragraphCreates).toBe(1);
    expect(state.blocks.at(-1)?.text).toBe('Reviewed by counsel on 19 May 2026.');
    expect(receipt.verification.every((v) => v.passed)).toBe(true);
  });

  test('insert_paragraphs (single text) honors placement: document_start', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_paragraphs',
      text: 'Top.',
      placement: { at: 'document_start' },
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('Top.');
  });

  test('insert_paragraphs creates multiple paragraphs in order', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_paragraphs',
      texts: ['First added.', 'Second added.', 'Third added.'],
    });
    expect(receipt.status).toBe('ok');
    expect(calls.paragraphCreates).toBe(3);
    expect(state.blocks.slice(-3).map((b) => b.text)).toEqual(['First added.', 'Second added.', 'Third added.']);
    // 1 pre-snapshot + 2 contextual-formatting reads (pre rows / post rows).
    expect(calls.blockListCalls).toBe(3);
  });

  test('insert_paragraphs with headingLevel starts with a heading', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_paragraphs',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_heading',
      text: 'Execution Summary',
      level: 2,
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks.at(-1)?.nodeType).toBe('heading');
    expect(state.blocks.at(-1)?.text).toBe('Execution Summary');
    // 1 pre-snapshot + 2 contextual-formatting reads (pre rows / post rows).
    expect(calls.blockListCalls).toBe(3);
  });

  test('replace_text rewrites matching content via mutations.apply', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'The lender is happy.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'lender approved.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
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

  test('replace_text reports partial for selector-scoped missing text and applies the rest', async () => {
    // Old behavior was all-or-nothing (fail both edits if one was missing).
    // The span-targeted scoped path applies what matches and reports the
    // skipped finds per-edit — a half-done request must read as partial,
    // never as silent failure of the edits that DID match.
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
    const receipt = await superdocPerformAction(doc, {
      action: 'replace_text',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      edits: [
        { find: 'Lender', replace: 'Borrower' },
        { find: 'Missing Term', replace: 'Corporation' },
      ],
    });
    expect(receipt.status).toBe('partial');
    expect(calls.mutationCalls).toBe(1);
    expect(state.blocks[0]?.text).toContain('Borrower');
    expect(state.blocks[1]?.text).toBe('The Lender approved the extension.');
    const skipped = receipt.editsSkipped as Array<{ find: string }>;
    expect(skipped?.[0]?.find).toBe('Missing Term');
    expect(receipt.nextStep).toMatch(/NOT applied/);
  });

  test('delete_text removes matching content', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello — world — here.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'delete_text',
      finds: ['—'],
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('Hello  world  here.');
  });

  test('delete_text with a selector scopes deletion to one block', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Keep this  extra bit.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Untouched  extra bit.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'delete_text',
      finds: ['  extra bit'],
      selector: { kind: 'nodeId', nodeId: 'p1' },
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('Keep this.');
    expect(state.blocks[1]?.text).toBe('Untouched  extra bit.'); // other block untouched
  });

  test('delete_text refuses an unscoped whitespace-only find (the 1170-target footgun)', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'a b c d.' }]);
    const receipt = await superdocPerformAction(doc, { action: 'delete_text', finds: [' '] });
    expect(receipt.status).toBe('failed');
    expect(JSON.stringify(receipt.errors)).toContain('whitespace-only');
    expect(state.blocks[0]?.text).toBe('a b c d.'); // no mutation
  });

  test('redo_changes reports nothing to redo when no undo preceded it', async () => {
    const { doc } = createMockDoc();
    const receipt: any = await superdocPerformAction(doc, { action: 'redo_changes', steps: 1 });
    expect(receipt.status).toBe('failed');
    expect(receipt.redone).toBe(0);
    expect(String(receipt.note)).toContain('nothing to redo');
  });

  test('redo_changes steps history forward after an undo overshoot', async () => {
    const { doc } = createMockDoc();
    const undo: any = await superdocPerformAction(doc, { action: 'undo_changes', steps: 2 });
    expect(undo.status).toBe('ok');
    expect(undo.undone).toBe(2);
    // The undo receipt must point at redo_changes, not the disabled execute_code.
    expect(String(undo.note)).toContain('redo_changes');
    expect(String(undo.note)).not.toContain('execute_code');
    const redo: any = await superdocPerformAction(doc, { action: 'redo_changes', steps: 2 });
    expect(redo.status).toBe('ok');
    expect(redo.redone).toBe(2);
  });

  test('append_list creates a list with the requested items', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'append_list',
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

  test('append_list with placement threads tracked changeMode through every mutation (dual dialect)', async () => {
    const { doc, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Anchor paragraph.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Signature block.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'append_list',
      items: ['One', 'Two'],
      changeMode: 'tracked',
      placement: { at: 'after', selector: { kind: 'nodeId', nodeId: 'p1' } },
    });
    expect(receipt.status).toBe('ok');
    // Regression: the placement path created paragraphs UNTRACKED while the
    // receipt reported success. Both dialect channels must carry tracked mode
    // for the item paragraphs AND the fromParagraphs list conversion.
    const paragraphOptions = calls.paragraphCreateOptions.slice(-2);
    expect(paragraphOptions.length).toBe(2);
    for (const options of paragraphOptions) {
      expect((options as { changeMode?: string } | undefined)?.changeMode).toBe('tracked');
    }
    expect((calls.listCreateOptions.at(-1) as { changeMode?: string } | undefined)?.changeMode).toBe('tracked');
  });

  test('create_table inserts a table with the requested shape', async () => {
    const { doc, state, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'create_table',
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

  test('comment_paragraphs adds one comment per body paragraph', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'First clause.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second clause.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'comment_paragraphs',
      commentText: 'Reviewer needs a second pass here.',
    });
    expect(receipt.status).toBe('ok');
    expect(state.comments.length).toBe(2);
    expect(state.comments.every((c) => c.text === 'Reviewer needs a second pass here.')).toBe(true);
  });

  test('add_comments targets a specific paragraph by selector', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'First.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'add_comments',
      commentText: 'Note',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 2 },
    });
    expect(receipt.status).toBe('ok');
    expect(state.comments.length).toBe(1);
    expect(state.comments[0]?.nodeId).toBe('p2');
  });

  test('add_comments batches many targets in one call via selectors[]', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'h1', nodeType: 'heading', text: 'One' },
      { ordinal: 2, nodeId: 'p1', nodeType: 'paragraph', text: 'Body.' },
      { ordinal: 3, nodeId: 'h2', nodeType: 'heading', text: 'Two' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'add_comments',
      commentText: 'Reviewed',
      selectors: [
        { kind: 'nodeId', nodeId: 'h1' },
        { kind: 'nodeId', nodeId: 'h2' },
      ],
    });
    expect(receipt.status).toBe('ok');
    expect(state.comments.length).toBe(2);
    expect(state.comments.map((c) => c.nodeId).sort()).toEqual(['h1', 'h2']);
  });

  test('reply_to_comment adds a threaded reply located by anchorText', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'The term is thirty days.' },
    ]);
    // Seed a parent comment (its body text is what anchorText matches).
    await superdocPerformAction(doc, {
      action: 'add_comments',
      commentText: 'Please confirm the thirty day window.',
      selector: { kind: 'nodeId', nodeId: 'p1' },
    });
    const receipt = await superdocPerformAction(doc, {
      action: 'reply_to_comment',
      anchorText: 'thirty day window',
      commentText: 'Confirmed, thirty days is correct.',
    });
    expect(receipt.status).toBe('ok');
    // A reply is created via doc.comments.create (the contract has no
    // separate `reply` op). Replies must NOT carry a target — the engine
    // rejects "parentCommentId with target"; the thread inherits the
    // parent's anchor. The threading key is dual-dialect: `parentId` for the
    // CLI transport (contract param), `parentCommentId` for in-process hosts.
    const replyCreate = calls.commentCreateCalls.at(-1);
    expect(replyCreate?.parentId).toBeTruthy();
    expect(replyCreate?.parentCommentId).toBe(replyCreate?.parentId);
    expect(replyCreate?.target).toBeUndefined();
    expect(state.comments.length).toBe(2);
    expect(state.comments.some((c) => c.text === 'Confirmed, thirty days is correct.')).toBe(true);
  });

  test('reply_to_comment fails (no mutation) when no comment matches', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Body.' }]);
    const receipt = await superdocPerformAction(doc, {
      action: 'reply_to_comment',
      anchorText: 'nonexistent comment',
      commentText: 'reply',
    });
    expect(receipt.status).toBe('failed');
    expect(state.comments.length).toBe(0);
  });

  test('reply_to_comment requires commentText and a locator', async () => {
    const { doc } = createMockDoc();
    await expect(
      superdocPerformAction(doc, { action: 'reply_to_comment', commentText: 'hi' } as never),
    ).rejects.toThrow(/anchorText.*commentId|commentId/);
  });

  test('set_font_family applies the whole-body font when no target is given', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'First clause.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second clause.' },
    ]);
    const receipt = await superdocPerformAction(doc, { action: 'set_font_family', fontFamily: 'Arial' });
    expect(receipt.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(2);
    expect(state.formats.get('p1')?.fontFamily).toBe('Arial');
    expect(state.formats.get('p2')?.fontFamily).toBe('Arial');
  });

  test('set_font_family scopes to one block via selector', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Keep me.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Restyle me.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'set_font_family',
      fontFamily: 'Georgia',
      selector: { kind: 'nodeId', nodeId: 'p2' },
    });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('p2')?.fontFamily).toBe('Georgia');
    expect(state.formats.get('p1')).toBeUndefined();
  });

  test('set_font_family targets specific text occurrences', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'CONFIDENTIAL notice.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Regular text.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'set_font_family',
      fontFamily: 'Courier New',
      targetText: 'CONFIDENTIAL',
    });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('p1')?.fontFamily).toBe('Courier New');
    expect(state.formats.get('p2')).toBeUndefined();
  });

  test('set_font_family requires a non-empty fontFamily', async () => {
    const { doc } = createMockDoc();
    await expect(superdocPerformAction(doc, { action: 'set_font_family' } as never)).rejects.toThrow(/fontFamily/);
  });

  test('add_list_items requires entries/items and a locator', async () => {
    const { doc } = createMockDoc();
    await expect(superdocPerformAction(doc, { action: 'add_list_items', anchorText: 'x' } as never)).rejects.toThrow(
      /entries.*items|items/,
    );
    await expect(superdocPerformAction(doc, { action: 'add_list_items', items: ['a'] } as never)).rejects.toThrow(
      /anchorText.*listOrdinal|listOrdinal/,
    );
  });

  test('add_list_items with a NEGATIVE level dedents to a top-level item (item-13 repro)', async () => {
    // Outline: item 12 (level 0) with nested sub-items 12(a)…12(e) (level 1).
    const { doc, state } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'i12',
        nodeType: 'listItem',
        text: 'Buyer requests the following endorsements',
        numbering: { marker: '12.', path: [12] },
      },
      {
        ordinal: 2,
        nodeId: 'i12a',
        nodeType: 'listItem',
        text: 'T-19.1 endorsement',
        numbering: { marker: '(a)', path: [12, 1] },
      },
      {
        ordinal: 3,
        nodeId: 'i12e',
        nodeType: 'listItem',
        text: 'Endorsements, if any, available in Texas',
        numbering: { marker: '(e)', path: [12, 5] },
      },
    ]);
    // Anchor on the nested sub-item 12(e) (level 1) and dedent by one → level 0.
    const receipt: any = await superdocPerformAction(doc, {
      action: 'add_list_items',
      anchorText: 'Endorsements, if any, available in Texas',
      entries: [{ text: 'Buyer reserves the right to raise additional objections', level: -1 }],
    });
    expect(receipt.status).toBe('ok');
    // The new item landed at outline level 0 (top-level), NOT nested at level 1.
    expect(receipt.addedItems?.[0]?.level).toBe(0);
    const added = state.blocks.find((b) => b.text.startsWith('Buyer reserves the right'));
    expect(added, 'new item exists').toBeTruthy();
    expect((added?.numbering?.path ?? []).length - 1).toBe(0); // ilvl 0
  });

  test('add_list_items nests with a POSITIVE level relative to the anchor', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'i1', nodeType: 'listItem', text: 'Parent item', numbering: { marker: '1.', path: [1] } },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'add_list_items',
      anchorText: 'Parent item',
      entries: [{ text: 'Nested child', level: 1 }],
    });
    expect(receipt.status).toBe('ok');
    expect(receipt.addedItems?.[0]?.level).toBe(1);
    const added = state.blocks.find((b) => b.text === 'Nested child');
    expect((added?.numbering?.path ?? []).length - 1).toBe(1); // ilvl 1
  });

  test('add_list_items matches the anchor item font/bold onto the new item', async () => {
    const { doc, state } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'i12',
        nodeType: 'listItem',
        text: 'Buyer requests the following endorsements',
        fontFamily: 'Arial',
        bold: true,
        numbering: { marker: '12.', path: [12] },
      },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'add_list_items',
      anchorText: 'Buyer requests the following endorsements',
      entries: [{ text: 'A newly added endorsement', level: 0 }],
    });
    expect(receipt.status).toBe('ok');
    // The anchor's inline look was copied onto the created item via format.apply.
    const added = state.blocks.find((b) => b.text === 'A newly added endorsement');
    expect(added, 'new item exists').toBeTruthy();
    const applied = state.formats.get(added!.nodeId);
    expect(applied?.fontFamily).toBe('Arial');
    expect(applied?.bold).toBe(true);
    // …and the receipt reports what it matched.
    expect(receipt.formattingMatched).toEqual({ fontFamily: 'Arial', bold: true });
  });

  test('add_list_items reports formattingMatched.skipped when the anchor has no inline look', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'i1', nodeType: 'listItem', text: 'Plain anchor', numbering: { marker: '1.', path: [1] } },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'add_list_items',
      anchorText: 'Plain anchor',
      entries: [{ text: 'New plain item', level: 0 }],
    });
    expect(receipt.status).toBe('ok');
    expect(receipt.formattingMatched?.skipped).toBeDefined();
    const added = state.blocks.find((b) => b.text === 'New plain item');
    expect(state.formats.get(added!.nodeId)).toBeUndefined();
  });

  test('add_list_items on a PARENT lands after the whole sub-tree, skipping interleaved paragraphs (no stolen subitems)', async () => {
    // Item 12 (level 0) with sub-items a. and d., and a NON-numbered continuation
    // paragraph wedged between them (real lists wrap items across paragraphs).
    const { doc, state } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'i12',
        nodeType: 'listItem',
        text: 'Buyer requests endorsements',
        numbering: { marker: '12.', path: [12] },
      },
      { ordinal: 2, nodeId: 'i12a', nodeType: 'listItem', text: 'sub a', numbering: { marker: 'a.', path: [12, 1] } },
      { ordinal: 3, nodeId: 'cont', nodeType: 'paragraph', text: 'continuation of a', numbering: null },
      { ordinal: 4, nodeId: 'i12d', nodeType: 'listItem', text: 'sub d', numbering: { marker: 'd.', path: [12, 4] } },
      {
        ordinal: 5,
        nodeId: 'next',
        nodeType: 'listItem',
        text: 'A different top item',
        numbering: { marker: '13.', path: [13] },
      },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'add_list_items',
      anchorText: 'Buyer requests endorsements', // the PARENT
      entries: [{ text: 'NEW13', level: 0 }],
    });
    expect(receipt.status).toBe('ok');
    expect(receipt.addedItems?.[0]?.level).toBe(0); // top-level
    const order = state.blocks.map((b) => b.nodeId);
    const testId = state.blocks.find((b) => b.text === 'NEW13')!.nodeId;
    // Lands AFTER the last descendant (i12d), not between the parent and its children.
    expect(order.indexOf(testId)).toBeGreaterThan(order.indexOf('i12d'));
    // Sub-items a and d stay before the new item — NOT stolen under it.
    expect(order.indexOf('i12a')).toBeLessThan(order.indexOf(testId));
    expect(order.indexOf('i12d')).toBeLessThan(order.indexOf(testId));
    // And before the next unrelated top-level item.
    expect(order.indexOf(testId)).toBeLessThan(order.indexOf('next'));
  });

  test('split_list splits at the anchored item and restarts numbering by default', async () => {
    const { doc, calls } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'i1',
        nodeType: 'listItem',
        text: 'First obligation',
        numbering: { marker: '1.', path: [1] },
      },
      {
        ordinal: 2,
        nodeId: 'i7',
        nodeType: 'listItem',
        text: 'Seventh obligation starts the new list',
        numbering: { marker: '7.', path: [7] },
      },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'split_list',
      anchorText: 'Seventh obligation',
    });
    expect(receipt.status).toBe('ok');
    expect(calls.listSplits).toBe(1);
    expect(String(receipt.intent)).toContain('restart at 1');
  });

  test('split_list with restartNumbering:false keeps continuous numbering', async () => {
    const { doc, calls } = createMockDoc([
      {
        ordinal: 1,
        nodeId: 'i7',
        nodeType: 'listItem',
        text: 'Seventh obligation',
        numbering: { marker: '7.', path: [7] },
      },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'split_list',
      anchorText: 'Seventh obligation',
      restartNumbering: false,
    });
    expect(receipt.status).toBe('ok');
    expect(calls.listSplits).toBe(1);
    expect(String(receipt.intent)).not.toContain('restart');
  });

  test('split_list fails (no mutation) when the anchor is not a list item', async () => {
    const { doc, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Just a paragraph, no numbering' },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'split_list',
      anchorText: 'Just a paragraph',
    });
    expect(receipt.status).toBe('failed');
    expect(calls.listSplits).toBe(0);
    expect(JSON.stringify(receipt.errors)).toContain('TARGET_NOT_FOUND');
  });

  test('split_list requires anchorText', async () => {
    const { doc } = createMockDoc();
    await expect(superdocPerformAction(doc, { action: 'split_list' } as never)).rejects.toThrow(/anchorText/);
  });

  test('move_text is a DIRECT move by default (not forced tracked)', async () => {
    const { doc } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Alpha clause. Bravo clause. Charlie clause.' },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'move_text',
      text: 'Bravo clause.',
      afterText: 'Charlie clause.',
    });
    expect(receipt.status).toBe('ok');
    expect(String(receipt.intent)).not.toContain('tracked');
  });

  test('move_text records a redline when changeMode:"tracked"', async () => {
    const { doc } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Alpha clause. Bravo clause. Charlie clause.' },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'move_text',
      text: 'Bravo clause.',
      afterText: 'Charlie clause.',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    expect(String(receipt.intent)).toContain('tracked');
  });

  test('move_text direct mode requires afterText (source is removed)', async () => {
    const { doc } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Alpha clause. Bravo clause.' },
    ]);
    const receipt: any = await superdocPerformAction(doc, { action: 'move_text', text: 'Bravo clause.' });
    expect(receipt.status).toBe('failed');
    expect(JSON.stringify(receipt.errors)).toContain('afterText');
  });

  test('tracked insert passes changeMode in BOTH input and the MutationOptions arg (dual dialect)', async () => {
    // The CLI-transport client reads changeMode from the input (encoded as a
    // flag); the in-process DocumentApi (browser bridge, CLI preset dispatch,
    // Python core) reads it from the SECOND options arg. Regression: passing it
    // only in input made "tracked" inserts silently DIRECT on in-process hosts.
    const { doc, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_paragraphs',
      text: 'Tracked paragraph.',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    const options = calls.paragraphCreateOptions.at(-1);
    expect(options?.changeMode).toBe('tracked');
  });

  test('direct insert passes NO MutationOptions arg', async () => {
    const { doc, calls } = createMockDoc();
    await superdocPerformAction(doc, { action: 'insert_paragraphs', text: 'Plain paragraph.' });
    expect(calls.paragraphCreateOptions.at(-1)).toBeUndefined();
  });

  test('move_text pre-flight: missing destination fails BEFORE any deletion', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Alpha clause. Bravo clause.' },
    ]);
    const receipt: any = await superdocPerformAction(doc, {
      action: 'move_text',
      text: 'Bravo clause.',
      afterText: 'No such destination anywhere',
    });
    expect(receipt.status).toBe('failed');
    expect(JSON.stringify(receipt.errors)).toContain('MATCH_NOT_FOUND');
    // Nothing was deleted — the source span is intact.
    expect(state.blocks[0]?.text).toContain('Bravo clause.');
  });

  test('set_paragraph_spacing / insert_page_break / add_hyperlink no longer advertise changeMode', async () => {
    const { readFileSync } = await import('node:fs');
    void readFileSync; // hints come from the registry, not the prompt file
    for (const name of ['set_paragraph_spacing', 'insert_page_break', 'add_hyperlink'] as const) {
      expect(ACTION_HINTS[name]).not.toContain('changeMode');
      expect(ACTION_HINTS[name]).toContain('Direct edit');
    }
  });

  test('rewrite_block replaces the text of a selected block', async () => {
    const { doc, state } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'Old text.' }]);
    const receipt = await superdocPerformAction(doc, {
      action: 'rewrite_block',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      text: 'New text.',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('New text.');
  });

  test('rewrite_block applies the requested text verbatim in tracked mode (no invented rewrite)', async () => {
    // Regression: preserveShortTitleMeaning replaced short-title rewrites with
    // fabricated boilerplate ("... states the same thing in plainer English")
    // exactly on the tracked-changes path. The caller's text must land as-is.
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'SHAREHOLDER LOAN AGREEMENT' },
    ]);
    const requested = 'This agreement sets out revised repayment terms.';
    const receipt = await superdocPerformAction(doc, {
      action: 'rewrite_block',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      text: requested,
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe(requested);
    expect(state.blocks[0]?.text).not.toContain('plainer English');
  });

  test('rewrite_block only re-cases a quoted all-caps title inside the rewrite (content preserved)', async () => {
    // normalizeTitleLikeRewriteText is content-preserving: when the rewrite
    // quotes the ALL-CAPS original, that phrase is re-cased for display and
    // every other requested word survives untouched.
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'SHAREHOLDER LOAN AGREEMENT' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'rewrite_block',
      selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: 1 },
      text: 'This magnificent shareholder loan agreement sets out the terms.',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks[0]?.text).toBe('This magnificent Shareholder Loan Agreement sets out the terms.');
  });

  test('superdoc_perform_action rejects unknown action name', async () => {
    const { doc } = createMockDoc();
    await expect(superdocPerformAction(doc, { action: 'bogus_thing' })).rejects.toThrow(/unknown action/);
  });

  test('superdoc_perform_action rejects missing required arguments', async () => {
    const { doc } = createMockDoc();
    await expect(superdocPerformAction(doc, { action: 'insert_paragraphs' })).rejects.toThrow(/text/);
  });

  test('accept_tracked_changes removes all changes via doc.trackChanges.decide', async () => {
    const { doc, state, calls } = createMockDoc(undefined, [
      { id: 't1', type: 'insert', author: 'Alice' },
      { id: 't2', type: 'delete', author: 'Bob' },
    ]);
    const receipt = await superdocPerformAction(doc, { action: 'accept_tracked_changes' });
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
    const receipt = await superdocPerformAction(doc, { action: 'reject_tracked_changes', author: 'Alice' });
    expect(receipt.status).toBe('ok');
    expect(state.trackedChanges.map((c) => c.id)).toEqual(['t2']);
  });

  test('accept_tracked_changes is a no-op when there are no tracked changes', async () => {
    const { doc, calls } = createMockDoc();
    const receipt = await superdocPerformAction(doc, { action: 'accept_tracked_changes' });
    expect(receipt.status).toBe('ok');
    expect(calls.trackedDecideCalls).toBe(0);
  });

  test('normalize_body_font_size applies format.apply to every body block', async () => {
    const { doc, state } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'A.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'B.' },
      { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: '   ' },
    ]);
    const receipt = await superdocPerformAction(doc, { action: 'normalize_body_font_size', fontSize: 11 });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('p1')?.fontSize).toBe(11);
    expect(state.formats.get('p2')?.fontSize).toBe(11);
    // empty paragraph is excluded
    expect(state.formats.has('p3')).toBe(false);
  });

  test('format_text colors every match of targetText across the body', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'urgent matter to resolve.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'no urgent items here.' },
      { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: 'unrelated.' },
    ]);
    const receipt = await superdocPerformAction(doc, { action: 'format_text', color: 'red', targetText: 'urgent' });
    expect(receipt.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(2);
    expect(state.formats.get('p1')?.color).toBe('FF0000');
    expect(state.formats.get('p2')?.color).toBe('FF0000');
    expect(state.formats.has('p3')).toBe(false);
  });

  test('format_text by selector colors only the selected block', async () => {
    const { doc, state, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'one.' },
      { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'two.' },
    ]);
    const receipt = await superdocPerformAction(doc, {
      action: 'format_text',
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
    const receipt = await superdocPerformAction(doc, {
      action: 'apply_letter_spacing',
      selector: { kind: 'ordinal', ordinalKind: 'headingOrdinal', value: 1 },
      letterSpacing: 3,
    });
    expect(receipt.status).toBe('ok');
    expect(state.formats.get('h1')?.letterSpacing).toBe(3);
  });

  test('insert_toc inserts a TOC at document start with optional title', async () => {
    const { doc, state } = createMockDoc();
    const receipt = await superdocPerformAction(doc, { action: 'insert_toc', title: 'Contents' });
    expect(receipt.status).toBe('ok');
    expect(state.tocs.length).toBe(1);
    expect(state.blocks.some((b) => b.nodeType === 'heading' && b.text === 'Contents')).toBe(true);
    expect(state.blocks.some((b) => b.nodeType === 'tableOfContents')).toBe(true);
  });

  test('insert_table_row appends a row to the only table and populates cells', async () => {
    const { doc, state } = createMockDoc();
    await superdocPerformAction(doc, {
      action: 'create_table',
      rows: 2,
      columns: 2,
      cellTexts: [
        ['Owner', 'Stage'],
        ['', ''],
      ],
    });
    const beforeRows = state.tables[0]!.rows;
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_table_row',
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
    await superdocPerformAction(doc, {
      action: 'create_table',
      rows: 2,
      columns: 2,
    });
    const beforeRevision = state.revision;
    const beforeRows = state.tables[0]!.rows;
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_table_row',
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
    await superdocPerformAction(doc, { action: 'create_table', rows: 2, columns: 2 });
    const receipt = await superdocPerformAction(doc, {
      action: 'insert_table_column',
      headerText: 'Notes',
    });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]!.columns).toBe(3);
    expect(state.tables[0]!.cells[0]![2]).toBe('Notes');
  });

  test('delete_table_row removes the requested row', async () => {
    const { doc, state } = createMockDoc();
    await superdocPerformAction(doc, { action: 'create_table', rows: 3, columns: 2 });
    const receipt = await superdocPerformAction(doc, { action: 'delete_table_row', rowIndex: 1 });
    expect(receipt.status).toBe('ok');
    expect(state.tables[0]!.rows).toBe(2);
  });

  test('split_table calls tables.split with the requested rowIndex', async () => {
    const { doc, state } = createMockDoc();
    await superdocPerformAction(doc, { action: 'create_table', rows: 4, columns: 2 });
    const receipt = await superdocPerformAction(doc, {
      action: 'split_table',
      rowIndex: 2,
      separatorText: 'Continued',
    });
    expect(receipt.status).toBe('ok');
    expect(state.tableCalls.some((c) => c.kind === 'split')).toBe(true);
    expect(state.blocks.some((b) => b.nodeType === 'paragraph' && b.text === 'Continued')).toBe(true);
  });

  test('format_text fails closed if targetText is not found anywhere', async () => {
    const { doc } = createMockDoc([{ ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'plain text.' }]);
    const receipt = await superdocPerformAction(doc, { action: 'format_text', color: 'red', targetText: 'missing' });
    expect(receipt.status).toBe('failed');
  });

  test('dispatchSuperDocTool routes superdoc_perform_action via the core preset', async () => {
    const { doc, state } = createMockDoc();
    const result = (await dispatchSuperDocTool(
      doc,
      'superdoc_perform_action',
      { action: 'insert_paragraphs', text: 'Dispatched.' },
      { preset: 'core' },
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

  test('compacted receipts CAP per-item lists (token hygiene for many-op actions)', async () => {
    // Whole-body set_font_family executes one format.apply per paragraph; the
    // receipt is re-sent as prompt tokens on every later turn, so an uncapped
    // executedOperations list on a large doc dominates conversation cost.
    const blocks = Array.from({ length: 40 }, (_, i) => ({
      ordinal: i + 1,
      nodeId: `p${i + 1}`,
      nodeType: 'paragraph',
      text: `Body paragraph number ${i + 1} with some words in it.`,
    }));
    const { doc, calls } = createMockDoc(blocks);
    const result = (await dispatchSuperDocTool(
      doc,
      'superdoc_perform_action',
      { action: 'set_font_family', fontFamily: 'Arial' },
      { preset: 'core' },
    )) as {
      status: string;
      executedOperations: Array<{ operationId: string }>;
      executedOperationCount?: number;
    };
    expect(result.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(40); // the WORK is not capped —
    expect(result.executedOperations.length).toBeLessThanOrEqual(8); // — only the receipt is
    expect(result.executedOperationCount).toBe(40); // and the true total survives
  });

  // A Will-style document whose "sections" are ALL-CAPS styled PARAGRAPHS (not
  // Word heading nodes) — exactly the shape move_range must handle.
  const willBlocks = (): Block[] => [
    { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'LAST WILL AND TESTAMENT' },
    { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'PREAMBLE' },
    { ordinal: 3, nodeId: 'n3', nodeType: 'paragraph', text: 'I, John Doe, declare this to be my will.' },
    { ordinal: 4, nodeId: 'n4', nodeType: 'paragraph', text: 'ARTICLE I - EXECUTOR' },
    { ordinal: 5, nodeId: 'n5', nodeType: 'paragraph', text: 'I appoint Jane Doe as executor.' },
    { ordinal: 6, nodeId: 'n6', nodeType: 'paragraph', text: 'SCHEDULE A' },
    { ordinal: 7, nodeId: 'n7', nodeType: 'paragraph', text: 'Item one in schedule A.' },
    { ordinal: 8, nodeId: 'n8', nodeType: 'paragraph', text: 'Item two in schedule A.' },
  ];

  test('move_range with fromText + auto-end lands after the destination heading-like section', async () => {
    const { doc, state } = createMockDoc(willBlocks());
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'PREAMBLE',
      afterText: 'SCHEDULE A',
    });
    expect(receipt.status).toBe('ok');
    // The PREAMBLE "visual section" is PREAMBLE + its body paragraph (auto-extended
    // up to the next styled title, ARTICLE I). It lands after the WHOLE SCHEDULE A
    // section (past its body items), not just after the SCHEDULE A title line.
    expect(state.blocks.map((b) => b.text)).toEqual([
      'LAST WILL AND TESTAMENT',
      'ARTICLE I - EXECUTOR',
      'I appoint Jane Doe as executor.',
      'SCHEDULE A',
      'Item one in schedule A.',
      'Item two in schedule A.',
      'PREAMBLE',
      'I, John Doe, declare this to be my will.',
    ]);
    // Original PREAMBLE removed — exactly one remains (the moved copy).
    expect(state.blocks.filter((b) => b.text === 'PREAMBLE').length).toBe(1);
  });

  test('move_range refuses a range containing a table instead of flattening it', async () => {
    // Regression: the range was recreated via create.paragraph({text}) — a
    // table inside collapsed to one plain paragraph of its text preview and
    // the original was force-deleted. The guard must refuse pre-mutation.
    const seeded: Block[] = [
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'SECTION A' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'Body before the table.' },
      { ordinal: 3, nodeId: 'n3', nodeType: 'table', text: 'Owner Stage' },
      { ordinal: 4, nodeId: 'n4', nodeType: 'paragraph', text: 'Body after the table.' },
      { ordinal: 5, nodeId: 'n5', nodeType: 'paragraph', text: 'SECTION B' },
    ];
    const { doc, state } = createMockDoc(seeded.map((b) => ({ ...b })));
    const receipt: any = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'SECTION A',
      toText: 'Body after the table.',
      afterText: 'SECTION B',
    });
    expect(receipt.status).toBe('failed');
    const messages = JSON.stringify(receipt.errors ?? receipt);
    expect(messages).toContain('table');
    expect(messages).toContain('Nothing was changed');
    // Pre-mutation refusal: document order and content untouched.
    expect(state.blocks.map((b) => b.text)).toEqual(seeded.map((b) => b.text));
  });

  test('move_range rejects an explicit toText that comes before fromText', async () => {
    const seeded = willBlocks();
    const { doc, state } = createMockDoc(seeded.map((block) => ({ ...block })));
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'SCHEDULE A',
      toText: 'PREAMBLE',
      beforeText: 'LAST WILL AND TESTAMENT',
    });
    expect(receipt.status).toBe('failed');
    const messages = JSON.stringify(receipt.errors ?? receipt);
    expect(messages).toContain('fromText');
    expect(messages).toContain('toText');
    expect(messages).toContain('Nothing was changed');
    expect(state.blocks.map((block) => block.text)).toEqual(seeded.map((block) => block.text));
  });

  test('move_range tracked mode fails before mutation because block-range deletion is direct-only', async () => {
    const seeded = willBlocks();
    const { doc, state, calls } = createMockDoc(seeded.map((block) => ({ ...block })));
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'ARTICLE I - EXECUTOR',
      toText: 'I appoint Jane Doe as executor.',
      afterText: 'SCHEDULE A',
      changeMode: 'tracked',
    });
    expect(receipt.status).toBe('failed');
    const messages = JSON.stringify(receipt.errors ?? receipt);
    expect(messages).toContain('Tracked mode');
    expect(messages).toContain('Nothing was changed');
    expect(calls.paragraphCreateOptions).toHaveLength(0);
    expect(calls.headingCreateOptions).toHaveLength(0);
    expect(calls.deleteRangeOptions).toHaveLength(0);
    expect(state.blocks.map((block) => block.text)).toEqual(seeded.map((block) => block.text));
  });

  test('move_range with an explicit toText moves the bounded range before the destination', async () => {
    const { doc, state } = createMockDoc(willBlocks());
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'ARTICLE I - EXECUTOR',
      toText: 'I appoint Jane Doe as executor.',
      beforeText: 'PREAMBLE',
    });
    expect(receipt.status).toBe('ok');
    expect(state.blocks.map((b) => b.text)).toEqual([
      'LAST WILL AND TESTAMENT',
      'ARTICLE I - EXECUTOR',
      'I appoint Jane Doe as executor.',
      'PREAMBLE',
      'I, John Doe, declare this to be my will.',
      'SCHEDULE A',
      'Item one in schedule A.',
      'Item two in schedule A.',
    ]);
  });

  test('move_range fails clearly when neither afterText nor beforeText is given', async () => {
    const { doc, state } = createMockDoc(willBlocks());
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'PREAMBLE',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.errors?.[0]?.code).toBe('INVALID_ARGUMENT');
    expect(receipt.errors?.[0]?.message).toContain('afterText');
    expect(receipt.errors?.[0]?.message).toContain('beforeText');
    // No mutation happened.
    expect(state.blocks.map((b) => b.text)).toEqual(willBlocks().map((b) => b.text));
  });

  test('move_range fails when providing BOTH afterText and beforeText', async () => {
    const { doc } = createMockDoc(willBlocks());
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'PREAMBLE',
      afterText: 'SCHEDULE A',
      beforeText: 'ARTICLE I - EXECUTOR',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.errors?.[0]?.code).toBe('INVALID_ARGUMENT');
  });

  test('move_range returns TARGET_NOT_FOUND when fromText matches nothing', async () => {
    const { doc, state } = createMockDoc(willBlocks());
    const receipt = await superdocPerformAction(doc, {
      action: 'move_range',
      fromText: 'A SECTION THAT DOES NOT EXIST',
      afterText: 'SCHEDULE A',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.errors?.[0]?.code).toBe('TARGET_NOT_FOUND');
    expect(receipt.errors?.[0]?.message).toContain('fromText');
    expect(state.blocks.map((b) => b.text)).toEqual(willBlocks().map((b) => b.text));
  });
});
