#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSuperDocMcpServer, MCP_PRESETS, parseMcpPreset, type McpPreset } from './create-server.js';
import type { SessionManager } from './session-manager.js';

// Validate MCP_PRESET at startup so misconfiguration fails fast instead of
// silently falling back to 'legacy'.
let requestedPreset: McpPreset;
try {
  requestedPreset = parseMcpPreset(process.env.MCP_PRESET);
} catch {
  console.error(`SuperDoc MCP: unknown preset "${process.env.MCP_PRESET}". Supported: ${MCP_PRESETS.join(', ')}.`);
  process.exit(2);
}

const transport = new StdioServerTransport();
let sessions: SessionManager | undefined;

async function main(): Promise<void> {
  const created = await createSuperDocMcpServer({ preset: requestedPreset });
  sessions = created.sessions;
  const { server } = created;
  await server.connect(transport);
}

main().catch((err) => {
  console.error('SuperDoc MCP server failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await sessions?.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await sessions?.closeAll();
  process.exit(0);
});
