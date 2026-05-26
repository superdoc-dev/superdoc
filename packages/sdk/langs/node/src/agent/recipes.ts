/**
 * Clean agent recipes.
 *
 * Recipes are the high-level, flat-arg actions the product agent surface
 * exposes through `agent_recipe`. They lower into deterministic doc.*
 * operation calls on the bound document handle and return real
 * AgentReceipts with pre/post evidence and verification.
 *
 * Recipes are *not* benchmark-shaped: they take only product-facing arguments
 * (text, items, target ordinal, change-mode) and never depend on eval IDs,
 * fixture names, benchmark descriptions, or task-text routing. They are a
 * port of the *generalizable* logic from the workflow-poc surface
 * (clause-level routing and descriptor sentinels are deliberately left
 * behind).
 *
 * The set is intentionally compact — every recipe covers a real product
 * intent that an LLM would otherwise have to express via raw generated
 * doc.* calls with complex oneOf JSON args.
 */
import type { BoundDocApi } from '../generated/client.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { runSuperdocListTransformWorkflow } from '../workflow-poc/tools/list-transform.js';
import { runSuperdocStructureInsertWorkflow } from '../workflow-poc/tools/structure-insert.js';
import { runSuperdocTextTransformWorkflow } from '../workflow-poc/tools/text-transform.js';
import {
  buildDocumentSnapshot,
  resolveSnapshotSelector,
  type DocumentSnapshot,
  type SnapshotBlock,
  type SnapshotDomain,
} from './doc-snapshot.js';
import type { AgentReceipt, VerificationResult } from './runtime.js';
import type { AgentChangeMode, AgentSelector, AgentVerificationCheck } from './ir.js';

export type RecipeName =
  | 'insert_paragraph'
  | 'insert_paragraphs'
  | 'insert_heading'
  | 'replace_text'
  | 'delete_text'
  | 'replace_top_date'
  | 'append_list'
  | 'insert_list_items'
  | 'create_table'
  | 'comment_paragraphs'
  | 'add_comment'
  | 'rewrite_block'
  | 'accept_tracked_changes'
  | 'reject_tracked_changes'
  | 'normalize_body_font_size'
  | 'color_text'
  | 'apply_letter_spacing'
  | 'fill_placeholders'
  | 'move_section'
  | 'insert_toc'
  | 'insert_image_with_caption'
  | 'set_table_shading'
  | 'insert_table_row'
  | 'insert_table_column'
  | 'delete_table_row'
  | 'delete_table_column'
  | 'split_table';

export type RecipePlacement =
  | { at: 'document_end' }
  | { at: 'document_start' }
  | { at: 'after'; selector: AgentSelector }
  | { at: 'before'; selector: AgentSelector };

export type RecipeArgs =
  | InsertParagraphArgs
  | InsertParagraphsArgs
  | InsertHeadingArgs
  | ReplaceTextArgs
  | DeleteTextArgs
  | ReplaceTopDateArgs
  | AppendListArgs
  | InsertListItemsArgs
  | CreateTableArgs
  | CommentParagraphsArgs
  | AddCommentArgs
  | RewriteBlockArgs
  | AcceptTrackedChangesArgs
  | RejectTrackedChangesArgs
  | NormalizeBodyFontSizeArgs
  | ColorTextArgs
  | ApplyLetterSpacingArgs
  | FillPlaceholdersArgs
  | MoveSectionArgs
  | InsertTocArgs
  | InsertImageWithCaptionArgs
  | SetTableShadingArgs
  | InsertTableRowArgs
  | InsertTableColumnArgs
  | DeleteTableRowArgs
  | DeleteTableColumnArgs
  | SplitTableArgs;

export type InsertParagraphArgs = {
  recipe: 'insert_paragraph';
  text: string;
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
};

export type InsertParagraphsArgs = {
  recipe: 'insert_paragraphs';
  texts: readonly string[];
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
  headingLevel?: number;
};

export type InsertHeadingArgs = {
  recipe: 'insert_heading';
  text: string;
  level: number;
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
};

