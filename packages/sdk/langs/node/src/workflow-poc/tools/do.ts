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
import type { WorkflowToolResult } from '../receipt.js';
import { runSuperdocCommentPassWorkflow } from './comment-pass.js';
import { runSuperdocListTransformWorkflow } from './list-transform.js';
import { runSuperdocMediaInsertWorkflow } from './media-insert.js';
import { runSuperdocStyleCloneWorkflow } from './style-clone.js';
import { runSuperdocStructureInsertWorkflow } from './structure-insert.js';
import { runSuperdocTableTransformWorkflow } from './table-transform.js';
import { runSuperdocTextTransformWorkflow } from './text-transform.js';
import { runSuperdocTrackChangesWorkflow } from './track-changes.js';
import { resolveWorkflowTargetFromUnknown } from '../resolve.js';

const SUPERDOC_DO_ACTIONS = [
  'replace_all',
  'delete_all',
  'fill_placeholders',
  'rewrite_block',
  'insert_paragraph',
  'insert_paragraphs',
  'insert_section_break',
  'count_paragraphs_and_append',
  'insert_summary_at_top',
  'comment_summary_at_top',
  'insert_heading_sections',
  'insert_list_items',
  'append_list',
  'color_texts',
  'apply_letter_spacing',
  'normalize_body_font_size',
  'move_section',
  'insert_toc',
  'insert_image_with_caption',
  'table',
  'comment_pass',
  'track_changes',
] as const;

type SuperdocDoAction = (typeof SUPERDOC_DO_ACTIONS)[number];

type WorkflowRunnerInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

type NestedWorkflowRunner = (input: WorkflowRunnerInput) => Promise<WorkflowToolResult<unknown>>;
type MutationApplyParams = NonNullable<Parameters<BoundDocApi['mutations']['apply']>[0]>;
type MutationStep = MutationApplyParams['steps'][number];
type FormattableBlock = { nodeId: string; nodeType: 'paragraph' | 'heading' | 'listItem' };

type SuperdocDoResolved = {
  action: SuperdocDoAction;
  inputShape: Record<string, unknown>;
};

type SuperdocDoPlan = {
  action: SuperdocDoAction;
  operations: Array<{
    tool: string;
    action?: string;
    count?: number;
  }>;
};

type SuperdocDoExecution = {
  action: SuperdocDoAction;
  operations: CompactNestedResult[];
  paragraphCount?: number;
  createdText?: string;
};

type SuperdocDoVerification = {
  passed: boolean;
  summary: string;
  operations: Array<{
    tool: string;
    status: string;
    phase: string;
    summary?: string;
  }>;
};

type CompactNestedResult = {
  tool: string;
  status: string;
  phase: string;
  summary?: string;
  checks?: unknown;
  revision?: unknown;
  counts?: unknown;
  details?: unknown;
};

export type RunSuperdocDoWorkflowInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseAction(raw: unknown): SuperdocDoAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return SUPERDOC_DO_ACTIONS.find((action) => action === raw);
}

function parseOptionalString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function parseOptionalBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) {
      return undefined;
    }
    values.push(entry);
  }
  return values;
}

type HeadingSection = {
  heading: string;
  paragraphs: string[];
};

function parseHeadingSections(raw: unknown): HeadingSection[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  const sections: HeadingSection[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const heading = parseOptionalString(entry.heading ?? entry.title);
    const paragraphs = parseStringArray(entry.paragraphs ?? entry.texts);
    if (heading == null || paragraphs == null) {
      return undefined;
    }
    sections.push({ heading, paragraphs });
  }
  return sections;
}

function parsePositiveInteger(raw: unknown): number | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return undefined;
  }
  return raw;
}

function parseOptionalNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function parseChangeMode(raw: unknown): 'direct' | 'tracked' | undefined {
  if (raw == null) {
    return 'direct';
  }
  return raw === 'direct' || raw === 'tracked' ? raw : undefined;
}

function fieldValues(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw;
}

function getRecordProperty(record: unknown, key: string): unknown {
  return isRecord(record) ? record[key] : undefined;
}

