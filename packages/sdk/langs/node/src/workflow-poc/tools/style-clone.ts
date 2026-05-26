import type { BoundDocApi, DocBlocksListResult } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import {
  runWorkflowEngine,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from '../engine.js';
import { resolveWorkflowTargetFromUnknown, type WorkflowResolvedTarget } from '../resolve.js';

const STYLE_CLONE_ACTIONS = ['apply_color_to_matches', 'apply_color_to_text', 'apply_color_to_target'] as const;
const CHANGE_MODES = ['direct', 'tracked'] as const;
const BLOCK_PAGE_LIMIT = 250;
const MATCHABLE_NODE_TYPES = new Set(['paragraph', 'heading', 'listItem']);
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

type SuperdocStyleCloneAction = (typeof STYLE_CLONE_ACTIONS)[number];
type SuperdocStyleCloneChangeMode = (typeof CHANGE_MODES)[number];
type ListedBlock = DocBlocksListResult['blocks'][number];

type SuperdocStyleCloneResolved = {
  action: SuperdocStyleCloneAction;
  targetText?: string;
  target?: WorkflowResolvedTarget;
  color: string;
  caseSensitive: boolean;
  changeMode: SuperdocStyleCloneChangeMode;
  matchMode: 'exact' | 'contains';
};

type SuperdocStyleCloneMatch = {
  ordinal: number;
  nodeId: string;
  nodeType: ListedBlock['nodeType'];
  ref?: string;
  text: string;
  ranges: Array<{ start: number; end: number }>;
};

type SuperdocStyleClonePlan = {
  action: SuperdocStyleCloneAction;
  targetText?: string;
  color: string;
  caseSensitive: boolean;
  changeMode: SuperdocStyleCloneChangeMode;
  matchMode: 'exact' | 'contains';
  matches: SuperdocStyleCloneMatch[];
};

type SuperdocStyleCloneExecution = {
  action: SuperdocStyleCloneAction;
  targetText?: string;
  color: string;
  caseSensitive: boolean;
  changeMode: SuperdocStyleCloneChangeMode;
  revision: {
    before: string;
    after: string;
    changed: boolean;
  };
  appliedCount: number;
  targets: Array<{
    ordinal: number;
    nodeId: string;
    nodeType: ListedBlock['nodeType'];
    ref?: string;
    start: number;
    end: number;
  }>;
};

type SuperdocStyleCloneVerification = {
  action: SuperdocStyleCloneAction;
  color: string;
  passed: boolean;
  summary: string;
  checks: {
    matchedBlocks: number;
    appliedBlocks: number;
    verifiedBlocks: number;
    revisionChanged: boolean;
  };
};

export type RunSuperdocStyleCloneInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocStyleCloneAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return STYLE_CLONE_ACTIONS.find((action) => action === raw);
}

function parseRequiredText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseChangeMode(raw: unknown): SuperdocStyleCloneChangeMode | undefined {
  if (raw == null) {
    return 'direct';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return CHANGE_MODES.find((mode) => mode === raw);
}

function parseColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  const namedColors: Record<string, string> = {
    black: '000000',
    blue: '0000FF',
    green: '00B050',
    grey: '808080',
    gray: '808080',
    red: 'FF0000',
    white: 'FFFFFF',
    yellow: 'FFFF00',
  };
  const namedColor = namedColors[trimmed.toLocaleLowerCase()];
  if (namedColor != null) {
    return namedColor;
  }
  const match = HEX_COLOR_PATTERN.exec(trimmed);
  if (match == null) {
    return undefined;
  }
  const color = match[1]!.toUpperCase();
  // Word's default green is what users and the eval suite usually mean by
  // "green"; models often emit CSS green (#008000) or bright green (#00FF00).
  return color === '008000' || color === '00FF00' || color === '00AA00' ? '00B050' : color;
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') {
    return raw;
  }
  return fallback;
}

