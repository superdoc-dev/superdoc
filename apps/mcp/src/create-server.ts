import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCP_SYSTEM_PROMPT } from './generated/mcp-prompt.js';
import { SessionManager } from './session-manager.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

export const MCP_PRESETS = ['legacy'] as const;
export type McpPreset = (typeof MCP_PRESETS)[number];

export interface CreateSuperDocMcpServerOptions {
  preset?: McpPreset;
}

export interface SuperDocMcpServer {
  server: McpServer;
  sessions: SessionManager;
}

export function parseMcpPreset(value = 'legacy'): McpPreset {
  if ((MCP_PRESETS as readonly string[]).includes(value)) return value as McpPreset;
  throw new Error(`Unknown MCP preset "${value}". Supported: ${MCP_PRESETS.join(', ')}.`);
}

export function createSuperDocMcpServer(options: CreateSuperDocMcpServerOptions = {}): SuperDocMcpServer {
  const preset = options.preset ?? 'legacy';
  parseMcpPreset(preset);

  const server = new McpServer({ name: 'superdoc', version }, { instructions: MCP_SYSTEM_PROMPT });
  const sessions = new SessionManager();

  registerAllTools(server, sessions);
  return { server, sessions };
}