function parseTargetBy(rawTarget: unknown): { by: string; value: unknown } | undefined {
  if (!isRecord(rawTarget) || typeof rawTarget.by !== 'string' || !('value' in rawTarget)) {
    return undefined;
  }
  return { by: rawTarget.by, value: rawTarget.value };
}

function resolveListGroupTarget(context: WorkflowEngineContext, rawTarget: unknown): unknown {
  const targetBy = parseTargetBy(rawTarget);
  if (targetBy?.by !== 'listOrdinal' || typeof targetBy.value !== 'number') {
    return rawTarget;
  }

  const listIdsInOrder: string[] = [];
  for (const item of context.index.lists) {
    if (!listIdsInOrder.includes(item.listId)) {
      listIdsInOrder.push(item.listId);
    }
  }

  const listId = listIdsInOrder[targetBy.value - 1];
  if (listId == null) {
    return rawTarget;
  }

  const items = context.index.lists.filter((item) => item.listId === listId);
  const lastItem = items[items.length - 1];
  return lastItem == null ? rawTarget : { nodeId: lastItem.nodeId };
}

function defaultListTarget(context: WorkflowEngineContext): unknown {
  const firstListId = context.index.lists[0]?.listId;
  if (firstListId == null) {
    return undefined;
  }
  const items = context.index.lists.filter((item) => item.listId === firstListId);
  const lastItem = items[items.length - 1];
  return lastItem == null ? undefined : { nodeId: lastItem.nodeId };
}

function normalizeCellTexts(raw: unknown, rows: unknown, columns: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }

  const flattened: Array<{ rowIndex: number; columnIndex: number; text: string }> = [];
  let sawCellObjects = false;
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    for (const entry of row) {
      if (!isRecord(entry)) continue;
      const rowIndex = typeof entry.rowIndex === 'number' ? entry.rowIndex : undefined;
      const columnIndex = typeof entry.columnIndex === 'number' ? entry.columnIndex : undefined;
      const text = parseOptionalString(entry.text);
      if (rowIndex == null || columnIndex == null || text == null) continue;
      sawCellObjects = true;
      flattened.push({ rowIndex, columnIndex, text });
    }
  }

  if (!sawCellObjects) {
    return raw;
  }

  const rowCount = typeof rows === 'number' ? rows : undefined;
  const columnCount = typeof columns === 'number' ? columns : undefined;
  const appearsOneBased =
    flattened.length > 0 &&
    flattened.every((cell) => cell.rowIndex >= 1 && cell.columnIndex >= 1) &&
    (rowCount == null || flattened.every((cell) => cell.rowIndex <= rowCount)) &&
    (columnCount == null || flattened.every((cell) => cell.columnIndex <= columnCount));

  return flattened.map((cell) => ({
    ...cell,
    rowIndex: appearsOneBased ? cell.rowIndex - 1 : cell.rowIndex,
    columnIndex: appearsOneBased ? cell.columnIndex - 1 : cell.columnIndex,
  }));
}

function compactObjectShape(args: Record<string, unknown>): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === 'src' && typeof value === 'string') {
      shape.srcLength = value.length;
      continue;
    }
    if (Array.isArray(value)) {
      shape[key] = { kind: 'array', length: value.length };
      continue;
    }
    shape[key] = typeof value;
  }
  return shape;
}

function compactNestedResult(toolName: string, result: WorkflowToolResult<unknown>): CompactNestedResult {
  const output = isRecord(result.output) ? result.output : undefined;
  const verification = isRecord(output?.verification) ? output.verification : undefined;
  const execution = isRecord(output?.execution) ? output.execution : undefined;
  const summary = typeof verification?.summary === 'string' ? verification.summary : undefined;
  const checks = verification?.checks;
  const revision = execution?.revision;
  const counts = execution?.counts ?? verification?.counts;

  return {
    tool: toolName,
    status: result.receipt.status,
    phase: result.receipt.phase,
    ...(summary == null ? {} : { summary }),
    ...(checks == null ? {} : { checks }),
    ...(revision == null ? {} : { revision }),
    ...(counts == null ? {} : { counts }),
    ...(result.receipt.details == null ? {} : { details: result.receipt.details }),
  };
}

