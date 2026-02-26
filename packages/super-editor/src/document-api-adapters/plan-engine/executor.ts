/**
 * Atomic execution engine — single-transaction execution with rollback semantics.
 *
 * Phase 2 (execute): apply compiled mutation steps sequentially in one PM
 * transaction, remap positions, evaluate assert steps post-mutation.
 *
 * Supports both single-block (range) and cross-block (span) targets.
 */

import type {
  MutationStep,
  AssertStep,
  TextRewriteStep,
  TextInsertStep,
  TextDeleteStep,
  StyleApplyStep,
  PlanReceipt,
  StepOutcome,
  TextStepData,
  AssertStepData,
  MutationsApplyInput,
  SetMarks,
  ReplacementPayload,
  Query,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CompiledPlan } from './compiler.js';
import type {
  CompiledTarget,
  CompiledRangeTarget,
  CompiledSpanTarget,
  ExecuteContext,
} from './executor-registry.types.js';
import { getStepExecutor } from './executor-registry.js';
import { planError } from './errors.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { compilePlan } from './compiler.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { resolveBlockInsertionPos } from './create-insertion.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from '../helpers/transaction-meta.js';
import { captureRunsInRange, resolveInlineStyle } from './style-resolver.js';
import { mapBlockNodeType } from '../helpers/node-address-resolver.js';
import { resolveWithinScope, scopeByRange } from '../helpers/adapter-utils.js';
import { normalizeReplacementText } from './replacement-normalizer.js';
import { Fragment, Slice } from 'prosemirror-model';
import type { Mark as ProseMirrorMark, MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Mapping } from 'prosemirror-transform';

// ---------------------------------------------------------------------------
// Style resolution helpers
// ---------------------------------------------------------------------------

/** Default inline policy when style is omitted from text.rewrite. */
const DEFAULT_INLINE_POLICY: import('@superdoc/document-api').InlineStylePolicy = {
  mode: 'preserve',
  onNonUniform: 'majority',
};

function asProseMirrorMarks(marks: readonly unknown[]): readonly ProseMirrorMark[] {
  return marks as readonly ProseMirrorMark[];
}

function resolveMarksForRange(editor: Editor, target: CompiledRangeTarget, step: MutationStep): readonly unknown[] {
  if (step.op !== 'text.rewrite') return [];
  const rewriteStep = step as TextRewriteStep;
  const policy = rewriteStep.args.style?.inline ?? DEFAULT_INLINE_POLICY;

  const captured =
    target.capturedStyle ??
    captureRunsInRange(editor, toAbsoluteBlockPos(editor, target.blockId), target.from, target.to);

  return resolveInlineStyle(editor, captured, policy, step.id);
}

function toAbsoluteBlockPos(editor: Editor, blockId: string): number {
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === blockId);
  if (!candidate) throw planError('TARGET_NOT_FOUND', `block "${blockId}" not found in style capture fallback`);
  return candidate.pos;
}

function buildMarksFromSetMarks(editor: Editor, setMarks?: SetMarks): readonly ProseMirrorMark[] {
  if (!setMarks) return [];
  const { schema } = editor.state;
  const marks: ProseMirrorMark[] = [];
  if (setMarks.bold && schema.marks.bold) marks.push(schema.marks.bold.create());
  if (setMarks.italic && schema.marks.italic) marks.push(schema.marks.italic.create());
  if (setMarks.underline && schema.marks.underline) marks.push(schema.marks.underline.create());
  if (setMarks.strike && schema.marks.strike) marks.push(schema.marks.strike.create());
  return marks;
}

// ---------------------------------------------------------------------------
// Shared inline style patch — applies boolean mark patches to a range
// ---------------------------------------------------------------------------