export type ReplaceTextArgs = {
  recipe: 'replace_text';
  edits: ReadonlyArray<{ find: string; replace: string }>;
  selector?: AgentSelector;
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

export type DeleteTextArgs = {
  recipe: 'delete_text';
  finds: readonly string[];
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

export type ReplaceTopDateArgs = {
  recipe: 'replace_top_date';
  date: string;
  changeMode?: AgentChangeMode;
};

export type AppendListArgs = {
  recipe: 'append_list';
  items: readonly string[];
  kind?: 'ordered' | 'bullet';
  headingText?: string;
  headingLevel?: number;
  changeMode?: AgentChangeMode;
};

export type InsertListItemsArgs = {
  recipe: 'insert_list_items';
  listOrdinal?: number;
  items: readonly string[];
  changeMode?: AgentChangeMode;
};

export type CreateTableArgs = {
  recipe: 'create_table';
  rows: number;
  columns: number;
  cellTexts?: ReadonlyArray<ReadonlyArray<string>>;
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
};

export type CommentParagraphsArgs = {
  recipe: 'comment_paragraphs';
  commentText: string;
  scope?: 'all' | 'body';
  excludeBlockQuotes?: boolean;
};

export type AddCommentArgs = {
  recipe: 'add_comment';
  commentText: string;
  selector: AgentSelector;
};

export type RewriteBlockArgs = {
  recipe: 'rewrite_block';
  selector: AgentSelector;
  text: string;
  changeMode?: AgentChangeMode;
};

export type AcceptTrackedChangesArgs = {
  recipe: 'accept_tracked_changes';
  author?: string;
};

export type RejectTrackedChangesArgs = {
  recipe: 'reject_tracked_changes';
  author?: string;
};

export type NormalizeBodyFontSizeArgs = {
  recipe: 'normalize_body_font_size';
  fontSize: number;
  changeMode?: AgentChangeMode;
};

export type ColorTextArgs = {
  recipe: 'color_text';
  color: string;
  targetText?: string;
  caseSensitive?: boolean;
  selector?: AgentSelector;
  changeMode?: AgentChangeMode;
};

export type ApplyLetterSpacingArgs = {
  recipe: 'apply_letter_spacing';
  selector: AgentSelector;
  letterSpacing: number;
  changeMode?: AgentChangeMode;
};

export type FillPlaceholdersArgs = {
  recipe: 'fill_placeholders';
  values?: readonly string[];
  fields?: ReadonlyArray<{ label?: string; value: string }>;
  changeMode?: AgentChangeMode;
};

export type MoveSectionArgs = {
  recipe: 'move_section';
  sourceSection: number;
  destinationSection: number;
  position?: 'before' | 'after';
  bottomNote?: string;
};

export type InsertTocArgs = {
  recipe: 'insert_toc';
  title?: string;
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
};

export type InsertImageWithCaptionArgs = {
  recipe: 'insert_image_with_caption';
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  sectionBreakBefore?: boolean;
  placement?: RecipePlacement;
  changeMode?: AgentChangeMode;
};

export type SetTableShadingArgs = {
  recipe: 'set_table_shading';
  color: string;
  tableOrdinal?: number;
  changeMode?: AgentChangeMode;
};

export type InsertTableRowArgs = {
  recipe: 'insert_table_row';
  tableOrdinal?: number;
  rowIndex?: number;
  position?: 'before' | 'after' | 'above' | 'below';
  cellTexts?: readonly string[];
  changeMode?: AgentChangeMode;
  dryRun?: boolean;
};

export type InsertTableColumnArgs = {
  recipe: 'insert_table_column';
  tableOrdinal?: number;
  columnIndex?: number;
  position?: 'left' | 'right';
  headerText?: string;
  changeMode?: AgentChangeMode;
};

export type DeleteTableRowArgs = {
  recipe: 'delete_table_row';
  tableOrdinal?: number;
  rowIndex: number;
  changeMode?: AgentChangeMode;
};

export type DeleteTableColumnArgs = {
  recipe: 'delete_table_column';
  tableOrdinal?: number;
  columnIndex: number;
  changeMode?: AgentChangeMode;
};

export type SplitTableArgs = {
  recipe: 'split_table';
  tableOrdinal?: number;
  rowIndex: number;
  separatorText?: string;
  changeMode?: AgentChangeMode;
};

const RECIPE_NAMES: readonly RecipeName[] = [
  'insert_paragraph',
  'insert_paragraphs',
  'insert_heading',
  'replace_text',
  'delete_text',
  'replace_top_date',
  'append_list',
  'insert_list_items',
  'create_table',
  'comment_paragraphs',
  'add_comment',
  'rewrite_block',
  'accept_tracked_changes',
  'reject_tracked_changes',
  'normalize_body_font_size',
  'color_text',
  'apply_letter_spacing',
  'fill_placeholders',
  'move_section',
  'insert_toc',
  'insert_image_with_caption',
  'set_table_shading',
  'insert_table_row',
  'insert_table_column',
  'delete_table_row',
  'delete_table_column',
  'split_table',
];

export function isRecipeName(value: unknown): value is RecipeName {
  return typeof value === 'string' && RECIPE_NAMES.includes(value as RecipeName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown, fallback?: string): string | undefined {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function maybeMethod(obj: unknown, path: readonly string[]): ((...args: unknown[]) => Promise<unknown>) | null {
  let cursor: unknown = obj;
  for (const token of path) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return typeof cursor === 'function' ? (cursor as (...args: unknown[]) => Promise<unknown>) : null;
}

function selectorToBlockTarget(
  selector: AgentSelector,
  snapshot: DocumentSnapshot,
): { nodeId: string; nodeType: string; text: string } | null {
  const matched = resolveSnapshotSelector(snapshot, selector);
  if (matched.length !== 1) return null;
  const nodeId = matched[0];
  const block = snapshot.blocks.find((b) => b.nodeId === nodeId);
  if (block) return { nodeId: block.nodeId, nodeType: block.nodeType, text: block.text };
  for (const table of snapshot.tables) {
    const cell = table.cells.find((entry) => entry.nodeId === nodeId);
    if (cell) {
      return { nodeId, nodeType: 'paragraph', text: cell.text };
    }
  }
  return null;
}

function snapshotDomainsForSelector(selector: AgentSelector): readonly SnapshotDomain[] {
  if (selector.kind === 'tableCell') {
    return ['blocks', 'tables'];
  }
  if (selector.kind === 'ordinal') {
    if (selector.ordinalKind === 'tableOrdinal') {
      return ['blocks', 'tables'];
    }
    if (selector.ordinalKind === 'sectionOrdinal') {
      return ['blocks', 'sections'];
    }
    if (selector.ordinalKind === 'listOrdinal') {
      return ['blocks', 'lists'];
    }
  }
  return ['blocks'];
}

function findSnapshotTextByNodeId(
  snapshot: DocumentSnapshot,
  nodeId: string,
): { nodeType: string; text: string } | null {
  const block = snapshot.blocks.find((entry) => entry.nodeId === nodeId);
  if (block) return { nodeType: block.nodeType, text: block.text };
  for (const table of snapshot.tables) {
    const cell = table.cells.find((entry) => entry.nodeId === nodeId);
    if (cell) return { nodeType: 'paragraph', text: cell.text };
  }
  return null;
}

function lastBlock(snapshot: DocumentSnapshot): { nodeId: string; nodeType: string } | null {
  const block = snapshot.blocks[snapshot.blocks.length - 1];
  return block ? { nodeId: block.nodeId, nodeType: block.nodeType } : null;
}

function createdBlockTarget(result: unknown): { nodeId: string; nodeType: string } | null {
  const rec = asRecord(result);
  const paragraph = asRecord(rec?.paragraph);
  if (typeof paragraph?.nodeId === 'string' && paragraph.nodeId.length > 0) {
    return { nodeId: paragraph.nodeId, nodeType: 'paragraph' };
  }
  const heading = asRecord(rec?.heading);
  if (typeof heading?.nodeId === 'string' && heading.nodeId.length > 0) {
    return { nodeId: heading.nodeId, nodeType: 'heading' };
  }
  return null;
}

function resolvePlacement(
  placement: RecipePlacement | undefined,
  snapshot: DocumentSnapshot,
):
  | { kind: 'documentEnd' }
  | { kind: 'documentStart' }
  | { kind: 'after'; target: { kind: 'block'; nodeType: string; nodeId: string } }
  | { kind: 'before'; target: { kind: 'block'; nodeType: string; nodeId: string } } {
  if (!placement || placement.at === 'document_end') return { kind: 'documentEnd' };
  if (placement.at === 'document_start') return { kind: 'documentStart' };
  const target = selectorToBlockTarget(placement.selector, snapshot);
  if (!target) {
    throw new SuperDocCliError('placement selector did not resolve to a unique body block', {
      code: 'INVALID_ARGUMENT',
      details: { placement },
    });
  }
  return {
    kind: placement.at === 'before' ? 'before' : 'after',
    target: { kind: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
  };
}

function estimateInsertedTableOrdinal(
  snapshot: DocumentSnapshot,
  placement: ReturnType<typeof resolvePlacement>,
): number {
  if (placement.kind === 'documentStart') return 1;
  if (placement.kind === 'documentEnd') return snapshot.tables.length + 1;

  const targetBlock = snapshot.blocks.find((block) => block.nodeId === placement.target.nodeId);
  if (!targetBlock) return snapshot.tables.length + 1;

  if (placement.kind === 'after') {
    const tablesBeforeOrAt = snapshot.blocks.filter(
      (block) => block.nodeType === 'table' && block.ordinal <= targetBlock.ordinal,
    ).length;
    return tablesBeforeOrAt + 1;
  }

  const tablesBefore = snapshot.blocks.filter(
    (block) => block.nodeType === 'table' && block.ordinal < targetBlock.ordinal,
  ).length;
  return tablesBefore + 1;
}

type ExtractedTableBlock = {
  nodeId: string;
  type?: string;
  tableContext?: {
    tableOrdinal?: number;
    rowIndex?: number;
    columnIndex?: number;
    colspan?: number;
    rowspan?: number;
  };
};

type TableCellText = {
  rowIndex: number;
  columnIndex: number;
  text: string;
};

type ListItemTarget = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

function emptyCounts(): DocumentSnapshot['counts'] {
  return {
    blocks: 0,
    paragraphs: 0,
    headings: 0,
    tables: 0,
    lists: 0,
    images: 0,
    comments: 0,
    trackedChanges: 0,
    sections: 0,
    fields: 0,
    hyperlinks: 0,
    bookmarks: 0,
    contentControls: 0,
    permissionRanges: 0,
    styles: 0,
    headers: 0,
    footers: 0,
  };
}

function countsFromInfoCounts(counts: Record<string, unknown> | null): DocumentSnapshot['counts'] {
  return {
    blocks: asNumber(counts?.blocks) ?? 0,
    paragraphs: asNumber(counts?.paragraphs) ?? 0,
    headings: asNumber(counts?.headings) ?? 0,
    tables: asNumber(counts?.tables) ?? 0,
    lists: asNumber(counts?.lists) ?? 0,
    images: asNumber(counts?.images) ?? 0,
    comments: asNumber(counts?.comments) ?? 0,
    trackedChanges: asNumber(counts?.trackedChanges) ?? 0,
    sections: asNumber(counts?.sections) ?? 0,
    fields: asNumber(counts?.fields) ?? 0,
    hyperlinks: asNumber(counts?.hyperlinks) ?? 0,
    bookmarks: asNumber(counts?.bookmarks) ?? 0,
    contentControls: asNumber(counts?.contentControls) ?? 0,
    permissionRanges: asNumber(counts?.permissionRanges) ?? 0,
    styles: asNumber(counts?.styles) ?? 0,
    headers: asNumber(counts?.headers) ?? 0,
    footers: asNumber(counts?.footers) ?? 0,
  };
}

function snapshotFromIdentity(identity: { revision: string; counts: DocumentSnapshot['counts'] }): DocumentSnapshot {
  return {
    revision: identity.revision,
    counts: identity.counts,
    blocks: [],
    lists: [],
    tables: [],
    comments: [],
    trackedChanges: [],
    sections: [],
    headerFooters: [],
    styles: [],
    contentControls: [],
    fields: [],
    hyperlinks: [],
    bookmarks: [],
    permissionRanges: [],
    images: [],
    diagnostics: [],
  };
}

async function readDocumentIdentity(
  doc: BoundDocApi,
): Promise<{ revision: string; counts: DocumentSnapshot['counts'] }> {
  const infoFn = maybeMethod(doc, ['info']);
  if (!infoFn) {
    return { revision: 'unknown', counts: emptyCounts() };
  }
  const infoRec = asRecord(await infoFn({}));
  return {
    revision: asString(infoRec?.revision, 'unknown') ?? 'unknown',
    counts: countsFromInfoCounts(asRecord(infoRec?.counts)),
  };
}

function revisionAfterOperation(result: unknown, fallbackRevision: string): string {
  return asString(asRecord(asRecord(result)?.revision)?.after, fallbackRevision) ?? fallbackRevision;
}

async function listAllBlocks(doc: BoundDocApi, includeText = false): Promise<SnapshotBlock[]> {
  const blocksFn = maybeMethod(doc, ['blocks', 'list']);
  if (!blocksFn) return [];

  const blocks: SnapshotBlock[] = [];
  const pageSize = 250;
  let offset = 0;
  while (true) {
    const raw = asRecord(
      await blocksFn(includeText ? { offset, limit: pageSize, includeText: true } : { offset, limit: pageSize }),
    );
    const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
    for (const block of rawBlocks) {
      const rec = asRecord(block);
      if (!rec) continue;
      blocks.push({
        ordinal: asNumber(rec.ordinal, blocks.length + 1) ?? blocks.length + 1,
        nodeId: asString(rec.nodeId, '') ?? '',
        nodeType: asString(rec.nodeType, 'paragraph') ?? 'paragraph',
        text: asString(rec.text, '') ?? '',
        textPreview: typeof rec.textPreview === 'string' ? rec.textPreview : null,
        styleId: typeof rec.styleId === 'string' ? rec.styleId : null,
        headingLevel: typeof rec.headingLevel === 'number' ? rec.headingLevel : undefined,
      });
    }
    const total = asNumber(raw?.total, blocks.length) ?? blocks.length;
    offset += rawBlocks.length;
    if (rawBlocks.length === 0 || offset >= total) return blocks;
  }
}

async function getTableShape(doc: BoundDocApi, nodeId: string): Promise<{ rows: number; columns: number } | null> {
  const getFn = maybeMethod(doc, ['tables', 'get']);
  if (!getFn) return null;
  const tableRec = asRecord(await getFn({ nodeId }));
  return {
    rows: asNumber(tableRec?.rows) ?? 0,
    columns: asNumber(tableRec?.columns) ?? 0,
  };
}

async function resolveTableContextQuick(
  doc: BoundDocApi,
  tableOrdinal: number | undefined,
): Promise<{ nodeId: string; ordinal: number; rows: number; columns: number } | null> {
  const blocks = await listAllBlocks(doc, false);
  const tableBlocks = blocks.filter((block) => block.nodeType === 'table');
  if (tableBlocks.length === 0) return null;

  const target =
    tableOrdinal == null
      ? tableBlocks.length === 1
        ? tableBlocks[0]!
        : null
      : (tableBlocks[tableOrdinal - 1] ?? null);
  if (!target) return null;

  const shape = await getTableShape(doc, target.nodeId);
  return {
    nodeId: target.nodeId,
    ordinal: tableOrdinal ?? 1,
    rows: shape?.rows ?? 0,
    columns: shape?.columns ?? 0,
  };
}

function revisionVerification(preRevision: string, postRevision: string, expectChanged: boolean): VerificationResult {
  return {
    check: { kind: expectChanged ? 'revision-changed' : 'revision-unchanged' },
    passed: expectChanged ? preRevision !== postRevision : preRevision === postRevision,
    detail: `pre=${preRevision} post=${postRevision}`,
  };
}

function failedReceipt(intent: string, err: unknown, preSnapshot?: DocumentSnapshot): AgentReceipt {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: 'failed',
    intent,
    preSnapshot: preSnapshot
      ? { revision: preSnapshot.revision, counts: preSnapshot.counts }
      : { revision: 'unknown', counts: emptyCounts() },
    selectedTargets: [],
    executedOperations: [],
    verification: [],
    errors: [{ code: 'RECIPE_FAILED', message }],
  };
}

async function receiptFromWorkflowResult(
  doc: BoundDocApi,
  intent: string,
  pre: DocumentSnapshot,
  workflowResult: {
    receipt: {
      status: string;
      toolName: string;
      message: string;
      details?: Record<string, unknown>;
    };
    output?: Record<string, unknown>;
  },
  selectedTargets: readonly { selector: AgentSelector; matched: readonly string[] }[] = [],
  checks: readonly AgentVerificationCheck[] = [{ kind: 'revision-changed' }],
): Promise<AgentReceipt> {
  const workflowCode = asString(workflowResult.receipt.details?.code);
  if (workflowResult.receipt.status !== 'success') {
    return {
      status: 'failed',
      intent,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      selectedTargets,
      executedOperations:
        workflowResult.output == null
          ? []
          : [{ operationId: `workflow.${workflowResult.receipt.toolName}`, result: workflowResult.output }],
      verification: [],
      errors: [
        {
          code: workflowCode ?? 'RECIPE_FAILED',
          message: workflowResult.receipt.message,
        },
      ],
    };
  }

  const post = await buildDocumentSnapshot(doc);
  const verification = evaluateChecks(pre, post, checks);
  const summary = asString(asRecord(workflowResult.output?.verification)?.summary);
  return {
    status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
    intent,
    preSnapshot: { revision: pre.revision, counts: pre.counts },
    postSnapshot: { revision: post.revision, counts: post.counts },
    selectedTargets,
    executedOperations: [
      {
        operationId: `workflow.${workflowResult.receipt.toolName}`,
        rationale: summary,
        result: workflowResult.output?.execution ?? workflowResult.output,
      },
    ],
    verification,
  };
}

function buildFullBlockTextTarget(
  snapshot: DocumentSnapshot,
  blockId: string,
): { kind: 'text'; blockId: string; range: { start: number; end: number } } | null {
  const block = snapshot.blocks.find((entry) => entry.nodeId === blockId);
  if (!block) return null;
  return {
    kind: 'text',
    blockId,
    range: {
      start: 0,
      end: block.text.length,
    },
  };
}

function flattenCellTexts(cellTexts: ReadonlyArray<ReadonlyArray<string>> | undefined): TableCellText[] {
  if (!cellTexts) return [];
  const flattened: TableCellText[] = [];
  for (let rowIndex = 0; rowIndex < cellTexts.length; rowIndex += 1) {
    const row = cellTexts[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      flattened.push({
        rowIndex,
        columnIndex,
        text: row[columnIndex] ?? '',
      });
    }
  }
  return flattened;
}

function findExtractedCellBlock(
  blocks: readonly ExtractedTableBlock[],
  rowIndex: number,
  columnIndex: number,
): ExtractedTableBlock | undefined {
  return (
    blocks.find(
      (block) => block.tableContext?.rowIndex === rowIndex && block.tableContext?.columnIndex === columnIndex,
    ) ??
    blocks.find((block) => {
      const context = block.tableContext;
      if (context?.rowIndex == null || context.columnIndex == null) return false;
      const rowEnd = context.rowIndex + Math.max(1, context.rowspan ?? 1);
      const columnEnd = context.columnIndex + Math.max(1, context.colspan ?? 1);
      return (
        rowIndex >= context.rowIndex &&
        rowIndex < rowEnd &&
        columnIndex >= context.columnIndex &&
        columnIndex < columnEnd
      );
    })
  );
}

function evaluateChecks(
  pre: DocumentSnapshot,
  post: DocumentSnapshot,
  checks: readonly AgentVerificationCheck[],
): VerificationResult[] {
  const results: VerificationResult[] = [];
  for (const check of checks) {
    if (check.kind === 'block-count-delta') {
      const preCount = pre.blocks.filter((b) => b.nodeType === check.nodeType).length;
      const postCount = post.blocks.filter((b) => b.nodeType === check.nodeType).length;
      results.push({
        check,
        passed: postCount - preCount === check.delta,
        detail: `pre=${preCount} post=${postCount}`,
      });
    } else if (check.kind === 'comment-count-delta') {
      results.push({
        check,
        passed: post.comments.length - pre.comments.length === check.delta,
        detail: `pre=${pre.comments.length} post=${post.comments.length}`,
      });
    } else if (check.kind === 'tracked-change-count-delta') {
      results.push({
        check,
        passed: post.trackedChanges.length - pre.trackedChanges.length === check.delta,
        detail: `pre=${pre.trackedChanges.length} post=${post.trackedChanges.length}`,
      });
    } else if (check.kind === 'revision-changed') {
      results.push({
        check,
        passed: pre.revision !== post.revision,
        detail: `pre=${pre.revision} post=${post.revision}`,
      });
    } else if (check.kind === 'block-text-contains') {
      const block = post.blocks.find((b) => b.nodeId === check.nodeId);
      results.push({ check, passed: !!block && block.text.includes(check.text) });
    } else if (check.kind === 'table-shape') {
      const table = post.tables.find((t) => t.nodeId === check.nodeId);
      results.push({
        check,
        passed: !!table && table.rows === check.rows && table.columns === check.columns,
      });
    } else if (check.kind === 'list-item-count') {
      const list = check.listId == null ? post.lists[0] : post.lists.find((l) => l.listId === check.listId);
      results.push({ check, passed: !!list && list.items.length === check.expected });
    } else {
      // Unsupported check kind for recipes: fail closed so we never
      // optimistically report success.
      results.push({ check, passed: false, detail: 'unsupported in recipe verification' });
    }
  }
  return results;
}

function preserveRewriteStyle(): {
  inline: { mode: 'preserve' };
  paragraph: { mode: 'preserve' };
} {
  return {
    inline: { mode: 'preserve' },
    paragraph: { mode: 'preserve' },
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllText(source: string, find: string, replace: string, caseSensitive: boolean): string {
  const flags = caseSensitive ? 'g' : 'gi';
  return source.replace(new RegExp(escapeRegExp(find), flags), replace);
}

function summarizeSkippedReplaceEdits(edits: readonly { find: string }[]): string | undefined {
  if (edits.length === 0) return undefined;
  const preview = edits
    .slice(0, 5)
    .map((edit) => JSON.stringify(edit.find))
    .join(', ');
  const suffix = edits.length > 5 ? `, and ${edits.length - 5} more` : '';
  return `Skipped ${edits.length} unmatched replacement edit(s): ${preview}${suffix}`;
}

function textIncludes(source: string, find: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return source.includes(find);
  return source.toLocaleLowerCase().includes(find.toLocaleLowerCase());
}

function significantRewriteTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((token) => token.length >= 3);
}

function tokensPresentInOrder(haystack: string, tokens: readonly string[]): boolean {
  let offset = 0;
  const lowerHaystack = haystack.toLocaleLowerCase();
  for (const token of tokens) {
    const lowerToken = token.toLocaleLowerCase();
    const index = lowerHaystack.indexOf(lowerToken, offset);
    if (index < 0) return false;
    offset = index + lowerToken.length;
  }
  return true;
}

function verifyRewrittenBlockText(
  targetText: string,
  rewrittenText: string,
  changeMode: AgentChangeMode | undefined,
): boolean {
  if (changeMode === 'tracked') {
    return tokensPresentInOrder(targetText, significantRewriteTokens(rewrittenText));
  }
  return targetText.includes(rewrittenText);
}

function isUppercaseTitleLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (/[.?!]/.test(trimmed)) return false;
  const letters = [...trimmed].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) return false;
  return letters.every((char) => char === char.toLocaleUpperCase());
}

function toDisplayTitleCase(text: string): string {
  return text.replace(/\p{L}+/gu, (word) =>
    word.length <= 3 ? word.toLocaleUpperCase() : `${word[0]!.toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`,
  );
}

function normalizeTitleLikeRewriteText(targetText: string, rewrittenText: string): string {
  if (!isUppercaseTitleLikeText(targetText)) return rewrittenText;
  const displayTitle = toDisplayTitleCase(targetText);
  if (rewrittenText.includes(displayTitle)) return rewrittenText;
  const lowerTarget = targetText.toLocaleLowerCase();
  const lowerRewrite = rewrittenText.toLocaleLowerCase();
  const index = lowerRewrite.indexOf(lowerTarget);
  if (index < 0) return rewrittenText;
  return `${rewrittenText.slice(0, index)}${displayTitle}${rewrittenText.slice(index + targetText.length)}`;
}

const DATE_PATTERNS = [
  /\b\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\b/,
  /\b[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
];

function findTopDateCandidate(
  snapshot: DocumentSnapshot,
): { nodeId: string; nodeType: string; text: string; rewrittenText: string } | null {
  const candidates = snapshot.blocks
    .filter((block) => block.nodeType === 'paragraph' && block.text.trim().length > 0)
    .slice(0, 8);
  for (const block of candidates) {
    for (const pattern of DATE_PATTERNS) {
      const match = pattern.exec(block.text);
      if (!match) continue;
      return {
        nodeId: block.nodeId,
        nodeType: block.nodeType,
        text: block.text,
        rewrittenText: block.text.replace(pattern, '__DATE__PLACEHOLDER__'),
      };
    }
  }
  return null;
}

async function executeCreateParagraph(
  doc: BoundDocApi,
  text: string,
  placement: ReturnType<typeof resolvePlacement>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'paragraph']);
  if (!fn)
    throw new SuperDocCliError('doc.create.paragraph is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = { text, at: placement };
  if (changeMode) params.changeMode = changeMode;
  return fn(params);
}

async function executeCreateHeading(
  doc: BoundDocApi,
  text: string,
  level: number,
  placement: ReturnType<typeof resolvePlacement>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'heading']);
  if (!fn) {
    // Fall back to a paragraph when create.heading is not exposed
    return executeCreateParagraph(doc, text, placement, changeMode);
  }
  const params: Record<string, unknown> = { text, level, at: placement };
  if (changeMode) params.changeMode = changeMode;
  return fn(params);
}

async function executeMutations(
  doc: BoundDocApi,
  steps: ReadonlyArray<Record<string, unknown>>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['mutations', 'apply']);
  if (!fn)
    throw new SuperDocCliError('doc.mutations.apply is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  return fn({ atomic: true, changeMode: changeMode ?? 'direct', steps });
}

async function executeCreateTable(
  doc: BoundDocApi,
  args: CreateTableArgs,
  placement: ReturnType<typeof resolvePlacement>,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'table']);
  if (!fn)
    throw new SuperDocCliError('doc.create.table is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = {
    rows: args.rows,
    columns: args.columns,
    at: placement,
  };
  if (args.changeMode) params.changeMode = args.changeMode;
  return fn(params);
}