async function runNestedWorkflow(
  context: WorkflowEngineContext,
  toolName: string,
  args: Record<string, unknown>,
  runner: NestedWorkflowRunner,
): Promise<WorkflowStepResult<CompactNestedResult>> {
  const result = await runner({
    documentHandle: context.documentHandle,
    args,
    invokeOptions: context.invokeOptions,
  });
  const compact = compactNestedResult(toolName, result);
  if (result.receipt.status !== 'success') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_DO_NESTED_FAILED',
      message: `${toolName} failed during superdoc_do action.`,
      details: compact,
    });
  }
  return workflowStepSuccess(compact);
}

function nestedTextArgs(context: WorkflowEngineContext, action: SuperdocDoAction): Record<string, unknown> {
  return {
    action,
    edits: context.args.edits,
    fields: context.args.fields,
    values: context.args.values ?? context.args.fields,
    target: context.args.target,
    text: context.args.text,
    caseSensitive: context.args.caseSensitive ?? false,
    preserveStyle: context.args.preserveStyle ?? true,
    changeMode: context.args.changeMode,
  };
}

function nestedStructureArgs(context: WorkflowEngineContext, action: string): Record<string, unknown> {
  return {
    action,
    target: context.args.target,
    placement: context.args.placement,
    position: context.args.position,
    text: context.args.text,
    texts: context.args.texts,
    headingLevel: context.args.headingLevel,
    title: context.args.title ?? context.args.headingText,
    sourceSection: context.args.sourceSection,
    destinationSection: context.args.destinationSection,
    bottomNote: context.args.bottomNote,
    breakType: context.args.breakType,
    changeMode: context.args.changeMode,
  };
}

function nestedListArgs(
  context: WorkflowEngineContext,
  action: 'insert_many' | 'append_new_list',
): Record<string, unknown> {
  const target =
    action === 'insert_many'
      ? (resolveListGroupTarget(context, context.args.target) ?? defaultListTarget(context))
      : context.args.target;
  return {
    action,
    target,
    items: context.args.texts ?? context.args.items,
    kind: context.args.kind,
    position: context.args.position,
    headingText: context.args.headingText,
    headingLevel: context.args.headingLevel,
    changeMode: context.args.changeMode,
  };
}

function nestedTableArgs(context: WorkflowEngineContext): Record<string, unknown> {
  return {
    action: context.args.tableAction,
    target: context.args.target,
    placement: context.args.placement,
    rows: context.args.rows,
    columns: context.args.columns,
    cellTexts: normalizeCellTexts(context.args.cellTexts, context.args.rows, context.args.columns),
    rowOrdinal: context.args.rowOrdinal,
    afterRow: context.args.afterRow,
    afterColumn: context.args.afterColumn,
    headerText: context.args.headerText,
    separatorText: context.args.separatorText,
    color: context.args.color,
    position: context.args.position,
    text: context.args.text,
  };
}

function nestedMediaArgs(context: WorkflowEngineContext): Record<string, unknown> {
  return {
    action: 'insert_image_with_caption',
    target: context.args.target,
    placement: context.args.placement,
    src: context.args.src,
    alt: context.args.alt,
    caption: context.args.caption ?? context.args.text,
  };
}

function nestedCommentArgs(context: WorkflowEngineContext): Record<string, unknown> {
  return {
    action: 'comment_paragraphs',
    text: context.args.commentText ?? context.args.text,
    excludeStyleId:
      context.args.excludeStyleId ?? (context.args.excludeBlockQuotes === true ? 'BlockQuote' : undefined),
    includeHeadings: context.args.includeHeadings,
    limit: context.args.limit,
  };
}

