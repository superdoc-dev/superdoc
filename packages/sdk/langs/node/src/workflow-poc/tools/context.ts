import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import type {
  WorkflowDocIndex,
  WorkflowIndexedBlock,
  WorkflowIndexedListItem,
  WorkflowIndexedTable,
} from '../doc-index.js';
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

const DEFAULT_WINDOW = 2;
const MAX_WINDOW = 6;
const OUTLINE_LIMIT = 6;
const BLOCK_LIMIT = 8;
const TABLE_LIMIT = 6;
const LIST_LIMIT = 5;
const LIST_SAMPLE_LIMIT = 3;
const PREVIEW_TEXT_LIMIT = 120;
const SNIPPET_PREVIEW_TEXT_LIMIT = 180;
const SEMANTIC_SNIPPET_LIMIT = 16;
const RISK_SNIPPET_LIMIT = 16;
const LONG_DOCUMENT_BLOCK_THRESHOLD = 100;
const LONG_DOCUMENT_WORD_THRESHOLD = 3000;
const RISK_TERMS = [
  'approval',
  'annahm',
  'auflage',
  'bau',
  'baurecht',
  'bewertung',
  'bewertungsannahm',
  'condition',
  'contamination',
  'defect',
  'encumbrance',
  'factual',
  'genehmig',
  'grundlage',
  'haft',
  'instand',
  'insolvenz',
  'kontamination',
  'legal',
  'liability',
  'mangel',
  'market',
  'markt',
  'permit',
  'planning',
  'recht',
  'risk',
  'risiko',
  'schaden',
  'technical',
  'uncertain',
  'unsicher',
  'valuation',
  'vergleich',
  'wartung',
  'zustand',
] as const;

type SuperdocContextTargetArgKey = 'target' | 'scope';

type SuperdocContextResolved = {
  targetArgKey?: SuperdocContextTargetArgKey;
  request?: WorkflowTargetRequest;
  target?: WorkflowResolvedTarget;
  notes?: string[];
};

type SuperdocContextPlan = {
  mode: 'overview' | 'focused';
  window: number;
  includeOutline: boolean;
  verifyRequested: boolean;
};

type SuperdocContextOutlineSummary = {
  level: number;
  text: string;
  nodeId: string;
};

type SuperdocContextBlockSummary = {
  ordinal: number;
  paragraphOrdinal?: number;
  bodyParagraphOrdinal?: number;
  headingOrdinal?: number;
  nodeId: string;
  nodeType: WorkflowIndexedBlock['nodeType'];
  textPreview?: string;
  styleId?: string;
  styleName?: string;
  ref?: string;
};

type SuperdocContextTableSummary = {
  tableOrdinal: number;
  nodeId: string;
  rows?: number;
  columns?: number;
  blockOrdinal?: number;
};

type SuperdocContextListItemSummary = {
  listOrdinal?: number;
  nodeId: string;
  ref?: string;
  level?: number;
  marker?: string;
  textPreview?: string;
};

type SuperdocContextListSummary = {
  listId: string;
  itemCount: number;
  listKinds?: Array<'ordered' | 'bullet'>;
  minLevel?: number;
  maxLevel?: number;
  sampleItems: SuperdocContextListItemSummary[];
};

type SuperdocContextSnippet = {
  source: 'block' | 'listItem';
  ordinal: number;
  nodeId: string;
  nodeType?: WorkflowIndexedBlock['nodeType'];
  paragraphOrdinal?: number;
  bodyParagraphOrdinal?: number;
  headingOrdinal?: number;
  listOrdinal?: number;
  headingLevel?: number;
  textPreview: string;
  matchedTerms?: string[];
};

type SuperdocContextWindow = {
  startOrdinal: number;
  endOrdinal: number;
  window: number;
  blocks: SuperdocContextBlockSummary[];
};

type SuperdocContextFocus = {
  resolvedTarget: {
    targetArgKey?: SuperdocContextTargetArgKey;
    request?: WorkflowTargetRequest;
    mode: WorkflowResolvedTarget['mode'];
    entityKind: WorkflowResolvedTarget['entityKind'];
    nodeId: string;
    ref?: string;
    blockOrdinal?: number;
    paragraphOrdinal?: number;
    bodyParagraphOrdinal?: number;
    headingOrdinal?: number;
    listOrdinal?: number;
    tableOrdinal?: number;
  };
  nearbyBlocks?: SuperdocContextWindow;
  table?: SuperdocContextTableSummary;
  list?: {
    listId: string;
    itemCount: number;
    focusNodeId: string;
    focusListOrdinal?: number;
    items: SuperdocContextListItemSummary[];
  };
};

