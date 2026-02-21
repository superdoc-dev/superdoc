import { describe, it, expect, afterAll } from 'bun:test';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');
const SERVER_ENTRY = resolve(import.meta.dir, '../index.ts');

const EXPECTED_TOOLS = [
  'superdoc_open',
  'superdoc_save',
  'superdoc_close',
  'superdoc_find',
  'superdoc_get_node',
  'superdoc_info',
  'superdoc_get_text',
  'superdoc_insert',
  'superdoc_replace',
  'superdoc_delete',
  'superdoc_format',
  'superdoc_create',
  'superdoc_list_changes',
  'superdoc_accept_change',
  'superdoc_reject_change',
  'superdoc_accept_all_changes',
  'superdoc_reject_all_changes',
  'superdoc_add_comment',
  'superdoc_list_comments',
  'superdoc_reply_comment',
  'superdoc_resolve_comment',
  'superdoc_insert_list',
  'superdoc_list_set_type',
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

  it('open → info → get_text → close workflow', async () => {
    await ready;

    // Open
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const opened = parseContent(openResult) as { session_id: string; filePath: string };
    expect(opened.session_id).toBeString();
    expect(opened.filePath).toBe(BLANK_DOCX);

    const sid = opened.session_id;

    // Info
    const infoResult = await client.callTool({ name: 'superdoc_info', arguments: { session_id: sid } });
    expect(textContent(infoResult)).toBeTruthy();

    // Get text
    const textResult = await client.callTool({ name: 'superdoc_get_text', arguments: { session_id: sid } });
    expect(textContent(textResult)).toBeDefined();

    // Close
    const closeResult = await client.callTool({ name: 'superdoc_close', arguments: { session_id: sid } });
    const closed = parseContent(closeResult) as { closed: boolean };
    expect(closed.closed).toBe(true);
  });

  it('open → create → find → save → close workflow', async () => {
    await ready;

    // Open
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
    const { session_id: sid } = parseContent(openResult) as { session_id: string };

    // Create a paragraph
    const createResult = await client.callTool({
      name: 'superdoc_create',
      arguments: { session_id: sid, type: 'paragraph', text: 'MCP integration test' },
    });
    expect(textContent(createResult)).toContain('success');

    // Find it
    const findResult = await client.callTool({
      name: 'superdoc_find',
      arguments: { session_id: sid, pattern: 'MCP integration' },
    });
    const found = parseContent(findResult) as { matches: unknown[]; total: number };
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
      name: 'superdoc_find',
      arguments: { session_id: 'nonexistent', pattern: 'test' },
    });

    expect(result).toHaveProperty('isError', true);
    expect(textContent(result)).toContain('No open session');
  });

  it('returns isError for invalid file path', async () => {
    await ready;

    const result = await client.callTool({
      name: 'superdoc_open',
      arguments: { path: '/nonexistent/file.docx' },
    });

    expect(result).toHaveProperty('isError', true);
    expect(textContent(result)).toContain('Failed to open document');
  });
});
