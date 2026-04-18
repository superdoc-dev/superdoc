import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerIntentTools } from './intent.js';

export async function registerAllTools(server: McpServer, sessions: SessionManager): Promise<void> {
  registerLifecycleTools(server, sessions);
  await registerIntentTools(server, sessions);
}
