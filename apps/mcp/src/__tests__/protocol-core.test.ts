/**
 * MCP protocol integration for MCP_PRESET=core: the server registers the
 * lifecycle tools plus the SDK core preset's two advertised tools, serves the
 * SDK's MCP-flavored core prompt as instructions, and dispatches actions
 * against the in-process document with real receipts.
 */
import { describe, it, expect, afterAll, beforeAll } from 'bun:test';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');
const SERVER_ENTRY = resolve(import.meta.dir, '../index.ts');

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = 'content' in result ? result.content : [];
  const first = (content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? '';
}

function parseContent(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(textContent(result));
}

describe('MCP protocol integration — core preset', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let sessionId: string;
  let docPath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-core-'));
    docPath = join(dir, 'doc.docx');
    await copyFile(BLANK_DOCX, docPath);

    transport = new StdioClientTransport({
      command: 'bun',
      args: ['run', SERVER_ENTRY],
      env: { ...process.env, MCP_PRESET: 'core', NODE_ENV: 'test' },
    });
    client = new Client({ name: 'core-test-client', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists lifecycle tools plus exactly the two advertised core tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      ['superdoc_open', 'superdoc_save', 'superdoc_close', 'superdoc_inspect', 'superdoc_perform_action'].sort(),
    );
    // superdoc_execute_code is dispatch-only in the SDK and must not be
    // reachable over MCP.
    expect(names).not.toContain('superdoc_execute_code');
  });

  it('opens a document and inspects it', async () => {
    const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: docPath } });
    const opened = parseContent(openResult) as { session_id: string };
    expect(opened.session_id).toBeTruthy();
    sessionId = opened.session_id;

    const inspectResult = await client.callTool({
      name: 'superdoc_inspect',
      arguments: { session_id: sessionId, countsOnly: true },
    });
    const snapshot = parseContent(inspectResult) as { counts?: Record<string, number> };
    expect(snapshot.counts).toBeDefined();
  });

  it('performs an action and returns a receipt with verification', async () => {
    const result = await client.callTool({
      name: 'superdoc_perform_action',
      arguments: {
        session_id: sessionId,
        action: 'insert_paragraphs',
        text: 'Inserted over MCP through the core preset.',
      },
    });
    const receipt = parseContent(result) as { status?: string };
    expect(receipt.status).toBe('ok');

    const inspectResult = await client.callTool({
      name: 'superdoc_inspect',
      arguments: { session_id: sessionId, includeDomains: ['blocks'] },
    });
    const snapshot = parseContent(inspectResult) as {
      blocks?: Array<{ text?: string; textPreview?: string | null }>;
    };
    const texts = (snapshot.blocks ?? []).map((block) => block.text ?? block.textPreview ?? '');
    expect(texts.some((text) => text.includes('Inserted over MCP'))).toBe(true);
  });

  it('adds a comment and threads a reply on it (in-process comments dialect)', async () => {
    const addResult = await client.callTool({
      name: 'superdoc_perform_action',
      arguments: {
        session_id: sessionId,
        action: 'add_comments',
        commentText: 'Please review this paragraph.',
        selector: { kind: 'textSearch', terms: ['Inserted over MCP'] },
      },
    });
    const addReceipt = parseContent(addResult) as { status?: string };
    expect(addReceipt.status).toBe('ok');

    // Regression (user demo trace): the reply create used to fail in-process
    // with 'Unknown field "parentId"' — the engine now accepts the contract
    // param name and the SDK sends both dialect keys.
    const replyResult = await client.callTool({
      name: 'superdoc_perform_action',
      arguments: {
        session_id: sessionId,
        action: 'reply_to_comment',
        anchorText: 'Inserted over MCP',
        commentText: 'Confirmed and resolved.',
      },
    });
    const replyReceipt = parseContent(replyResult) as { status?: string; errors?: unknown[] };
    expect(replyReceipt.status).toBe('ok');

    const inspectResult = await client.callTool({
      name: 'superdoc_inspect',
      arguments: { session_id: sessionId, includeDomains: ['comments'] },
    });
    const snapshot = parseContent(inspectResult) as { comments?: Array<{ text?: string }> };
    const texts = (snapshot.comments ?? []).map((comment) => comment.text ?? '');
    expect(texts.some((text) => text.includes('Confirmed and resolved.'))).toBe(true);
  });

  it('serves the core MCP prompt as server instructions', async () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    expect(instructions).toContain('superdoc_perform_action');
  });
});
