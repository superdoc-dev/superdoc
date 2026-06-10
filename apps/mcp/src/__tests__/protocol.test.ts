import { describe, it, expect, afterAll } from 'bun:test';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');
const SERVER_ENTRY = resolve(import.meta.dir, '../index.ts');

// 3 lifecycle + 10 intent tools from the generated catalog
const EXPECTED_TOOLS = [
  // Lifecycle
  'superdoc_open',
  'superdoc_save',
  'superdoc_close',
  // Intent tools (from catalog.json)
  'superdoc_get_content',
  'superdoc_edit',
  'superdoc_format',
  'superdoc_create',
  'superdoc_list',
  'superdoc_comment',
  'superdoc_track_changes',
  'superdoc_search',
  'superdoc_mutations',
  'superdoc_table',
];

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = 'content' in result ? result.content : [];
  const first = (content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? '';
}

function parseContent(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(textContent(result));
}

describe('MCP protocol integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  // Connect once for all tests — spawns the server subprocess
  const ready = (async () => {
    transport = new StdioClientTransport({
      command: 'bun',
      args: ['run', SERVER_ENTRY],
      stderr: 'pipe',
    });
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
  })();

  afterAll(async () => {
    await transport?.close();
  });

  it('connects and lists all expected tools', async () => {
    await ready;
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('tools have required annotations', async () => {
    await ready;
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations!.readOnlyHint).toBe('boolean');
    }
  });

  it('intent tools have action enum in schema', async () => {
    await ready;
    const { tools } = await client.listTools();

    // Multi-action intent tools should have an "action" property with an enum
    const multiActionTools = tools.filter(
      (t) => !['superdoc_open', 'superdoc_save', 'superdoc_close', 'superdoc_search'].includes(t.name),
    );

    for (const tool of multiActionTools) {
      const schema = tool.inputSchema as { properties?: Record<string, { enum?: string[] }> };
      expect(schema.properties?.action).toBeDefined();
      expect(schema.properties!.action.enum).toBeArray();
      expect(schema.properties!.action.enum!.length).toBeGreaterThan(0);
    }
  });

  it('intent tools have session_id in schema', async () => {
    await ready;
    const { tools } = await client.listTools();

    // All intent tools (not lifecycle open) should require session_id
    const intentTools = tools.filter((t) => !['superdoc_open', 'superdoc_save', 'superdoc_close'].includes(t.name));

    for (const tool of intentTools) {
      const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      expect(schema.properties?.session_id).toBeDefined();
      expect(schema.required).toContain('session_id');
    }
  });

  it('open → get_content → close workflow', async () => {
    await ready;

    // Open
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const opened = parseContent(openResult) as { session_id: string; filePath: string };
    expect(opened.session_id).toBeString();
    expect(opened.filePath).toBe(BLANK_DOCX);

    const sid = opened.session_id;

    // Get content as text
    const textResult = await client.callTool({
      name: 'superdoc_get_content',
      arguments: { session_id: sid, action: 'text' },
    });
    expect(textContent(textResult)).toBeDefined();

    // Get content as info
    const infoResult = await client.callTool({
      name: 'superdoc_get_content',
      arguments: { session_id: sid, action: 'info' },
    });
    expect(textContent(infoResult)).toBeTruthy();

    // Close
    const closeResult = await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });
    const closed = parseContent(closeResult) as { closed: boolean };
    expect(closed.closed).toBe(true);
  });

  it('open → create → search → save → close workflow', async () => {
    await ready;

    // Open
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const { session_id: sid } = parseContent(openResult) as { session_id: string };

    // Create a paragraph
    const createResult = await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, action: 'paragraph', text: 'MCP integration test' },
    });
    expect(textContent(createResult)).toBeTruthy();

    // Search for it
    const searchResult = await client.callTool({
      name: 'superdoc_search',
      arguments: {
        session_id: sid,
        select: { type: 'text', pattern: 'MCP integration' },
      },
    });
    const found = parseContent(searchResult) as { matches: unknown[]; total: number };
    expect(found.total).toBeGreaterThan(0);

    // Save to temp path
    const tmpPath = resolve(import.meta.dir, '../../../../tmp-protocol-test.docx');
    const saveResult = await client.callTool({
      name: 'superdoc_save',
      arguments: { session_id: sid, out: tmpPath },
    });
    const saved = parseContent(saveResult) as { path: string; byteLength: number };
    expect(saved.byteLength).toBeGreaterThan(0);

    // Close
    await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });

    // Clean up temp file
    const { unlink } = await import('node:fs/promises');
    await unlink(tmpPath).catch(() => {});
  });

  it('returns isError for invalid session', async () => {
    await ready;

    const result = await client.callTool({
      name: 'superdoc_search',
      arguments: {
        session_id: 'nonexistent',
        select: { type: 'text', pattern: 'test' },
      },
    });

    expect(result).toHaveProperty('isError', true);
    expect(textContent(result)).toContain('No open session');
  });

  it('creates a blank document when file does not exist', async () => {
    await ready;

    const result = await client.callTool({
      name: 'superdoc_open',
      arguments: { path: '/nonexistent/file.docx' },
    });

    expect(result).not.toHaveProperty('isError');
    const body = JSON.parse(textContent(result));
    expect(body).toHaveProperty('session_id');
  });

  // ---------------------------------------------------------------------------
  // Block-node deletion via superdoc_edit (delete_block / delete_block_range)
  //
  // These tests prove the *reported bug* is fixed end-to-end through the MCP
  // layer: a text `delete` (by ref) empties a block but leaves the container
  // behind, whereas `delete_block` (by {kind:'block', nodeType, nodeId} target)
  // physically removes the whole block node.
  //
  // Addressing model (must be respected or the test fails):
  //   - get_content action:"blocks" returns { total, blocks: [...], revision };
  //     each entry exposes BOTH a `nodeId` and a `ref`.
  //   - text `delete` takes a `ref`.
  //   - `delete_block` takes `target: {kind:'block', nodeType, nodeId}`.
  //   - refs and block handles EXPIRE after ANY mutation; we re-fetch blocks
  //     before every call that consumes a handle.
  // ---------------------------------------------------------------------------

  interface BlockEntry {
    nodeId: string;
    nodeType: string;
    isEmpty: boolean;
    ref?: string;
    textPreview: string | null;
  }

  interface BlocksPayload {
    total: number;
    blocks: BlockEntry[];
    revision: string;
  }

  // Always re-fetch — never cache a handle across a mutation.
  async function fetchBlocks(sid: string): Promise<BlocksPayload> {
    const result = await client.callTool({
      name: 'superdoc_get_content',
      arguments: { session_id: sid, action: 'blocks' },
    });
    return parseContent(result) as BlocksPayload;
  }

  it('exposes delete_block and delete_block_range in the superdoc_edit action enum', async () => {
    await ready;
    const { tools } = await client.listTools();

    const editTool = tools.find((t) => t.name === 'superdoc_edit');
    expect(editTool).toBeDefined();

    const schema = editTool!.inputSchema as { properties?: Record<string, { enum?: string[] }> };
    const actionEnum = schema.properties?.action?.enum;
    expect(actionEnum).toBeArray();
    expect(actionEnum).toContain('delete_block');
    expect(actionEnum).toContain('delete_block_range');
  });

  it('delete_block physically removes a block node (count decrements, nodeId absent)', async () => {
    await ready;

    // Open a blank document.
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const { session_id: sid } = parseContent(openResult) as { session_id: string };

    // Create a heading and a paragraph (proven create workflow).
    const headingResult = await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, action: 'heading', text: 'Block To Delete', level: 1 },
    });
    expect(textContent(headingResult)).toBeTruthy();

    const paraResult = await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, action: 'paragraph', text: 'Surviving paragraph' },
    });
    expect(textContent(paraResult)).toBeTruthy();

    // Record block count N and the heading's nodeId from the authoritative listing.
    const before = await fetchBlocks(sid);
    const heading = before.blocks.find((b) => b.nodeType === 'heading');
    expect(heading).toBeDefined();
    const headingNodeId = heading!.nodeId;
    const countBefore = before.blocks.length;
    expect(countBefore).toBeGreaterThan(1);

    // Delete the entire heading block by its target address.
    const deleteResult = await client.callTool({
      name: 'superdoc_edit',
      arguments: {
        session_id: sid,
        action: 'delete_block',
        target: { kind: 'block', nodeType: 'heading', nodeId: headingNodeId },
      },
    });
    expect(deleteResult).not.toHaveProperty('isError');

    // Re-fetch (handles expired) and assert PHYSICAL removal.
    const after = await fetchBlocks(sid);
    expect(after.blocks.length).toBe(countBefore - 1);
    expect(after.blocks.some((b) => b.nodeId === headingNodeId)).toBe(false);

    await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });
  });

  it('text delete leaves an empty container; delete_block removes it (the reported bug)', async () => {
    await ready;

    // Open a blank document and create a heading to operate on.
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const { session_id: sid } = parseContent(openResult) as { session_id: string };

    await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, action: 'heading', text: 'Heading body text', level: 1 },
    });

    // Locate the heading; capture its nodeId AND its fresh ref.
    const before = await fetchBlocks(sid);
    const heading = before.blocks.find((b) => b.nodeType === 'heading');
    expect(heading).toBeDefined();
    const headingNodeId = heading!.nodeId;
    expect(heading!.ref).toBeString();

    // 1) Text `delete` by ref: empties the block but leaves the container.
    const textDelete = await client.callTool({
      name: 'superdoc_edit',
      arguments: { session_id: sid, action: 'delete', ref: heading!.ref },
    });
    expect(textDelete).not.toHaveProperty('isError');

    const afterTextDelete = await fetchBlocks(sid);
    const survivor = afterTextDelete.blocks.find((b) => b.nodeId === headingNodeId);
    expect(survivor).toBeDefined(); // container survives — this is the bug
    expect(survivor!.isEmpty).toBe(true);

    // 2) delete_block by target: physically removes the container.
    const blockDelete = await client.callTool({
      name: 'superdoc_edit',
      arguments: {
        session_id: sid,
        action: 'delete_block',
        target: { kind: 'block', nodeType: 'heading', nodeId: headingNodeId },
      },
    });
    expect(blockDelete).not.toHaveProperty('isError');

    const afterBlockDelete = await fetchBlocks(sid);
    expect(afterBlockDelete.blocks.some((b) => b.nodeId === headingNodeId)).toBe(false);

    await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });
  });

  it('delete_block_range removes a contiguous span of top-level blocks (count drop + spanned nodeIds absent)', async () => {
    await ready;

    // Open a blank document.
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const { session_id: sid } = parseContent(openResult) as { session_id: string };

    // Create four contiguous top-level blocks with distinctive markers. Created
    // blocks append at document end, so RangeAlpha..RangeDelta land in order.
    await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, action: 'heading', text: 'RangeAlpha', level: 1 },
    });
    for (const marker of ['RangeBravo', 'RangeCharlie', 'RangeDelta']) {
      await client.callTool({
        name: 'superdoc_create',
        arguments: { session_id: sid, action: 'paragraph', text: marker },
      });
    }

    // Locate the four created blocks from the authoritative listing.
    const before = await fetchBlocks(sid);
    const findByMarker = (marker: string): BlockEntry => {
      const block = before.blocks.find((b) => (b.textPreview ?? '').includes(marker));
      expect(block).toBeDefined(); // fail loud if create/preview wiring changed
      return block!;
    };
    const alpha = findByMarker('RangeAlpha');
    const bravo = findByMarker('RangeBravo');
    const charlie = findByMarker('RangeCharlie');
    const delta = findByMarker('RangeDelta');

    // Confirm Bravo→Charlie→Delta are contiguous and ordered (start must precede
    // end, and the span is inclusive of both endpoints).
    const idxOf = (b: BlockEntry) => before.blocks.findIndex((x) => x.nodeId === b.nodeId);
    expect(idxOf(charlie)).toBe(idxOf(bravo) + 1);
    expect(idxOf(delta)).toBe(idxOf(bravo) + 2);

    const countBefore = before.blocks.length;

    // Delete the inclusive range Bravo..Delta (3 blocks) by top-level addresses.
    const rangeResult = await client.callTool({
      name: 'superdoc_edit',
      arguments: {
        session_id: sid,
        action: 'delete_block_range',
        start: { kind: 'block', nodeType: bravo.nodeType, nodeId: bravo.nodeId },
        end: { kind: 'block', nodeType: delta.nodeType, nodeId: delta.nodeId },
      },
    });
    expect(rangeResult).not.toHaveProperty('isError');

    // The MCP layer serializes the raw BlocksDeleteRangeResult as JSON. Assert
    // the contiguous-span contract directly: count + the exact spanned nodeIds.
    const payload = parseContent(rangeResult) as {
      success: boolean;
      deletedCount: number;
      deletedBlocks: Array<{ nodeId: string; nodeType: string }>;
    };
    expect(payload.success).toBe(true);
    expect(payload.deletedCount).toBe(3);
    expect(payload.deletedBlocks.map((b) => b.nodeId).sort()).toEqual(
      [bravo.nodeId, charlie.nodeId, delta.nodeId].sort(),
    );

    // Re-fetch (handles expired) and assert PHYSICAL removal of the whole span,
    // while the block just outside the range (Alpha) survives — proves the
    // delete is bounded, not a delete-all.
    const after = await fetchBlocks(sid);
    expect(after.blocks.length).toBe(countBefore - 3);
    for (const removed of [bravo, charlie, delta]) {
      expect(after.blocks.some((b) => b.nodeId === removed.nodeId)).toBe(false);
    }
    expect(after.blocks.some((b) => b.nodeId === alpha.nodeId)).toBe(true);

    await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });
  });
});