function nestedTrackChangesArgs(context: WorkflowEngineContext): Record<string, unknown> {
  return {
    action: context.args.trackAction ?? context.args.trackChangesAction ?? context.args.mode ?? 'accept_all',
    scope: context.args.scope ?? 'all',
    author: context.args.author,
  };
}

function countParagraphs(context: WorkflowEngineContext): number {
  return context.index.blocks.filter((block) => block.nodeType === 'paragraph').length;
}

function renderCountTemplate(rawTemplate: unknown, count: number): string {
  const template = parseOptionalString(rawTemplate) ?? 'Document contains {count} paragraphs.';
  return template.replace(/\{count\}|\bN\b/g, String(count));
}

async function createCountParagraphNote(
  context: WorkflowEngineContext,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const changeMode = parseChangeMode(context.args.changeMode);
  if (changeMode == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_CHANGE_MODE_INVALID',
      message: 'changeMode must be direct or tracked.',
    });
  }

  const paragraphCount = countParagraphs(context);
  const createdText = renderCountTemplate(context.args.textTemplate ?? context.args.text, paragraphCount);
  const beforeRevision = context.info.revision;
  const params: NonNullable<Parameters<BoundDocApi['create']['paragraph']>[0]> = {
    text: createdText,
    changeMode,
    at: { kind: 'documentEnd' },
  };
  await context.documentHandle.create.paragraph(params, context.invokeOptions);
  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

  return workflowStepSuccess({
    action: 'count_paragraphs_and_append',
    paragraphCount,
    createdText,
    operations: [
      {
        tool: 'doc.create.paragraph',
        status: 'success',
        phase: 'execute',
        summary: `Counted ${paragraphCount} paragraphs and appended the requested note.`,
        revision: {
          before: beforeRevision,
          after: afterInfo.revision,
          unchanged: beforeRevision === afterInfo.revision,
        },
      },
    ],
  });
}

function trimForSummary(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function createCommentSummaryAtTop(
  context: WorkflowEngineContext,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const headingText = parseOptionalString(context.args.headingText) ?? 'Comment summary:';
  const includeResolved = parseOptionalBoolean(context.args.includeResolved) ?? true;
  const limit = parsePositiveInteger(context.args.limit) ?? 50;
  const comments = await context.documentHandle.comments.list(
    { includeResolved, offset: 0, limit },
    context.invokeOptions,
  );

  const summaryBody =
    comments.items.length === 0
      ? 'No comments are currently present in this document.'
      : comments.items
          .map((comment, index) => {
            const author = parseOptionalString(comment.creatorName) ?? `Comment ${index + 1}`;
            const body = parseOptionalString(comment.text) ?? parseOptionalString(comment.anchoredText) ?? '';
            return `${author}: ${trimForSummary(body, 220)}`;
          })
          .join('; ');
  const createdText = `${headingText} ${summaryBody}`.trim();
  const beforeRevision = context.info.revision;
  await context.documentHandle.create.paragraph(
    {
      text: createdText,
      changeMode: parseChangeMode(context.args.changeMode) ?? 'direct',
      at: { kind: 'documentStart' },
    },
    context.invokeOptions,
  );
  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

  return workflowStepSuccess({
    action: 'comment_summary_at_top',
    createdText: trimForSummary(createdText, 500),
    operations: [
      {
        tool: 'doc.comments.list',
        status: 'success',
        phase: 'execute',
        summary: `Read ${comments.items.length}/${comments.total} comments.`,
        counts: { comments: comments.total },
      },
      {
        tool: 'doc.create.paragraph',
        status: 'success',
        phase: 'execute',
        summary: 'Inserted compact comment summary at document start.',
        revision: {
          before: beforeRevision,
          after: afterInfo.revision,
          unchanged: beforeRevision === afterInfo.revision,
        },
      },
    ],
  });
}

async function createHeadingSections(context: WorkflowEngineContext): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const sections = parseHeadingSections(context.args.sections);
  if (sections == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_SECTIONS_INVALID',
      message: 'insert_heading_sections requires sections:[{heading,paragraphs:[...]}].',
    });
  }

  const placement = context.args.placement === 'document_end' ? 'documentEnd' : 'documentStart';
  const headingLevel = parsePositiveInteger(context.args.headingLevel) ?? 1;
  const changeMode = parseChangeMode(context.args.changeMode) ?? 'direct';
  const beforeRevision = context.info.revision;
  const createdNodeIds: string[] = [];
  let previous:
    | {
        kind: 'block';
        nodeType: 'paragraph' | 'heading';
        nodeId: string;
      }
    | undefined;

  for (const section of sections) {
    const headingResult = await context.documentHandle.create.heading(
      {
        text: section.heading,
        level: headingLevel,
        changeMode,
        at:
          previous == null
            ? { kind: placement }
            : {
                kind: 'after',
                target: previous,
              },
      },
      context.invokeOptions,
    );
    previous = {
      kind: 'block',
      nodeType: 'heading',
      nodeId: headingResult.heading.nodeId,
    };
    createdNodeIds.push(headingResult.heading.nodeId);

    for (const paragraph of section.paragraphs) {
      const paragraphResult = await context.documentHandle.create.paragraph(
        {
          text: paragraph,
          changeMode,
          at: {
            kind: 'after',
            target: previous,
          },
        },
        context.invokeOptions,
      );
      previous = {
        kind: 'block',
        nodeType: 'paragraph',
        nodeId: paragraphResult.paragraph.nodeId,
      };
      createdNodeIds.push(paragraphResult.paragraph.nodeId);
    }
  }

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

  return workflowStepSuccess({
    action: 'insert_heading_sections',
    operations: [
      {
        tool: 'doc.create.heading/doc.create.paragraph',
        status: 'success',
        phase: 'execute',
        summary: `Inserted ${sections.length} heading section(s) with ${createdNodeIds.length} block(s).`,
        revision: {
          before: beforeRevision,
          after: afterInfo.revision,
          unchanged: beforeRevision === afterInfo.revision,
        },
        counts: {
          sections: sections.length,
          blocks: createdNodeIds.length,
        },
      },
    ],
  });
}

