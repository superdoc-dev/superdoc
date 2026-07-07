import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerIntentTools } from './intent.js';
import { registerCoreTools } from './core.js';

export async function registerAllTools(
  server: McpServer,
  sessions: SessionManager,
  presetId: 'legacy' | 'core' = 'legacy',
): Promise<void> {
  registerLifecycleTools(server, sessions);
  if (presetId === 'core') {
    await registerCoreTools(server, sessions);
    return;
  }
  registerIntentTools(server, sessions);
}
