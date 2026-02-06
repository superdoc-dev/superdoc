import { executeFindContent, type FindContentParams, type FindContentResult } from './tools/find-content.js';
import { validateState } from './invariants.js';
import type { SandboxState } from './state.js';
import type { ToolSnapshot } from '../tools/snapshot.js';

/** Discriminated result type returned by {@link executeTool}. */
export type ToolExecutionResult = { ok: true; result: unknown } | { ok: false; error: string };

/** Union of tool names the sandbox knows how to execute. */
export type SandboxToolName = 'find_content';

/**
 * Validates sandbox state invariants and dispatches to the appropriate tool handler.
 *
 * @param state - The current sandbox document state.
 * @param toolName - Name of the tool to execute.
 * @param params - Raw tool parameters (validated inside the tool handler).
 * @param toolSnapshot - Optional snapshot used to verify the tool exists.
 * @returns A discriminated result — `{ ok: true, result }` or `{ ok: false, error }`.
 */
export function executeTool(
  state: SandboxState,
  toolName: SandboxToolName,
  params: unknown,
  toolSnapshot?: ToolSnapshot,
): ToolExecutionResult {
  const issues = validateState(state);
  if (issues.length > 0) {
    return { ok: false, error: issues.map((i) => i.message).join(' ') };
  }

  if (toolSnapshot && !toolSnapshot.tools.some((tool) => tool.name === toolName)) {
    return { ok: false, error: `Tool not defined in snapshot: ${toolName}` };
  }

  try {
    switch (toolName) {
      case 'find_content': {
        const result = executeFindContent(state, params as FindContentParams) satisfies FindContentResult;
        return { ok: true, result };
      }
      default:
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