/** Applies boolean inline mark patches (bold, italic, underline, strike) to a document range. */
function applyInlineMarkPatches(
  editor: Editor,
  tr: Transaction,
  absFrom: number,
  absTo: number,
  inline: StyleApplyStep['args']['inline'],
): boolean {
  const { schema } = editor.state;
  let changed = false;

  const markEntries: Array<[boolean | undefined, MarkType | undefined]> = [
    [inline.bold, schema.marks.bold],
    [inline.italic, schema.marks.italic],
    [inline.underline, schema.marks.underline],
    [inline.strike, schema.marks.strike],
  ];

  for (const [value, markType] of markEntries) {
    if (value === undefined || !markType) continue;
    if (value) {
      tr.addMark(absFrom, absTo, markType.create());
    } else {
      tr.removeMark(absFrom, absTo, markType);
    }
    changed = true;
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Block-anchor position resolution for create operations
// ---------------------------------------------------------------------------

/**
 * Derives the anchor block ID for a create step from a compiled target.
 *
 * - range target → the target's blockId directly.
 * - span target  → first segment block for 'before', last segment block for 'after'.
 *   This implements B0 invariant 4: multi-block refs anchor at span boundaries.
 */
function resolveCreateAnchorBlockId(target: CompiledTarget, position: 'before' | 'after', stepId: string): string {
  if (target.kind === 'range') {
    return target.blockId;
  }

  const segments = target.segments;
  if (!segments.length) {
    throw planError('INVALID_INPUT', 'span target has no segments', stepId);
  }

  return position === 'before' ? segments[0].blockId : segments[segments.length - 1].blockId;
}

// ---------------------------------------------------------------------------
// Range target executors (single-block — existing behavior)
// ---------------------------------------------------------------------------

export function executeTextRewrite(
  editor: Editor,
  tr: Transaction,
  target: CompiledRangeTarget,
  step: TextRewriteStep,
  mapping: Mapping,
): { changed: boolean } {
  const absFrom = mapping.map(target.absFrom);
  const absTo = mapping.map(target.absTo);

  const replacementText = getReplacementText(step.args.replacement);
  const marks = resolveMarksForRange(editor, target, step);

  const textNode = editor.state.schema.text(replacementText, asProseMirrorMarks(marks));
  tr.replaceWith(absFrom, absTo, textNode);

  return { changed: replacementText !== target.text };
}

export function executeTextInsert(
  editor: Editor,
  tr: Transaction,
  target: CompiledRangeTarget,
  step: TextInsertStep,
  mapping: Mapping,
): { changed: boolean } {
  const position = step.args.position;
  const absPos = mapping.map(position === 'before' ? target.absFrom : target.absTo);

  const text = step.args.content.text;
  if (!text) return { changed: false };

  let marks: readonly ProseMirrorMark[] = [];
  const stylePolicy = step.args.style?.inline;
  if (stylePolicy) {
    if (stylePolicy.mode === 'set') {
      marks = buildMarksFromSetMarks(editor, stylePolicy.setMarks);
    } else if (stylePolicy.mode === 'clear') {
      marks = [];
    } else {
      const resolvedPos = tr.doc.resolve(absPos);
      marks = resolvedPos.marks();
    }
  } else {
    const resolvedPos = tr.doc.resolve(absPos);
    marks = resolvedPos.marks();
  }

  const textNode = editor.state.schema.text(text, marks);
  tr.insert(absPos, textNode);

  return { changed: true };
}

export function executeTextDelete(
  _editor: Editor,
  tr: Transaction,
  target: CompiledRangeTarget,
  _step: TextDeleteStep,
  mapping: Mapping,
): { changed: boolean } {
  const absFrom = mapping.map(target.absFrom);
  const absTo = mapping.map(target.absTo);

  if (absFrom === absTo) return { changed: false };

  tr.delete(absFrom, absTo);
  return { changed: true };
}

export function executeStyleApply(
  editor: Editor,
  tr: Transaction,
  target: CompiledRangeTarget,
  step: StyleApplyStep,
  mapping: Mapping,
): { changed: boolean } {
  const absFrom = mapping.map(target.absFrom);
  const absTo = mapping.map(target.absTo);
  return { changed: applyInlineMarkPatches(editor, tr, absFrom, absTo, step.args.inline) };
}

// ---------------------------------------------------------------------------
// Span target executors (cross-block)
// ---------------------------------------------------------------------------

/**
 * Validates that mapped span segments are still contiguous and in order.
 * Fails with SPAN_FRAGMENTED if a prior step has disrupted the span.
 */
function validateMappedSpanContiguity(target: CompiledSpanTarget, mapping: Mapping, stepId: string): void {
  let lastMappedEnd = -1;
  let lastOriginalEnd = -1;

  for (const seg of target.segments) {
    const mappedFrom = mapping.map(seg.absFrom, 1);
    const mappedTo = mapping.map(seg.absTo, -1);

    if (mappedFrom > mappedTo) {
      throw planError(
        'SPAN_FRAGMENTED',
        `span target "${target.matchId}" has been fragmented by a prior mutation step`,
        stepId,
        { matchId: target.matchId },
      );
    }

    if (lastMappedEnd >= 0) {
      if (mappedFrom < lastMappedEnd) {
        throw planError(
          'SPAN_FRAGMENTED',
          `span target "${target.matchId}" has been fragmented by a prior mutation step`,
          stepId,
          { matchId: target.matchId },
        );
      }

      const expectedGap = seg.absFrom - lastOriginalEnd;
      const actualGap = mappedFrom - lastMappedEnd;
      if (actualGap !== expectedGap) {
        throw planError(
          'SPAN_FRAGMENTED',
          `span target "${target.matchId}" has been fragmented by a prior mutation step`,
          stepId,
          { matchId: target.matchId },
        );
      }
    }

    lastMappedEnd = mappedTo;
    lastOriginalEnd = seg.absTo;
  }
}

export function executeSpanTextRewrite(
  editor: Editor,
  tr: Transaction,
  target: CompiledSpanTarget,
  step: TextRewriteStep,
  mapping: Mapping,
): { changed: boolean } {
  validateMappedSpanContiguity(target, mapping, step.id);

  const replacementBlocks = resolveReplacementBlocks(step.args.replacement, step.id);
  const policy = step.args.style?.inline ?? DEFAULT_INLINE_POLICY;

  // Replace the entire span (first segment start → last segment end)
  const firstSeg = target.segments[0];
  const lastSeg = target.segments[target.segments.length - 1];
  const absFrom = mapping.map(firstSeg.absFrom, 1);
  const absTo = mapping.map(lastSeg.absTo, -1);

  // Build replacement content: one text node per block, separated by paragraph nodes
  // For single replacement block, use flat replacement into the span
  if (replacementBlocks.length === 1) {
    const marks = resolveSpanMarks(editor, target, policy, step.id);
    const textNode = editor.state.schema.text(replacementBlocks[0], asProseMirrorMarks(marks));
    tr.replaceWith(absFrom, absTo, textNode);
    return { changed: true };
  }

  // Multi-block replacement: build paragraph nodes
  const { schema } = editor.state;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) {
    throw planError('INVALID_INPUT', 'paragraph node type not in schema', step.id);
  }

  const nodes: ProseMirrorNode[] = [];
  for (let i = 0; i < replacementBlocks.length; i++) {
    const segmentIndex = Math.min(i, target.segments.length - 1);
    const marks = resolveSegmentMarks(editor, target, segmentIndex, policy, step.id);
    const paragraphAttrs = resolveInheritedParagraphAttrsForReplacement(editor, target, segmentIndex);

    const text = replacementBlocks[i];
    const textNode = text.length > 0 ? schema.text(text, asProseMirrorMarks(marks)) : null;
    const para =
      paragraphType.createAndFill(paragraphAttrs, textNode ?? undefined) ??
      paragraphType.create(paragraphAttrs, textNode ? [textNode] : undefined);
    nodes.push(para);
  }

  const slice = new Slice(Fragment.from(nodes), 1, 1);
  tr.replace(absFrom, absTo, slice);

  return { changed: true };
}

export function executeSpanTextDelete(
  _editor: Editor,
  tr: Transaction,
  target: CompiledSpanTarget,
  step: TextDeleteStep,
  mapping: Mapping,
): { changed: boolean } {
  validateMappedSpanContiguity(target, mapping, step.id);

  const firstSeg = target.segments[0];
  const lastSeg = target.segments[target.segments.length - 1];
  const absFrom = mapping.map(firstSeg.absFrom, 1);
  const absTo = mapping.map(lastSeg.absTo, -1);

  if (absFrom === absTo) return { changed: false };

  tr.delete(absFrom, absTo);
  return { changed: true };
}

export function executeSpanStyleApply(
  editor: Editor,
  tr: Transaction,
  target: CompiledSpanTarget,
  step: StyleApplyStep,
  mapping: Mapping,
): { changed: boolean } {
  validateMappedSpanContiguity(target, mapping, step.id);

  // Apply marks uniformly across the full span
  const firstSeg = target.segments[0];
  const lastSeg = target.segments[target.segments.length - 1];
  const absFrom = mapping.map(firstSeg.absFrom, 1);
  const absTo = mapping.map(lastSeg.absTo, -1);

  return { changed: applyInlineMarkPatches(editor, tr, absFrom, absTo, step.args.inline) };
}

// ---------------------------------------------------------------------------
// Replacement helpers
// ---------------------------------------------------------------------------

/** Extract flat replacement text from the payload (for single-block range targets). */
function getReplacementText(replacement: ReplacementPayload): string {
  if (replacement.blocks !== undefined) {
    return replacement.blocks.map((b) => b.text).join('\n\n');
  }
  if (replacement.text == null) {
    throw planError('INVALID_INPUT', 'replacement must specify either text or blocks');
  }
  return replacement.text;
}

/** Resolve replacement into an array of paragraph text strings. */
function resolveReplacementBlocks(replacement: ReplacementPayload, stepId: string): string[] {
  if (replacement.blocks !== undefined) {
    if (replacement.blocks.length === 0) {
      throw planError('INVALID_INPUT', 'replacement.blocks must contain at least one entry', stepId);
    }
    return replacement.blocks.map((b) => b.text);
  }

  // Flat text → normalize via D3 rules for span targets
  if (replacement.text == null) {
    throw planError('INVALID_INPUT', 'replacement must specify either text or blocks', stepId);
  }
  return normalizeReplacementText(replacement.text, stepId);
}

function resolveInheritedParagraphAttrsForReplacement(
  editor: Editor,
  target: CompiledSpanTarget,
  segmentIndex: number,
): Record<string, unknown> | null {
  const sourceSegment = target.segments[Math.min(segmentIndex, target.segments.length - 1)];
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === sourceSegment.blockId);
  const sourceAttrs = candidate?.node?.attrs;

  if (!sourceAttrs || typeof sourceAttrs !== 'object') {
    return null;
  }

  const attrs = { ...(sourceAttrs as Record<string, unknown>) };
  delete attrs.paraId;
  delete attrs.sdBlockId;
  delete attrs.nodeId;
  delete attrs.id;
  delete attrs.blockId;
  delete attrs.uuid;

  return Object.keys(attrs).length > 0 ? attrs : null;
}

