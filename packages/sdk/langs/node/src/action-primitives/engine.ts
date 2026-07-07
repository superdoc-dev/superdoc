/**
 * Shared resolve -> plan -> execute -> verify pipeline for action-primitive tools.
 *
 * Each workflow tool plugs in only the steps it needs. The engine owns the
 * common concerns: reuse the indexed document snapshot, convert thrown
 * exceptions into structured receipts, and return a stable success/failure
 * payload shape to the caller.
 */
import type { BoundDocApi, DocInfoResult } from '../generated/client.js';
import type { InvokeOptions } from '../runtime/process.js';
import { buildWorkflowDocIndex, type WorkflowDocIndex } from './doc-index.js';
import {
  createWorkflowFailureReceipt,
  createWorkflowNotImplementedReceipt,
  createWorkflowSuccessReceipt,
  type WorkflowExecutionPhase,
  type WorkflowIndexSummary,
  type WorkflowToolResult,
} from './receipt.js';
import { workflowPocSessionCache, type WorkflowSessionCache, type WorkflowSessionState } from './session-cache.js';
import type { WorkflowPocToolName } from './types.js';

export type WorkflowEngineFailure = {
  status: 'failed' | 'not_implemented';
  phase: WorkflowExecutionPhase;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkflowStepResult<TValue> = { ok: true; value: TValue } | { ok: false; failure: WorkflowEngineFailure };

export function workflowStepSuccess<TValue>(value: TValue): WorkflowStepResult<TValue> {
  return { ok: true, value };
}

export function workflowStepFailure(failure: WorkflowEngineFailure): WorkflowStepResult<never> {
  return { ok: false, failure };
}

export function workflowNotImplementedFailure(input: {
  phase: WorkflowExecutionPhase;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): WorkflowEngineFailure {
  return {
    status: 'not_implemented',
    phase: input.phase,
    code: input.code,
    message: input.message,
    details: input.details,
  };
}

export type WorkflowEngineContext = {
  toolName: WorkflowPocToolName;
  args: Record<string, unknown>;
  documentHandle: BoundDocApi;
  invokeOptions?: InvokeOptions;
  sessionState: WorkflowSessionState;
  info: DocInfoResult;
  index: WorkflowDocIndex;
};

export type WorkflowEngineHooks<TResolved, TPlan, TExecution, TVerification> = {
  resolve: (context: WorkflowEngineContext) => Promise<WorkflowStepResult<TResolved>>;
  plan?: (context: WorkflowEngineContext, resolved: TResolved) => Promise<WorkflowStepResult<TPlan>>;
  execute?: (
    context: WorkflowEngineContext,
    resolved: TResolved,
    plan: TPlan,
  ) => Promise<WorkflowStepResult<TExecution>>;
  verify?: (
    context: WorkflowEngineContext,
    resolved: TResolved,
    plan: TPlan,
    execution: TExecution,
  ) => Promise<WorkflowStepResult<TVerification>>;
};

export type WorkflowEngineRunInput<TResolved, TPlan, TExecution, TVerification> = {
  documentHandle: BoundDocApi;
  toolName: WorkflowPocToolName;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
  cache?: WorkflowSessionCache;
  hooks: WorkflowEngineHooks<TResolved, TPlan, TExecution, TVerification>;
};

export type WorkflowEngineOutput<TResolved, TPlan, TExecution, TVerification> = {
  resolved: TResolved;
  plan: TPlan;
  execution: TExecution;
  verification: TVerification;
};

export type WorkflowEngineRunResult<TResolved, TPlan, TExecution, TVerification> = WorkflowToolResult<
  WorkflowEngineOutput<TResolved, TPlan, TExecution, TVerification>
> & {
  index: WorkflowDocIndex;
  sessionState: WorkflowSessionState;
};

function toIndexSummary(index: WorkflowDocIndex): WorkflowIndexSummary {
  return {
    revision: index.revision,
    blocks: index.blocks.length,
    lists: index.lists.length,
    tables: index.tables.length,
  };
}

function coerceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function ensureDocIndex(input: {
  documentHandle: BoundDocApi;
  invokeOptions?: InvokeOptions;
  cache: WorkflowSessionCache;
}): Promise<{ sessionState: WorkflowSessionState; info: DocInfoResult; index: WorkflowDocIndex }> {
  const sessionState = input.cache.getState(input.documentHandle);
  const info = await input.documentHandle.info({}, input.invokeOptions);
  const cached = input.cache.getCachedIndex(input.documentHandle, info.revision);
  if (cached != null) {
    return { sessionState, info, index: cached };
  }

  const index = await buildWorkflowDocIndex({
    documentHandle: input.documentHandle,
    documentKey: sessionState.documentKey,
    invokeOptions: input.invokeOptions,
    info,
  });
  input.cache.setCachedIndex(input.documentHandle, index);
  return { sessionState, info, index };
}

function receiptFromFailure(
  toolName: WorkflowPocToolName,
  sessionState: WorkflowSessionState,
  index: WorkflowDocIndex,
  failure: WorkflowEngineFailure,
) {
  const details = { code: failure.code, ...failure.details };
  if (failure.status === 'not_implemented') {
    return createWorkflowNotImplementedReceipt({
      toolName,
      sessionKey: sessionState.documentKey,
      phase: failure.phase,
      message: failure.message,
      index: toIndexSummary(index),
      details,
    });
  }
  return createWorkflowFailureReceipt({
    toolName,
    sessionKey: sessionState.documentKey,
    phase: failure.phase,
    message: failure.message,
    index: toIndexSummary(index),
    details,
  });
}

function exceptionFailure(phase: WorkflowExecutionPhase, error: unknown): WorkflowEngineFailure {
  return {
    status: 'failed',
    phase,
    code: 'WORKFLOW_ENGINE_STEP_EXCEPTION',
    message: `Workflow engine phase "${phase}" threw unexpectedly.`,
    details: { error: coerceErrorMessage(error) },
  };
}

export async function runWorkflowEngine<TResolved, TPlan, TExecution, TVerification>(
  input: WorkflowEngineRunInput<TResolved, TPlan, TExecution, TVerification>,
): Promise<WorkflowEngineRunResult<TResolved, TPlan, TExecution, TVerification>> {
  const cache = input.cache ?? workflowPocSessionCache;
  const { sessionState, info, index } = await ensureDocIndex({
    documentHandle: input.documentHandle,
    invokeOptions: input.invokeOptions,
    cache,
  });

  const context: WorkflowEngineContext = {
    toolName: input.toolName,
    args: input.args,
    documentHandle: input.documentHandle,
    invokeOptions: input.invokeOptions,
    sessionState,
    info,
    index,
  };

  let resolvedStep: WorkflowStepResult<TResolved>;
  try {
    resolvedStep = await input.hooks.resolve(context);
  } catch (error) {
    resolvedStep = workflowStepFailure(exceptionFailure('resolve', error));
  }
  if (!resolvedStep.ok) {
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, resolvedStep.failure),
      index,
      sessionState,
    };
  }

  let planStep: WorkflowStepResult<TPlan>;
  try {
    if (input.hooks.plan == null) {
      planStep = workflowStepSuccess({ resolved: resolvedStep.value, args: context.args } as TPlan);
    } else {
      planStep = await input.hooks.plan(context, resolvedStep.value);
    }
  } catch (error) {
    planStep = workflowStepFailure(exceptionFailure('plan', error));
  }
  if (!planStep.ok) {
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, planStep.failure),
      index,
      sessionState,
    };
  }

  if (input.hooks.execute == null) {
    const notImplemented = workflowNotImplementedFailure({
      phase: 'execute',
      code: 'WORKFLOW_TOOL_EXECUTE_NOT_IMPLEMENTED',
      message: `Workflow tool "${input.toolName}" has no execute implementation yet.`,
    });
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, notImplemented),
      index,
      sessionState,
    };
  }

  let executionStep: WorkflowStepResult<TExecution>;
  try {
    executionStep = await input.hooks.execute(context, resolvedStep.value, planStep.value);
  } catch (error) {
    executionStep = workflowStepFailure(exceptionFailure('execute', error));
  }
  if (!executionStep.ok) {
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, executionStep.failure),
      index,
      sessionState,
    };
  }

  if (input.hooks.verify == null) {
    const notImplemented = workflowNotImplementedFailure({
      phase: 'verify',
      code: 'WORKFLOW_TOOL_VERIFY_NOT_IMPLEMENTED',
      message: `Workflow tool "${input.toolName}" has no verify implementation yet.`,
    });
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, notImplemented),
      index,
      sessionState,
    };
  }

  let verificationStep: WorkflowStepResult<TVerification>;
  try {
    verificationStep = await input.hooks.verify(context, resolvedStep.value, planStep.value, executionStep.value);
  } catch (error) {
    verificationStep = workflowStepFailure(exceptionFailure('verify', error));
  }
  if (!verificationStep.ok) {
    return {
      receipt: receiptFromFailure(input.toolName, sessionState, index, verificationStep.failure),
      index,
      sessionState,
    };
  }

  return {
    receipt: createWorkflowSuccessReceipt({
      toolName: input.toolName,
      sessionKey: sessionState.documentKey,
      message: `Workflow tool "${input.toolName}" completed.`,
      index: toIndexSummary(index),
    }),
    output: {
      resolved: resolvedStep.value,
      plan: planStep.value,
      execution: executionStep.value,
      verification: verificationStep.value,
    },
    index,
    sessionState,
  };
}