async function executeCommentCreate(
  doc: BoundDocApi,
  snapshot: DocumentSnapshot,
  commentText: string,
  blockId: string,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['comments', 'create']);
  if (!fn)
    throw new SuperDocCliError('doc.comments.create is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const target = buildFullBlockTextTarget(snapshot, blockId);
  if (!target) {
    throw new SuperDocCliError('Unable to build a text target for the requested comment block.', {
      code: 'INVALID_ARGUMENT',
      details: { blockId },
    });
  }
  return fn({
    text: commentText,
    target,
  });
}

async function executeListCreateFromParagraph(
  doc: BoundDocApi,
  paragraphNodeId: string,
  kind: 'ordered' | 'bullet',
  sequenceMode: 'new' | 'continuePrevious',
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['lists', 'create']);
  if (!fn)
    throw new SuperDocCliError('doc.lists.create is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = {
    mode: 'fromParagraphs',
    target: {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: paragraphNodeId,
    },
    kind,
    sequence: { mode: sequenceMode },
  };
  if (changeMode) params.changeMode = changeMode;
  return fn(params);
}

async function executeListInsert(
  doc: BoundDocApi,
  target: ListItemTarget,
  text: string,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['lists', 'insert']);
  if (!fn)
    throw new SuperDocCliError('doc.lists.insert is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = {
    target,
    position: 'after',
    text,
  };
  if (changeMode) params.changeMode = changeMode;
  return fn(params);
}