function buildSummaryTexts(context: WorkflowEngineContext): WorkflowStepResult<string[]> {
  const headingText = parseOptionalString(context.args.headingText) ?? 'Risk summary:';
  const summary = parseOptionalString(context.args.summary ?? context.args.text);
  if (summary == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_SUMMARY_REQUIRED',
      message: 'insert_summary_at_top requires summary or text.',
    });
  }
  return workflowStepSuccess([headingText, summary]);
}

async function executeColorTexts(context: WorkflowEngineContext): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const targetColor = parseOptionalString(context.args.color);
  if (context.args.target != null && targetColor != null) {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_style_clone',
      {
        action: 'apply_color_to_target',
        target: context.args.target,
        color: targetColor,
        changeMode: context.args.changeMode,
      },
      runSuperdocStyleCloneWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action: 'color_texts', operations: [nested.value] });
  }

  const colors = fieldValues(context.args.colors);
  if (colors == null || colors.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_COLORS_REQUIRED',
      message: 'color_texts requires a non-empty colors array.',
    });
  }

  const operations: CompactNestedResult[] = [];
  for (const colorRule of colors) {
    const text = parseOptionalString(getRecordProperty(colorRule, 'text'));
    const color = parseOptionalString(getRecordProperty(colorRule, 'color'));
    if (text == null || color == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_DO_COLOR_RULE_INVALID',
        message: 'Each colors entry requires text and color.',
      });
    }

    const nested = await runNestedWorkflow(
      context,
      'superdoc_style_clone',
      {
        action: context.args.target == null ? 'apply_color_to_text' : 'apply_color_to_target',
        target: context.args.target,
        targetText: text,
        color,
        caseSensitive: getRecordProperty(colorRule, 'caseSensitive') ?? false,
        matchMode: getRecordProperty(colorRule, 'matchMode') ?? 'contains',
        changeMode: context.args.changeMode,
      },
      runSuperdocStyleCloneWorkflow,
    );
    if (!nested.ok) return nested;
    operations.push(nested.value);
  }

  return workflowStepSuccess({
    action: 'color_texts',
    operations,
  });
}

