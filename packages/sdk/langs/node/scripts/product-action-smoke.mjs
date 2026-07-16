#!/usr/bin/env node
/**
 * Product action smoke harness.
 *
 * This is the fast inner-loop iteration tool for the clean DOCX agent runtime.
 * It runs a deterministic mock "model" against a set of product-shaped tasks
 * and reports how many succeed end-to-end without going through a real LLM
 * gateway. The mock model maps each task to an `superdoc_perform_action` call by
 * keyword. The harness exercises the same dispatcher path that the real
 * harness uses (`dispatchSuperDocTool`).
 *
 * Use this when you want to know whether the runtime can express a product
 * task without paying for or waiting on a gateway. It is intentionally
 * shaped like the eval slice (60 tasks split across text/list/table/comment
 * edits) so we can confirm the clean product path can reach the recovery
 * bar before scheduling a gateway sweep.
 *
 * It is NOT a substitute for the gateway sweep — a real LLM may make
 * different choices. It IS a tight feedback loop on whether the runtime
 * surface is *capable* of completing each task at all.
 *
 * Usage:
 *   bun scripts/product-action-smoke.mjs
 *   node scripts/product-action-smoke.mjs            # works under node too
 *
 * Exit codes:
 *   0 — pass rate >= threshold (default 80%)
 *   1 — pass rate below threshold or any task threw
 */
import { dispatchSuperDocTool } from '../dist/index.js';

const THRESHOLD = Number(process.env.PRODUCT_ACTION_SMOKE_THRESHOLD ?? '0.8');