async function applyTableCellTexts(
  doc: BoundDocApi,
  tableNodeId: string,
  tableOrdinal: number,
  cellTexts: readonly TableCellText[],
  changeMode: AgentChangeMode | undefined,
): Promise<TableCellText[]> {
  const nonEmptyCells = cellTexts.filter((cell) => cell.text.trim().length > 0);
  if (nonEmptyCells.length === 0) return [];

  const extractFn = maybeMethod(doc, ['extract']);
  if (!extractFn) {
    throw new SuperDocCliError('doc.extract is required to populate table cell text.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }

  const extracted = asRecord(await extractFn({}));
  const blocks = (Array.isArray(extracted?.blocks) ? extracted?.blocks : [])
    .map((block: unknown) => asRecord(block))
    .filter((block: Record<string, unknown> | null): block is Record<string, unknown> => block != null)
    .flatMap((block: Record<string, unknown>) => {
      const tableContext = asRecord(block.tableContext);
      if (asNumber(tableContext?.tableOrdinal, -1) !== tableOrdinal - 1) return [];
      const nodeId = asString(block.nodeId);
      if (!nodeId) return [];
      return [
        {
          nodeId,
          type: asString(block.type, 'paragraph'),
          tableContext: {
            tableOrdinal: asNumber(tableContext?.tableOrdinal),
            rowIndex: asNumber(tableContext?.rowIndex),
            columnIndex: asNumber(tableContext?.columnIndex),
            colspan: asNumber(tableContext?.colspan, 1),
            rowspan: asNumber(tableContext?.rowspan, 1),
          },
        } satisfies ExtractedTableBlock,
      ];
    });

  const steps = [];
  for (const cell of nonEmptyCells) {
    const block = findExtractedCellBlock(blocks, cell.rowIndex, cell.columnIndex);
    if (!block?.nodeId) {
      throw new SuperDocCliError('Unable to locate a paragraph block for the requested table cell.', {
        code: 'INVALID_ARGUMENT',
        details: {
          tableNodeId,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
        },
      });
    }
    steps.push({
      id: `set-table-cell-${cell.rowIndex}-${cell.columnIndex}`,
      op: 'text.rewrite',
      where: {
        by: 'block',
        nodeType: block.type ?? 'paragraph',
        nodeId: block.nodeId,
      },
      args: {
        replacement: { text: cell.text },
      },
    });
  }

  if (steps.length === 0) return [];
  await executeMutations(doc, steps, changeMode);
  return nonEmptyCells;
}

async function runInsertParagraph(doc: BoundDocApi, args: InsertParagraphArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const placement = resolvePlacement(args.placement, pre);
    const result = await executeCreateParagraph(doc, args.text, placement, args.changeMode);
    const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
    const verification = evaluateChecks(pre, post, [
      { kind: 'revision-changed' },
      { kind: 'block-count-delta', nodeType: 'paragraph', delta: 1 },
    ]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `insert_paragraph: ${args.text.slice(0, 60)}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.create.paragraph', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_paragraph', err, pre);
  }
}

async function runInsertParagraphs(doc: BoundDocApi, args: InsertParagraphsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const placement = resolvePlacement(args.placement, pre);
    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [];
    // For the first item: respect the requested placement and headingLevel.
    // For subsequent items: append after the previously inserted block by
    // using `documentEnd` (the SDK keeps blocks contiguous) so order is
    // preserved.
    let currentPlacement = placement;
    let headingFirst = false;
    if (typeof args.headingLevel === 'number' && args.headingLevel >= 1 && args.headingLevel <= 6) {
      headingFirst = true;
    }
    for (let i = 0; i < args.texts.length; i += 1) {
      const text = args.texts[i]!;
      const isFirst = i === 0;
      const result =
        isFirst && headingFirst
          ? await executeCreateHeading(doc, text, args.headingLevel!, currentPlacement, args.changeMode)
          : await executeCreateParagraph(doc, text, currentPlacement, args.changeMode);
      executedOperations.push({
        operationId: isFirst && headingFirst ? 'doc.create.heading' : 'doc.create.paragraph',
        result,
      });
      const created = createdBlockTarget(result);
      if (created) {
        currentPlacement = {
          kind: 'after',
          target: { kind: 'block', nodeType: created.nodeType, nodeId: created.nodeId },
        };
        continue;
      }
      const mid = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
      const last = lastBlock(mid);
      currentPlacement = last
        ? { kind: 'after', target: { kind: 'block', nodeType: last.nodeType, nodeId: last.nodeId } }
        : { kind: 'documentEnd' };
    }
    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_paragraphs',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_paragraphs', err, pre);
  }
}

async function runInsertHeading(doc: BoundDocApi, args: InsertHeadingArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const placement = resolvePlacement(args.placement, pre);
    const result = await executeCreateHeading(doc, args.text, args.level, placement, args.changeMode);
    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `insert_heading: ${args.text.slice(0, 60)}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.create.heading', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_heading', err, pre);
  }
}

async function runReplaceText(doc: BoundDocApi, args: ReplaceTextArgs): Promise<AgentReceipt> {
  const selectorDomains = args.selector ? snapshotDomainsForSelector(args.selector) : null;
  const requiresBlockSnapshot = args.selector != null || args.edits.length > 1;
  const preIdentity = requiresBlockSnapshot ? null : await readDocumentIdentity(doc);
  const pre = requiresBlockSnapshot
    ? await buildDocumentSnapshot(doc, { includeDomains: selectorDomains ?? ['blocks'] })
    : snapshotFromIdentity(preIdentity!);
  try {
    if (args.edits.length === 0) {
      return failedReceipt('replace_text', new Error('edits must be non-empty'), pre);
    }
    const caseSensitive = args.caseSensitive === true;
    const selectedTargets: Array<{ selector: AgentSelector; matched: readonly string[] }> = [];
    let skippedEdits: Array<{ find: string }> = [];
    let steps: Array<Record<string, unknown>>;

    if (args.selector) {
      const target = selectorToBlockTarget(args.selector, pre);
      if (!target) {
        return failedReceipt('replace_text', new Error('selector did not resolve to a unique body block'), pre);
      }
      let rewrittenText = target.text;
      for (const edit of args.edits) {
        if (!textIncludes(rewrittenText, edit.find, caseSensitive)) {
          return {
            status: 'failed',
            intent: 'replace_text',
            preSnapshot: { revision: pre.revision, counts: pre.counts },
            selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
            executedOperations: [],
            verification: [],
            errors: [
              {
                code: 'RECIPE_FAILED',
                message: `selected block does not contain ${JSON.stringify(edit.find)}`,
              },
            ],
          };
        }
        rewrittenText = replaceAllText(rewrittenText, edit.find, edit.replace, caseSensitive);
      }
      steps = [
        {
          id: 'replace-text-in-block-1',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
          args: {
            replacement: { text: rewrittenText },
            style: preserveRewriteStyle(),
          },
        },
      ];
      selectedTargets.push({ selector: args.selector, matched: [target.nodeId] });
    } else {
      const matchingEdits =
        args.edits.length === 1
          ? args.edits
          : args.edits.filter((edit) => pre.blocks.some((block) => textIncludes(block.text, edit.find, caseSensitive)));
      skippedEdits = args.edits.filter((edit) => !matchingEdits.includes(edit));
      if (matchingEdits.length === 0) {
        return {
          status: 'failed',
          intent: 'replace_text',
          preSnapshot: { revision: pre.revision, counts: pre.counts },
          selectedTargets: [],
          executedOperations: [],
          verification: [],
          errors: [
            {
              code: 'RECIPE_FAILED',
              message: 'none of the requested text replacements matched the current document',
            },
          ],
        };
      }
      steps = matchingEdits.map((edit, index) => ({
        id: `replace-${index + 1}`,
        op: 'text.rewrite',
        where: {
          by: 'select',
          select: {
            type: 'text',
            pattern: edit.find,
            mode: 'contains',
            caseSensitive,
          },
          require: 'all',
        },
        args: {
          replacement: { text: edit.replace },
          style: preserveRewriteStyle(),
        },
      }));
    }

    const result = await executeMutations(doc, steps, args.changeMode);
    if (args.selector && selectedTargets[0]) {
      const post = await buildDocumentSnapshot(doc, { includeDomains: selectorDomains ?? ['blocks'] });
      const blockId = selectedTargets[0]!.matched[0]!;
      const postTarget = findSnapshotTextByNodeId(post, blockId);
      const preTarget = findSnapshotTextByNodeId(pre, blockId);
      const finalText = postTarget?.text ?? '';
      const expectedText = args.edits.reduce(
        (current, edit) => replaceAllText(current, edit.find, edit.replace, caseSensitive),
        preTarget?.text ?? '',
      );
      const verification = [
        {
          check: { kind: 'revision-changed' } satisfies AgentVerificationCheck,
          passed: pre.revision !== post.revision,
          detail: `pre=${pre.revision} post=${post.revision}`,
        },
        {
          check: {
            kind: 'block-text-contains',
            nodeId: blockId,
            text: expectedText,
          } satisfies AgentVerificationCheck,
          passed: !!postTarget && verifyRewrittenBlockText(finalText, expectedText, args.changeMode),
        },
      ];
      return {
        status: verification.every((v) => v.passed) ? 'ok' : 'failed',
        intent: 'replace_text',
        preSnapshot: { revision: pre.revision, counts: pre.counts },
        postSnapshot: { revision: post.revision, counts: post.counts },
        selectedTargets,
        executedOperations: [{ operationId: 'doc.mutations.apply', result }],
        verification,
      };
    }

    const postIdentity =
      args.changeMode === 'tracked'
        ? await readDocumentIdentity(doc)
        : {
            revision: revisionAfterOperation(result, pre.revision),
            counts: pre.counts,
          };
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    const skippedEditRationale =
      args.selector == null && args.edits.length > 1 ? summarizeSkippedReplaceEdits(skippedEdits) : undefined;
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'replace_text',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets,
      executedOperations: [
        {
          operationId: 'doc.mutations.apply',
          ...(skippedEditRationale ? { rationale: skippedEditRationale } : {}),
          result,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('replace_text', err, pre);
  }
}

async function runDeleteText(doc: BoundDocApi, args: DeleteTextArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    if (args.finds.length === 0) {
      return failedReceipt('delete_text', new Error('finds must be non-empty'), pre);
    }
    const steps = args.finds.map((find, index) => ({
      id: `delete-${index + 1}`,
      op: 'text.delete',
      where: {
        by: 'select',
        select: {
          type: 'text',
          pattern: find,
          mode: 'contains',
          caseSensitive: args.caseSensitive === true,
        },
        require: 'all',
      },
      args: {},
    }));
    const result = await executeMutations(doc, steps, args.changeMode);
    const revision = asRecord(asRecord(result)?.revision);
    const postIdentity =
      args.changeMode === 'tracked'
        ? await readDocumentIdentity(doc)
        : {
            revision: asString(revision?.after, preIdentity.revision) ?? preIdentity.revision,
            counts: preIdentity.counts,
          };
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_text',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_text', err, pre);
  }
}

async function runReplaceTopDate(doc: BoundDocApi, args: ReplaceTopDateArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const candidate = findTopDateCandidate(pre);
    if (!candidate) {
      return failedReceipt(
        'replace_top_date',
        new Error('no date-like paragraph found near the top of the document'),
        pre,
      );
    }
    const rewrittenText = candidate.rewrittenText.replace('__DATE__PLACEHOLDER__', args.date);
    const result = await executeMutations(
      doc,
      [
        {
          id: 'replace-top-date-1',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: candidate.nodeType, nodeId: candidate.nodeId },
          args: {
            replacement: { text: rewrittenText },
            style: preserveRewriteStyle(),
          },
        },
      ],
      args.changeMode,
    );
    const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
    const updated = findSnapshotTextByNodeId(post, candidate.nodeId);
    const verification: VerificationResult[] = [
      {
        check: { kind: 'revision-changed' },
        passed: pre.revision !== post.revision,
        detail: `pre=${pre.revision} post=${post.revision}`,
      },
      {
        check: { kind: 'block-text-contains', nodeId: candidate.nodeId, text: args.date },
        passed: !!updated && updated.text.includes(args.date),
      },
    ];
    return {
      status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
      intent: 'replace_top_date',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [
        {
          selector: { kind: 'nodeId', nodeId: candidate.nodeId },
          matched: [candidate.nodeId],
        },
      ],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('replace_top_date', err, pre);
  }
}

