import type { WorkflowPocToolName } from './types.js';

export const WORKFLOW_POC_PROFILE = 'workflow-poc' as const;

export type WorkflowExecutionPhase = 'resolve' | 'plan' | 'execute' | 'verify';
export type WorkflowReceiptStatus = 'success' | 'failed' | 'not_implemented';

export type WorkflowIndexSummary = {
  revision: string;
  blocks: number;
  lists: number;
  tables: number;
};

export type WorkflowReceipt = {
  profile: typeof WORKFLOW_POC_PROFILE;
  toolName: WorkflowPocToolName;
  status: WorkflowReceiptStatus;
  phase: WorkflowExecutionPhase;
  sessionKey: string;
  message: string;
  index: WorkflowIndexSummary;
  details?: Record<string, unknown>;
};

export type WorkflowToolResult<TOutput = unknown> = {
  receipt: WorkflowReceipt;
  output?: TOutput;
};

type WorkflowReceiptBaseInput = {
  toolName: WorkflowPocToolName;
  sessionKey: string;
  phase: WorkflowExecutionPhase;
  status: WorkflowReceiptStatus;
  message: string;
  index: WorkflowIndexSummary;
  details?: Record<string, unknown>;
};

function createWorkflowReceiptBase(input: WorkflowReceiptBaseInput): WorkflowReceipt {
  return {
    profile: WORKFLOW_POC_PROFILE,
    toolName: input.toolName,
    status: input.status,
    phase: input.phase,
    sessionKey: input.sessionKey,
    message: input.message,
    index: input.index,
    details: input.details,
  };
}

export function createWorkflowSuccessReceipt(input: {
  toolName: WorkflowPocToolName;
  sessionKey: string;
  phase?: WorkflowExecutionPhase;
  message: string;
  index: WorkflowIndexSummary;
  details?: Record<string, unknown>;
}): WorkflowReceipt {
  return createWorkflowReceiptBase({
    ...input,
    phase: input.phase ?? 'verify',
    status: 'success',
  });
}

export function createWorkflowFailureReceipt(input: {
  toolName: WorkflowPocToolName;
  sessionKey: string;
  phase: WorkflowExecutionPhase;
  message: string;
  index: WorkflowIndexSummary;
  details?: Record<string, unknown>;
}): WorkflowReceipt {
  return createWorkflowReceiptBase({
    ...input,
    status: 'failed',
  });
}

export function createWorkflowNotImplementedReceipt(input: {
  toolName: WorkflowPocToolName;
  sessionKey: string;
  phase: WorkflowExecutionPhase;
  message: string;
  index: WorkflowIndexSummary;
  details?: Record<string, unknown>;
}): WorkflowReceipt {
  return createWorkflowReceiptBase({
    ...input,
    status: 'not_implemented',
  });
}
