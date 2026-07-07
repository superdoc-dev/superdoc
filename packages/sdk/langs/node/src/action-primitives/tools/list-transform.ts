import type { BoundDocApi, DocListsInsertResult, DocListsListResult } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import {
  runWorkflowEngine,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from '../engine.js';
import {
  resolveWorkflowTargetFromUnknown,
  type WorkflowResolvedTarget,
  type WorkflowTargetRequest,
} from '../resolve.js';

const LIST_TRANSFORM_ACTIONS = ['insert_many', 'append_new_list'] as const;
const CHANGE_MODES = ['direct', 'tracked'] as const;
const POSITIONS = ['before', 'after'] as const;
const LIST_KINDS = ['bullet', 'ordered'] as const;
const LIST_PAGE_LIMIT = 250;

type SuperdocListTransformAction = (typeof LIST_TRANSFORM_ACTIONS)[number];
type SuperdocListTransformChangeMode = (typeof CHANGE_MODES)[number];
type SuperdocListTransformPosition = (typeof POSITIONS)[number];
type SuperdocListKind = (typeof LIST_KINDS)[number];
type ListInsertParams = NonNullable<Parameters<BoundDocApi['lists']['insert']>[0]>;
type ListInsertTarget = NonNullable<ListInsertParams['target']>;
type TrackedChangeRef = NonNullable<DocListsInsertResult['trackedChangeRefs']>[number];

type SuperdocListTransformResolved = {
  action: SuperdocListTransformAction;
  items: string[];
  changeMode: SuperdocListTransformChangeMode;
  position: SuperdocListTransformPosition;
  target?: ListInsertTarget;
  createAfterTarget?: {
    kind: 'block';
    nodeType: 'paragraph' | 'heading' | 'listItem';
    nodeId: string;
  };
  createNewList: boolean;
  targetSource: 'provided' | 'auto_single_list' | 'apparent_textual_list' | 'document_end';
  deterministicTarget: boolean;
  listKind: SuperdocListKind;
  preset: string;
  headingText?: string;
  headingLevel?: number;
  listId?: string;
  request?: WorkflowTargetRequest;
  resolvedTarget?: WorkflowResolvedTarget;
};

type SuperdocListTransformPlan = {
  action: SuperdocListTransformAction;
  changeMode: SuperdocListTransformChangeMode;
  position: SuperdocListTransformPosition;
  target?: ListInsertTarget;
  createAfterTarget?: SuperdocListTransformResolved['createAfterTarget'];
  createNewList: boolean;
  items: string[];
  stepCount: number;
  targetSource: SuperdocListTransformResolved['targetSource'];
  deterministicTarget: boolean;
  listKind: SuperdocListKind;
  preset: string;
  headingText?: string;
  headingLevel?: number;
  listId?: string;
};

type SuperdocListTransformExecution = {
  action: SuperdocListTransformAction;
  changeMode: SuperdocListTransformChangeMode;
  position: SuperdocListTransformPosition;
  targetSource: SuperdocListTransformResolved['targetSource'];
  deterministicTarget: boolean;
  listKind: SuperdocListKind;
  preset: string;
  headingText?: string;
  headingLevel?: number;
  headingNodeId?: string;
  headingDirectFormattingReset?: boolean;
  headingDetachedFromList?: boolean;
  listId?: string;
  insertedCount: number;
  insertedNodeIds: string[];
  inserts: Array<{
    text: string;
    nodeId: string;
    trackedChangeRefIds: string[];
  }>;
  trackedChangeRefs: TrackedChangeRef[];
};

type SuperdocListTransformVerification = {
  action: SuperdocListTransformAction;
  passed: boolean;
  summary: string;
  checks: {
    insertedPresent: number;
    insertedExpected: number;
    textsVerified: number;
    textsExpected: number;
    headingVerified?: boolean;
    trackedChangeRefs: number;
  };
};

export type RunSuperdocListTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocListTransformAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return LIST_TRANSFORM_ACTIONS.find((action) => action === raw);
}