async function runAppendList(doc: BoundDocApi, args: AppendListArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (args.items.length === 0) {
      return failedReceipt('append_list', new Error('items must be non-empty'), pre);
    }
    const workflowResult = await runSuperdocListTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'append_new_list',
        items: [...args.items],
        kind: args.kind ?? 'ordered',
        headingText: args.headingText,
        headingLevel: args.headingLevel,
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'append_list', pre, workflowResult);
  } catch (err) {
    return failedReceipt('append_list', err, pre);
  }
}

async function runInsertListItems(doc: BoundDocApi, args: InsertListItemsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (args.items.length === 0) {
      return failedReceipt('insert_list_items', new Error('items must be non-empty'), pre);
    }
    const workflowResult = await runSuperdocListTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'insert_many',
        items: [...args.items],
        target:
          args.listOrdinal == null
            ? undefined
            : {
                by: 'listOrdinal',
                value: args.listOrdinal,
              },
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'insert_list_items', pre, workflowResult);
  } catch (err) {
    return failedReceipt('insert_list_items', err, pre);
  }
}

async function runCreateTable(doc: BoundDocApi, args: CreateTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isInteger(args.rows) || args.rows < 1 || !Number.isInteger(args.columns) || args.columns < 1) {
      return failedReceipt('create_table', new Error('rows and columns must be positive integers'), pre);
    }
    const placement = resolvePlacement(args.placement, pre);
    const insertedTableOrdinal = estimateInsertedTableOrdinal(pre, placement);
    const result = await executeCreateTable(doc, args, placement);
    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      { operationId: 'doc.create.table', result },
    ];
    const createdTableNodeId = asString(asRecord(asRecord(result)?.table)?.nodeId);
    if (createdTableNodeId && args.cellTexts) {
      const appliedCells = await applyTableCellTexts(
        doc,
        createdTableNodeId,
        insertedTableOrdinal,
        flattenCellTexts(args.cellTexts),
        args.changeMode,
      );
      if (appliedCells.length > 0) {
        executedOperations.push({
          operationId: 'doc.mutations.apply',
          rationale: `Populated ${appliedCells.length} table cells.`,
        });
      }
    }
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [
      { kind: 'revision-changed' },
      { kind: 'block-count-delta', nodeType: 'table', delta: 1 },
    ]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'create_table',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt('create_table', err, pre);
  }
}

async function runCommentParagraphs(doc: BoundDocApi, args: CommentParagraphsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const blocks = pre.blocks.filter((b) => {
      if (args.scope === 'all') {
        if (b.nodeType !== 'paragraph' && b.nodeType !== 'heading') return false;
      } else if (b.nodeType !== 'paragraph') {
        return false;
      }
      if (b.text.trim().length === 0) return false;
      if (args.excludeBlockQuotes && /(blockquote|intensequote|quote)/i.test(b.styleId ?? '')) return false;
      return true;
    });
    if (blocks.length === 0) {
      return failedReceipt('comment_paragraphs', new Error('no eligible body paragraphs to comment'), pre);
    }
    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const block of blocks) {
      const result = await executeCommentCreate(doc, pre, args.commentText, block.nodeId);
      executed.push({ operationId: 'doc.comments.create', result });
    }
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'comment-count-delta', delta: blocks.length }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'comment_paragraphs',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('comment_paragraphs', err, pre);
  }
}

async function runAddComment(doc: BoundDocApi, args: AddCommentArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('add_comment', new Error('selector did not resolve to a body block'), pre);
    }
    const result = await executeCommentCreate(doc, pre, args.commentText, target.nodeId);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'comment-count-delta', delta: 1 }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'add_comment',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.comments.create', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('add_comment', err, pre);
  }
}

async function runRewriteBlock(doc: BoundDocApi, args: RewriteBlockArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('rewrite_block', new Error('selector did not resolve to a body block'), pre);
    }
    const normalizedText = normalizeTitleLikeRewriteText(target.text, args.text);
    const steps = [
      {
        id: 'rewrite-block-1',
        op: 'text.rewrite',
        where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        args: {
          replacement: { text: normalizedText },
          style: preserveRewriteStyle(),
        },
      },
    ];
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const rewrittenBlock = findSnapshotTextByNodeId(post, target.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(pre.revision, post.revision, true),
      {
        check: { kind: 'block-text-contains', nodeId: target.nodeId, text: normalizedText },
        passed: !!rewrittenBlock && verifyRewrittenBlockText(rewrittenBlock.text, normalizedText, args.changeMode),
      },
    ];
    const changed = pre.revision !== post.revision;
    const rewritten = !!rewrittenBlock && verifyRewrittenBlockText(rewrittenBlock.text, args.text, args.changeMode);
    return {
      status: changed && rewritten ? 'ok' : 'failed',
      intent: 'rewrite_block',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
      errors:
        changed && rewritten
          ? undefined
          : [
              {
                code: 'RECIPE_FAILED',
                message: changed
                  ? 'rewrite_block did not produce the requested rewritten text for the selected block'
                  : 'rewrite_block produced no change for the selected block; keep the same target and provide a changed rewrite',
              },
            ],
    };
  } catch (err) {
    return failedReceipt('rewrite_block', err, pre);
  }
}

const NAMED_COLORS: Record<string, string> = {
  black: '000000',
  blue: '0000FF',
  green: '00B050',
  grey: '808080',
  gray: '808080',
  'light grey': 'D3D3D3',
  'light gray': 'D3D3D3',
  red: 'FF0000',
  white: 'FFFFFF',
  yellow: 'FFFF00',
  orange: 'ED7D31',
  purple: '7030A0',
};

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

function normalizeColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const named = NAMED_COLORS[trimmed.toLocaleLowerCase()];
  if (named) return named;
  const match = HEX_COLOR_PATTERN.exec(trimmed);
  return match ? match[1]!.toUpperCase() : null;
}

function normalizeTableColor(raw: string): string | null {
  const normalized = normalizeColor(raw);
  return normalized ? `#${normalized}` : null;
}

async function runAcceptTrackedChanges(doc: BoundDocApi, args: AcceptTrackedChangesArgs): Promise<AgentReceipt> {
  return runTrackedChangeDecision(doc, 'accept_tracked_changes', 'accept', args.author);
}

async function runRejectTrackedChanges(doc: BoundDocApi, args: RejectTrackedChangesArgs): Promise<AgentReceipt> {
  return runTrackedChangeDecision(doc, 'reject_tracked_changes', 'reject', args.author);
}

async function runTrackedChangeDecision(
  doc: BoundDocApi,
  intentLabel: string,
  decision: 'accept' | 'reject',
  author: string | undefined,
): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const listFn = maybeMethod(doc, ['trackChanges', 'list']);
    const decideFn = maybeMethod(doc, ['trackChanges', 'decide']);
    if (!listFn || !decideFn) {
      throw new SuperDocCliError('doc.trackChanges.list / decide are not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    const items = await listAllTrackedChanges(listFn);
    const authorKey = author?.trim().toLocaleLowerCase();
    const scoped = authorKey
      ? items.filter((item) => asString(item?.author)?.toLocaleLowerCase() === authorKey)
      : items;

    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [];

    if (scoped.length === 0) {
      // Nothing to do is not a failure: report it honestly.
      const post = await buildDocumentSnapshot(doc);
      return {
        status: 'ok',
        intent: intentLabel,
        preSnapshot: { revision: pre.revision, counts: pre.counts },
        postSnapshot: { revision: post.revision, counts: post.counts },
        selectedTargets: [],
        executedOperations: [
          {
            operationId: 'doc.trackChanges.list',
            rationale: `no tracked changes${author ? ` for author=${author}` : ''} to ${decision}`,
          },
        ],
        verification: [{ check: { kind: 'tracked-change-count-delta', delta: 0 }, passed: true, detail: 'no-op' }],
      };
    }

    if (!authorKey) {
      const result = await decideFn({ decision, target: { scope: 'all' } });
      executedOperations.push({ operationId: 'doc.trackChanges.decide', result });
    } else {
      for (const item of scoped) {
        const id = asString(item?.id);
        if (!id) continue;
        const story = asRecord(asRecord(item?.address)?.story);
        const params: Record<string, unknown> = { decision, target: { id, ...(story ? { story } : {}) } };
        const result = await decideFn(params);
        executedOperations.push({ operationId: 'doc.trackChanges.decide', result });
      }
    }

    const post = await buildDocumentSnapshot(doc);
    const expectedDelta = -scoped.length;
    const verification = evaluateChecks(pre, post, [
      { kind: 'revision-changed' },
      { kind: 'tracked-change-count-delta', delta: expectedDelta },
    ]);

    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: intentLabel,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt(intentLabel, err, pre);
  }
}

async function listAllTrackedChanges(
  listFn: (input: unknown) => Promise<unknown>,
): Promise<Array<Record<string, unknown>>> {
  const PAGE = 250;
  let offset = 0;
  const out: Array<Record<string, unknown>> = [];
  while (true) {
    const page = asRecord(await listFn({ offset, limit: PAGE, in: 'all' }));
    const items = Array.isArray(page?.items) ? page!.items : [];
    for (const item of items) {
      if (isRecord(item)) out.push(item);
    }
    const total = asNumber(page?.total, out.length) ?? out.length;
    offset += items.length;
    if (items.length === 0 || offset >= total) return out;
  }
}

async function runNormalizeBodyFontSize(doc: BoundDocApi, args: NormalizeBodyFontSizeArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isFinite(args.fontSize) || args.fontSize <= 0) {
      return failedReceipt('normalize_body_font_size', new Error('fontSize must be a positive number'), pre);
    }
    const targetBlocks = pre.blocks.filter(
      (b) =>
        (b.nodeType === 'paragraph' || b.nodeType === 'listItem') &&
        typeof b.text === 'string' &&
        b.text.trim().length > 0,
    );
    if (targetBlocks.length === 0) {
      return failedReceipt('normalize_body_font_size', new Error('no non-empty body blocks found'), pre);
    }
    const steps = targetBlocks.map((block, index) => ({
      id: `body-font-${index + 1}`,
      op: 'format.apply',
      where: { by: 'block', nodeType: block.nodeType, nodeId: block.nodeId },
      args: { inline: { fontSize: args.fontSize }, scope: 'block' },
    }));
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `normalize_body_font_size: ${args.fontSize}pt`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [
        {
          operationId: 'doc.mutations.apply',
          result,
          rationale: `format.apply on ${targetBlocks.length} body block(s)`,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('normalize_body_font_size', err, pre);
  }
}

