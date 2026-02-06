import type { SandboxState } from './state.js';

/** An issue found during sandbox state validation. */
export type SandboxInvariantIssue = {
  message: string;
};

/**
 * Checks sandbox state for structural invariant violations (missing or duplicate block IDs).
 *
 * @param state - The sandbox state to validate.
 * @returns An array of issues. Empty means the state is valid.
 */
export function validateState(state: SandboxState): SandboxInvariantIssue[] {
  const issues: SandboxInvariantIssue[] = [];
  const seen = new Set<string>();

  for (const block of state.blocks) {
    if (!block.blockId) {
      issues.push({ message: 'Block missing blockId.' });
      continue;
    }
    if (seen.has(block.blockId)) {
      issues.push({ message: `Duplicate blockId: ${block.blockId}` });
    }
    seen.add(block.blockId);
  }

  return issues;
}