function parsePosition(raw: unknown): SuperdocListTransformPosition | undefined {
  if (raw == null) {
    return 'after';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return POSITIONS.find((position) => position === raw);
}

function parseChangeMode(raw: unknown): SuperdocListTransformChangeMode | undefined {
  if (raw == null) {
    return 'direct';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return CHANGE_MODES.find((mode) => mode === raw);
}

function parseListKind(raw: unknown, fallback: SuperdocListKind): SuperdocListKind | undefined {
  if (raw == null) {
    return fallback;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return LIST_KINDS.find((kind) => kind === raw);
}

function parsePreset(raw: unknown, kind: SuperdocListKind): string {
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  return kind === 'bullet' ? 'disc' : 'decimal';
}

function parseItems(raw: unknown): string[] | undefined {
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

function parseOptionalText(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseHeadingLevel(raw: unknown): number | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 6) {
    return Number.NaN;
  }
  return raw;
}

function resolveTargetAddress(
  context: WorkflowEngineContext,
  resolvedTarget: WorkflowResolvedTarget,
): WorkflowStepResult<{ target: ListInsertTarget; listId?: string }> {
  if (resolvedTarget.entity.kind === 'listItem') {
    return workflowStepSuccess({
      target: {
        kind: 'block',
        nodeType: 'listItem',
        nodeId: resolvedTarget.entity.nodeId,
      },
      listId: resolvedTarget.entity.listId,
    });
  }

  if (resolvedTarget.entity.kind === 'block' && resolvedTarget.entity.nodeType === 'listItem') {
    const listItem = context.index.lists.find((entry) => entry.nodeId === resolvedTarget.entity.nodeId);
    return workflowStepSuccess({
      target: {
        kind: 'block',
        nodeType: 'listItem',
        nodeId: resolvedTarget.entity.nodeId,
      },
      listId: listItem?.listId,
    });
  }

  return workflowStepFailure({
    status: 'failed',
    phase: 'resolve',
    code: 'WORKFLOW_TARGET_KIND_UNSUPPORTED',
    message: `superdoc_list_transform requires a list item target but resolved to ${resolvedTarget.entity.kind}.`,
    details: {
      entityKind: resolvedTarget.entity.kind,
      ...(resolvedTarget.entity.kind === 'block' ? { nodeType: resolvedTarget.entity.nodeType } : {}),
    },
  });
}

function resolveSingleListAppendTarget(context: WorkflowEngineContext): WorkflowStepResult<{
  target?: ListInsertTarget;
  listId?: string;
}> {
  const listIds = new Map<string, Array<(typeof context.index.lists)[number]>>();
  for (const item of context.index.lists) {
    const existing = listIds.get(item.listId);
    if (existing == null) {
      listIds.set(item.listId, [item]);
      continue;
    }
    existing.push(item);
  }

  if (listIds.size === 0) {
    return workflowStepSuccess({
      target: undefined as unknown as ListInsertTarget,
      listId: undefined,
    });
  }

  const sortedAllItems = [...context.index.lists].sort((left, right) => {
    const leftOrder = left.apiOrdinal ?? left.indexOrdinal;
    const rightOrder = right.apiOrdinal ?? right.indexOrdinal;
    return leftOrder - rightOrder;
  });
  const firstListId = sortedAllItems[0]?.listId;
  const onlyList = firstListId == null ? undefined : ([firstListId, listIds.get(firstListId) ?? []] as const);
  if (onlyList == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_TARGET_REQUIRED',
      message: 'superdoc_list_transform requires target when no list items are indexed.',
      details: {
        listCount: 0,
      },
    });
  }

  const [listId, items] = onlyList;
  if (items.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_TARGET_REQUIRED',
      message: 'superdoc_list_transform requires target when the only list has no addressable items.',
      details: {
        listId,
      },
    });
  }

  const sorted = [...items].sort((left, right) => {
    const leftOrder = left.apiOrdinal ?? left.indexOrdinal;
    const rightOrder = right.apiOrdinal ?? right.indexOrdinal;
    return leftOrder - rightOrder;
  });
  const tail = sorted[sorted.length - 1];
  if (tail == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_TARGET_REQUIRED',
      message: 'superdoc_list_transform could not identify a list tail item for append.',
      details: { listId },
    });
  }

  return workflowStepSuccess({
    target: {
      kind: 'block',
      nodeType: 'listItem',
      nodeId: tail.nodeId,
    },
    listId,
  });
}

const TEXTUAL_ORDERED_LIST_PATTERN = /^\s*(?:\(\d+\)|\d+[.)]|[A-Z][.)])\s+\S/;
const TEXTUAL_BULLET_LIST_PATTERN = /^\s*(?:[-*•‣◦])\s+\S/;