type SuperdocContextExecution = {
  mode: SuperdocContextPlan['mode'];
  revision: string;
  counts: WorkflowDocIndex['counts'];
  indexedCounts: {
    blocks: number;
    lists: number;
    tables: number;
  };
  outline?: SuperdocContextOutlineSummary[];
  topBlocks?: SuperdocContextBlockSummary[];
  tables?: SuperdocContextTableSummary[];
  lists?: SuperdocContextListSummary[];
  semanticSnippets?: SuperdocContextSnippet[];
  riskSnippets?: SuperdocContextSnippet[];
  focus?: SuperdocContextFocus;
  notes?: string[];
};

type SuperdocContextVerification = {
  requested: boolean;
  revision: string;
  indexedCounts: {
    blocks: number;
    lists: number;
    tables: number;
  };
  fingerprint?: {
    firstBlock?: string;
    lastBlock?: string;
    firstTable?: string;
    outlineHeadNodeIds?: string[];
  };
  targetNodeId?: string;
};

export type RunSuperdocContextInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function sanitizeTextPreview(raw: string | null | undefined): string | undefined {
  return sanitizeTextPreviewWithLimit(raw, PREVIEW_TEXT_LIMIT);
}

function sanitizeTextPreviewWithLimit(raw: string | null | undefined, limit: number): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

function toBlockSummary(block: WorkflowIndexedBlock): SuperdocContextBlockSummary {
  return {
    ordinal: block.ordinal,
    paragraphOrdinal: block.paragraphOrdinal,
    bodyParagraphOrdinal: block.bodyParagraphOrdinal,
    headingOrdinal: block.headingOrdinal,
    nodeId: block.nodeId,
    nodeType: block.nodeType,
    textPreview: sanitizeTextPreview(block.textPreview),
    styleId: block.styleId,
    styleName: block.styleName,
    ref: block.ref,
  };
}

function toTableSummary(table: WorkflowIndexedTable): SuperdocContextTableSummary {
  return {
    tableOrdinal: table.tableOrdinal,
    nodeId: table.nodeId,
    rows: table.rows,
    columns: table.columns,
    blockOrdinal: table.blockOrdinal,
  };
}

function toListItemSummary(item: WorkflowIndexedListItem): SuperdocContextListItemSummary {
  return {
    listOrdinal: item.apiOrdinal,
    nodeId: item.nodeId,
    ref: item.ref,
    level: item.level,
    marker: item.marker,
    textPreview: sanitizeTextPreview(item.text),
  };
}

function toOutlineSummary(index: WorkflowDocIndex, limit: number): SuperdocContextOutlineSummary[] {
  return index.outline.slice(0, limit).map((entry) => ({
    level: entry.level,
    text: entry.text,
    nodeId: entry.nodeId,
  }));
}

function toListSummaries(index: WorkflowDocIndex, listLimit: number): SuperdocContextListSummary[] {
  const grouped = new Map<string, WorkflowIndexedListItem[]>();
  for (const item of index.lists) {
    const existing = grouped.get(item.listId);
    if (existing == null) {
      grouped.set(item.listId, [item]);
      continue;
    }
    existing.push(item);
  }

  const listSummaries = Array.from(grouped.entries())
    .map(([listId, items]) => {
      const sorted = [...items].sort((left, right) => left.indexOrdinal - right.indexOrdinal);
      const levels = sorted.map((item) => item.level).filter((value): value is number => typeof value === 'number');
      const kinds = Array.from(
        new Set(sorted.map((item) => item.listKind).filter((value): value is 'ordered' | 'bullet' => value != null)),
      );
      return {
        listId,
        firstOrdinal: sorted[0]?.indexOrdinal ?? Number.MAX_SAFE_INTEGER,
        summary: {
          listId,
          itemCount: sorted.length,
          listKinds: kinds.length > 0 ? kinds : undefined,
          minLevel: levels.length > 0 ? Math.min(...levels) : undefined,
          maxLevel: levels.length > 0 ? Math.max(...levels) : undefined,
          sampleItems: sorted.slice(0, LIST_SAMPLE_LIMIT).map(toListItemSummary),
        } satisfies SuperdocContextListSummary,
      };
    })
    .sort((left, right) => left.firstOrdinal - right.firstOrdinal)
    .slice(0, listLimit)
    .map((entry) => entry.summary);

  return listSummaries;
}

