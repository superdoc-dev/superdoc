import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import {
  runWorkflowEngine,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from '../engine.js';

const COMMENT_PASS_ACTIONS = ['comment_paragraphs'] as const;
const PAGE_LIMIT = 250;

type SuperdocCommentPassAction = (typeof COMMENT_PASS_ACTIONS)[number];
type CommentCreateParams = NonNullable<Parameters<BoundDocApi['comments']['create']>[0]>;
type CommentCreateTarget = NonNullable<CommentCreateParams['target']>;
type CommentListResult = Awaited<ReturnType<BoundDocApi['comments']['list']>>;
type BlockListResult = Awaited<ReturnType<BoundDocApi['blocks']['list']>>;

type SuperdocCommentPassResolved = {
  action: 'comment_paragraphs';
  text: string;
  excludeStyleId?: string;
  includeHeadings: boolean;
};

type SuperdocCommentCandidate = {
  ordinal: number;
  nodeId: string;
  styleId?: string;
  styleName?: string;
  nodeType: 'paragraph' | 'heading';
  textLength: number;
  target: CommentCreateTarget;
};

type SuperdocCommentPassPlan = {
  action: 'comment_paragraphs';
  text: string;
  excludeStyleId?: string;
  inspectedParagraphs: number;
  eligibleParagraphs: SuperdocCommentCandidate[];
  skipped: {
    excludedStyle: number;
    empty: number;
  };
};

type SuperdocCommentPassExecution = {
  action: 'comment_paragraphs';
  text: string;
  excludeStyleId?: string;
  revision: {
    before: string;
    after: string;
    unchanged: boolean;
  };
  commentCount: {
    before: number;
    after: number;
  };
  inspectedParagraphs: number;
  eligibleParagraphs: number;
  createdComments: number;
  skipped: SuperdocCommentPassPlan['skipped'];
  targets: Array<{
    ordinal: number;
    blockId: string;
    styleId?: string;
    styleName?: string;
    nodeType: 'paragraph' | 'heading';
    textLength: number;
    commentId?: string;
  }>;
};

type SuperdocCommentPassVerification = {
  action: 'comment_paragraphs';
  passed: boolean;
  summary: string;
  checks: {
    inspectedParagraphs: number;
    eligibleParagraphs: number;
    createdComments: number;
    verifiedComments: number;
    skippedExcludedStyle: number;
    skippedEmpty: number;
    commentCountDelta: number;
    revisionChanged: boolean;
  };
};

export type RunSuperdocCommentPassInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocCommentPassAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return COMMENT_PASS_ACTIONS.find((action) => action === raw);
}

function parseRequiredText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseOptionalText(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function shouldExcludeStyle(
  styleId: string | undefined,
  styleName: string | undefined,
  excludeStyleId: string | undefined,
): boolean {
  const styleTokens = [styleId, styleName].filter((value): value is string => typeof value === 'string');
  if (excludeStyleId != null) {
    const wanted = excludeStyleId.toLocaleLowerCase();
    if (styleTokens.some((style) => style.toLocaleLowerCase() === wanted)) return true;
    if (wanted.includes('quote') && styleTokens.some((style) => style.toLocaleLowerCase().includes('quote')))
      return true;
    return false;
  }

  return styleTokens.some((style) => style.toLocaleLowerCase().includes('quote'));
}

async function listAllBlocks(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<BlockListResult['blocks']> {
  const blocks: BlockListResult['blocks'] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.blocks.list({ offset, limit: PAGE_LIMIT, includeText: true }, invokeOptions);
    blocks.push(...page.blocks);
    offset += page.blocks.length;
    if (page.blocks.length === 0 || offset >= page.total) {
      break;
    }
  }
  return blocks;
}

async function listAllComments(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<CommentListResult['items']> {
  const comments: CommentListResult['items'] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.comments.list(
      {
        includeResolved: true,
        offset,
        limit: PAGE_LIMIT,
      },
      invokeOptions,
    );
    comments.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) {
      break;
    }
  }
  return comments;
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocCommentPassResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_COMMENT_PASS_ACTION_INVALID',
      message: 'superdoc_comment_pass requires action to be comment_paragraphs.',
    });
  }

  const text = parseRequiredText(context.args.text);
  if (text == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_COMMENT_PASS_TEXT_REQUIRED',
      message: 'comment_paragraphs requires non-empty text.',
    });
  }

  return workflowStepSuccess({
    action,
    text,
    excludeStyleId: parseOptionalText(context.args.excludeStyleId),
    includeHeadings: coerceBoolean(context.args.includeHeadings, true),
  });
}