function detectApparentTextualListTail(
  context: WorkflowEngineContext,
  kind: SuperdocListKind,
): SuperdocListTransformResolved['createAfterTarget'] | undefined {
  const pattern = kind === 'bullet' ? TEXTUAL_BULLET_LIST_PATTERN : TEXTUAL_ORDERED_LIST_PATTERN;
  const candidateBlocks = context.index.blocks.filter((block) => {
    if (block.nodeType !== 'paragraph' && block.nodeType !== 'heading' && block.nodeType !== 'listItem') {
      return false;
    }
    return typeof block.textPreview === 'string' && pattern.test(block.textPreview);
  });

  if (candidateBlocks.length === 0) {
    return undefined;
  }

  let bestRun: typeof candidateBlocks = [];
  let currentRun: typeof candidateBlocks = [];
  let previousOrdinal: number | undefined;
  for (const block of candidateBlocks) {
    if (previousOrdinal == null || block.ordinal === previousOrdinal + 1) {
      currentRun.push(block);
    } else {
      if (currentRun.length > bestRun.length) {
        bestRun = currentRun;
      }
      currentRun = [block];
    }
    previousOrdinal = block.ordinal;
  }
  if (currentRun.length > bestRun.length) {
    bestRun = currentRun;
  }

  const tail = (bestRun.length >= 2 ? bestRun : candidateBlocks)[
    (bestRun.length >= 2 ? bestRun : candidateBlocks).length - 1
  ];
  if (tail == null || (tail.nodeType !== 'paragraph' && tail.nodeType !== 'heading' && tail.nodeType !== 'listItem')) {
    return undefined;
  }

  return {
    kind: 'block',
    nodeType: tail.nodeType,
    nodeId: tail.nodeId,
  };
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocListTransformResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_TRANSFORM_ACTION_INVALID',
      message: 'superdoc_list_transform requires action to be "insert_many" or "append_new_list".',
    });
  }

  const items = parseItems(context.args.items);
  if (items == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_ITEMS_REQUIRED',
      message: 'insert_many requires a non-empty items array of non-empty strings.',
    });
  }

  const listKind = parseListKind(
    context.args.kind ?? context.args.listKind,
    action === 'append_new_list' ? 'bullet' : 'ordered',
  );
  if (listKind == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_KIND_INVALID',
      message: 'kind/listKind must be "bullet" or "ordered".',
      details: { received: context.args.kind ?? context.args.listKind },
    });
  }
  const preset = parsePreset(context.args.preset, listKind);
  const headingText = parseOptionalText(context.args.headingText);
  const headingLevel = parseHeadingLevel(context.args.headingLevel);
  if (Number.isNaN(headingLevel)) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_HEADING_LEVEL_INVALID',
      message: 'headingLevel must be an integer from 1 to 6 when provided.',
      details: { received: context.args.headingLevel },
    });
  }

  const changeMode = parseChangeMode(context.args.changeMode);
  if (changeMode == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_CHANGE_MODE_INVALID',
      message: 'changeMode must be "direct" or "tracked".',
      details: { received: context.args.changeMode },
    });
  }

  const position = parsePosition(context.args.position);
  if (position == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_POSITION_INVALID',
      message: 'position must be "before" or "after".',
      details: { received: context.args.position },
    });
  }

  if (action === 'append_new_list') {
    return workflowStepSuccess({
      action,
      items,
      changeMode,
      position: 'after',
      createNewList: true,
      targetSource: 'document_end',
      deterministicTarget: true,
      listKind,
      preset,
      headingText,
      headingLevel,
    });
  }

  if (headingText != null || headingLevel != null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_LIST_HEADING_UNSUPPORTED',
      message: 'headingText/headingLevel are only supported for action "append_new_list".',
    });
  }

  if (context.args.target == null) {
    if (position === 'before') {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_LIST_TARGET_REQUIRED',
        message: 'position "before" requires an explicit deterministic target for superdoc_list_transform.',
      });
    }

    const autoTarget = resolveSingleListAppendTarget(context);
    if (!autoTarget.ok) {
      return autoTarget;
    }

    return workflowStepSuccess({
      action,
      items,
      changeMode,
      position: 'after',
      target: autoTarget.value.target,
      createAfterTarget: autoTarget.value.target == null ? detectApparentTextualListTail(context, listKind) : undefined,
      createNewList: autoTarget.value.target == null,
      targetSource:
        autoTarget.value.target == null && detectApparentTextualListTail(context, listKind) != null
          ? 'apparent_textual_list'
          : 'auto_single_list',
      deterministicTarget: false,
      listKind,
      preset,
      listId: autoTarget.value.listId,
    });
  }

  const resolved = resolveWorkflowTargetFromUnknown(context.index, context.args.target);
  if (!resolved.ok) {
    if (position === 'after') {
      const createAfterTarget = detectApparentTextualListTail(context, listKind);
      if (createAfterTarget != null) {
        return workflowStepSuccess({
          action,
          items,
          changeMode,
          position,
          createAfterTarget,
          createNewList: true,
          targetSource: 'apparent_textual_list',
          deterministicTarget: false,
          listKind,
          preset,
        });
      }
    }

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

  const targetAddress = resolveTargetAddress(context, resolved.target);
  if (!targetAddress.ok) {
    return targetAddress;
  }

  return workflowStepSuccess({
    action,
    items,
    changeMode,
    position,
    target: targetAddress.value.target,
    createNewList: false,
    targetSource: 'provided',
    deterministicTarget: true,
    listKind,
    preset,
    listId: targetAddress.value.listId,
    request: resolved.request,
    resolvedTarget: resolved.target,
  });
}

