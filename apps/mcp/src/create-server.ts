import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpPrompt } from '@superdoc-dev/sdk';
import { MCP_SYSTEM_PROMPT } from './generated/mcp-prompt.js';
import { SessionManager } from './session-manager.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

export const MCP_PRESETS = ['legacy', 'core'] as const;
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

export async function createSuperDocMcpServer(
  options: CreateSuperDocMcpServerOptions = {},
): Promise<SuperDocMcpServer> {
  const preset = options.preset ?? 'legacy';
  parseMcpPreset(preset);

  const instructions = preset === 'core' ? await getMcpPrompt('core') : MCP_SYSTEM_PROMPT;
  const server = new McpServer({ name: 'superdoc', version }, { instructions });
  const sessions = new SessionManager();

  await registerAllTools(server, sessions, preset);
  return { server, sessions };
}
