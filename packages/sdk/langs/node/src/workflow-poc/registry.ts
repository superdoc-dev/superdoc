import type { BoundDocApi } from '../generated/client.js';
import type { InvokeOptions } from '../runtime/process.js';
import {
  runWorkflowEngine,
  workflowNotImplementedFailure,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from './engine.js';
import { resolveWorkflowTargetFromUnknown, type WorkflowResolvedTarget } from './resolve.js';
import { runSuperdocCommentPassWorkflow } from './tools/comment-pass.js';
import { runSuperdocCommentTransformWorkflow } from './tools/comment-transform.js';
import { runSuperdocContextWorkflow } from './tools/context.js';
import { runSuperdocDoWorkflow } from './tools/do.js';
import { runSuperdocFormatTransformWorkflow } from './tools/format-transform.js';
import { runSuperdocListTransformWorkflow } from './tools/list-transform.js';
import { runSuperdocMediaInsertWorkflow } from './tools/media-insert.js';
import { runSuperdocSectionTransformWorkflow } from './tools/section-transform.js';
import { runSuperdocStyleCloneWorkflow } from './tools/style-clone.js';
import { runSuperdocStructureInsertWorkflow } from './tools/structure-insert.js';
import { runSuperdocTableTransformWorkflow } from './tools/table-transform.js';
import { runSuperdocTrackChangesWorkflow } from './tools/track-changes.js';
import { runSuperdocTextTransformWorkflow } from './tools/text-transform.js';
import { WORKFLOW_POC_TOOL_NAMES, type WorkflowPocToolName } from './types.js';

type WorkflowRegistryResolved = {
  target?: WorkflowResolvedTarget;
  targetArgKey?: string;
};

export type WorkflowRegistryRunInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

export type WorkflowRegistryEntry = {
  toolName: WorkflowPocToolName;
  run: (input: WorkflowRegistryRunInput) => Promise<WorkflowEngineRunResult<unknown, unknown, unknown, unknown>>;
};

type WorkflowRegistryRunner = WorkflowRegistryEntry['run'];

type ToolTargetConfig = {
  argKeys: string[];
  required: boolean;
};

const DEFAULT_TARGET_CONFIG: ToolTargetConfig = { argKeys: [], required: false };

// Only tools that accept a caller-supplied deterministic target need the shared
// pre-resolution hook. The rest own their own resolution logic internally.
const TOOL_TARGET_CONFIG: Partial<Record<WorkflowPocToolName, ToolTargetConfig>> = {
  superdoc_context: { argKeys: [], required: false },
  superdoc_list_transform: { argKeys: ['target'], required: false },
  superdoc_table_transform: { argKeys: ['target'], required: true },
};

function selectRawTarget(
  args: Record<string, unknown>,
  config: ToolTargetConfig,
): { argKey: string; value: unknown } | undefined {
  for (const argKey of config.argKeys) {
    const value = args[argKey];
    if (value != null) {
      return { argKey, value };
    }
  }
  return undefined;
}

function makeResolveHook(
  toolName: WorkflowPocToolName,
  config: ToolTargetConfig,
): (context: WorkflowEngineContext) => Promise<WorkflowStepResult<WorkflowRegistryResolved>> {
  return async (context) => {
    const selectedTarget = selectRawTarget(context.args, config);
    if (selectedTarget == null) {
      if (!config.required) {
        return workflowStepSuccess<WorkflowRegistryResolved>({});
      }
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TARGET_REQUIRED',
        message: `Workflow tool "${toolName}" requires a deterministic target.`,
        details: { expectedArgKeys: config.argKeys },
      });
    }

    const resolved = resolveWorkflowTargetFromUnknown(context.index, selectedTarget.value);
    if (!resolved.ok) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: `WORKFLOW_${resolved.code}`,
        message: resolved.message,
        details: {
          targetArgKey: selectedTarget.argKey,
          ...resolved.details,
        },
      });
    }

    return workflowStepSuccess<WorkflowRegistryResolved>({
      target: resolved.target,
      targetArgKey: selectedTarget.argKey,
    });
  };
}

function makePlaceholderRegistryEntry(toolName: WorkflowPocToolName): WorkflowRegistryEntry {
  const config = TOOL_TARGET_CONFIG[toolName] ?? DEFAULT_TARGET_CONFIG;
  return {
    toolName,
    run: (input) =>
      runWorkflowEngine({
        documentHandle: input.documentHandle,
        toolName,
        args: input.args,
        invokeOptions: input.invokeOptions,
        hooks: {
          resolve: makeResolveHook(toolName, config),
          execute: async (_context, resolved) =>
            workflowStepFailure(
              workflowNotImplementedFailure({
                phase: 'execute',
                code: 'WORKFLOW_TOOL_EXECUTE_NOT_IMPLEMENTED',
                message: `Workflow tool "${toolName}" execute step is not implemented yet.`,
                details: resolved.target == null ? undefined : { target: resolved.target },
              }),
            ),
        },
      }),
  };
}

function makeDirectRegistryEntry(toolName: WorkflowPocToolName, run: WorkflowRegistryRunner): WorkflowRegistryEntry {
  return { toolName, run };
}

// Most tools have a dedicated workflow implementation. The placeholder path
// keeps partially-scaffolded tools explicit and safe instead of failing later in
// the call stack with a vague "unknown tool" error.
const IMPLEMENTED_TOOL_RUNNERS = {
  superdoc_do: runSuperdocDoWorkflow,
  superdoc_context: runSuperdocContextWorkflow,
  superdoc_text_transform: runSuperdocTextTransformWorkflow,
  superdoc_list_transform: runSuperdocListTransformWorkflow,
  superdoc_table_transform: runSuperdocTableTransformWorkflow,
  superdoc_structure_insert: runSuperdocStructureInsertWorkflow,
  superdoc_media_insert: runSuperdocMediaInsertWorkflow,
  superdoc_comment_pass: runSuperdocCommentPassWorkflow,
  superdoc_comment_transform: runSuperdocCommentTransformWorkflow,
  superdoc_format_transform: runSuperdocFormatTransformWorkflow,
  superdoc_section_transform: runSuperdocSectionTransformWorkflow,
  superdoc_style_clone: runSuperdocStyleCloneWorkflow,
  superdoc_track_changes: runSuperdocTrackChangesWorkflow,
} satisfies Partial<Record<WorkflowPocToolName, WorkflowRegistryRunner>>;

const WORKFLOW_POC_TOOL_REGISTRY = new Map<WorkflowPocToolName, WorkflowRegistryEntry>(
  WORKFLOW_POC_TOOL_NAMES.map((toolName) => {
    const run = IMPLEMENTED_TOOL_RUNNERS[toolName];
    if (run != null) {
      return [toolName, makeDirectRegistryEntry(toolName, run)];
    }
    return [toolName, makePlaceholderRegistryEntry(toolName)];
  }),
);

export function getWorkflowPocToolRegistry(): ReadonlyMap<WorkflowPocToolName, WorkflowRegistryEntry> {
  return WORKFLOW_POC_TOOL_REGISTRY;
}

export function getWorkflowPocToolRegistryEntry(toolName: WorkflowPocToolName): WorkflowRegistryEntry {
  const entry = WORKFLOW_POC_TOOL_REGISTRY.get(toolName);
  if (entry == null) {
    throw new Error(`Workflow registry entry not found for tool "${toolName}".`);
  }
  return entry;
}
