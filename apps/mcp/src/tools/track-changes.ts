import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTrackChangesTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_list_changes',
    {
      title: 'List Tracked Changes',
      description:
        'List all tracked changes (suggestions) in the document. Returns change type (insert/delete/format), author, date, and excerpt for each.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        type: z.enum(['insert', 'delete', 'format']).optional().describe('Filter by change type.'),
        limit: z.number().optional().describe('Maximum number of results.'),
        offset: z.number().optional().describe('Skip this many results (for pagination).'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, type, limit, offset }) => {
      try {
        const { api } = sessions.get(session_id);
        const input: Record<string, unknown> = {};
        if (type != null) input.type = type;
        if (limit != null) input.limit = limit;
        if (offset != null) input.offset = offset;

        const result = api.invoke({ operationId: 'trackChanges.list', input });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `List changes failed: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_accept_change',
    {
      title: 'Accept Tracked Change',
      description:
        'Accept a single tracked change (suggestion), applying it to the document. Use the change ID from superdoc_list_changes.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        id: z.string().describe('The tracked change ID from superdoc_list_changes results.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'trackChanges.decide',
          input: { decision: 'accept', target: { id } },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Accept change failed: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_reject_change',
    {
      title: 'Reject Tracked Change',
      description:
        'Reject a single tracked change (suggestion), reverting it from the document. Use the change ID from superdoc_list_changes.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        id: z.string().describe('The tracked change ID from superdoc_list_changes results.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'trackChanges.decide',
          input: { decision: 'reject', target: { id } },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Reject change failed: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_accept_all_changes',
    {
      title: 'Accept All Tracked Changes',
      description: 'Accept all tracked changes (suggestions) in the document, applying them all.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'trackChanges.decide',
          input: { decision: 'accept', target: { scope: 'all' } },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Accept all failed: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_reject_all_changes',
    {
      title: 'Reject All Tracked Changes',
      description: 'Reject all tracked changes (suggestions) in the document, reverting them all.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ session_id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'trackChanges.decide',
          input: { decision: 'reject', target: { scope: 'all' } },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Reject all failed: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    },
  );
}
