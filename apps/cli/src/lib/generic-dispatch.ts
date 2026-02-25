/**
 * Single dispatch entry point for all doc-backed operations.
 *
 * Replaces the 3-tier cascade (tryRunDirectCallOperation → tryRunExtraOperationInvoker
 * → getLegacyRunner) with a single generic path driven by orchestrationKind().
 */

import { orchestrationKind } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { executeReadOperation } from './read-orchestrator.js';
import { executeMutationOperation } from './mutation-orchestrator.js';
import type { CommandContext, CommandExecution } from './types.js';

export type DocOperationRequest = {
  operationId: CliExposedOperationId;
  input: Record<string, unknown>;
  context: CommandContext;
};

/**
 * Dispatches a doc-backed operation through the appropriate orchestrator.
 * All doc-backed operations flow through this single entry point.
 */
export async function dispatchDocOperation(request: DocOperationRequest): Promise<CommandExecution> {
  const kind = orchestrationKind(request.operationId);

  if (kind === 'read') {
    return executeReadOperation(request);
  }

  return executeMutationOperation(request);
}