function matchedRiskTerms(text: string): string[] {
  const lower = text.toLocaleLowerCase();
  return RISK_TERMS.filter((term) => lower.includes(term));
}

function snippetFromBlock(block: WorkflowIndexedBlock): SuperdocContextSnippet | undefined {
  const textPreview = sanitizeTextPreviewWithLimit(block.textPreview, SNIPPET_PREVIEW_TEXT_LIMIT);
  if (textPreview == null || textPreview.length < 8) {
    return undefined;
  }
  return {
    source: 'block',
    ordinal: block.ordinal,
    nodeId: block.nodeId,
    nodeType: block.nodeType,
    paragraphOrdinal: block.paragraphOrdinal,
    bodyParagraphOrdinal: block.bodyParagraphOrdinal,
    headingOrdinal: block.headingOrdinal,
    headingLevel: block.headingLevel,
    textPreview,
  };
}

function snippetFromListItem(item: WorkflowIndexedListItem): SuperdocContextSnippet | undefined {
  const textPreview = sanitizeTextPreviewWithLimit(item.text, SNIPPET_PREVIEW_TEXT_LIMIT);
  if (textPreview == null || textPreview.length < 8) {
    return undefined;
  }
  return {
    source: 'listItem',
    ordinal: item.indexOrdinal,
    nodeId: item.nodeId,
    listOrdinal: item.apiOrdinal,
    textPreview,
  };
}

function selectEvenlySpaced<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }
  if (limit <= 1) {
    return items.slice(0, 1);
  }

  const selected: T[] = [];
  const used = new Set<number>();
  const step = (items.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    const itemIndex = Math.round(index * step);
    if (used.has(itemIndex)) continue;
    const item = items[itemIndex];
    if (item == null) continue;
    selected.push(item);
    used.add(itemIndex);
  }
  return selected;
}

function buildSemanticSnippets(index: WorkflowDocIndex): SuperdocContextSnippet[] | undefined {
  const blockSnippets = index.blocks
    .filter((block) => block.nodeType === 'heading' || block.nodeType === 'paragraph' || block.nodeType === 'listItem')
    .map(snippetFromBlock)
    .filter((snippet): snippet is SuperdocContextSnippet => snippet != null);
  const listSnippets = index.lists
    .map(snippetFromListItem)
    .filter((snippet): snippet is SuperdocContextSnippet => snippet != null);
  const snippetsByKey = new Map<string, SuperdocContextSnippet>();
  for (const snippet of [...blockSnippets, ...listSnippets]) {
    const key = `${snippet.source}:${snippet.nodeId}:${snippet.textPreview}`;
    if (!snippetsByKey.has(key)) {
      snippetsByKey.set(key, snippet);
    }
  }
  const snippets = [...snippetsByKey.values()].sort((left, right) => left.ordinal - right.ordinal);
  const selected = selectEvenlySpaced(snippets, SEMANTIC_SNIPPET_LIMIT);
  return selected.length > 0 ? selected : undefined;
}

function buildRiskSnippets(index: WorkflowDocIndex): SuperdocContextSnippet[] | undefined {
  const snippets = [
    ...index.blocks
      .filter(
        (block) => block.nodeType === 'heading' || block.nodeType === 'paragraph' || block.nodeType === 'listItem',
      )
      .map(snippetFromBlock),
    ...index.lists.map(snippetFromListItem),
  ].filter((snippet): snippet is SuperdocContextSnippet => snippet != null);

  const riskSnippets = snippets
    .map((snippet) => {
      const matchedTerms = matchedRiskTerms(snippet.textPreview);
      return matchedTerms.length > 0 ? { ...snippet, matchedTerms } : undefined;
    })
    .filter((snippet): snippet is SuperdocContextSnippet & { matchedTerms: string[] } => snippet != null)
    .sort((left, right) => {
      const scoreDelta = right.matchedTerms.length - left.matchedTerms.length;
      return scoreDelta !== 0 ? scoreDelta : left.ordinal - right.ordinal;
    })
    .slice(0, RISK_SNIPPET_LIMIT)
    .sort((left, right) => left.ordinal - right.ordinal);

  return riskSnippets.length > 0 ? riskSnippets : undefined;
}

