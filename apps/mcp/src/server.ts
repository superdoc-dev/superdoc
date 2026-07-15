#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSuperDocMcpServer, MCP_PRESETS, parseMcpPreset, type McpPreset } from './create-server.js';

// Validate MCP_PRESET at startup so misconfiguration fails fast instead of
// silently falling back to 'legacy'. Tool registration is wired to legacy via
// the static MCP_TOOL_CATALOG + dispatchIntentTool imports in tools/intent.ts;
// the resolved id is not plumbed further yet. When a non-legacy preset lands,
// pass the id into registerAllTools() so it can route through the registry.
let requestedPreset: McpPreset;
try {
  requestedPreset = parseMcpPreset(process.env.MCP_PRESET);
} catch {
  console.error(`SuperDoc MCP: unknown preset "${process.env.MCP_PRESET}". Supported: ${MCP_PRESETS.join(', ')}.`);
  process.exit(2);
}

const { server, sessions } = createSuperDocMcpServer({ preset: requestedPreset });
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
