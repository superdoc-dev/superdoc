import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerIntentTools } from './intent.js';

export function registerAllTools(server: McpServer, sessions: SessionManager): void {
  registerLifecycleTools(server, sessions);
  registerIntentTools(server, sessions);
}