async function runColorText(doc: BoundDocApi, args: ColorTextArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const color = normalizeColor(args.color);
    if (!color) {
      return failedReceipt(
        'color_text',
        new Error('color must be a 6-digit hex (e.g. "#FF0000") or a named color'),
        pre,
      );
    }
    const formatFn = maybeMethod(doc, ['format', 'apply']);
    if (!formatFn) {
      throw new SuperDocCliError('doc.format.apply is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    type Range = { blockId: string; start: number; end: number };
    const ranges: Range[] = [];

    if (args.selector) {
      const target = selectorToBlockTarget(args.selector, pre);
      if (!target) {
        return failedReceipt('color_text', new Error('selector did not resolve to a unique body block'), pre);
      }
      const block = pre.blocks.find((b) => b.nodeId === target.nodeId);
      if (!block) {
        return failedReceipt('color_text', new Error('resolved block missing from snapshot'), pre);
      }
      if (args.targetText) {
        const found = findRanges(block.text, args.targetText, args.caseSensitive === true);
        if (found.length === 0) {
          return failedReceipt('color_text', new Error('targetText not found inside the selected block'), pre);
        }
        for (const r of found) ranges.push({ blockId: block.nodeId, ...r });
      } else {
        if (block.text.length === 0) {
          return failedReceipt('color_text', new Error('selected block has no text to color'), pre);
        }
        ranges.push({ blockId: block.nodeId, start: 0, end: block.text.length });
      }
    } else {
      if (!args.targetText) {
        return failedReceipt('color_text', new Error('either selector or targetText is required'), pre);
      }
      for (const b of pre.blocks) {
        if (b.nodeType !== 'paragraph' && b.nodeType !== 'heading' && b.nodeType !== 'listItem') continue;
        const found = findRanges(b.text, args.targetText, args.caseSensitive === true);
        for (const r of found) ranges.push({ blockId: b.nodeId, ...r });
      }
      if (ranges.length === 0) {
        return failedReceipt('color_text', new Error('targetText not found anywhere in body text'), pre);
      }
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const range of ranges) {
      const params: Record<string, unknown> = {
        blockId: range.blockId,
        start: range.start,
        end: range.end,
        inline: { color },
      };
      if (args.changeMode) params.changeMode = args.changeMode;
      const result = await formatFn(params);
      executed.push({ operationId: 'doc.format.apply', result });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `color_text: ${args.targetText ?? '<block>'} -> #${color}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('color_text', err, pre);
  }
}

function findRanges(haystack: string, needle: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  if (needle.length === 0) return ranges;
  const source = caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const target = caseSensitive ? needle : needle.toLocaleLowerCase();
  let offset = 0;
  while (offset < source.length) {
    const idx = source.indexOf(target, offset);
    if (idx < 0) break;
    ranges.push({ start: idx, end: idx + target.length });
    offset = idx + target.length;
  }
  return ranges;
}

async function runApplyLetterSpacing(doc: BoundDocApi, args: ApplyLetterSpacingArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isFinite(args.letterSpacing)) {
      return failedReceipt('apply_letter_spacing', new Error('letterSpacing must be a finite number'), pre);
    }
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('apply_letter_spacing', new Error('selector did not resolve to a unique block'), pre);
    }
    if (target.nodeType !== 'paragraph' && target.nodeType !== 'heading' && target.nodeType !== 'listItem') {
      return failedReceipt(
        'apply_letter_spacing',
        new Error('selector must resolve to a paragraph, heading, or list item'),
        pre,
      );
    }
    const steps = [
      {
        id: 'letter-spacing-1',
        op: 'format.apply',
        where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        args: { inline: { letterSpacing: args.letterSpacing }, scope: 'block' },
      },
    ];
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `apply_letter_spacing: ${args.letterSpacing}pt`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('apply_letter_spacing', err, pre);
  }
}

async function runFillPlaceholders(doc: BoundDocApi, args: FillPlaceholdersArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const valueCount = args.values?.length ?? 0;
    const fieldCount = args.fields?.length ?? 0;
    if (valueCount === 0 && fieldCount === 0) {
      return failedReceipt(
        'fill_placeholders',
        new Error('fill_placeholders requires non-empty values or fields'),
        pre,
      );
    }
    const workflowResult = await runSuperdocTextTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'fill_placeholders',
        values: args.values == null ? undefined : [...args.values],
        fields: args.fields,
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'fill_placeholders', pre, workflowResult);
  } catch (err) {
    return failedReceipt('fill_placeholders', err, pre);
  }
}

async function runMoveSection(doc: BoundDocApi, args: MoveSectionArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    if (!Number.isInteger(args.sourceSection) || args.sourceSection < 1) {
      return failedReceipt('move_section', new Error('sourceSection must be a positive integer'), pre);
    }
    if (!Number.isInteger(args.destinationSection) || args.destinationSection < 1) {
      return failedReceipt('move_section', new Error('destinationSection must be a positive integer'), pre);
    }
    if (args.sourceSection === args.destinationSection) {
      return failedReceipt('move_section', new Error('sourceSection and destinationSection must differ'), pre);
    }
    const workflowResult = await runSuperdocStructureInsertWorkflow({
      documentHandle: doc,
      args: {
        action: 'move_section',
        sourceSection: args.sourceSection,
        destinationSection: args.destinationSection,
        position: args.position ?? 'before',
        bottomNote: args.bottomNote,
      },
    });
    const workflowCode = asString(workflowResult.receipt.details?.code);
    if (workflowResult.receipt.status !== 'success') {
      return {
        status: 'failed',
        intent: 'move_section',
        preSnapshot: preIdentity,
        selectedTargets: [],
        executedOperations:
          workflowResult.output == null
            ? []
            : [{ operationId: `workflow.${workflowResult.receipt.toolName}`, result: workflowResult.output }],
        verification: [],
        errors: [
          {
            code: workflowCode ?? 'RECIPE_FAILED',
            message: workflowResult.receipt.message,
          },
        ],
      };
    }

    const postIdentity = await readDocumentIdentity(doc);
    const summary = asString(asRecord(workflowResult.output?.verification)?.summary);
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
      intent: 'move_section',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [
        {
          operationId: `workflow.${workflowResult.receipt.toolName}`,
          rationale: summary,
          result: workflowResult.output?.execution ?? workflowResult.output,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('move_section', err, pre);
  }
}

async function runInsertToc(doc: BoundDocApi, args: InsertTocArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const tocFn = maybeMethod(doc, ['create', 'tableOfContents']);
    if (!tocFn) {
      throw new SuperDocCliError('doc.create.tableOfContents is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const placement = resolvePlacement(args.placement ?? { at: 'document_start' }, pre);
    const executed: Array<{ operationId: string; result?: unknown }> = [];

    let tocPlacement = placement;
    if (args.title) {
      const headingResult = await executeCreateHeading(doc, args.title, 1, placement, args.changeMode);
      executed.push({ operationId: 'doc.create.heading', result: headingResult });
      const headingNodeId = asString(asRecord(asRecord(headingResult)?.heading)?.nodeId);
      if (headingNodeId) {
        tocPlacement = {
          kind: 'after',
          target: { kind: 'block', nodeType: 'heading', nodeId: headingNodeId },
        };
      }
    }

    const tocParams: Record<string, unknown> = { at: tocPlacement };
    if (args.changeMode) tocParams.changeMode = args.changeMode;
    const result = await tocFn(tocParams);
    executed.push({ operationId: 'doc.create.tableOfContents', result });

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `insert_toc${args.title ? `: ${args.title}` : ''}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_toc', err, pre);
  }
}

async function runInsertImageWithCaption(doc: BoundDocApi, args: InsertImageWithCaptionArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const executed: Array<{ operationId: string; result?: unknown }> = [];
    let placement = resolvePlacement(args.placement, pre);

    if (args.sectionBreakBefore) {
      const sectionBreakFn = maybeMethod(doc, ['create', 'sectionBreak']);
      if (!sectionBreakFn) {
        throw new SuperDocCliError('doc.create.sectionBreak is not available on the document handle.', {
          code: 'TOOL_DISPATCH_NOT_FOUND',
        });
      }
      const sectionBreakResult = await sectionBreakFn({
        at: placement,
        breakType: 'nextPage',
      });
      executed.push({ operationId: 'doc.create.sectionBreak', result: sectionBreakResult });
      const breakParagraph = asRecord(asRecord(sectionBreakResult)?.breakParagraph);
      const breakNodeId = asString(breakParagraph?.nodeId);
      const breakNodeType = asString(breakParagraph?.nodeType);
      if (breakNodeId && breakNodeType) {
        placement = {
          kind: 'after',
          target: {
            kind: 'block',
            nodeType: breakNodeType,
            nodeId: breakNodeId,
          },
        };
      }
    }

    const imageFn = maybeMethod(doc, ['create', 'image']);
    if (!imageFn) {
      throw new SuperDocCliError('doc.create.image is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const imageParams: Record<string, unknown> = {
      src: args.src,
      at: placement,
    };
    if (args.alt) imageParams.alt = args.alt;
    if (args.changeMode) imageParams.changeMode = args.changeMode;
    if (args.width != null || args.height != null || /^attached(?::|$)/i.test(args.src)) {
      imageParams.size = {
        width: args.width ?? 320,
        height: args.height ?? 180,
      };
    }
    const imageResult = await imageFn(imageParams);
    const imageId =
      asString(asRecord(asRecord(imageResult)?.image)?.imageId) ??
      asString(asRecord(asRecord(imageResult)?.image)?.sdImageId) ??
      asString(asRecord(asRecord(imageResult)?.image)?.id) ??
      asString(asRecord(asRecord(imageResult)?.image)?.nodeId);
    executed.push({ operationId: 'doc.create.image', result: imageResult });

    if (args.caption) {
      if (!imageId) {
        throw new SuperDocCliError('doc.create.image did not return an image id; caption cannot be attached.', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const captionFn = maybeMethod(doc, ['images', 'insertCaption']);
      if (!captionFn) {
        throw new SuperDocCliError('doc.images.insertCaption is not available on the document handle.', {
          code: 'TOOL_DISPATCH_NOT_FOUND',
        });
      }
      const captionResult = await captionFn({ imageId, text: args.caption });
      executed.push({ operationId: 'doc.images.insertCaption', result: captionResult });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_image_with_caption',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_image_with_caption', err, pre);
  }
}

async function runSetTableShading(doc: BoundDocApi, args: SetTableShadingArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const tableOrdinal = args.tableOrdinal ?? 1;
    const table = await resolveTableContextQuick(doc, tableOrdinal);
    if (!table) {
      return failedReceipt('set_table_shading', new Error(`tableOrdinal ${tableOrdinal} is out of range`), pre);
    }
    const color = normalizeTableColor(args.color);
    if (!color) {
      return failedReceipt('set_table_shading', new Error(`unsupported color ${JSON.stringify(args.color)}`), pre);
    }
    const fn = maybeMethod(doc, ['tables', 'setShading']);
    if (!fn) {
      throw new SuperDocCliError('doc.tables.setShading is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: {
        kind: 'block',
        nodeType: 'table',
        nodeId: table.nodeId,
      },
      color,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const result = await fn(params);
    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
      intent: 'set_table_shading',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [
        {
          selector: { kind: 'ordinal', ordinalKind: 'tableOrdinal', value: tableOrdinal },
          matched: [table.nodeId],
        },
      ],
      executedOperations: [{ operationId: 'doc.tables.setShading', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('set_table_shading', err, pre);
  }
}

function resolveSnapshotTable(
  snapshot: DocumentSnapshot,
  tableOrdinal: number | undefined,
): { nodeId: string; ordinal: number; rows: number; columns: number } | null {
  if (snapshot.tables.length === 0) return null;
  if (tableOrdinal == null) {
    if (snapshot.tables.length !== 1) return null;
    const t = snapshot.tables[0]!;
    return { nodeId: t.nodeId, ordinal: t.ordinal, rows: t.rows, columns: t.columns };
  }
  const t = snapshot.tables.find((entry) => entry.ordinal === tableOrdinal);
  return t ? { nodeId: t.nodeId, ordinal: t.ordinal, rows: t.rows, columns: t.columns } : null;
}

async function runInsertTableRow(doc: BoundDocApi, args: InsertTableRowArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const table = await resolveTableContextQuick(doc, args.tableOrdinal);
    if (!table) {
      return failedReceipt(
        'insert_table_row',
        new Error(
          args.tableOrdinal == null
            ? 'no unique table found (specify tableOrdinal)'
            : `table ordinal ${args.tableOrdinal} not found`,
        ),
        pre,
      );
    }
    const insertFn = maybeMethod(doc, ['tables', 'insertRow']);
    if (!insertFn) {
      throw new SuperDocCliError('doc.tables.insertRow is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const lastRowIndex = Math.max(0, table.rows - 1);
    const rowIndex = args.rowIndex == null ? lastRowIndex : Math.min(args.rowIndex, lastRowIndex);
    const position = args.position === 'before' || args.position === 'above' ? 'above' : 'below';
    const insertParams: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex,
      position,
    };
    if (args.changeMode) insertParams.changeMode = args.changeMode;
    if (args.dryRun === true) insertParams.dryRun = true;
    const insertResult = await insertFn(insertParams);
    const executed: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      {
        operationId: 'doc.tables.insertRow',
        result: insertResult,
        rationale: args.dryRun === true ? 'Preview only; no document mutation applied.' : undefined,
      },
    ];

    if (args.dryRun !== true && args.cellTexts && args.cellTexts.length > 0) {
      const insertedRowIndex = position === 'below' ? rowIndex + 1 : rowIndex;
      const cells = args.cellTexts.map((text, columnIndex) => ({ rowIndex: insertedRowIndex, columnIndex, text }));
      const applied = await applyTableCellTexts(doc, table.nodeId, table.ordinal, cells, args.changeMode);
      if (applied.length > 0) {
        executed.push({
          operationId: 'doc.mutations.apply',
          rationale: `Populated ${applied.length} cell(s) in new row`,
        });
      }
    }

    const postIdentity = await readDocumentIdentity(doc);
    const postTable = await getTableShape(doc, table.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(preIdentity.revision, postIdentity.revision, args.dryRun !== true),
    ];
    if (postTable) {
      verification.push({
        check: {
          kind: 'table-shape',
          nodeId: table.nodeId,
          rows: args.dryRun === true ? table.rows : table.rows + 1,
          columns: table.columns,
        },
        passed:
          postTable.rows === (args.dryRun === true ? table.rows : table.rows + 1) &&
          postTable.columns === table.columns,
      });
    }
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_table_row',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_table_row', err, pre);
  }
}

async function runInsertTableColumn(doc: BoundDocApi, args: InsertTableColumnArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const table = await resolveTableContextQuick(doc, args.tableOrdinal);
    if (!table) {
      return failedReceipt(
        'insert_table_column',
        new Error(
          args.tableOrdinal == null
            ? 'no unique table found (specify tableOrdinal)'
            : `table ordinal ${args.tableOrdinal} not found`,
        ),
        pre,
      );
    }
    const insertFn = maybeMethod(doc, ['tables', 'insertColumn']);
    if (!insertFn) {
      throw new SuperDocCliError('doc.tables.insertColumn is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const lastColumnIndex = Math.max(0, table.columns - 1);
    const columnIndex = args.columnIndex == null ? lastColumnIndex : Math.min(args.columnIndex, lastColumnIndex);
    const position = args.position ?? 'right';
    const insertParams: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      columnIndex,
      position,
    };
    if (args.changeMode) insertParams.changeMode = args.changeMode;
    const insertResult = await insertFn(insertParams);
    const executed: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      { operationId: 'doc.tables.insertColumn', result: insertResult },
    ];

    if (args.headerText) {
      const headerColumnIndex = position === 'right' ? columnIndex + 1 : columnIndex;
      const applied = await applyTableCellTexts(
        doc,
        table.nodeId,
        table.ordinal,
        [{ rowIndex: 0, columnIndex: headerColumnIndex, text: args.headerText }],
        args.changeMode,
      );
      if (applied.length > 0) {
        executed.push({ operationId: 'doc.mutations.apply', rationale: 'Populated header cell' });
      }
    }

    const postIdentity = await readDocumentIdentity(doc);
    const postTable = await getTableShape(doc, table.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(preIdentity.revision, postIdentity.revision, true),
    ];
    if (postTable) {
      verification.push({
        check: {
          kind: 'table-shape',
          nodeId: table.nodeId,
          rows: table.rows,
          columns: table.columns + 1,
        },
        passed: postTable.rows === table.rows && postTable.columns === table.columns + 1,
      });
    }
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_table_column',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_table_column', err, pre);
  }
}

async function runDeleteTableRow(doc: BoundDocApi, args: DeleteTableRowArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('delete_table_row', new Error('no table resolved for delete_table_row'), pre);
    }
    if (!Number.isInteger(args.rowIndex) || args.rowIndex < 0 || args.rowIndex >= table.rows) {
      return failedReceipt(
        'delete_table_row',
        new Error(`rowIndex ${args.rowIndex} out of range [0, ${table.rows - 1}]`),
        pre,
      );
    }
    const fn = maybeMethod(doc, ['tables', 'deleteRow']);
    if (!fn) {
      throw new SuperDocCliError('doc.tables.deleteRow is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex: args.rowIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const result = await fn(params);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_table_row',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.tables.deleteRow', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_table_row', err, pre);
  }
}

async function runDeleteTableColumn(doc: BoundDocApi, args: DeleteTableColumnArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('delete_table_column', new Error('no table resolved for delete_table_column'), pre);
    }
    if (!Number.isInteger(args.columnIndex) || args.columnIndex < 0 || args.columnIndex >= table.columns) {
      return failedReceipt(
        'delete_table_column',
        new Error(`columnIndex ${args.columnIndex} out of range [0, ${table.columns - 1}]`),
        pre,
      );
    }
    const fn = maybeMethod(doc, ['tables', 'deleteColumn']);
    if (!fn) {
      throw new SuperDocCliError('doc.tables.deleteColumn is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      columnIndex: args.columnIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const result = await fn(params);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_table_column',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.tables.deleteColumn', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_table_column', err, pre);
  }
}

