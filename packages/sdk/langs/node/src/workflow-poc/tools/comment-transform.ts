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
import { runSuperdocCommentPassWorkflow } from './comment-pass.js';
import { runSuperdocDoWorkflow } from './do.js';

const COMMENT_TRANSFORM_ACTIONS = ['comment_paragraphs', 'comment_summary_at_top', 'comment_risk_clauses'] as const;
const PAGE_LIMIT = 250;
const DEFAULT_RISK_TERMS = [
  'any and all claims',
  'defend',
  'defense costs',
  'fines',
  'hold harmless',
  'indemnif',
  'judgments',
  'liability',
  'liable',
  'loss',
  'penalties',
  'penalty',
  'reimburse',
  'remediation costs',
  'responsible for any',
  'solely responsible',
  'without interruption',
] as const;

type SuperdocCommentTransformAction = (typeof COMMENT_TRANSFORM_ACTIONS)[number];
type CommentCreateParams = NonNullable<Parameters<BoundDocApi['comments']['create']>[0]>;
type CommentCreateTarget = NonNullable<CommentCreateParams['target']>;
type CommentListResult = Awaited<ReturnType<BoundDocApi['comments']['list']>>;
type BlockListResult = Awaited<ReturnType<BoundDocApi['blocks']['list']>>;

type SuperdocCommentTransformResolved = {
  action: 'comment_risk_clauses';
  text: string;
  criteria?: string;
  side?: string;
  minComments: number;
  maxComments: number;
  riskTerms: string[];
};

type SuperdocCommentTransformCandidate = {
  ordinal: number;
  nodeId: string;
  text: string;
  textLength: number;
  score: number;
  matchedTerms: string[];
  target: CommentCreateTarget;
};

type SuperdocCommentTransformPlan = {
  action: 'comment_risk_clauses';
  inspectedParagraphs: number;
  selected: SuperdocCommentTransformCandidate[];
  skipped: {
    empty: number;
    belowThreshold: number;
  };
};

type SuperdocCommentTransformExecution = {
  action: 'comment_risk_clauses';
  text: string;
  commentCount: {
    before: number;
    after: number;
  };
  revision: {
    before: string;
    after: string;
    unchanged: boolean;
  };
  createdComments: number;
  targets: Array<{
    ordinal: number;
    blockId: string;
    textLength: number;
    score: number;
    matchedTerms: string[];
    commentId?: string;
  }>;
};

type SuperdocCommentTransformVerification = {
  action: 'comment_risk_clauses';
  passed: boolean;
  summary: string;
  checks: {
    selectedParagraphs: number;
    createdComments: number;
    verifiedComments: number;
    commentCountDelta: number;
    minComments: number;
    revisionChanged: boolean;
  };
};

export type RunSuperdocCommentTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocCommentTransformAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return COMMENT_TRANSFORM_ACTIONS.find((action) => action === raw);
}

function parseOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const values = raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : undefined;
}

function parsePositiveInteger(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined;
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

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocCommentTransformResolved> {
  const action = parseAction(context.args.action);
  if (action !== 'comment_risk_clauses') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_COMMENT_TRANSFORM_ACTION_INVALID',
      message: 'superdoc_comment_transform risk workflow requires action to be comment_risk_clauses.',
      details: { received: context.args.action },
    });
  }

  const text = parseOptionalString(context.args.text ?? context.args.commentText);
  if (text == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_COMMENT_TRANSFORM_TEXT_REQUIRED',
      message: 'comment_risk_clauses requires comment text.',
    });
  }

  const minComments = parsePositiveInteger(context.args.minComments) ?? 1;
  const maxComments = parsePositiveInteger(context.args.maxComments) ?? 8;
  return workflowStepSuccess({
    action,
    text,
    criteria: parseOptionalString(context.args.criteria),
    side: parseOptionalString(context.args.side),
    minComments,
    maxComments: Math.max(minComments, maxComments),
    riskTerms: parseStringArray(context.args.riskTerms) ?? [...DEFAULT_RISK_TERMS],
  });
}

function includesTerm(text: string, term: string): boolean {
  return text.includes(term.toLocaleLowerCase());
}

function scoreRiskParagraph(
  text: string,
  resolved: SuperdocCommentTransformResolved,
): {
  score: number;
  matchedTerms: string[];
} {
  const lower = text.toLocaleLowerCase();
  const matchedTerms = resolved.riskTerms.filter((term) => includesTerm(lower, term));
  let score = matchedTerms.length;

  if (/\b(company|provider|seller)\s+(will|shall|must|is)\b/.test(lower)) {
    score += 1;
  }
  if (/\b(customer|client|buyer)\b/.test(lower) && /\b(company|provider|seller)\b/.test(lower)) {
    score += 0.5;
  }
  if (/\b(regardless of|any and all|solely responsible|responsible for any)\b/.test(lower)) {
    score += 1.5;
  }
  if (/\b(except to the extent|non-appealable court order|intentional misconduct)\b/.test(lower)) {
    score += 1;
  }
  if (resolved.side != null && lower.includes(resolved.side.toLocaleLowerCase())) {
    score += 0.5;
  }
  if (resolved.criteria != null && /high[-\s]?liability|risk|liability/.test(resolved.criteria.toLocaleLowerCase())) {
    score += /\b(liability|indemnif|defend|penalt|fines?|claims?|damages?|expenses?)\b/.test(lower) ? 1 : 0;
  }

  return { score, matchedTerms };
}

