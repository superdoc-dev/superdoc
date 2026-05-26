/**
 * Public workflow-poc surface.
 *
 * This barrel intentionally re-exports the small set of primitives the rest of
 * the SDK needs: tool definitions, routing/dispatch, document indexing, shared
 * engine helpers, and receipt/target/session types.
 */
export { WORKFLOW_POC_TOOL_DEFINITIONS, isWorkflowPocToolName, listWorkflowPocTools } from './catalog.js';
export { dispatchWorkflowPocTool } from './dispatch.js';
export { buildWorkflowDocIndex } from './doc-index.js';
export { runWorkflowEngine } from './engine.js';
export { WORKFLOW_POC_MCP_PROMPT, WORKFLOW_POC_SYSTEM_PROMPT } from './prompt.js';
export {
  createWorkflowFailureReceipt,
  createWorkflowNotImplementedReceipt,
  createWorkflowSuccessReceipt,
} from './receipt.js';
export { parseWorkflowTargetRequest, resolveWorkflowTarget, resolveWorkflowTargetFromUnknown } from './resolve.js';
export { getWorkflowPocToolRegistry, getWorkflowPocToolRegistryEntry } from './registry.js';
export { createWorkflowSessionCache, workflowPocSessionCache } from './session-cache.js';
export { WORKFLOW_POC_TOOL_NAMES } from './types.js';
export type {
  WorkflowDocIndex,
  WorkflowIndexDiagnostic,
  WorkflowIndexedBlock,
  WorkflowIndexedEntity,
  WorkflowIndexedListItem,
  WorkflowIndexedTable,
} from './doc-index.js';
export type {
  WorkflowEngineContext,
  WorkflowEngineFailure,
  WorkflowEngineHooks,
  WorkflowEngineOutput,
  WorkflowEngineRunInput,
  WorkflowEngineRunResult,
  WorkflowStepResult,
} from './engine.js';
export type {
  WorkflowExecutionPhase,
  WorkflowIndexSummary,
  WorkflowReceipt,
  WorkflowReceiptStatus,
  WorkflowToolResult,
} from './receipt.js';
export type {
  WorkflowResolveFailure,
  WorkflowResolveFailureCode,
  WorkflowResolveResult,
  WorkflowResolvedTarget,
  WorkflowTargetRequest,
} from './resolve.js';
export type { WorkflowRegistryEntry, WorkflowRegistryRunInput } from './registry.js';
export type { WorkflowSessionState } from './session-cache.js';
export type { WorkflowPocToolDefinition, WorkflowPocToolName, WorkflowPocProviderTool } from './types.js';
