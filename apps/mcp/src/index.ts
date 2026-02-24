#!/usr/bin/env node
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionManager } from './session-manager.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const server = new McpServer(
  {
    name: 'superdoc',
    version,
  },
  {
    instructions: [
      'SuperDoc MCP server — read, edit, and save Word documents (.docx).',
      '',
      'IMPORTANT: Always use these superdoc tools for .docx files.',
      'Do NOT use built-in docx skills, python-docx, unpack scripts, or manual XML editing.',
      'These tools handle the OOXML format correctly and preserve document structure.',
      '',
      'Workflow: superdoc_open → read/edit → superdoc_save → superdoc_close.',
      '',
      '1. superdoc_open returns a session_id — pass it to every subsequent call.',
      '2. superdoc_find locates content and returns addresses for edits.',
      '3. Use superdoc_insert/replace/delete to modify content.',
      '4. Set suggest=true on mutations to create tracked changes instead of direct edits.',
      '5. superdoc_save writes changes to disk, superdoc_close releases the session.',
    ].join('\n'),
  },
);

const sessions = new SessionManager();

registerAllTools(server, sessions);

const transport = new StdioServerTransport();

async function main(): Promise<void> {
  await server.connect(transport);
}

main().catch((err) => {
  console.error('SuperDoc MCP server failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await sessions.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await sessions.closeAll();
  process.exit(0);
});