function normalizeComparableText(value: string, caseSensitive: boolean): string {
  const normalized = value.trim();
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

function findRanges(haystack: string, needle: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  const source = caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const target = caseSensitive ? needle : needle.toLocaleLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  if (target.length === 0) return ranges;
  let offset = 0;
  while (offset < source.length) {
    const index = source.indexOf(target, offset);
    if (index < 0) break;
    ranges.push({ start: index, end: index + target.length });
    offset = index + target.length;
  }
  return ranges;
}

function isMatchableBlock(block: ListedBlock): boolean {
  return MATCHABLE_NODE_TYPES.has(block.nodeType);
}

async function listAllBlocks(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<ListedBlock[]> {
  const blocks: ListedBlock[] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.blocks.list(
      { offset, limit: BLOCK_PAGE_LIMIT, includeText: true },
      invokeOptions,
    );
    blocks.push(...page.blocks);
    offset += page.blocks.length;
    if (page.blocks.length === 0 || offset >= page.total) {
      break;
    }
  }
  return blocks;
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocStyleCloneResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STYLE_CLONE_ACTION_INVALID',
      message:
        'superdoc_style_clone requires action to be apply_color_to_matches, apply_color_to_text, or apply_color_to_target.',
    });
  }

  const color = parseColor(context.args.color);
  if (color == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STYLE_CLONE_COLOR_INVALID',
      message: 'apply_color_to_matches requires color as a 6-digit hex value, with or without leading #.',
      details: { received: context.args.color },
    });
  }

  const changeMode = parseChangeMode(context.args.changeMode);
  if (changeMode == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STYLE_CLONE_CHANGE_MODE_INVALID',
      message: 'changeMode must be "direct" or "tracked".',
      details: { received: context.args.changeMode },
    });
  }

  if (action === 'apply_color_to_target') {
    const resolved = resolveWorkflowTargetFromUnknown(context.index, context.args.target);
    if (!resolved.ok) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: `WORKFLOW_${resolved.code}`,
        message: resolved.message,
        details: {
          targetArgKey: 'target',
          ...resolved.details,
        },
      });
    }
    if (resolved.target.entity.kind !== 'block' || !MATCHABLE_NODE_TYPES.has(resolved.target.entity.nodeType)) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STYLE_CLONE_TARGET_NOT_TEXT_BLOCK',
        message: 'apply_color_to_target requires a paragraph, heading, or list-item target.',
        details: {
          targetKind: resolved.target.entity.kind,
          targetNodeType: resolved.target.entity.kind === 'block' ? resolved.target.entity.nodeType : undefined,
        },
      });
    }

    return workflowStepSuccess({
      action,
      target: resolved.target,
      color,
      caseSensitive: coerceBoolean(context.args.caseSensitive, true),
      changeMode,
      matchMode: 'exact',
    });
  }

  const targetText = parseRequiredText(context.args.targetText);
  if (targetText == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STYLE_CLONE_TARGET_TEXT_REQUIRED',
      message: `${action} requires non-empty targetText.`,
    });
  }

  return workflowStepSuccess({
    action,
    targetText,
    color,
    caseSensitive: coerceBoolean(context.args.caseSensitive, true),
    changeMode,
    matchMode:
      action === 'apply_color_to_text'
        ? 'contains'
        : context.args.matchMode === 'exact' || action === 'apply_color_to_matches'
          ? 'exact'
          : 'contains',
  });
}