// ---------------------------------------------------------------------------
// Span style resolution (D5)
// ---------------------------------------------------------------------------

/** Resolve marks for a single-block replacement of a span target. */
function resolveSpanMarks(
  editor: Editor,
  target: CompiledSpanTarget,
  policy: import('@superdoc/document-api').InlineStylePolicy,
  stepId: string,
): readonly unknown[] {
  if (policy.mode === 'set') {
    return buildMarksFromSetMarks(editor, policy.setMarks);
  }
  if (policy.mode === 'clear') {
    return [];
  }

  // preserve/merge: weighted majority across all segments
  if (!target.capturedStyleBySegment?.length) return [];

  // Flatten all runs across segments for global majority
  const allRuns = target.capturedStyleBySegment.flatMap((cs) => cs.runs);
  const combined = { runs: allRuns, isUniform: allRuns.length <= 1 };
  return resolveInlineStyle(editor, combined, policy, stepId);
}

/** Resolve marks for a specific replacement block mapped to a source segment. */
function resolveSegmentMarks(
  editor: Editor,
  target: CompiledSpanTarget,
  segmentIndex: number,
  policy: import('@superdoc/document-api').InlineStylePolicy,
  stepId: string,
): readonly unknown[] {
  if (policy.mode === 'set') {
    return buildMarksFromSetMarks(editor, policy.setMarks);
  }
  if (policy.mode === 'clear') {
    return [];
  }

  if (!target.capturedStyleBySegment?.length) return [];

  const captured = target.capturedStyleBySegment[segmentIndex];
  if (!captured) return [];

  return resolveInlineStyle(editor, captured, policy, stepId);
}