function createBlockFormatMutationStep(
  id: string,
  block: FormattableBlock,
  inline: Record<string, unknown>,
): MutationStep {
  return {
    id,
    op: 'format.apply',
    where: {
      by: 'block',
      nodeType: block.nodeType,
      nodeId: block.nodeId,
    },
    args: {
      inline,
      scope: 'block',
    },
  } as MutationStep;
}

async function executeNormalizeBodyFontSize(
  context: WorkflowEngineContext,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const fontSize = parseOptionalNumber(context.args.fontSize ?? context.args.size) ?? 11;
  const blocks = context.index.blocks.filter(
    (block): block is typeof block & FormattableBlock =>
      (block.nodeType === 'paragraph' || block.nodeType === 'listItem') &&
      typeof block.textPreview === 'string' &&
      block.textPreview.trim().length > 0,
  );

  if (blocks.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'plan',
      code: 'WORKFLOW_DO_BODY_BLOCKS_NOT_FOUND',
      message: 'normalize_body_font_size could not find non-empty body paragraph/list blocks.',
    });
  }

  const beforeRevision = context.info.revision;
  const mutation = await context.documentHandle.mutations.apply(
    {
      atomic: true,
      changeMode: parseChangeMode(context.args.changeMode) ?? 'direct',
      steps: blocks.map((block, index) =>
        createBlockFormatMutationStep(`body-font-${index + 1}`, block, {
          fontSize,
        }),
      ),
      force: true,
    },
    context.invokeOptions,
  );

  return workflowStepSuccess({
    action: 'normalize_body_font_size',
    operations: [
      {
        tool: 'doc.mutations.apply',
        status: 'success',
        phase: 'execute',
        summary: `Normalized ${blocks.length} body block(s) to ${fontSize}pt.`,
        revision: {
          before: beforeRevision,
          after: mutation.revision.after,
          unchanged: beforeRevision === mutation.revision.after,
        },
        counts: { blocks: blocks.length, steps: mutation.steps.length },
      },
    ],
  });
}

async function executeApplyLetterSpacing(
  context: WorkflowEngineContext,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const letterSpacing = parseOptionalNumber(context.args.letterSpacing ?? context.args.spacing) ?? 2;
  const rawTarget = context.args.target ?? { by: 'headingOrdinal', value: context.args.headingOrdinal ?? 1 };
  const resolved = resolveWorkflowTargetFromUnknown(context.index, rawTarget);
  if (!resolved.ok || resolved.target.entity.kind !== 'block') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_FORMAT_TARGET_INVALID',
      message: resolved.ok ? 'apply_letter_spacing requires a block target.' : resolved.message,
      details: resolved.ok
        ? { targetKind: resolved.target.entity.kind }
        : {
            targetArgKey: 'target',
            ...resolved.details,
          },
    });
  }

  const block = resolved.target.entity;
  if (block.nodeType !== 'paragraph' && block.nodeType !== 'heading' && block.nodeType !== 'listItem') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_DO_FORMAT_TARGET_UNSUPPORTED',
      message: 'apply_letter_spacing requires a paragraph, heading, or list item target.',
      details: { nodeType: block.nodeType },
    });
  }
  const formatBlock: FormattableBlock = { nodeId: block.nodeId, nodeType: block.nodeType };

  const beforeRevision = context.info.revision;
  const mutation = await context.documentHandle.mutations.apply(
    {
      atomic: true,
      changeMode: parseChangeMode(context.args.changeMode) ?? 'direct',
      steps: [
        createBlockFormatMutationStep('letter-spacing-1', formatBlock, {
          letterSpacing,
        }),
      ],
      force: true,
    },
    context.invokeOptions,
  );

  return workflowStepSuccess({
    action: 'apply_letter_spacing',
    operations: [
      {
        tool: 'doc.mutations.apply',
        status: 'success',
        phase: 'execute',
        summary: `Applied ${letterSpacing}pt letter spacing to ${block.nodeType} ${block.nodeId}.`,
        revision: {
          before: beforeRevision,
          after: mutation.revision.after,
          unchanged: beforeRevision === mutation.revision.after,
        },
      },
    ],
  });
}

