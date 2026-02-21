import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerQueryTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_find',
    {
      title: 'Find in Document',
      description:
        'Search the document for nodes matching a type, text pattern, or both. Returns matching nodes with their addresses (use addresses in subsequent edit operations).',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        type: z.string().optional().describe('Node type to filter by (e.g. "heading", "paragraph", "table", "image").'),
        pattern: z.string().optional().describe('Text pattern to search for (substring match).'),
        limit: z.number().optional().describe('Maximum number of results.'),
        offset: z.number().optional().describe('Skip this many results (for pagination).'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, type, pattern, limit, offset }) => {
      try {
        const { api } = sessions.get(session_id);
        const query: Record<string, unknown> = {};

        if (type) {
          query.select = { type };
        }
        if (pattern) {
          query.select = { ...(query.select as object), pattern, mode: 'contains' };
        }

        const input: Record<string, unknown> = { query };
        if (limit != null) input.limit = limit;
        if (offset != null) input.offset = offset;

        const result = api.invoke({ operationId: 'find', input });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Find failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_get_node',
    {
      title: 'Get Node',
      description:
        'Get detailed information about a specific document node by its address (from superdoc_find results).',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        address: z.string().describe('JSON-encoded node address from superdoc_find results.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, address }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(address);
        const result = api.invoke({ operationId: 'getNode', input: parsed });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Get node failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_info',
    {
      title: 'Document Info',
      description: 'Return document metadata: structure summary, node counts, and capabilities.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({ operationId: 'info', input: {} });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Info failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_get_text',
    {
      title: 'Get Document Text',
      description: 'Return the full plain-text content of the document.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({ operationId: 'getText', input: {} });
        return {
          content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Get text failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
