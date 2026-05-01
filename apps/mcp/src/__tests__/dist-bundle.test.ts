import { beforeAll, describe, expect, it } from 'bun:test';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execFileAsync = promisify(execFile);

const MCP_ROOT = resolve(import.meta.dir, '../..');
const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');
const DIST_ENTRY = resolve(MCP_ROOT, 'dist/index.js');

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = 'content' in result ? result.content : [];
  const first = (content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? '';
}

function parseContent(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(textContent(result));
}

describe('MCP dist bundle', () => {
  beforeAll(async () => {
    await execFileAsync('bun', ['build', 'src/index.ts', '--outdir', 'dist', '--target', 'node', '--format', 'esm'], {
      cwd: MCP_ROOT,
    });
  });

  it('starts the bundled Node server and runs open/read/close over stdio', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [DIST_ENTRY],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'dist-bundle-test-client', version: '1.0.0' });

    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('superdoc_open');
      expect(tools.map((tool) => tool.name)).toContain('superdoc_get_content');

      const openResult = await client.callTool({ name: 'superdoc_open', arguments: { path: BLANK_DOCX } });
      expect(openResult).not.toHaveProperty('isError');
      const opened = parseContent(openResult) as { session_id: string };
      expect(opened.session_id).toBeString();

      const infoResult = await client.callTool({
        name: 'superdoc_get_content',
        arguments: { session_id: opened.session_id, action: 'info' },
      });
      expect(infoResult).not.toHaveProperty('isError');
      expect(textContent(infoResult)).toBeTruthy();

      const closeResult = await client.callTool({
        name: 'superdoc_close',
        arguments: { session_id: opened.session_id },
      });
      expect(parseContent(closeResult)).toEqual({ closed: true });
    } finally {
      await transport.close();
    }
  });
});