async function executeImageWithCaption(
  context: WorkflowEngineContext,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  const operations: CompactNestedResult[] = [];
  if (parseOptionalBoolean(context.args.sectionBreakBefore) === true) {
    const breakResult = await runNestedWorkflow(
      context,
      'superdoc_structure_insert',
      { action: 'insert_section_break', breakType: context.args.breakType ?? 'nextPage' },
      runSuperdocStructureInsertWorkflow,
    );
    if (!breakResult.ok) return breakResult;
    operations.push(breakResult.value);
  }

  const imageResult = await runNestedWorkflow(
    context,
    'superdoc_media_insert',
    nestedMediaArgs(context),
    runSuperdocMediaInsertWorkflow,
  );
  if (!imageResult.ok) return imageResult;
  operations.push(imageResult.value);

  return workflowStepSuccess({
    action: 'insert_image_with_caption',
    operations,
  });
}

async function executeAction(
  context: WorkflowEngineContext,
  action: SuperdocDoAction,
): Promise<WorkflowStepResult<SuperdocDoExecution>> {
  if (
    action === 'replace_all' ||
    action === 'delete_all' ||
    action === 'fill_placeholders' ||
    action === 'rewrite_block'
  ) {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_text_transform',
      nestedTextArgs(context, action),
      runSuperdocTextTransformWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'insert_paragraph' || action === 'insert_paragraphs' || action === 'insert_section_break') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_structure_insert',
      nestedStructureArgs(context, action),
      runSuperdocStructureInsertWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'count_paragraphs_and_append') {
    return createCountParagraphNote(context);
  }

  if (action === 'insert_summary_at_top') {
    const texts = buildSummaryTexts(context);
    if (!texts.ok) return texts;
    const nested = await runNestedWorkflow(
      context,
      'superdoc_structure_insert',
      {
        action: 'insert_paragraphs',
        texts: texts.value,
        headingLevel: parsePositiveInteger(context.args.headingLevel) ?? 1,
        placement: 'document_start',
        changeMode: context.args.changeMode,
      },
      runSuperdocStructureInsertWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'comment_summary_at_top') {
    return createCommentSummaryAtTop(context);
  }

  if (action === 'insert_heading_sections') {
    return createHeadingSections(context);
  }

  if (action === 'insert_list_items') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_list_transform',
      nestedListArgs(context, 'insert_many'),
      runSuperdocListTransformWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'append_list') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_list_transform',
      nestedListArgs(context, 'append_new_list'),
      runSuperdocListTransformWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'color_texts') {
    return executeColorTexts(context);
  }

  if (action === 'apply_letter_spacing') {
    return executeApplyLetterSpacing(context);
  }

  if (action === 'normalize_body_font_size') {
    return executeNormalizeBodyFontSize(context);
  }

  if (action === 'move_section') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_structure_insert',
      nestedStructureArgs(context, 'move_section'),
      runSuperdocStructureInsertWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'insert_toc') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_structure_insert',
      nestedStructureArgs(context, 'insert_toc'),
      runSuperdocStructureInsertWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'insert_image_with_caption') {
    return executeImageWithCaption(context);
  }

  if (action === 'table') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_table_transform',
      nestedTableArgs(context),
      runSuperdocTableTransformWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  if (action === 'comment_pass') {
    const nested = await runNestedWorkflow(
      context,
      'superdoc_comment_pass',
      nestedCommentArgs(context),
      runSuperdocCommentPassWorkflow,
    );
    if (!nested.ok) return nested;
    return workflowStepSuccess({ action, operations: [nested.value] });
  }

  const nested = await runNestedWorkflow(
    context,
    'superdoc_track_changes',
    nestedTrackChangesArgs(context),
    runSuperdocTrackChangesWorkflow,
  );
  if (!nested.ok) return nested;
  return workflowStepSuccess({ action, operations: [nested.value] });
}

