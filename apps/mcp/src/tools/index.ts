import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerQueryTools } from './query.js';
import { registerMutationTools } from './mutation.js';
import { registerFormatTools } from './format.js';
import { registerCreateTools } from './create.js';

export function registerAllTools(server: McpServer, sessions: SessionManager): void {
  registerLifecycleTools(server, sessions);
  registerQueryTools(server, sessions);
  registerMutationTools(server, sessions);
  registerFormatTools(server, sessions);
  registerCreateTools(server, sessions);
}