function planStep(
  _context: WorkflowEngineContext,
  resolved: SuperdocListTransformResolved,
): WorkflowStepResult<SuperdocListTransformPlan> {
  if (resolved.items.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'plan',
      code: 'WORKFLOW_LIST_TRANSFORM_STEP_BUILD_FAILED',
      message: 'insert_many requires at least one item.',
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    changeMode: resolved.changeMode,
    position: resolved.position,
    target: resolved.target,
    createAfterTarget: resolved.createAfterTarget,
    createNewList: resolved.createNewList,
    items: resolved.items,
    stepCount: resolved.items.length,
    targetSource: resolved.targetSource,
    deterministicTarget: resolved.deterministicTarget,
    listKind: resolved.listKind,
    preset: resolved.preset,
    headingText: resolved.headingText,
    headingLevel: resolved.headingLevel,
    listId: resolved.listId,
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocListTransformResolved,
  plan: SuperdocListTransformPlan,
): Promise<WorkflowStepResult<SuperdocListTransformExecution>> {
  let target = plan.target;
  const inserts: SuperdocListTransformExecution['inserts'] = [];
  const insertedNodeIds: string[] = [];
  const trackedChangeRefs: TrackedChangeRef[] = [];

  if (plan.createNewList) {
    let previous:
      | {
          kind: 'block';
          nodeType: 'paragraph' | 'heading';
          nodeId: string;
        }
      | undefined;
    let headingNodeId: string | undefined;
    const headingDetachedFromList = false;
    const headingDirectFormattingReset = false;

    if (plan.createAfterTarget != null) {
      previous =
        plan.createAfterTarget.nodeType === 'listItem'
          ? undefined
          : {
              kind: 'block',
              nodeType: plan.createAfterTarget.nodeType,
              nodeId: plan.createAfterTarget.nodeId,
            };
    }

    if (plan.headingText != null) {
      // Generated list labels must stay outside list/outline numbering. In
      // template-heavy legal docs, HeadingN styles often carry numbering, so a
      // plain paragraph is safer than doc.create.heading for this workflow.
      const result = await context.documentHandle.create.paragraph(
        {
          text: plan.headingText,
          changeMode: plan.changeMode,
          at:
            previous == null
              ? { kind: 'documentEnd' }
              : {
                  kind: 'after',
                  target: previous,
                },
        },
        context.invokeOptions,
      );
      headingNodeId = result.paragraph.nodeId;
      previous = {
        kind: 'block',
        nodeType: 'paragraph',
        nodeId: result.paragraph.nodeId,
      };
      trackedChangeRefs.push(...(result.trackedChangeRefs ?? []));
    }

    const [firstText, ...remainingItems] = plan.items;
    if (firstText == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'execute',
        code: 'WORKFLOW_LIST_TRANSFORM_STEP_BUILD_FAILED',
        message: 'append_new_list requires at least one item.',
      });
    }

    const firstParagraphResult = await context.documentHandle.create.paragraph(
      {
        text: firstText,
        changeMode: plan.changeMode,
        at:
          previous == null
            ? { kind: 'documentEnd' }
            : {
                kind: 'after',
                target: previous,
              },
      },
      context.invokeOptions,
    );
    const firstParagraph = {
      kind: 'block' as const,
      nodeType: 'paragraph' as const,
      nodeId: firstParagraphResult.paragraph.nodeId,
    };
    const createdList = await context.documentHandle.lists.create(
      {
        mode: 'fromParagraphs',
        target: firstParagraph,
        kind: plan.listKind,
        preset: plan.preset,
        sequence: { mode: 'new' },
      },
      context.invokeOptions,
    );
    let appendTarget = createdList.item;
    const firstRefs = firstParagraphResult.trackedChangeRefs ?? [];
    trackedChangeRefs.push(...firstRefs);
    insertedNodeIds.push(appendTarget.nodeId);
    inserts.push({
      text: firstText,
      nodeId: appendTarget.nodeId,
      trackedChangeRefIds: firstRefs.map((ref) => ref.entityId),
    });

    for (const text of remainingItems) {
      const result = await context.documentHandle.lists.insert(
        {
          target: appendTarget,
          position: 'after',
          text,
          changeMode: plan.changeMode,
        },
        context.invokeOptions,
      );
      appendTarget = result.item;
      insertedNodeIds.push(result.item.nodeId);
      const refs = result.trackedChangeRefs ?? [];
      trackedChangeRefs.push(...refs);
      inserts.push({
        text,
        nodeId: result.item.nodeId,
        trackedChangeRefIds: refs.map((ref) => ref.entityId),
      });
    }

    return workflowStepSuccess({
      action: plan.action,
      changeMode: plan.changeMode,
      position: plan.position,
      targetSource: plan.targetSource,
      deterministicTarget: plan.deterministicTarget,
      listKind: plan.listKind,
      preset: plan.preset,
      headingText: plan.headingText,
      headingLevel: plan.headingLevel,
      headingNodeId,
      headingDirectFormattingReset,
      headingDetachedFromList,
      listId: createdList.listId,
      insertedCount: inserts.length,
      insertedNodeIds,
      inserts,
      trackedChangeRefs,
    });
  }

  if (target == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_LIST_TARGET_REQUIRED',
      message: 'superdoc_list_transform could not resolve an existing list target.',
    });
  }

  for (const text of plan.items) {
    const result = await context.documentHandle.lists.insert(
      {
        target,
        position: plan.position,
        text,
        changeMode: plan.changeMode,
      },
      context.invokeOptions,
    );

    insertedNodeIds.push(result.item.nodeId);
    const refs = result.trackedChangeRefs ?? [];
    trackedChangeRefs.push(...refs);
    inserts.push({
      text,
      nodeId: result.item.nodeId,
      trackedChangeRefIds: refs.map((ref) => ref.entityId),
    });

    if (plan.position === 'after') {
      target = result.item;
    }
  }

  return workflowStepSuccess({
    action: plan.action,
    changeMode: plan.changeMode,
    position: plan.position,
    targetSource: plan.targetSource,
    deterministicTarget: plan.deterministicTarget,
    listKind: plan.listKind,
    preset: plan.preset,
    headingText: plan.headingText,
    headingLevel: plan.headingLevel,
    listId: plan.listId,
    insertedCount: inserts.length,
    insertedNodeIds,
    inserts,
    trackedChangeRefs,
  });
}