// ---------------------------------------------------------------------------
// Assert step evaluation
// ---------------------------------------------------------------------------

function countTextMatches(text: string, pattern: string, mode: string, caseSensitive: boolean): number {
  if (mode === 'regex') {
    if (pattern.length > 1024) return 0;
    const flags = caseSensitive ? 'g' : 'gi';
    try {
      const regex = new RegExp(pattern, flags);
      const matches = text.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = searchText.indexOf(searchPattern, pos);
    if (idx === -1) break;
    count++;
    pos = idx + 1;
  }
  return count;
}

type AssertIndexCandidate = {
  node: ProseMirrorNode;
  pos: number;
  end: number;
  nodeType: Exclude<ReturnType<typeof mapBlockNodeType>, undefined>;
  nodeId: string;
};

type AssertIndex = {
  candidates: AssertIndexCandidate[];
  byId: Map<string, AssertIndexCandidate>;
  ambiguous: ReadonlySet<string>;
};

function asId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveAssertNodeId(node: ProseMirrorNode, mappedType: AssertIndexCandidate['nodeType']): string | undefined {
  const attrs = node.attrs ?? {};
  if (mappedType === 'paragraph' || mappedType === 'heading' || mappedType === 'listItem') {
    return asId(attrs.paraId) ?? asId(attrs.sdBlockId) ?? asId(attrs.nodeId);
  }
  return (
    asId(attrs.blockId) ??
    asId(attrs.id) ??
    asId(attrs.paraId) ??
    asId(attrs.uuid) ??
    asId(attrs.sdBlockId) ??
    asId(attrs.nodeId)
  );
}

function buildAssertIndex(doc: ProseMirrorNode): AssertIndex {
  const candidates: AssertIndexCandidate[] = [];
  const byId = new Map<string, AssertIndexCandidate>();
  const ambiguous = new Set<string>();

  function registerKey(key: string, candidate: AssertIndexCandidate): void {
    if (byId.has(key)) {
      ambiguous.add(key);
      byId.delete(key);
      return;
    }
    if (!ambiguous.has(key)) {
      byId.set(key, candidate);
    }
  }

  doc.descendants((node: ProseMirrorNode, pos: number) => {
    const nodeType = mapBlockNodeType(node);
    if (!nodeType) return true;
    const nodeId = resolveAssertNodeId(node, nodeType);
    if (!nodeId) return true;

    const candidate: AssertIndexCandidate = {
      node,
      pos,
      end: pos + node.nodeSize,
      nodeType,
      nodeId,
    };

    candidates.push(candidate);
    registerKey(`${nodeType}:${nodeId}`, candidate);

    if (nodeType === 'paragraph' || nodeType === 'heading' || nodeType === 'listItem') {
      const aliasId = asId(node.attrs?.sdBlockId);
      if (aliasId && aliasId !== nodeId) {
        registerKey(`${nodeType}:${aliasId}`, candidate);
      }
    }

    return true;
  });

  return { candidates, byId, ambiguous };
}

function resolveAssertScope(
  index: AssertIndex,
  select: AssertStep['where']['select'],
  within: AssertStep['where']['within'],
): { ok: true; range: { start: number; end: number } | undefined } | { ok: false } {
  if (!within) return { ok: true, range: undefined };
  const query: Query = { select, within };
  const scope = resolveWithinScope(index, query, []);
  if (!scope.ok) return { ok: false };
  return { ok: true, range: scope.range };
}

function countNodeMatchesInDoc(
  doc: ProseMirrorNode,
  selector: Exclude<AssertStep['where']['select'], { type: 'text' }>,
  within: AssertStep['where']['within'],
): number {
  const index = buildAssertIndex(doc);
  const scope = resolveAssertScope(index, selector, within);
  if (!scope.ok) return 0;

  if (selector.kind && selector.kind !== 'block') return 0;

  const scoped = scopeByRange(index.candidates, scope.range);
  let count = 0;
  for (const candidate of scoped) {
    if (selector.nodeType && candidate.nodeType !== selector.nodeType) continue;
    count++;
  }
  return count;
}

function resolveScopedTextForAssert(
  doc: ProseMirrorNode,
  selector: Extract<AssertStep['where']['select'], { type: 'text' }>,
  within: AssertStep['where']['within'],
): string {
  const index = buildAssertIndex(doc);
  const scope = resolveAssertScope(index, selector, within);
  if (!scope.ok) return '';
  if (!scope.range) return doc.textContent;

  return doc.textBetween(scope.range.start, scope.range.end, '\n', '\ufffc');
}

function executeAssertStep(
  _editor: Editor,
  tr: Transaction,
  step: AssertStep,
): { passed: boolean; actualCount: number } {
  const where = step.where;
  if (where.by !== 'select') {
    throw planError('INVALID_INPUT', `assert steps only support by: 'select'`, step.id);
  }

  const selector = where.select;
  if (selector.type !== 'text') {
    const count = countNodeMatchesInDoc(tr.doc, selector, where.within);
    return { passed: count === step.args.expectCount, actualCount: count };
  }

  const text = resolveScopedTextForAssert(tr.doc, selector, where.within);
  const pattern = selector.pattern;
  const mode = selector.mode ?? 'contains';
  const caseSensitive = selector.caseSensitive ?? false;
  const count = countTextMatches(text, pattern, mode, caseSensitive);
  return { passed: count === step.args.expectCount, actualCount: count };
}

// ---------------------------------------------------------------------------
// Domain step executors — create operations
// ---------------------------------------------------------------------------

export function executeCreateStep(
  editor: Editor,
  tr: Transaction,
  step: MutationStep,
  targets: CompiledTarget[],
  mapping: Mapping,
): StepOutcome {
  const target = targets[0];
  if (!target) {
    throw planError('INVALID_INPUT', `${step.op} step requires at least one target`, step.id);
  }

  const args = step.args as Record<string, unknown>;
  const position = (args.position as 'before' | 'after') ?? 'after';

  // Derive anchor block from target kind:
  //   range  → target.blockId directly
  //   span   → first segment for 'before', last segment for 'after'
  const anchorBlockId = resolveCreateAnchorBlockId(target, position, step.id);

  // Create ops use block-anchor semantics: insert at block boundaries, never mid-text.
  // target.from/target.to (text-model offsets) are intentionally ignored.
  const anchorPos = resolveBlockInsertionPos(editor, anchorBlockId, position, step.id);
  const pos = mapping.map(anchorPos);

  const paragraphType = editor.state.schema?.nodes?.paragraph;
  if (!paragraphType) {
    throw planError('INVALID_INPUT', 'paragraph node type not in schema', step.id);
  }

  const sdBlockId = args.sdBlockId as string | undefined;
  const text = (args.text as string) ?? '';
  const textNode = text.length > 0 ? editor.state.schema.text(text) : null;

  let attrs: Record<string, unknown> | undefined;
  if (step.op === 'create.heading') {
    const level = (args.level as number) ?? 1;
    attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      paragraphProperties: { styleId: `Heading${level}` },
    };
  } else {
    attrs = sdBlockId ? { sdBlockId } : undefined;
  }

  const node =
    paragraphType.createAndFill(attrs, textNode ?? undefined) ??
    paragraphType.create(attrs, textNode ? [textNode] : undefined);

  if (!node) {
    throw planError('INVALID_INPUT', `could not create ${step.op} node`, step.id);
  }

  tr.insert(pos, node);

  // E1: Verify no duplicate block IDs after insertion
  assertNoPostInsertDuplicateIds(tr.doc, step.id);

  return {
    stepId: step.id,
    op: step.op,
    effect: 'changed',
    matchCount: 1,
    data: { domain: 'text', resolutions: [] } as TextStepData,
  };
}