function overviewNotes(index: WorkflowDocIndex, notes?: string[]): string[] | undefined {
  const combined = [...(notes ?? [])];
  if (
    index.blocks.length >= LONG_DOCUMENT_BLOCK_THRESHOLD ||
    (typeof index.counts.words === 'number' && index.counts.words >= LONG_DOCUMENT_WORD_THRESHOLD)
  ) {
    combined.push(
      'Long-document overview includes semanticSnippets and riskSnippets. For summary/risk-summary tasks, use those snippets and proceed to the write step instead of probing many headings one by one.',
    );
  }
  return combined.length > 0 ? combined : undefined;
}

function coerceWindow(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return DEFAULT_WINDOW;
  }
  return Math.min(raw, MAX_WINDOW);
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') {
    return raw;
  }
  return fallback;
}

function selectTargetInput(args: Record<string, unknown>):
  | {
      ok: true;
      value?: {
        argKey: SuperdocContextTargetArgKey;
        rawTarget: unknown;
      };
    }
  | {
      ok: false;
      message: string;
    } {
  const hasTarget = args.target != null;
  const hasScope = args.scope != null;
  if (hasTarget && hasScope) {
    return {
      ok: false,
      message: 'Provide only one deterministic selector for superdoc_context: either target or scope.',
    };
  }

  if (hasTarget) {
    return {
      ok: true,
      value: {
        argKey: 'target',
        rawTarget: args.target,
      },
    };
  }

  if (hasScope) {
    return {
      ok: true,
      value: {
        argKey: 'scope',
        rawTarget: args.scope,
      },
    };
  }

  return { ok: true };
}

function isListOrdinalTarget(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') {
    return false;
  }
  const target = raw as Record<string, unknown>;
  return target.listOrdinal != null || (target.by === 'listOrdinal' && target.value != null);
}

function findBlockByNodeId(index: WorkflowDocIndex, nodeId: string): WorkflowIndexedBlock | undefined {
  const candidates = index.lookup.byNodeId.get(nodeId) ?? [];
  return candidates.find((candidate): candidate is WorkflowIndexedBlock => candidate.kind === 'block');
}

function resolveAnchorBlockOrdinal(index: WorkflowDocIndex, target: WorkflowResolvedTarget): number | undefined {
  if (typeof target.blockOrdinal === 'number') {
    return target.blockOrdinal;
  }
  if (target.entity.kind === 'table') {
    return target.entity.blockOrdinal;
  }
  return findBlockByNodeId(index, target.nodeId)?.ordinal;
}

function buildWindow(
  index: WorkflowDocIndex,
  anchorBlockOrdinal: number | undefined,
  window: number,
): SuperdocContextWindow | undefined {
  if (anchorBlockOrdinal == null || index.blocks.length === 0) {
    return undefined;
  }

  const lowestOrdinal = index.blocks[0]?.ordinal ?? anchorBlockOrdinal;
  const highestOrdinal = index.blocks[index.blocks.length - 1]?.ordinal ?? anchorBlockOrdinal;
  const startOrdinal = Math.max(lowestOrdinal, anchorBlockOrdinal - window);
  const endOrdinal = Math.min(highestOrdinal, anchorBlockOrdinal + window);
  const blocks = index.blocks
    .filter((block) => block.ordinal >= startOrdinal && block.ordinal <= endOrdinal)
    .map(toBlockSummary);

  return {
    startOrdinal,
    endOrdinal,
    window,
    blocks,
  };
}