async function listAllListItems(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<DocListsListResult['items']> {
  const items: DocListsListResult['items'] = [];
  let offset = 0;
  while (true) {
    const page = await documentHandle.lists.list({ offset, limit: LIST_PAGE_LIMIT }, invokeOptions);
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) {
      break;
    }
  }
  return items;
}

async function verifyStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocListTransformResolved,
  _plan: SuperdocListTransformPlan,
  execution: SuperdocListTransformExecution,
): Promise<WorkflowStepResult<SuperdocListTransformVerification>> {
  const postListInventory = await listAllListItems(context.documentHandle, context.invokeOptions);
  const byNodeId = new Map(postListInventory.map((item) => [item.address.nodeId, item]));

  let insertedPresent = 0;
  let textsVerified = 0;
  for (const insert of execution.inserts) {
    const listed = byNodeId.get(insert.nodeId);
    if (listed != null) {
      insertedPresent += 1;
      if (listed.text === insert.text) {
        textsVerified += 1;
      }
    }
  }

  let headingVerified: boolean | undefined;
  if (execution.headingText != null) {
    const currentText = await context.documentHandle.getText({}, context.invokeOptions);
    headingVerified = currentText.includes(execution.headingText);
  }

  const insertedExpected = execution.inserts.length;
  const textsExpected = execution.inserts.length;
  const passed = insertedPresent === insertedExpected && textsVerified === textsExpected && (headingVerified ?? true);
  const summary = `list insert checks nodeIds=${insertedPresent}/${insertedExpected} texts=${textsVerified}/${textsExpected}; headingVerified=${headingVerified ?? 'n/a'}; trackedRefs=${execution.trackedChangeRefs.length}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_LIST_TRANSFORM_VERIFICATION_FAILED',
      message: 'superdoc_list_transform verification failed.',
      details: {
        summary,
        insertedPresent,
        insertedExpected,
        textsVerified,
        textsExpected,
        headingVerified,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      insertedPresent,
      insertedExpected,
      textsVerified,
      textsExpected,
      headingVerified,
      trackedChangeRefs: execution.trackedChangeRefs.length,
    },
  });
}

export async function runSuperdocListTransformWorkflow(
  input: RunSuperdocListTransformInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocListTransformResolved,
    SuperdocListTransformPlan,
    SuperdocListTransformExecution,
    SuperdocListTransformVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_list_transform',
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
