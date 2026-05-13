/**
 * Wire → contract field-name renames for intent tool dispatch.
 *
 * The MCP wire schema (apps/mcp/src/generated/catalog.ts) is generated from
 * apps/cli/src/cli/operation-params.ts, where PARAM_FLAG_OVERRIDES rewrites
 * a handful of contract field names to shorter CLI flag names (e.g.
 * `commentId` → `id`, `parentCommentId` → `parentId`). The same renamed
 * names end up in the MCP wire schema. Without an inverse translation at
 * dispatch time, the contract validator rejects the input because it expects
 * the canonical field names.
 *
 * The CLI applies the inverse rename in extractInvokeInput()
 * (apps/cli/src/lib/invoke-input.ts PARAM_RENAMES). This module is the MCP
 * mirror, kept in lockstep by hand. Five operations are affected today
 * (comments.delete, comments.get, comments.patch, comments.create's
 * parentId, and getNodeById's id), so duplication is small.
 *
 * Keys are bare operation IDs (no `doc.` prefix) to match the form
 * executeOperation passes to api.invoke().
 */
const PARAM_RENAMES: Record<string, Record<string, string>> = {
  getNodeById: { id: 'nodeId' },
  'comments.create': { parentId: 'parentCommentId' },
  'comments.patch': { id: 'commentId' },
  'comments.delete': { id: 'commentId' },
  'comments.get': { id: 'commentId' },
};

export function applyParamRenames(opId: string, input: Record<string, unknown>): Record<string, unknown> {
  const renames = PARAM_RENAMES[opId];
  if (!renames) return input;
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    renamed[renames[key] ?? key] = value;
  }
  return renamed;
}