// ---------------------------------------------------------------------------
// Block identity invariant check (Workstream E)
// ---------------------------------------------------------------------------

/**
 * Walks the post-mutation document and asserts no two blocks share the same
 * identity (paraId/sdBlockId/nodeId). Called after every create-step insertion.
 */
function assertNoPostInsertDuplicateIds(doc: ProseMirrorNode, stepId: string): void {
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();

  doc.descendants((node: ProseMirrorNode) => {
    // Only check textblock nodes (paragraphs, headings) — skip containers (tables, blockquotes)
    if (!node.isTextblock) return true;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const id =
      (typeof attrs.paraId === 'string' && attrs.paraId) ||
      (typeof attrs.sdBlockId === 'string' && attrs.sdBlockId) ||
      (typeof attrs.nodeId === 'string' && attrs.nodeId);

    if (!id) return true;

    if (seen.has(id)) {
      duplicateSet.add(id);
    } else {
      seen.add(id);
    }
    return true;
  });

  if (duplicateSet.size > 0) {
    const duplicates = [...duplicateSet];
    throw planError(
      'INTERNAL_ERROR',
      `create step produced duplicate block identities: [${duplicates.join(', ')}]`,
      stepId,
      {
        source: 'executor:checkPostInsertIdentityUniqueness',
        invariant: 'post-insert block IDs must be unique',
        duplicateBlockIds: duplicates,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Shared execution core — used by both executePlan and previewPlan
// ---------------------------------------------------------------------------

export function runMutationsOnTransaction(
  editor: Editor,
  tr: Transaction,
  compiled: CompiledPlan,
  options: { throwOnAssertFailure: boolean },
): {
  stepOutcomes: StepOutcome[];
  assertFailures: Array<{ stepId: string; expectedCount: number; actualCount: number }>;
  commandDispatched: boolean;
} {
  const mapping = tr.mapping;
  const stepOutcomes: StepOutcome[] = [];
  const assertFailures: Array<{ stepId: string; expectedCount: number; actualCount: number }> = [];

  const ctx: ExecuteContext = {
    editor,
    tr,
    mapping,
    changeMode: 'direct',
    planGroupId: '',
    commandDispatched: false,
  };

  for (const compiledStep of compiled.mutationSteps) {
    const { step, targets } = compiledStep;
    const executor = getStepExecutor(step.op);
    if (!executor) {
      throw planError('INVALID_INPUT', `unsupported step op "${step.op}"`, step.id);
    }
    const outcome = executor.execute(ctx, targets, step);
    stepOutcomes.push(outcome);
  }

  for (const assertStep of compiled.assertSteps) {
    const { passed, actualCount } = executeAssertStep(editor, tr, assertStep);

    if (!passed) {
      if (options.throwOnAssertFailure) {
        throw planError(
          'PRECONDITION_FAILED',
          `assert "${assertStep.id}" expected ${assertStep.args.expectCount} matches but found ${actualCount}`,
          assertStep.id,
          { expectedCount: assertStep.args.expectCount, actualCount },
        );
      }
      assertFailures.push({ stepId: assertStep.id, expectedCount: assertStep.args.expectCount, actualCount });
    }

    const data: AssertStepData = {
      domain: 'assert',
      expectedCount: assertStep.args.expectCount,
      actualCount,
    };

    stepOutcomes.push({
      stepId: assertStep.id,
      op: 'assert',
      effect: passed ? 'assert_passed' : 'assert_failed',
      matchCount: actualCount,
      data,
    });
  }

  return { stepOutcomes, assertFailures, commandDispatched: ctx.commandDispatched };
}

// ---------------------------------------------------------------------------
// Shared post-compilation execution
// ---------------------------------------------------------------------------

export interface ExecuteCompiledOptions {
  changeMode?: 'direct' | 'tracked';
  expectedRevision?: string;
}

export function executeCompiledPlan(
  editor: Editor,
  compiled: CompiledPlan,
  options: ExecuteCompiledOptions = {},
): PlanReceipt {
  const startTime = performance.now();
  const revisionBefore = getRevision(editor);

  checkRevision(editor, options.expectedRevision);

  // D3: Detect revision drift between compile and execute
  if (compiled.compiledRevision !== revisionBefore) {
    throw planError(
      'REVISION_CHANGED_SINCE_COMPILE',
      `Document revision changed between compile and execute. Compiled at "${compiled.compiledRevision}", now at "${revisionBefore}".`,
      undefined,
      {
        compiledRevision: compiled.compiledRevision,
        currentRevision: revisionBefore,
        stepCount: compiled.mutationSteps.length,
        failedAtStep: 'pre-execution',
        remediation: 'Re-compile the plan against the current document state.',
      },
    );
  }

  const tr = editor.state.tr;
  const changeMode = options.changeMode ?? 'direct';

  if (changeMode === 'tracked') {
    applyTrackedMutationMeta(tr);
  } else {
    applyDirectMutationMeta(tr);
  }

  const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: true });

  if (tr.docChanged) {
    editor.dispatch(tr);
  }

  const revisionAfter = getRevision(editor);
  const totalMs = performance.now() - startTime;

  return {
    success: true,
    revision: {
      before: revisionBefore,
      after: revisionAfter,
    },
    steps: stepOutcomes,
    timing: { totalMs },
  };
}

// ---------------------------------------------------------------------------
// Main execution entry point (selector-based plans)
// ---------------------------------------------------------------------------

export function executePlan(editor: Editor, input: MutationsApplyInput): PlanReceipt {
  if (!input.steps?.length) {
    throw planError('INVALID_INPUT', 'plan must contain at least one step');
  }

  const compiled = compilePlan(editor, input.steps);

  return executeCompiledPlan(editor, compiled, {
    changeMode: input.changeMode ?? 'direct',
    expectedRevision: input.expectedRevision,
  });
}