function findRelevantTable(
  index: WorkflowDocIndex,
  target: WorkflowResolvedTarget,
): SuperdocContextTableSummary | undefined {
  if (typeof target.tableOrdinal === 'number') {
    const table = index.lookup.byTableOrdinal.get(target.tableOrdinal);
    return table == null ? undefined : toTableSummary(table);
  }

  if (target.entity.kind === 'table') {
    return toTableSummary(target.entity);
  }

  const candidates = index.lookup.byNodeId.get(target.nodeId) ?? [];
  const tableCandidate = candidates.find((entity): entity is WorkflowIndexedTable => entity.kind === 'table');
  if (tableCandidate == null) {
    return undefined;
  }
  return toTableSummary(tableCandidate);
}

function findListItemForTarget(
  index: WorkflowDocIndex,
  target: WorkflowResolvedTarget,
): WorkflowIndexedListItem | undefined {
  if (target.entity.kind === 'listItem') {
    return target.entity;
  }

  const candidates = index.lookup.byNodeId.get(target.nodeId) ?? [];
  return candidates.find((entity): entity is WorkflowIndexedListItem => entity.kind === 'listItem');
}

function findRelevantList(
  index: WorkflowDocIndex,
  target: WorkflowResolvedTarget,
  window: number,
): SuperdocContextFocus['list'] | undefined {
  const focusListItem = findListItemForTarget(index, target);
  if (focusListItem == null) {
    return undefined;
  }

  const listItems = index.lists.filter((item) => item.listId === focusListItem.listId);
  if (listItems.length === 0) {
    return undefined;
  }
  listItems.sort((left, right) => left.indexOrdinal - right.indexOrdinal);

  const focusIndex = Math.max(
    0,
    listItems.findIndex(
      (item) => item.nodeId === focusListItem.nodeId && item.indexOrdinal === focusListItem.indexOrdinal,
    ),
  );
  const start = Math.max(0, focusIndex - window);
  const end = Math.min(listItems.length, focusIndex + window + 1);

  return {
    listId: focusListItem.listId,
    itemCount: listItems.length,
    focusNodeId: focusListItem.nodeId,
    focusListOrdinal: focusListItem.apiOrdinal,
    items: listItems.slice(start, end).map(toListItemSummary),
  };
}

function buildOverviewExecution(
  index: WorkflowDocIndex,
  includeOutline: boolean,
  notes?: string[],
): SuperdocContextExecution {
  return {
    mode: 'overview',
    revision: index.revision,
    counts: index.counts,
    indexedCounts: {
      blocks: index.blocks.length,
      lists: index.lists.length,
      tables: index.tables.length,
    },
    outline: includeOutline ? toOutlineSummary(index, OUTLINE_LIMIT) : undefined,
    topBlocks: index.blocks.slice(0, BLOCK_LIMIT).map(toBlockSummary),
    tables: index.tables.slice(0, TABLE_LIMIT).map(toTableSummary),
    lists: toListSummaries(index, LIST_LIMIT),
    semanticSnippets: buildSemanticSnippets(index),
    riskSnippets: buildRiskSnippets(index),
    notes: overviewNotes(index, notes),
  };
}

function buildFocusedExecution(
  context: WorkflowEngineContext,
  resolved: SuperdocContextResolved,
  plan: SuperdocContextPlan,
): SuperdocContextExecution {
  const target = resolved.target;
  if (target == null) {
    return buildOverviewExecution(context.index, plan.includeOutline, resolved.notes);
  }

  const focus: SuperdocContextFocus = {
    resolvedTarget: {
      targetArgKey: resolved.targetArgKey,
      request: resolved.request,
      mode: target.mode,
      entityKind: target.entityKind,
      nodeId: target.nodeId,
      ref: target.ref,
      blockOrdinal: target.blockOrdinal,
      paragraphOrdinal: target.paragraphOrdinal,
      bodyParagraphOrdinal: target.bodyParagraphOrdinal,
      headingOrdinal: target.headingOrdinal,
      listOrdinal: target.listOrdinal,
      tableOrdinal: target.tableOrdinal,
    },
    nearbyBlocks: buildWindow(context.index, resolveAnchorBlockOrdinal(context.index, target), plan.window),
    table: findRelevantTable(context.index, target),
    list: findRelevantList(context.index, target, plan.window),
  };

  return {
    mode: 'focused',
    revision: context.index.revision,
    counts: context.index.counts,
    indexedCounts: {
      blocks: context.index.blocks.length,
      lists: context.index.lists.length,
      tables: context.index.tables.length,
    },
    outline: plan.includeOutline ? toOutlineSummary(context.index, OUTLINE_LIMIT) : undefined,
    focus,
  };
}

