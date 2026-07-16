import { describe, expect, test } from 'bun:test';
import { buildWorkflowDocIndex, type WorkflowDocIndex } from '../action-primitives/doc-index.ts';
import { resolveWorkflowTarget } from '../action-primitives/resolve.ts';
import type { BoundDocApi } from '../generated/client.js';

// The doc-api reports block.ordinal 0-based; workflow target requests use the
// 1-based convention (parseOrdinal rejects < 1). These tests pin the mapping —
// blockOrdinal:1 must resolve the FIRST block (regression: it targeted the
// second).

const RAW_BLOCKS = [
  { ordinal: 0, nodeId: 'b0', nodeType: 'paragraph', textPreview: 'First paragraph' },
  { ordinal: 1, nodeId: 'b1', nodeType: 'heading', headingLevel: 1, textPreview: 'A heading' },
  { ordinal: 2, nodeId: 'b2', nodeType: 'paragraph', textPreview: 'Second paragraph' },
];

const RAW_LIST_ITEMS = [
  {
    ordinal: 1,
    listId: 'list-1',
    handle: { ref: 'list-ref-1' },
    address: { nodeId: 'li1' },
    level: 0,
    marker: '1.',
    kind: 'ordered',
    text: 'First list item',
  },
];

const RAW_TABLE_BLOCKS = [{ ordinal: 0, nodeId: 't1', nodeType: 'table', ref: 'table-ref-1', textPreview: '' }];

type FakeHandleOptions = {
  blocks?: typeof RAW_BLOCKS;
  listItems?: typeof RAW_LIST_ITEMS;
};

function makeFakeHandle(options: FakeHandleOptions = {}): BoundDocApi {
  const blocks = options.blocks ?? RAW_BLOCKS;
  const listItems = options.listItems ?? [];
  return {
    info: async () => ({ revision: 'r1' }),
    blocks: {
      list: async ({ offset = 0 }: { offset?: number }) => ({
        blocks: offset === 0 ? blocks : [],
        total: blocks.length,
      }),
    },
    lists: {
      list: async ({ offset = 0 }: { offset?: number } = {}) => ({
        items: offset === 0 ? listItems : [],
        total: listItems.length,
      }),
    },
    tables: {
      get: async () => ({ rows: [], columns: [] }),
    },
  } as unknown as BoundDocApi;
}

async function buildIndex(options: FakeHandleOptions = {}): Promise<WorkflowDocIndex> {
  return buildWorkflowDocIndex({ documentHandle: makeFakeHandle(options) });
}

describe('workflow target resolution — ordinal conventions', () => {
  test('blockOrdinal:1 resolves the FIRST block (1-based request over 0-based doc-api ordinals)', async () => {
    const index = await buildIndex();
    const result = resolveWorkflowTarget(index, { mode: 'blockOrdinal', blockOrdinal: 1 });
    if (!result.ok) throw new Error(`expected resolved, got ${JSON.stringify(result)}`);
    expect(result.target.entity.nodeId).toBe('b0');
  });

  test('blockOrdinal covers every block 1..N in order', async () => {
    const index = await buildIndex();
    const ids: string[] = [];
    for (let ordinal = 1; ordinal <= RAW_BLOCKS.length; ordinal += 1) {
      const result = resolveWorkflowTarget(index, { mode: 'blockOrdinal', blockOrdinal: ordinal });
      if (!result.ok) throw new Error(`ordinal ${ordinal} did not resolve`);
      ids.push(result.target.entity.nodeId);
    }
    expect(ids).toEqual(['b0', 'b1', 'b2']);
  });

  test('blockOrdinal past the end fails instead of wrapping', async () => {
    const index = await buildIndex();
    const result = resolveWorkflowTarget(index, {
      mode: 'blockOrdinal',
      blockOrdinal: RAW_BLOCKS.length + 1,
    });
    expect(result.ok).toBe(false);
  });

  test('paragraphOrdinal:1 resolves the first paragraph (sibling 1-based convention unchanged)', async () => {
    const index = await buildIndex();
    const result = resolveWorkflowTarget(index, { mode: 'paragraphOrdinal', paragraphOrdinal: 1 });
    if (!result.ok) throw new Error(`expected resolved, got ${JSON.stringify(result)}`);
    expect(result.target.entity.nodeId).toBe('b0');
  });

  test('listOrdinal:1 resolves a single flat list item once, not as an ambiguous duplicate', async () => {
    const index = await buildIndex({ listItems: RAW_LIST_ITEMS });
    const result = resolveWorkflowTarget(index, { mode: 'listOrdinal', listOrdinal: 1 });
    if (!result.ok) throw new Error(`expected resolved, got ${JSON.stringify(result)}`);
    expect(result.target.entityKind).toBe('listItem');
    expect(result.target.nodeId).toBe('li1');
  });

  test('table nodeId/ref resolve once instead of matching both the table block and synthetic table entry', async () => {
    const index = await buildIndex({ blocks: RAW_TABLE_BLOCKS });

    const byNodeId = resolveWorkflowTarget(index, { mode: 'nodeId', nodeId: 't1' });
    if (!byNodeId.ok) throw new Error(`expected nodeId resolved, got ${JSON.stringify(byNodeId)}`);
    expect(byNodeId.target.entityKind).toBe('block');
    expect(byNodeId.target.nodeId).toBe('t1');

    const byRef = resolveWorkflowTarget(index, { mode: 'ref', ref: 'table-ref-1' });
    if (!byRef.ok) throw new Error(`expected ref resolved, got ${JSON.stringify(byRef)}`);
    expect(byRef.target.entityKind).toBe('block');
    expect(byRef.target.nodeId).toBe('t1');
  });
});
