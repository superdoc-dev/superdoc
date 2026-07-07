#!/usr/bin/env node
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getMcpPrompt } from '@superdoc-dev/sdk';
import { MCP_SYSTEM_PROMPT } from './generated/mcp-prompt.js';
import { SessionManager } from './session-manager.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Validate MCP_PRESET at startup so misconfiguration fails fast instead of
// silently falling back to 'legacy'.
//   legacy (default) — the 9 grouped intent tools from the generated catalog.
//   core             — the actions surface (superdoc_inspect +
//                      superdoc_perform_action) from the SDK's core preset,
//                      with the SDK's MCP-flavored core prompt as instructions.
const PRESETS_SUPPORTED = new Set(['legacy', 'core']);
const requestedPreset = (process.env.MCP_PRESET ?? 'legacy') as 'legacy' | 'core';
if (!PRESETS_SUPPORTED.has(requestedPreset)) {
  console.error(`SuperDoc MCP: unknown preset "${requestedPreset}". Supported: ${[...PRESETS_SUPPORTED].join(', ')}.`);
  process.exit(2);
}

const sessions = new SessionManager();
const transport = new StdioServerTransport();

async function main(): Promise<void> {
  const instructions = requestedPreset === 'core' ? await getMcpPrompt('core') : MCP_SYSTEM_PROMPT;
  const server = new McpServer(
    {
      name: 'superdoc',
      version,
    },
    {
      instructions,
    },
  );
  await registerAllTools(server, sessions, requestedPreset);
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