function buildPlan(context: WorkflowEngineContext, action: SuperdocDoAction): SuperdocDoPlan {
  if (action === 'color_texts') {
    return {
      action,
      operations: [
        {
          tool: 'superdoc_style_clone',
          action: 'apply_color_to_text',
          count: fieldValues(context.args.colors)?.length ?? 0,
        },
      ],
    };
  }

  if (action === 'insert_image_with_caption') {
    return {
      action,
      operations: [
        ...(context.args.sectionBreakBefore === true
          ? [{ tool: 'superdoc_structure_insert', action: 'insert_section_break' }]
          : []),
        { tool: 'superdoc_media_insert', action: 'insert_image_with_caption' },
      ],
    };
  }

  if (action === 'table') {
    return {
      action,
      operations: [{ tool: 'superdoc_table_transform', action: String(context.args.tableAction ?? '') }],
    };
  }

  if (action === 'track_changes') {
    return {
      action,
      operations: [
        {
          tool: 'superdoc_track_changes',
          action: String(context.args.trackAction ?? context.args.mode ?? 'accept_all'),
        },
      ],
    };
  }

  const workflowToolByAction: Record<SuperdocDoAction, string> = {
    replace_all: 'superdoc_text_transform',
    delete_all: 'superdoc_text_transform',
    fill_placeholders: 'superdoc_text_transform',
    rewrite_block: 'superdoc_text_transform',
    insert_paragraph: 'superdoc_structure_insert',
    insert_paragraphs: 'superdoc_structure_insert',
    insert_section_break: 'superdoc_structure_insert',
    count_paragraphs_and_append: 'doc.create.paragraph',
    insert_summary_at_top: 'superdoc_structure_insert',
    comment_summary_at_top: 'doc.comments.list',
    insert_heading_sections: 'doc.create.heading/doc.create.paragraph',
    insert_list_items: 'superdoc_list_transform',
    append_list: 'superdoc_list_transform',
    color_texts: 'superdoc_style_clone',
    apply_letter_spacing: 'doc.mutations.apply',
    normalize_body_font_size: 'doc.mutations.apply',
    move_section: 'superdoc_structure_insert',
    insert_toc: 'superdoc_structure_insert',
    insert_image_with_caption: 'superdoc_media_insert',
    table: 'superdoc_table_transform',
    comment_pass: 'superdoc_comment_pass',
    track_changes: 'superdoc_track_changes',
  };

  return {
    action,
    operations: [{ tool: workflowToolByAction[action], action }],
  };
}

export async function runSuperdocDoWorkflow(
  input: RunSuperdocDoWorkflowInput,
): Promise<WorkflowEngineRunResult<SuperdocDoResolved, SuperdocDoPlan, SuperdocDoExecution, SuperdocDoVerification>> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_do',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => {
        const action = parseAction(context.args.action);
        if (action == null) {
          return workflowStepFailure({
            status: 'failed',
            phase: 'resolve',
            code: 'WORKFLOW_DO_ACTION_INVALID',
            message: `superdoc_do requires action to be one of ${SUPERDOC_DO_ACTIONS.join(', ')}.`,
            details: { received: context.args.action },
          });
        }

        return workflowStepSuccess({
          action,
          inputShape: compactObjectShape(context.args),
        });
      },
      plan: async (context, resolved) => workflowStepSuccess(buildPlan(context, resolved.action)),
      execute: async (context, resolved) => executeAction(context, resolved.action),
      verify: async (_context, resolved, _plan, execution) =>
        workflowStepSuccess({
          passed: execution.operations.every((operation) => operation.status === 'success'),
          summary: `superdoc_do ${resolved.action} completed with ${execution.operations.length} operation(s).`,
          operations: execution.operations.map((operation) => ({
            tool: operation.tool,
            status: operation.status,
            phase: operation.phase,
            ...(operation.summary == null ? {} : { summary: operation.summary }),
          })),
        }),
    },
  });
}