async function runSplitTable(doc: BoundDocApi, args: SplitTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('split_table', new Error('no table resolved for split_table'), pre);
    }
    if (!Number.isInteger(args.rowIndex) || args.rowIndex < 1 || args.rowIndex >= table.rows) {
      return failedReceipt(
        'split_table',
        new Error(`rowIndex ${args.rowIndex} must be in range [1, ${table.rows - 1}]`),
        pre,
      );
    }
    const splitFn = maybeMethod(doc, ['tables', 'split']);
    if (!splitFn) {
      throw new SuperDocCliError('doc.tables.split is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex: args.rowIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const splitResult = await splitFn(params);
    const executed: Array<{ operationId: string; result?: unknown }> = [
      { operationId: 'doc.tables.split', result: splitResult },
    ];

    if (args.separatorText) {
      const placement: ReturnType<typeof resolvePlacement> = {
        kind: 'after',
        target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      };
      const sepResult = await executeCreateParagraph(doc, args.separatorText, placement, args.changeMode);
      executed.push({ operationId: 'doc.create.paragraph', result: sepResult });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'split_table',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('split_table', err, pre);
  }
}

export async function agentRecipe(doc: BoundDocApi, args: unknown): Promise<AgentReceipt> {
  if (!isRecord(args)) {
    throw new SuperDocCliError('agent_recipe arguments must be an object', {
      code: 'INVALID_ARGUMENT',
    });
  }
  const recipe = args.recipe;
  if (!isRecipeName(recipe)) {
    throw new SuperDocCliError(`agent_recipe received unknown recipe: ${asString(recipe) ?? String(recipe)}`, {
      code: 'INVALID_ARGUMENT',
      details: { recipe },
    });
  }
  switch (recipe) {
    case 'insert_paragraph': {
      const text = asString(args.text);
      if (!text) {
        throw new SuperDocCliError('insert_paragraph requires a non-empty "text" string', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runInsertParagraph(doc, {
        recipe,
        text,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'insert_paragraphs': {
      const texts = parseStringArray(args.texts);
      if (!texts || texts.length === 0) {
        throw new SuperDocCliError('insert_paragraphs requires a non-empty "texts" array', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const headingLevel = asNumber(args.headingLevel);
      return runInsertParagraphs(doc, {
        recipe,
        texts,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
        headingLevel:
          headingLevel != null && Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6
            ? headingLevel
            : undefined,
      });
    }
    case 'insert_heading': {
      const text = asString(args.text);
      const level = asNumber(args.level);
      if (!text || level == null || !Number.isInteger(level) || level < 1 || level > 6) {
        throw new SuperDocCliError('insert_heading requires "text" string and integer "level" 1-6', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runInsertHeading(doc, {
        recipe,
        text,
        level,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'replace_text': {
      const edits = parseEdits(args.edits);
      if (!edits || edits.length === 0) {
        throw new SuperDocCliError('replace_text requires a non-empty "edits" array of {find, replace}', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const selector = args.selector != null ? parseSelector(args.selector) : undefined;
      if (args.selector != null && selector == null) {
        throw new SuperDocCliError('replace_text: invalid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runReplaceText(doc, {
        recipe,
        edits,
        selector,
        caseSensitive: args.caseSensitive === true,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_text': {
      const finds = parseStringArray(args.finds);
      if (!finds || finds.length === 0) {
        throw new SuperDocCliError('delete_text requires a non-empty "finds" array of strings', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteText(doc, {
        recipe,
        finds,
        caseSensitive: args.caseSensitive === true,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'replace_top_date': {
      const date = asString(args.date);
      if (!date) {
        throw new SuperDocCliError('replace_top_date requires "date"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runReplaceTopDate(doc, {
        recipe,
        date,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'append_list': {
      const items = parseStringArray(args.items);
      if (!items || items.length === 0) {
        throw new SuperDocCliError('append_list requires a non-empty "items" array of strings', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const kindRaw = asString(args.kind);
      const headingLevel = asNumber(args.headingLevel);
      return runAppendList(doc, {
        recipe,
        items,
        kind: kindRaw === 'bullet' ? 'bullet' : 'ordered',
        headingText: asString(args.headingText),
        headingLevel:
          headingLevel != null && Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6
            ? headingLevel
            : undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'insert_list_items': {
      const items = parseStringArray(args.items);
      if (!items || items.length === 0) {
        throw new SuperDocCliError('insert_list_items requires a non-empty "items" array of strings', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const listOrdinal = asNumber(args.listOrdinal);
      return runInsertListItems(doc, {
        recipe,
        items,
        listOrdinal: listOrdinal != null && Number.isInteger(listOrdinal) && listOrdinal >= 1 ? listOrdinal : undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'create_table': {
      const rows = asNumber(args.rows);
      const columns = asNumber(args.columns);
      if (rows == null || columns == null) {
        throw new SuperDocCliError('create_table requires "rows" and "columns" numbers', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runCreateTable(doc, {
        recipe,
        rows,
        columns,
        cellTexts: parseCellTexts(args.cellTexts),
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'comment_paragraphs': {
      const commentText = asString(args.commentText);
      if (!commentText) {
        throw new SuperDocCliError('comment_paragraphs requires a non-empty "commentText" string', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runCommentParagraphs(doc, {
        recipe,
        commentText,
        scope: args.scope === 'all' ? 'all' : 'body',
        excludeBlockQuotes: args.excludeBlockQuotes === true,
      });
    }
    case 'add_comment': {
      const commentText = asString(args.commentText);
      const selector = parseSelector(args.selector);
      if (!commentText || !selector) {
        throw new SuperDocCliError('add_comment requires "commentText" and "selector"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runAddComment(doc, { recipe, commentText, selector });
    }
    case 'rewrite_block': {
      const text = asString(args.text);
      const selector = parseSelector(args.selector);
      if (!text || !selector) {
        throw new SuperDocCliError('rewrite_block requires "text" and "selector"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runRewriteBlock(doc, {
        recipe,
        text,
        selector,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'accept_tracked_changes':
      return runAcceptTrackedChanges(doc, {
        recipe,
        author: asString(args.author),
      });
    case 'reject_tracked_changes':
      return runRejectTrackedChanges(doc, {
        recipe,
        author: asString(args.author),
      });
    case 'normalize_body_font_size': {
      const fontSize = asNumber(args.fontSize);
      if (fontSize == null) {
        throw new SuperDocCliError('normalize_body_font_size requires a numeric "fontSize" (points)', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runNormalizeBodyFontSize(doc, {
        recipe,
        fontSize,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'color_text': {
      const color = asString(args.color);
      if (!color) {
        throw new SuperDocCliError('color_text requires a "color" (named or hex)', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const selector = args.selector != null ? parseSelector(args.selector) : undefined;
      if (args.selector != null && selector == null) {
        throw new SuperDocCliError('color_text: invalid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runColorText(doc, {
        recipe,
        color,
        targetText: asString(args.targetText),
        caseSensitive: args.caseSensitive === true,
        selector,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'apply_letter_spacing': {
      const selector = parseSelector(args.selector);
      const letterSpacing = asNumber(args.letterSpacing);
      if (!selector || letterSpacing == null) {
        throw new SuperDocCliError('apply_letter_spacing requires "selector" and numeric "letterSpacing"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runApplyLetterSpacing(doc, {
        recipe,
        selector,
        letterSpacing,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'fill_placeholders': {
      const values = parseLooseStringArray(args.values);
      const fields = parsePlaceholderFields(args.fields);
      if ((values == null || values.length === 0) && (fields == null || fields.length === 0)) {
        throw new SuperDocCliError('fill_placeholders requires non-empty "values" or "fields"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runFillPlaceholders(doc, {
        recipe,
        values: values ?? undefined,
        fields: fields ?? undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'move_section': {
      const sourceSection = asNumber(args.sourceSection);
      const destinationSection = asNumber(args.destinationSection);
      const position = args.position === 'after' ? 'after' : args.position === 'before' ? 'before' : undefined;
      if (
        sourceSection == null ||
        destinationSection == null ||
        !Number.isInteger(sourceSection) ||
        !Number.isInteger(destinationSection)
      ) {
        throw new SuperDocCliError('move_section requires integer sourceSection and destinationSection', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runMoveSection(doc, {
        recipe,
        sourceSection,
        destinationSection,
        position,
        bottomNote: asString(args.bottomNote),
      });
    }
    case 'insert_toc':
      return runInsertToc(doc, {
        recipe,
        title: asString(args.title),
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    case 'insert_image_with_caption': {
      const src = asString(args.src);
      if (!src) {
        throw new SuperDocCliError('insert_image_with_caption requires a "src" string', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runInsertImageWithCaption(doc, {
        recipe,
        src,
        alt: asString(args.alt),
        caption: asString(args.caption),
        width: asNumber(args.width),
        height: asNumber(args.height),
        sectionBreakBefore: args.sectionBreakBefore === true,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'set_table_shading': {
      const color = asString(args.color);
      const tableOrdinal = asNumber(args.tableOrdinal);
      if (!color) {
        throw new SuperDocCliError('set_table_shading requires "color"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runSetTableShading(doc, {
        recipe,
        color,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'insert_table_row': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      const position =
        args.position === 'before' ||
        args.position === 'after' ||
        args.position === 'above' ||
        args.position === 'below'
          ? args.position
          : undefined;
      const cellTexts = parseLooseStringArray(args.cellTexts);
      return runInsertTableRow(doc, {
        recipe,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex: rowIndex != null && Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : undefined,
        position,
        cellTexts: cellTexts ?? undefined,
        changeMode: parseChangeMode(args.changeMode),
        dryRun: args.dryRun === true,
      });
    }
    case 'insert_table_column': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const columnIndex = asNumber(args.columnIndex);
      const position = args.position === 'left' ? 'left' : args.position === 'right' ? 'right' : undefined;
      return runInsertTableColumn(doc, {
        recipe,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        columnIndex: columnIndex != null && Number.isInteger(columnIndex) && columnIndex >= 0 ? columnIndex : undefined,
        position,
        headerText: asString(args.headerText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_table_row': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      if (rowIndex == null || !Number.isInteger(rowIndex) || rowIndex < 0) {
        throw new SuperDocCliError('delete_table_row requires an integer rowIndex >= 0', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteTableRow(doc, {
        recipe,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_table_column': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const columnIndex = asNumber(args.columnIndex);
      if (columnIndex == null || !Number.isInteger(columnIndex) || columnIndex < 0) {
        throw new SuperDocCliError('delete_table_column requires an integer columnIndex >= 0', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteTableColumn(doc, {
        recipe,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        columnIndex,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'split_table': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      if (rowIndex == null || !Number.isInteger(rowIndex) || rowIndex < 1) {
        throw new SuperDocCliError('split_table requires an integer rowIndex >= 1', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runSplitTable(doc, {
        recipe,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex,
        separatorText: asString(args.separatorText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
  }
}

function parseChangeMode(value: unknown): AgentChangeMode | undefined {
  if (value === 'direct' || value === 'tracked') return value;
  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) return undefined;
    result.push(entry);
  }
  return result;
}

function parseLooseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    result.push(entry);
  }
  return result;
}

function parseEdits(value: unknown): Array<{ find: string; replace: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Array<{ find: string; replace: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    const find = asString(entry.find);
    const replace = asString(entry.replace) ?? '';
    if (!find) return undefined;
    result.push({ find, replace });
  }
  return result;
}

function parseCellTexts(value: unknown): ReadonlyArray<ReadonlyArray<string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return undefined;
    const cells: string[] = [];
    for (const cell of row) {
      if (typeof cell !== 'string') return undefined;
      cells.push(cell);
    }
    result.push(cells);
  }
  return result;
}

function parsePlaceholderFields(value: unknown): Array<{ label?: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Array<{ label?: string; value: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.value !== 'string') return undefined;
    const label = asString(entry.label);
    result.push(label ? { label, value: entry.value } : { value: entry.value });
  }
  return result;
}

function parsePlacement(value: unknown): RecipePlacement | undefined {
  if (!isRecord(value)) return undefined;
  const at = asString(value.at);
  if (at === 'document_end' || at === 'document_start') {
    return { at };
  }
  if (at === 'after' || at === 'before') {
    const selector = parseSelector(value.selector);
    if (!selector) return undefined;
    return { at, selector };
  }
  return undefined;
}

function parseSelector(value: unknown): AgentSelector | undefined {
  if (!isRecord(value)) return undefined;
  const kind = asString(value.kind);
  if (kind === 'nodeId') {
    const nodeId = asString(value.nodeId);
    return nodeId ? { kind: 'nodeId', nodeId } : undefined;
  }
  if (kind === 'ref') {
    const ref = asString(value.ref);
    return ref ? { kind: 'ref', ref } : undefined;
  }
  if (kind === 'ordinal') {
    const ordinalKindStr = asString(value.ordinalKind);
    const numericValue = asNumber(value.value);
    const validOrdinalKinds = new Set([
      'blockOrdinal',
      'paragraphOrdinal',
      'bodyParagraphOrdinal',
      'headingOrdinal',
      'listOrdinal',
      'tableOrdinal',
      'sectionOrdinal',
    ]);
    if (
      !ordinalKindStr ||
      !validOrdinalKinds.has(ordinalKindStr) ||
      numericValue == null ||
      !Number.isInteger(numericValue) ||
      numericValue < 1
    ) {
      return undefined;
    }
    return {
      kind: 'ordinal',
      ordinalKind: ordinalKindStr as Extract<AgentSelector, { kind: 'ordinal' }>['ordinalKind'],
      value: numericValue,
    };
  }
  if (kind === 'tableCell') {
    const tableOrdinal = asNumber(value.tableOrdinal);
    const rowIndex = asNumber(value.rowIndex);
    const columnIndex = asNumber(value.columnIndex);
    if (
      tableOrdinal == null ||
      !Number.isInteger(tableOrdinal) ||
      tableOrdinal < 1 ||
      rowIndex == null ||
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      columnIndex == null ||
      !Number.isInteger(columnIndex) ||
      columnIndex < 0
    ) {
      return undefined;
    }
    return {
      kind: 'tableCell',
      tableOrdinal,
      rowIndex,
      columnIndex,
    };
  }
  if (kind === 'textSearch') {
    const terms = parseStringArray(value.terms);
    const match = asString(value.match);
    const occurrence = asNumber(value.occurrence);
    const caseSensitive = value.caseSensitive === true;
    const nodeTypesRaw = Array.isArray(value.nodeTypes) ? value.nodeTypes : undefined;
    const nodeTypes =
      nodeTypesRaw == null
        ? undefined
        : nodeTypesRaw.every((entry) => entry === 'paragraph' || entry === 'heading' || entry === 'listItem')
          ? (nodeTypesRaw as Array<'paragraph' | 'heading' | 'listItem'>)
          : undefined;
    if (
      !terms ||
      terms.length === 0 ||
      (match != null && match !== 'all' && match !== 'any') ||
      (occurrence != null && (!Number.isInteger(occurrence) || occurrence < 1)) ||
      (nodeTypesRaw != null && nodeTypes == null)
    ) {
      return undefined;
    }
    return {
      kind: 'textSearch',
      terms,
      match: match === 'any' ? 'any' : 'all',
      occurrence: occurrence != null ? occurrence : undefined,
      caseSensitive: caseSensitive || undefined,
      nodeTypes,
    };
  }
  if (kind === 'entity') {
    const entityTypeStr = asString(value.entityType);
    const entityId = asString(value.entityId);
    const validEntities = new Set(['comment', 'trackedChange', 'bookmark', 'image', 'hyperlink', 'field']);
    if (!entityTypeStr || !validEntities.has(entityTypeStr) || !entityId) return undefined;
    return {
      kind: 'entity',
      entityType: entityTypeStr as Extract<AgentSelector, { kind: 'entity' }>['entityType'],
      entityId,
    };
  }
  if (kind === 'document') return { kind: 'document' };
  if (kind === 'placement') {
    const at = asString(value.at);
    if (at !== 'document_start' && at !== 'document_end') return undefined;
    return { kind: 'placement', at };
  }
  if (kind === 'relative') {
    const position = asString(value.position);
    if (position !== 'before' && position !== 'after') return undefined;
    const target = parseSelector(value.target);
    if (!target) return undefined;
    return { kind: 'relative', position, target };
  }
  return undefined;
}

export const RECIPE_NAMES_LIST: readonly RecipeName[] = RECIPE_NAMES;