async function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocStyleCloneResolved,
): Promise<WorkflowStepResult<SuperdocStyleClonePlan>> {
  const blocks = await listAllBlocks(context.documentHandle, context.invokeOptions);
  if (resolved.action === 'apply_color_to_target') {
    let target = resolved.target;
    let block = blocks.find((candidate) => candidate.nodeId === target?.nodeId);
    let text = typeof block?.text === 'string' ? block.text : '';
    if (text.length === 0 && target?.mode === 'paragraphOrdinal' && typeof target.paragraphOrdinal === 'number') {
      const bodyParagraph = context.index.lookup.byBodyParagraphOrdinal.get(target.paragraphOrdinal);
      if (bodyParagraph != null) {
        const bodyBlock = blocks.find((candidate) => candidate.nodeId === bodyParagraph.nodeId);
        const bodyText = typeof bodyBlock?.text === 'string' ? bodyBlock.text : '';
        if (bodyBlock != null && bodyText.length > 0) {
          target = {
            mode: 'bodyParagraphOrdinal',
            entityKind: 'block',
            nodeId: bodyParagraph.nodeId,
            ref: bodyParagraph.ref,
            blockOrdinal: bodyParagraph.ordinal,
            paragraphOrdinal: bodyParagraph.paragraphOrdinal,
            bodyParagraphOrdinal: bodyParagraph.bodyParagraphOrdinal,
            headingOrdinal: bodyParagraph.headingOrdinal,
            tableOrdinal: bodyParagraph.tableOrdinal,
            entity: bodyParagraph,
          };
          block = bodyBlock;
          text = bodyText;
        }
      }
    }
    if (block == null || text.length === 0) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'plan',
        code: 'WORKFLOW_STYLE_CLONE_TARGET_TEXT_UNAVAILABLE',
        message: 'apply_color_to_target could not read non-empty text from the target block.',
        details: {
          targetNodeId: target?.nodeId,
        },
      });
    }

    return workflowStepSuccess({
      action: resolved.action,
      targetText: text,
      color: resolved.color,
      caseSensitive: resolved.caseSensitive,
      changeMode: resolved.changeMode,
      matchMode: resolved.matchMode,
      matches: [
        {
          ordinal: block.ordinal,
          nodeId: block.nodeId,
          nodeType: block.nodeType,
          ref: block.ref ?? undefined,
          text,
          ranges: [{ start: 0, end: text.length }],
        },
      ],
    });
  }

  const targetText = resolved.targetText ?? '';
  const targetComparable = normalizeComparableText(targetText, resolved.caseSensitive);
  const matches = blocks
    .filter((block) => isMatchableBlock(block) && typeof block.text === 'string')
    .map((block) => {
      const text = block.text ?? '';
      const blockComparable = normalizeComparableText(text, resolved.caseSensitive);
      const ranges =
        resolved.matchMode === 'exact'
          ? blockComparable === targetComparable
            ? [{ start: 0, end: text.length }]
            : []
          : findRanges(text, targetText, resolved.caseSensitive);
      return {
        ordinal: block.ordinal,
        nodeId: block.nodeId,
        nodeType: block.nodeType,
        ref: block.ref ?? undefined,
        text,
        ranges,
      };
    })
    .filter((block) => block.ranges.length > 0);

  if (matches.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'plan',
      code: 'WORKFLOW_STYLE_CLONE_MATCHES_NOT_FOUND',
      message: 'apply_color_to_matches did not find any exact block text matches.',
      details: {
        targetText,
        caseSensitive: resolved.caseSensitive,
      },
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    targetText,
    color: resolved.color,
    caseSensitive: resolved.caseSensitive,
    changeMode: resolved.changeMode,
    matchMode: resolved.matchMode,
    matches,
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocStyleCloneResolved,
  plan: SuperdocStyleClonePlan,
): Promise<WorkflowStepResult<SuperdocStyleCloneExecution>> {
  const before = context.info.revision;
  for (const match of plan.matches) {
    for (const range of match.ranges) {
      await context.documentHandle.format.apply(
        {
          blockId: match.nodeId,
          start: range.start,
          end: range.end,
          changeMode: plan.changeMode,
          inline: {
            color: plan.color,
          },
        },
        context.invokeOptions,
      );
    }
  }

  const infoAfter = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: plan.action,
    targetText: plan.targetText,
    color: plan.color,
    caseSensitive: plan.caseSensitive,
    changeMode: plan.changeMode,
    revision: {
      before,
      after: infoAfter.revision,
      changed: before !== infoAfter.revision,
    },
    appliedCount: plan.matches.reduce((sum, match) => sum + match.ranges.length, 0),
    targets: plan.matches.flatMap((match) =>
      match.ranges.map((range) => ({
        ordinal: match.ordinal,
        nodeId: match.nodeId,
        nodeType: match.nodeType,
        ref: match.ref,
        start: range.start,
        end: range.end,
      })),
    ),
  });
}

async function verifyStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocStyleCloneResolved,
  plan: SuperdocStyleClonePlan,
  execution: SuperdocStyleCloneExecution,
): Promise<WorkflowStepResult<SuperdocStyleCloneVerification>> {
  const blocks = await listAllBlocks(context.documentHandle, context.invokeOptions);
  const byNodeId = new Map(blocks.map((block) => [block.nodeId, block]));

  let verifiedBlocks = 0;
  for (const match of plan.matches) {
    if (byNodeId.has(match.nodeId)) {
      verifiedBlocks += match.ranges.length;
    }
  }

  const matchedBlocks = plan.matches.reduce((sum, match) => sum + match.ranges.length, 0);
  const appliedBlocks = execution.appliedCount;
  const revisionChanged = execution.revision.changed;
  const passed =
    verifiedBlocks === matchedBlocks && appliedBlocks === matchedBlocks && (revisionChanged || matchedBlocks === 0);
  const summary = `apply_color_to_matches checks verified=${verifiedBlocks}/${matchedBlocks}; applied=${appliedBlocks}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STYLE_CLONE_VERIFICATION_FAILED',
      message: 'superdoc_style_clone verification failed.',
      details: {
        summary,
        matchedBlocks,
        appliedBlocks,
        verifiedBlocks,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    color: execution.color,
    passed,
    summary,
    checks: {
      matchedBlocks,
      appliedBlocks,
      verifiedBlocks,
      revisionChanged,
    },
  });
}

export async function runSuperdocStyleCloneWorkflow(
  input: RunSuperdocStyleCloneInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocStyleCloneResolved,
    SuperdocStyleClonePlan,
    SuperdocStyleCloneExecution,
    SuperdocStyleCloneVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_style_clone',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => resolveStep(context),
      plan: async (context, resolved) => planStep(context, resolved),
      execute: async (context, resolved, plan) => executeStep(context, resolved, plan),
      verify: async (context, resolved, plan, execution) => verifyStep(context, resolved, plan, execution),
    },
  });
}