function createMockDoc(initial) {
  const state = {
    revision: 'rev-1',
    blocks:
      initial?.blocks ??
      [
        { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'The lender is obligated under this agreement.' },
        { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'Second clause — body — text.' },
        { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: 'Third clause body.' },
      ],
    comments: [],
    tables: [],
    lists: [],
    trackedChanges: initial?.trackedChanges ?? [],
    images: [],
    tocs: [],
    formats: new Map(),
    tableCalls: [],
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
  function placeAt(block, at) {
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
  function findTableCellByNodeId(nodeId) {
    for (const table of state.tables) {
      for (let rowIndex = 0; rowIndex < table.cellBlockIds.length; rowIndex += 1) {
        const row = table.cellBlockIds[rowIndex] ?? [];
        const columnIndex = row.findIndex((candidate) => candidate === nodeId);
        if (columnIndex >= 0) return { table, rowIndex, columnIndex };
      }
    }
    return null;
  }
  function ensureListForParagraph(targetNodeId, kind, sequenceMode) {
    const targetBlock = state.blocks.find((block) => block.nodeId === targetNodeId);
    if (!targetBlock) return null;
    targetBlock.nodeType = 'listItem';
    const list =
      sequenceMode === 'continuePrevious' && state.lists.length > 0
        ? state.lists[state.lists.length - 1]
        : (() => {
            const listId = `list${nextList++}`;
            const created = { listId, kind, items: [] };
            state.lists.push(created);
            return created;
          })();
    list.kind = kind;
    list.items.push({ nodeId: targetBlock.nodeId, text: targetBlock.text });
    return list;
  }

  return {
    state,
    doc: {
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
        list: async (args = {}) => {
          const offset = args.offset ?? 0;
          const limit = args.limit ?? state.blocks.length;
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
        paragraph: async (args) => {
          const id = `n${nextNode}`;
          nextNode += 1;
          placeAt(
            { ordinal: 0, nodeId: id, nodeType: 'paragraph', text: args.text },
            args.at,
          );
          bump();
          return { paragraph: { nodeId: id }, revision: { before: 'prev', after: state.revision } };
        },
        heading: async (args) => {
          const id = `n${nextNode}`;
          nextNode += 1;
          placeAt(
            { ordinal: 0, nodeId: id, nodeType: 'heading', text: args.text },
            args.at,
          );
          bump();
          return { heading: { nodeId: id, level: args.level }, revision: { before: 'prev', after: state.revision } };
        },
        table: async (args) => {
          const id = `tbl${nextTable}`;
          nextTable += 1;
          placeAt({ ordinal: 0, nodeId: id, nodeType: 'table', text: '' }, args.at);
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
        tableOfContents: async (args) => {
          const id = `toc${nextToc++}`;
          placeAt({ ordinal: 0, nodeId: id, nodeType: 'tableOfContents', text: '' }, args.at);
          state.tocs.push({ nodeId: id });
          bump();
          return { toc: { nodeId: id }, revision: { before: 'prev', after: state.revision } };
        },
        image: async (args) => {
          const n = nextImage++;
          const nodeId = `img${n}`;
          const imageId = `imgid${n}`;
          placeAt({ ordinal: 0, nodeId, nodeType: 'image', text: '' }, args.at);
          state.images.push({ imageId, nodeId, alt: args.alt });
          bump();
          return { image: { imageId, nodeId }, revision: { before: 'prev', after: state.revision } };
        },
      },
      mutations: {
        apply: async (args) => {
          for (const step of args.steps ?? []) {
            if (step.op === 'text.rewrite') {
              const pattern = step.where?.select?.pattern;
              const replacement = step.args?.replacement?.text ?? '';
              if (pattern) {
                for (const b of state.blocks) b.text = b.text.split(pattern).join(replacement);
              } else if (step.where?.nodeId) {
                const tableCell = findTableCellByNodeId(step.where.nodeId);
                if (tableCell) {
                  tableCell.table.cells[tableCell.rowIndex][tableCell.columnIndex] = replacement;
                } else {
                  const t = state.blocks.find((b) => b.nodeId === step.where.nodeId);
                  if (t) {
                    t.text = replacement;
                    for (const list of state.lists) {
                      const item = list.items.find((candidate) => candidate.nodeId === t.nodeId);
                      if (item) item.text = replacement;
                    }
                  }
                }
              }
            } else if (step.op === 'text.delete') {
              const pattern = step.where?.select?.pattern;
              if (pattern) {
                for (const b of state.blocks) b.text = b.text.split(pattern).join('');
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
          return { revision: { before: 'prev', after: state.revision }, applied: args.steps?.length ?? 0 };
        },
      },
      comments: {
        create: async (args) => {
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
        list: async (args = {}) => {
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
          const offset = args.offset ?? 0;
          const limit = args.limit ?? allItems.length;
          return {
            total: allItems.length,
            items: allItems.slice(offset, offset + limit),
          };
        },
        create: async (args) => {
          const list = ensureListForParagraph(
            args.target?.nodeId,
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
        insert: async (args) => {
          const list = state.lists.find((candidate) =>
            candidate.items.some((item) => item.nodeId === args.target?.nodeId),
          );
          if (!list) throw new Error('target list item missing for list insert');
          const listIndex = list.items.findIndex((item) => item.nodeId === args.target.nodeId);
          const blockIndex = state.blocks.findIndex((block) => block.nodeId === args.target.nodeId);
          if (listIndex < 0 || blockIndex < 0) throw new Error('target list item index missing');
          const id = `n${nextNode++}`;
          const item = { nodeId: id, text: args.text ?? '' };
          const insertOffset = args.position === 'before' ? 0 : 1;
          list.items.splice(listIndex + insertOffset, 0, item);
          state.blocks.splice(blockIndex + insertOffset, 0, {
            ordinal: 0,
            nodeId: id,
            nodeType: 'listItem',
            text: item.text,
          });
          renumberBlocks();
          bump();
          return { item, revision: { before: 'prev', after: state.revision } };
        },
      },
      tables: {
        get: async (args) => {
          const t = state.tables.find((tt) => tt.nodeId === args.nodeId);
          return t ? { rows: t.rows, columns: t.columns } : { rows: 0, columns: 0 };
        },
        insertRow: async (args) => {
          const id = args.target?.nodeId ?? args.nodeId;
          const t = state.tables.find((tt) => tt.nodeId === id);
          if (!t) throw new Error('insertRow: table missing');
          const insertAt = args.position === 'before' ? args.rowIndex : args.rowIndex + 1;
          t.cells.splice(insertAt, 0, Array.from({ length: t.columns }, () => ''));
          t.cellBlockIds.splice(
            insertAt,
            0,
            Array.from({ length: t.columns }, (_, c) => `${t.nodeId}-r${t.rows}c${c}-new`),
          );
          t.rows += 1;
          state.tableCalls.push({ kind: 'insertRow', nodeId: t.nodeId });
          bump();
          return { success: true };
        },
        insertColumn: async (args) => {
          const id = args.target?.nodeId ?? args.nodeId;
          const t = state.tables.find((tt) => tt.nodeId === id);
          if (!t) throw new Error('insertColumn: table missing');
          const insertAt = args.position === 'left' ? args.columnIndex : args.columnIndex + 1;
          for (let r = 0; r < t.rows; r += 1) {
            t.cells[r].splice(insertAt, 0, '');
            t.cellBlockIds[r].splice(insertAt, 0, `${t.nodeId}-r${r}c${t.columns}-new`);
          }
          t.columns += 1;
          state.tableCalls.push({ kind: 'insertColumn', nodeId: t.nodeId });
          bump();
          return { success: true };
        },
        deleteRow: async (args) => {
          const id = args.target?.nodeId ?? args.nodeId;
          const t = state.tables.find((tt) => tt.nodeId === id);
          if (!t) throw new Error('deleteRow: table missing');
          t.cells.splice(args.rowIndex, 1);
          t.cellBlockIds.splice(args.rowIndex, 1);
          t.rows = Math.max(0, t.rows - 1);
          state.tableCalls.push({ kind: 'deleteRow', nodeId: t.nodeId });
          bump();
          return { success: true };
        },
        deleteColumn: async (args) => {
          const id = args.target?.nodeId ?? args.nodeId;
          const t = state.tables.find((tt) => tt.nodeId === id);
          if (!t) throw new Error('deleteColumn: table missing');
          for (let r = 0; r < t.rows; r += 1) {
            t.cells[r].splice(args.columnIndex, 1);
            t.cellBlockIds[r].splice(args.columnIndex, 1);
          }
          t.columns = Math.max(0, t.columns - 1);
          state.tableCalls.push({ kind: 'deleteColumn', nodeId: t.nodeId });
          bump();
          return { success: true };
        },
        split: async (args) => {
          const id = args.target?.nodeId ?? args.nodeId;
          const t = state.tables.find((tt) => tt.nodeId === id);
          if (!t) throw new Error('split: table missing');
          state.tableCalls.push({ kind: 'split', nodeId: t.nodeId, rowIndex: args.rowIndex });
          bump();
          return { success: true };
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
        decide: async (args) => {
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
        apply: async (args) => {
          const id = args.blockId ?? args.nodeId;
          if (id) {
            const existing = state.formats.get(id) ?? {};
            state.formats.set(id, { ...existing, ...(args.inline ?? {}) });
          }
          bump();
          return { success: true };
        },
      },
      images: {
        insertCaption: async (args) => {
          const img = state.images.find((i) => i.imageId === args.imageId);
          if (img) img.caption = args.text;
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
              tableContext: { tableOrdinal, rowIndex, columnIndex },
            })),
          ),
        ),
      }),
      save: async () => ({ success: true }),
    },
  };
}

// Deterministic mock "model": maps task text to an superdoc_perform_action call. This
// mirrors the kinds of mappings a well-prompted LLM should be able to do.
// Each task returns at most one action call.
function chooseActionForTask(task) {
  const t = task.toLowerCase();

  // Specific action matches that must beat the generic ones below.
  if (/insert (a )?(table of contents|toc)|add (a )?table of contents/.test(t)) {
    const quoted = task.match(/['"]([^'"]+)['"]/);
    return { action: 'insert_toc', ...(quoted ? { title: quoted[1] } : {}) };
  }
  if (/add a (new )?row|insert a row|append a row/.test(t)) {
    return { action: 'insert_table_row' };
  }
  if (/add a (new )?column|insert a column/.test(t)) {
    const headerMatch = task.match(/['"]([^'"]+)['"]/);
    return { action: 'insert_table_column', ...(headerMatch ? { headerText: headerMatch[1] } : {}) };
  }
  if (/split (the )?table/.test(t)) {
    const m = task.match(/(?:after|at) row (\d+)/);
    return { action: 'split_table', rowIndex: m ? Number(m[1]) : 1 };
  }

  if (/remove every (em dash|—)|remove every occurrence/.test(t)) {
    const finds = [];
    const dashMatch = task.match(/['"]([^'"]+)['"]/);
    if (dashMatch) finds.push(dashMatch[1]);
    if (/em dash|—/.test(t)) finds.push('—');
    return { action: 'delete_text', finds };
  }
  if (/(replace|change) every\s+["']?([^"']+?)["']?\s+with\s+["']?([^"'.]+)["']?/.test(t)) {
    const m = task.match(/(replace|change) every\s+["']?([^"']+?)["']?\s+with\s+["']?([^"'.]+)["']?/i);
    if (m) {
      return {
        action: 'replace_text',
        edits: [{ find: m[2], replace: m[3] }],
      };
    }
  }
  if (/^add a new paragraph at the very end|append (a|one) paragraph|at the very bottom|at the bottom/.test(t)) {
    const quoted = task.match(/['"]([^'"]+)['"]/);
    return {
      action: 'insert_paragraphs',
      text: quoted ? quoted[1] : 'Appended paragraph.',
      changeMode: /tracked/.test(t) ? 'tracked' : 'direct',
    };
  }
  if (/numbered list|bulleted list|bullet list/.test(t)) {
    const items = extractListItems(task);
    return {
      action: 'append_list',
      kind: /bullet/.test(t) ? 'bullet' : 'ordered',
      items: items.length > 0 ? items : ['Item 1', 'Item 2', 'Item 3'],
    };
  }
  if (/add a table|small table|insert a table|place a (small )?table/.test(t)) {
    return { action: 'create_table', rows: 2, columns: 2, cellTexts: [['Owner', 'Stage'], ['', '']] };
  }
  if (/comment on (each|every) body paragraph|leave the same.*comment on each|comment on every paragraph|comment each paragraph/.test(t)) {
    const quoted = task.match(/['"]([^'"]+)['"]/);
    return {
      action: 'comment_paragraphs',
      commentText: quoted ? quoted[1] : 'Reviewer needs a second pass.',
    };
  }
  if (/rewrite the (\d+)(st|nd|rd|th) paragraph/.test(t)) {
    const m = t.match(/rewrite the (\d+)(st|nd|rd|th) paragraph/);
    const quoted = task.match(/['"]([^'"]+)['"]/);
    if (m) {
      return {
        action: 'rewrite_block',
        selector: { kind: 'ordinal', ordinalKind: 'paragraphOrdinal', value: Number(m[1]) },
        text: quoted ? quoted[1] : 'Rewritten paragraph.',
      };
    }
  }
  if (/append a (heading|heading 1|heading 2)/.test(t)) {
    const quoted = task.match(/['"]([^'"]+)['"]/);
    const level = /heading 2/.test(t) ? 2 : 1;
    return { action: 'insert_heading', text: quoted ? quoted[1] : 'New Heading', level };
  }
  if (/(accept|approve) (every|all) tracked|accept all tracked changes/.test(t)) {
    const authorMatch = task.match(/by\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    return { action: 'accept_tracked_changes', ...(authorMatch ? { author: authorMatch[1] } : {}) };
  }
  if (/(reject|reject all|reject every) tracked/.test(t)) {
    const authorMatch = task.match(/by\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    return { action: 'reject_tracked_changes', ...(authorMatch ? { author: authorMatch[1] } : {}) };
  }
  if (/normalize.*body.*font|set body (text|font) size|change body font size to/.test(t)) {
    const m = task.match(/(\d+)\s*(pt|point)?/);
    return { action: 'normalize_body_font_size', fontSize: m ? Number(m[1]) : 11 };
  }
  if (/color (every|all) ['"][^'"]+['"]|color the word ['"][^'"]+['"]|highlight ['"][^'"]+['"] in/.test(t)) {
    const targetMatch = task.match(/['"]([^'"]+)['"]/);
    const colorMatch = task.match(/\b(red|blue|green|yellow|orange|purple|grey|gray|black|white)\b/i);
    return {
      action: 'format_text',
      color: colorMatch ? colorMatch[1].toLowerCase() : 'red',
      targetText: targetMatch ? targetMatch[1] : 'urgent',
    };
  }
  if (/color the (\d+)(st|nd|rd|th) (paragraph|heading)/.test(t)) {
    const m = task.match(/color the (\d+)(st|nd|rd|th) (paragraph|heading)/);
    const colorMatch = task.match(/\b(red|blue|green|yellow|orange|purple)\b/i);
    return {
      action: 'format_text',
      color: colorMatch ? colorMatch[1].toLowerCase() : 'red',
      selector: {
        kind: 'ordinal',
        ordinalKind: m[3] === 'heading' ? 'headingOrdinal' : 'paragraphOrdinal',
        value: Number(m[1]),
      },
    };
  }
  if (/letter spacing|apply (\d+)\s*pt letter/.test(t)) {
    const m = task.match(/(\d+)\s*pt/);
    return {
      action: 'apply_letter_spacing',
      selector: { kind: 'ordinal', ordinalKind: 'headingOrdinal', value: 1 },
      letterSpacing: m ? Number(m[1]) : 2,
    };
  }
  if (/insert (a )?(table of contents|toc)|add (a )?table of contents/.test(t)) {
    const quoted = task.match(/['"]([^'"]+)['"]/);
    return { action: 'insert_toc', ...(quoted ? { title: quoted[1] } : {}) };
  }
  if (/add a (new )?row|insert a row|append a row/.test(t)) {
    return { action: 'insert_table_row' };
  }
  if (/add a (new )?column|insert a column/.test(t)) {
    const headerMatch = task.match(/['"]([^'"]+)['"]/);
    return { action: 'insert_table_column', ...(headerMatch ? { headerText: headerMatch[1] } : {}) };
  }
  if (/split (the )?table/.test(t)) {
    const m = task.match(/(?:after|at) row (\d+)/);
    return { action: 'split_table', rowIndex: m ? Number(m[1]) : 1 };
  }
  return null;
}

function extractListItems(task) {
  // Try colon-then-list-items shape: "with these exact four items in this order: a. b. c. d."
  const colon = task.match(/items in this order:\s*(.+)$/i);
  if (colon) {
    return colon[1]
      .split(/\.\s+|\.$|,\s+/)
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter((s) => s.length > 0);
  }
  return [];
}

// 60 product-shaped tasks: 15 text edits, 15 lists, 15 tables, 15 comments.
function buildProductTaskSlice() {
  const tasks = [];
  // Text edits
  for (let i = 0; i < 15; i += 1) {
    tasks.push({
      slice: 'text',
      task:
        i % 3 === 0
          ? `Add a new paragraph at the very end of this document with the text 'Reviewed by counsel on entry ${i + 1}.'`
          : i % 3 === 1
            ? `Remove every em dash character in the document, keep all other content intact.`
            : `Replace every "lender" with "financier" using the most efficient call.`,
      assertSubstring:
        i % 3 === 0 ? `Reviewed by counsel on entry ${i + 1}.` : i % 3 === 1 ? null : 'financier',
    });
  }
  // Lists
  for (let i = 0; i < 15; i += 1) {
    tasks.push({
      slice: 'list',
      task: `After the closing paragraph, add a numbered list with these exact four items in this order: Review scope. Confirm signatories. Capture risk register. Notify counsel.`,
      assertSubstring: 'Notify counsel',
    });
  }
  // Tables
  for (let i = 0; i < 15; i += 1) {
    tasks.push({
      slice: 'table',
      task: `Below the second paragraph, place a small table that has two rows and two columns. Top-left says Owner, top-right says Stage.`,
      assertTable: true,
      assertTableTexts: ['Owner', 'Stage'],
    });
  }
  // Comments
  for (let i = 0; i < 15; i += 1) {
    tasks.push({
      slice: 'comment',
      task: `Leave the same brief reviewer comment on each body paragraph in this document. Use this exact wording for every comment: 'Reviewer needs a second pass here.'`,
      assertComment: true,
    });
  }
  // Tracked changes (with seeded changes)
  for (let i = 0; i < 6; i += 1) {
    tasks.push({
      slice: 'tracked',
      task: i % 2 === 0
        ? `Accept all tracked changes in this document.`
        : `Reject every tracked change by Alice Reviewer.`,
      seedTrackedChanges: [
        { id: 'tc1', type: 'insert', author: 'Alice Reviewer' },
        { id: 'tc2', type: 'delete', author: 'Bob Editor' },
        { id: 'tc3', type: 'insert', author: 'Alice Reviewer' },
      ],
      assertNoTrackedChanges: i % 2 === 0,
      assertTrackedAuthorGone: i % 2 === 1 ? 'Alice Reviewer' : null,
    });
  }
  // Formatting
  for (let i = 0; i < 6; i += 1) {
    if (i % 3 === 0) {
      tasks.push({
        slice: 'format',
        task: `Normalize body text font size to 11 pt for every body paragraph.`,
        assertBodyFontSize: 11,
      });
    } else if (i % 3 === 1) {
      tasks.push({
        slice: 'format',
        task: `Color every 'urgent' in red across the document.`,
        seedBlocks: [
          { ordinal: 1, nodeId: 'p1', nodeType: 'paragraph', text: 'This is urgent and needs attention.' },
          { ordinal: 2, nodeId: 'p2', nodeType: 'paragraph', text: 'No urgent matters today.' },
          { ordinal: 3, nodeId: 'p3', nodeType: 'paragraph', text: 'Routine update.' },
        ],
        assertColorOnBlock: { nodeId: 'p1', color: 'FF0000' },
      });
    } else {
      tasks.push({
        slice: 'format',
        task: `Apply 3 pt letter spacing to the 1st heading.`,
        seedBlocks: [
          { ordinal: 1, nodeId: 'h1', nodeType: 'heading', text: 'Title' },
          { ordinal: 2, nodeId: 'p1', nodeType: 'paragraph', text: 'Body.' },
        ],
        assertLetterSpacingOn: { nodeId: 'h1', value: 3 },
      });
    }
  }
  // Media/TOC
  for (let i = 0; i < 6; i += 1) {
    if (i % 2 === 0) {
      tasks.push({
        slice: 'media',
        task: `Insert a table of contents titled 'Contents' at the top of the document.`,
        assertHasToc: true,
      });
    } else {
      // insert_image_with_caption was dropped from the action registry; keep
      // the slot on the media slice with a differently-titled TOC task.
      tasks.push({
        slice: 'media',
        task: `Insert a table of contents titled 'Index of sections' at the top of the document.`,
        assertHasToc: true,
      });
    }
  }
  // Table row/col/split
  for (let i = 0; i < 6; i += 1) {
    if (i % 3 === 0) {
      tasks.push({
        slice: 'table-edit',
        task: `Add a new row to the table at the bottom.`,
        seedTable: { rows: 2, columns: 2 },
        assertTableShape: { rows: 3, columns: 2 },
      });
    } else if (i % 3 === 1) {
      tasks.push({
        slice: 'table-edit',
        task: `Insert a column on the right with header 'Notes'.`,
        seedTable: { rows: 2, columns: 2 },
        assertTableShape: { rows: 2, columns: 3 },
        assertTableHeader: 'Notes',
      });
    } else {
      tasks.push({
        slice: 'table-edit',
        task: `Split the table after row 1.`,
        seedTable: { rows: 4, columns: 2 },
        assertTableSplit: true,
      });
    }
  }
  return tasks;
}

function evaluateReceipt(task, receipt, state) {
  if (!receipt || receipt.status !== 'ok') return false;
  if (task.assertSubstring != null) {
    const text = state.blocks.map((b) => b.text).join(' \n ');
    if (!text.includes(task.assertSubstring)) return false;
  }
  if (task.assertTable && state.tables.length === 0) return false;
  if (task.assertTableTexts != null) {
    const tableTexts = state.tables.flatMap((table) => table.cells.flatMap((row) => row)).join(' \n ');
    for (const text of task.assertTableTexts) {
      if (!tableTexts.includes(text)) return false;
    }
  }
  if (task.assertComment && state.comments.length === 0) return false;
  if (task.assertNoTrackedChanges && state.trackedChanges.length !== 0) return false;
  if (task.assertTrackedAuthorGone) {
    if (state.trackedChanges.some((c) => c.author === task.assertTrackedAuthorGone)) return false;
  }
  if (task.assertBodyFontSize != null) {
    const bodyBlocks = state.blocks.filter(
      (b) => (b.nodeType === 'paragraph' || b.nodeType === 'listItem') && b.text.trim().length > 0,
    );
    if (bodyBlocks.length === 0) return false;
    if (!bodyBlocks.every((b) => state.formats.get(b.nodeId)?.fontSize === task.assertBodyFontSize)) return false;
  }
  if (task.assertColorOnBlock) {
    const f = state.formats.get(task.assertColorOnBlock.nodeId);
    if (!f || f.color !== task.assertColorOnBlock.color) return false;
  }
  if (task.assertLetterSpacingOn) {
    const f = state.formats.get(task.assertLetterSpacingOn.nodeId);
    if (!f || f.letterSpacing !== task.assertLetterSpacingOn.value) return false;
  }
  if (task.assertHasToc && state.tocs.length === 0) return false;
  if (task.assertHasImage && state.images.length === 0) return false;
  if (task.assertTableShape) {
    if (state.tables.length === 0) return false;
    const t = state.tables[0];
    if (t.rows !== task.assertTableShape.rows || t.columns !== task.assertTableShape.columns) return false;
  }
  if (task.assertTableHeader) {
    if (state.tables.length === 0) return false;
    const headerRow = state.tables[0].cells[0] ?? [];
    if (!headerRow.some((c) => c === task.assertTableHeader)) return false;
  }
  if (task.assertTableSplit) {
    if (!state.tableCalls.some((c) => c.kind === 'split')) return false;
  }
  return true;
}

async function main() {
  const tasks = buildProductTaskSlice();
  let pass = 0;
  let fail = 0;
  const failureSamples = [];

  for (const task of tasks) {
    const initial = {};
    if (task.seedBlocks) initial.blocks = task.seedBlocks.map((b) => ({ ...b }));
    if (task.seedTrackedChanges) initial.trackedChanges = task.seedTrackedChanges.map((c) => ({ ...c }));
    const { doc, state } = createMockDoc(initial);

    if (task.seedTable) {
      // Pre-create a table for table-edit tasks
      await doc.create.table({ rows: task.seedTable.rows, columns: task.seedTable.columns, at: { kind: 'documentEnd' } });
    }

    const actionCall = chooseActionForTask(task.task);
    let receipt = null;
    try {
      if (!actionCall) {
        fail += 1;
        if (failureSamples.length < 5) failureSamples.push({ task: task.task, reason: 'no action mapped' });
        continue;
      }
      receipt = await dispatchSuperDocTool(doc, 'superdoc_perform_action', actionCall, { preset: 'core', toolsetProfile: 'product' });
      if (evaluateReceipt(task, receipt, state)) {
        pass += 1;
      } else {
        fail += 1;
        if (failureSamples.length < 5) {
          failureSamples.push({
            task: task.task,
            action: actionCall.action,
            status: receipt.status,
          });
        }
      }
    } catch (err) {
      fail += 1;
      if (failureSamples.length < 5) failureSamples.push({ task: task.task, error: err?.message ?? String(err) });
    }
  }

  const passRate = pass / tasks.length;
  console.log(
    `product-action-smoke: ${pass}/${tasks.length} passed, ${fail} failed (${(passRate * 100).toFixed(1)}%)`,
  );
  for (const sample of failureSamples) {
    console.log('  failure:', JSON.stringify(sample));
  }

  if (passRate < THRESHOLD) {
    console.error(`product-action-smoke: pass rate ${passRate.toFixed(2)} below threshold ${THRESHOLD}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('product-action-smoke: uncaught failure:', err?.stack ?? String(err));
  process.exit(1);
});