function buildVerification(
  context: WorkflowEngineContext,
  resolved: SuperdocContextResolved,
  plan: SuperdocContextPlan,
): SuperdocContextVerification {
  const base: SuperdocContextVerification = {
    requested: plan.verifyRequested,
    revision: context.index.revision,
    indexedCounts: {
      blocks: context.index.blocks.length,
      lists: context.index.lists.length,
      tables: context.index.tables.length,
    },
  };

  if (!plan.verifyRequested) {
    return base;
  }

  const firstBlock = context.index.blocks[0];
  const lastBlock = context.index.blocks[context.index.blocks.length - 1];
  const firstTable = context.index.tables[0];
  return {
    ...base,
    fingerprint: {
      firstBlock: firstBlock == null ? undefined : `${firstBlock.ordinal}:${firstBlock.nodeId}:${firstBlock.nodeType}`,
      lastBlock: lastBlock == null ? undefined : `${lastBlock.ordinal}:${lastBlock.nodeId}:${lastBlock.nodeType}`,
      firstTable:
        firstTable == null
          ? undefined
          : `${firstTable.tableOrdinal}:${firstTable.nodeId}:${firstTable.rows ?? '?'}x${firstTable.columns ?? '?'}`,
      outlineHeadNodeIds: context.index.outline.slice(0, 3).map((entry) => entry.nodeId),
    },
    targetNodeId: resolved.target?.nodeId,
  };
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocContextResolved> {
  const selected = selectTargetInput(context.args);
  if (!selected.ok) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TARGET_CONFLICT',
      message: selected.message,
    });
  }

  if (selected.value == null) {
    return workflowStepSuccess({});
  }

  const resolved = resolveWorkflowTargetFromUnknown(context.index, selected.value.rawTarget);
  if (!resolved.ok) {
    if (
      isListOrdinalTarget(selected.value.rawTarget) &&
      (resolved.code === 'TARGET_MODE_UNAVAILABLE' || resolved.code === 'TARGET_NOT_FOUND')
    ) {
      return workflowStepSuccess({
        targetArgKey: selected.value.argKey,
        notes: [
          'Requested listOrdinal could not be resolved from API list inventory. For tracked list insertion, call superdoc_list_transform action:"insert_many" with the requested items and omit target so the list workflow can choose the safest insertion path.',
        ],
      });
    }
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: `WORKFLOW_${resolved.code}`,
      message: resolved.message,
      details: {
        targetArgKey: selected.value.argKey,
        ...resolved.details,
      },
    });
  }

  return workflowStepSuccess({
    targetArgKey: selected.value.argKey,
    request: resolved.request,
    target: resolved.target,
  });
}

function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocContextResolved,
): WorkflowStepResult<SuperdocContextPlan> {
  return workflowStepSuccess({
    mode: resolved.target == null ? 'overview' : 'focused',
    window: coerceWindow(context.args.window),
    includeOutline: coerceBoolean(context.args.includeOutline, true),
    verifyRequested: coerceBoolean(context.args.verify, false),
  });
}

function executeStep(
  context: WorkflowEngineContext,
  resolved: SuperdocContextResolved,
  plan: SuperdocContextPlan,
): WorkflowStepResult<SuperdocContextExecution> {
  if (plan.mode === 'overview') {
    return workflowStepSuccess(buildOverviewExecution(context.index, plan.includeOutline, resolved.notes));
  }
  return workflowStepSuccess(buildFocusedExecution(context, resolved, plan));
}

function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocContextResolved,
  plan: SuperdocContextPlan,
): WorkflowStepResult<SuperdocContextVerification> {
  return workflowStepSuccess(buildVerification(context, resolved, plan));
}

export async function runSuperdocContextWorkflow(
  input: RunSuperdocContextInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocContextResolved,
    SuperdocContextPlan,
    SuperdocContextExecution,
    SuperdocContextVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_context',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => resolveStep(context),
      plan: async (context, resolved) => planStep(context, resolved),
      execute: async (context, resolved, plan) => executeStep(context, resolved, plan),
      verify: async (context, resolved, plan) => verifyStep(context, resolved, plan),
    },
  });
}