async function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentPassResolved,
): Promise<WorkflowStepResult<SuperdocCommentPassPlan>> {
  const blocks = await listAllBlocks(context.documentHandle, context.invokeOptions);
  const eligibleParagraphs: SuperdocCommentCandidate[] = [];
  let inspectedParagraphs = 0;
  let skippedExcludedStyle = 0;
  let skippedEmpty = 0;

  for (const block of [...blocks].sort((left, right) => left.ordinal - right.ordinal)) {
    if (block.nodeType !== 'paragraph' && !(resolved.includeHeadings && block.nodeType === 'heading')) {
      continue;
    }

    inspectedParagraphs += 1;
    const text = typeof block.text === 'string' ? block.text : '';
    if (text.trim().length === 0) {
      skippedEmpty += 1;
      continue;
    }

    const record = block as Record<string, unknown>;
    const styleId = typeof record.styleId === 'string' && record.styleId.length > 0 ? record.styleId : undefined;
    const styleName =
      typeof record.styleName === 'string' && record.styleName.length > 0 ? record.styleName : undefined;
    if (shouldExcludeStyle(styleId, styleName, resolved.excludeStyleId)) {
      skippedExcludedStyle += 1;
      continue;
    }

    eligibleParagraphs.push({
      ordinal: block.ordinal,
      nodeId: block.nodeId,
      styleId,
      styleName,
      nodeType: block.nodeType,
      textLength: text.length,
      target: {
        kind: 'text',
        blockId: block.nodeId,
        range: {
          start: 0,
          end: text.length,
        },
      },
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    text: resolved.text,
    excludeStyleId: resolved.excludeStyleId,
    inspectedParagraphs,
    eligibleParagraphs,
    skipped: {
      excludedStyle: skippedExcludedStyle,
      empty: skippedEmpty,
    },
  });
}

function extractCreatedCommentId(result: unknown): string | undefined {
  if (result == null || typeof result !== 'object' || !Array.isArray((result as { inserted?: unknown[] }).inserted)) {
    return undefined;
  }

  for (const entry of (result as { inserted: unknown[] }).inserted) {
    if (
      entry != null &&
      typeof entry === 'object' &&
      (entry as { kind?: unknown }).kind === 'entity' &&
      (entry as { entityType?: unknown }).entityType === 'comment' &&
      typeof (entry as { entityId?: unknown }).entityId === 'string'
    ) {
      return (entry as { entityId: string }).entityId;
    }
  }

  return undefined;
}

async function executeStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentPassResolved,
  plan: SuperdocCommentPassPlan,
): Promise<WorkflowStepResult<SuperdocCommentPassExecution>> {
  const beforeRevision = context.info.revision;
  const beforeCommentCount = context.info.counts.comments ?? 0;
  const targets: SuperdocCommentPassExecution['targets'] = [];

  for (const candidate of plan.eligibleParagraphs) {
    const result = await context.documentHandle.comments.create(
      {
        text: resolved.text,
        target: candidate.target,
      },
      context.invokeOptions,
    );

    targets.push({
      ordinal: candidate.ordinal,
      blockId: candidate.nodeId,
      styleId: candidate.styleId,
      styleName: candidate.styleName,
      nodeType: candidate.nodeType,
      textLength: candidate.textLength,
      commentId: extractCreatedCommentId(result),
    });
  }

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: resolved.action,
    text: resolved.text,
    excludeStyleId: resolved.excludeStyleId,
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    commentCount: {
      before: beforeCommentCount,
      after: afterInfo.counts.comments ?? beforeCommentCount,
    },
    inspectedParagraphs: plan.inspectedParagraphs,
    eligibleParagraphs: plan.eligibleParagraphs.length,
    createdComments: targets.length,
    skipped: plan.skipped,
    targets,
  });
}

function commentMatchesExecutionTarget(
  comment: CommentListResult['items'][number],
  executionTarget: SuperdocCommentPassExecution['targets'][number],
  expectedText: string,
): boolean {
  if (comment.text !== expectedText) {
    return false;
  }

  if (executionTarget.commentId != null && comment.id !== executionTarget.commentId) {
    return false;
  }

  const segments = comment.target?.segments ?? [];
  return segments.some(
    (segment) =>
      segment.blockId === executionTarget.blockId &&
      segment.range.start === 0 &&
      segment.range.end === executionTarget.textLength,
  );
}

async function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentPassResolved,
  _plan: SuperdocCommentPassPlan,
  execution: SuperdocCommentPassExecution,
): Promise<WorkflowStepResult<SuperdocCommentPassVerification>> {
  const comments = await listAllComments(context.documentHandle, context.invokeOptions);
  const verifiedComments = execution.targets.filter((target) =>
    comments.some((comment) => commentMatchesExecutionTarget(comment, target, resolved.text)),
  ).length;
  const commentCountDelta = execution.commentCount.after - execution.commentCount.before;
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const expectedMutations = execution.eligibleParagraphs;
  const passed =
    execution.createdComments === expectedMutations &&
    verifiedComments === expectedMutations &&
    commentCountDelta === expectedMutations &&
    (expectedMutations === 0 ? !revisionChanged : revisionChanged);
  const summary =
    `comment_paragraphs checks created=${execution.createdComments}/${expectedMutations}; ` +
    `verified=${verifiedComments}/${expectedMutations}; skippedExcludedStyle=${execution.skipped.excludedStyle}; ` +
    `skippedEmpty=${execution.skipped.empty}; commentCountDelta=${commentCountDelta}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_COMMENT_PASS_VERIFICATION_FAILED',
      message: 'comment_paragraphs verification failed.',
      details: {
        summary,
        createdComments: execution.createdComments,
        eligibleParagraphs: expectedMutations,
        verifiedComments,
        skippedExcludedStyle: execution.skipped.excludedStyle,
        skippedEmpty: execution.skipped.empty,
        commentCountDelta,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      inspectedParagraphs: execution.inspectedParagraphs,
      eligibleParagraphs: expectedMutations,
      createdComments: execution.createdComments,
      verifiedComments,
      skippedExcludedStyle: execution.skipped.excludedStyle,
      skippedEmpty: execution.skipped.empty,
      commentCountDelta,
      revisionChanged,
    },
  });
}

export async function runSuperdocCommentPassWorkflow(
  input: RunSuperdocCommentPassInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocCommentPassResolved,
    SuperdocCommentPassPlan,
    SuperdocCommentPassExecution,
    SuperdocCommentPassVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_comment_pass',
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