async function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentTransformResolved,
): Promise<WorkflowStepResult<SuperdocCommentTransformPlan>> {
  const blocks = await listAllBlocks(context.documentHandle, context.invokeOptions);
  const candidates: SuperdocCommentTransformCandidate[] = [];
  let inspectedParagraphs = 0;
  let skippedEmpty = 0;

  for (const block of [...blocks].sort((left, right) => left.ordinal - right.ordinal)) {
    if (block.nodeType !== 'paragraph') continue;
    inspectedParagraphs += 1;
    const text = typeof block.text === 'string' ? block.text.trim() : '';
    if (text.length === 0) {
      skippedEmpty += 1;
      continue;
    }
    if (text.length < 40) continue;

    const risk = scoreRiskParagraph(text, resolved);
    if (risk.score < 2.5) continue;

    candidates.push({
      ordinal: block.ordinal,
      nodeId: block.nodeId,
      text,
      textLength: text.length,
      score: risk.score,
      matchedTerms: risk.matchedTerms,
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

  const selected = [...candidates]
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .slice(0, resolved.maxComments)
    .sort((left, right) => left.ordinal - right.ordinal);

  if (selected.length < resolved.minComments) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'plan',
      code: 'WORKFLOW_COMMENT_TRANSFORM_TOO_FEW_CANDIDATES',
      message: 'comment_risk_clauses could not identify enough risk-clause candidates.',
      details: {
        selected: selected.length,
        minComments: resolved.minComments,
        inspectedParagraphs,
      },
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    inspectedParagraphs,
    selected,
    skipped: {
      empty: skippedEmpty,
      belowThreshold: Math.max(0, inspectedParagraphs - skippedEmpty - selected.length),
    },
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentTransformResolved,
  plan: SuperdocCommentTransformPlan,
): Promise<WorkflowStepResult<SuperdocCommentTransformExecution>> {
  const beforeRevision = context.info.revision;
  const beforeCommentCount = context.info.counts.comments ?? 0;
  const targets: SuperdocCommentTransformExecution['targets'] = [];

  for (const candidate of plan.selected) {
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
      textLength: candidate.textLength,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
      commentId: extractCreatedCommentId(result),
    });
  }

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: resolved.action,
    text: resolved.text,
    commentCount: {
      before: beforeCommentCount,
      after: afterInfo.counts.comments ?? beforeCommentCount,
    },
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    createdComments: targets.length,
    targets,
  });
}

function commentMatchesExecutionTarget(
  comment: CommentListResult['items'][number],
  executionTarget: SuperdocCommentTransformExecution['targets'][number],
  expectedText: string,
): boolean {
  if (comment.text !== expectedText) {
    return false;
  }
  if (executionTarget.commentId != null && comment.id !== executionTarget.commentId) {
    return false;
  }
  const segments = comment.target?.segments ?? [];
  return segments.some((segment) => segment.blockId === executionTarget.blockId);
}

async function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocCommentTransformResolved,
  plan: SuperdocCommentTransformPlan,
  execution: SuperdocCommentTransformExecution,
): Promise<WorkflowStepResult<SuperdocCommentTransformVerification>> {
  const comments = await listAllComments(context.documentHandle, context.invokeOptions);
  const verifiedComments = execution.targets.filter((target) =>
    comments.some((comment) => commentMatchesExecutionTarget(comment, target, resolved.text)),
  ).length;
  const commentCountDelta = execution.commentCount.after - execution.commentCount.before;
  const revisionChanged = !execution.revision.unchanged;
  const passed =
    plan.selected.length >= resolved.minComments &&
    execution.createdComments === plan.selected.length &&
    verifiedComments === plan.selected.length &&
    commentCountDelta >= plan.selected.length &&
    revisionChanged;
  const summary =
    `comment_risk_clauses checks selected=${plan.selected.length}; created=${execution.createdComments}; ` +
    `verified=${verifiedComments}; min=${resolved.minComments}; commentCountDelta=${commentCountDelta}; ` +
    `revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_COMMENT_TRANSFORM_VERIFICATION_FAILED',
      message: 'comment_risk_clauses verification failed.',
      details: {
        selected: plan.selected.length,
        createdComments: execution.createdComments,
        verifiedComments,
        commentCountDelta,
        minComments: resolved.minComments,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    passed,
    summary,
    checks: {
      selectedParagraphs: plan.selected.length,
      createdComments: execution.createdComments,
      verifiedComments,
      commentCountDelta,
      minComments: resolved.minComments,
      revisionChanged,
    },
  });
}

export async function runSuperdocCommentTransformWorkflow(
  input: RunSuperdocCommentTransformInput,
): Promise<
  | WorkflowEngineRunResult<
      SuperdocCommentTransformResolved,
      SuperdocCommentTransformPlan,
      SuperdocCommentTransformExecution,
      SuperdocCommentTransformVerification
    >
  | Awaited<ReturnType<typeof runSuperdocDoWorkflow>>
  | Awaited<ReturnType<typeof runSuperdocCommentPassWorkflow>>
> {
  const action = parseAction(input.args.action);
  if (action === 'comment_summary_at_top') {
    return runSuperdocDoWorkflow(input);
  }
  if (action === 'comment_paragraphs') {
    return runSuperdocCommentPassWorkflow(input);
  }

  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_comment_transform',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => resolveStep(context),
      plan: planStep,
      execute: executeStep,
      verify: verifyStep,
    },
  });
}
