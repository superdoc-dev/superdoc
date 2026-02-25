import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerLifecycleTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_open',
    {
      title: 'Open Document',
      description:
        'Open a Word document (.docx) for reading and editing. If the file does not exist, a new blank document is created at that path. Must be called before any other operation. Returns a session_id to use in subsequent calls.',
      inputSchema: {
        path: z.string().describe('Absolute path to the .docx file.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ path }) => {
      try {
        const session = await sessions.open(path);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ session_id: session.id, filePath: session.filePath }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to open document: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_save',
    {
      title: 'Save Document',
      description: 'Save the document to disk. Writes to the original path unless "out" is specified.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        out: z.string().optional().describe('Save to a different file path instead of the original.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, out }) => {
      try {
        const result = await sessions.save(session_id, out);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to save: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_close',
    {
      title: 'Close Document',
      description: 'Close a document session and release memory. Unsaved changes will be lost.',
      inputSchema: {
        session_id: z.string().describe('Session ID to close.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ session_id }) => {
      await sessions.close(session_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ closed: true }) }],
      };
    },
  );
}
