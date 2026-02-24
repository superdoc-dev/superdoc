/**
 * Plan engine — barrel export for all plan-engine modules.
 */

export { executePlan, executeCompiledPlan } from './executor.js';
export type { ExecuteCompiledOptions } from './executor.js';
export { previewPlan } from './preview.js';
export { queryMatchAdapter } from './query-match-adapter.js';
export { getRevision, initRevision, incrementRevision, checkRevision, trackRevisions } from './revision-tracker.js';
export { registerStepExecutor, getStepExecutor, hasStepExecutor, clearExecutorRegistry } from './executor-registry.js';
export { planError, PlanError } from './errors.js';
export { captureRunsInRange, resolveInlineStyle } from './style-resolver.js';
export type { CapturedRun, CapturedStyle } from './style-resolver.js';
export type { CompiledTarget, StepExecutor, CompileContext, ExecuteContext } from './executor-registry.types.js';
export {
  writeWrapper,
  formatBoldWrapper,
  formatItalicWrapper,
  formatUnderlineWrapper,
  formatStrikethroughWrapper,
} from './plan-wrappers.js';
