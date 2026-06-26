#!/usr/bin/env node
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_SYSTEM_PROMPT } from './generated/mcp-prompt.js';
import { SessionManager, DEFAULT_MCP_USER, type McpUser } from './session-manager.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Validate MCP_PRESET at startup so misconfiguration fails fast instead of
// silently falling back to 'legacy'. Tool registration is wired to legacy via
// the static MCP_TOOL_CATALOG + dispatchIntentTool imports in tools/intent.ts;
// the resolved id is not plumbed further yet. When a non-legacy preset lands,
// pass the id into registerAllTools() so it can route through the registry.
const PRESETS_SUPPORTED = new Set(['legacy']);
const requestedPreset = process.env.MCP_PRESET ?? 'legacy';
if (!PRESETS_SUPPORTED.has(requestedPreset)) {
  console.error(`SuperDoc MCP: unknown preset "${requestedPreset}". Supported: ${[...PRESETS_SUPPORTED].join(', ')}.`);
  process.exit(2);
}

// The author that tracked changes and comments are attributed to. Defaults to "MCP Server"
// (unchanged behaviour); set SUPERDOC_AUTHOR_NAME so an agent records edits under the identity
// it is acting as (the .docx w:author/comment author), and optionally SUPERDOC_AUTHOR_ID.
function resolveAuthor(): McpUser {
  const name = process.env.SUPERDOC_AUTHOR_NAME?.trim();
  const id = process.env.SUPERDOC_AUTHOR_ID?.trim();
  return {
    id: id || DEFAULT_MCP_USER.id,
    name: name || DEFAULT_MCP_USER.name,
  };
}

const server = new McpServer(
  {
    name: 'superdoc',
    version,
  },
  {
    instructions: MCP_SYSTEM_PROMPT,
  },
);

const sessions = new SessionManager(resolveAuthor());

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
