import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerQueryTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_find',
    {
      title: 'Find in Document',
      description:
        'Search the document for nodes matching a type, text pattern, or both. For text searches, the result includes context[].textRanges — these are the TextAddress objects you pass as "target" to replace/insert/delete/format tools. Do NOT use matches[] as mutation targets (those are block addresses).',
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

        // Build a Selector or Query object directly — find accepts both.
        // Selector: { type: 'text', pattern } or { type: 'node', nodeType }
        // Query: { select: Selector, limit?, offset? }
        let selector: Record<string, unknown>;
        if (pattern) {
          selector = { type: 'text', pattern, mode: 'contains' };
        } else if (type) {
          selector = { type: 'node', nodeType: type };
        } else {
          selector = { type: 'node' };
        }

        const input: Record<string, unknown> =
          limit != null || offset != null ? { select: selector, limit, offset } : selector;

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
