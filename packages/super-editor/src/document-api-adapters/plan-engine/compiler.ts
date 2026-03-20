/**
 * Plan compiler — resolves step selectors against pre-mutation document state.
 *
 * Phase 1 (compile): resolve all mutation step selectors, capture style data,
 * detect overlapping targets. Supports both single-block (range) and
 * cross-block (span) targets via a discriminated union.
 */

import type {
  MutationStep,
  AssertStep,
  TextSelector,
  NodeSelector,
  SelectWhere,
  RefWhere,
  TargetWhere,
  TextAddress,
} from '@superdoc/document-api';
import { MAX_PLAN_STEPS, MAX_PLAN_RESOLVED_TARGETS, isPublicMutationStepOp } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type {
  CompiledTarget,
  CompiledRangeTarget,
  CompiledSpanTarget,
  CompiledSelectionTarget,
  CompiledSegment,
} from './executor-registry.types.js';
import { decodeRef, type StoryRefV4 } from '../story-runtime/story-ref-codec.js';
import { planError } from './errors.js';
import { hasStepExecutor } from './executor-registry.js';
import { captureRunsInRange, checkUniformity, type CapturedStyle } from './style-resolver.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { getRevision } from './revision-tracker.js';
import { executeTextSelector } from '../find/text-strategy.js';
import { executeBlockSelector } from '../find/block-strategy.js';
import {
  isTextBlockCandidate,
  resolveBlockAlias,
  type BlockCandidate,
  type BlockIndex,
} from '../helpers/node-address-resolver.js';
import { resolveTextRangeInBlock } from '../helpers/text-offset-resolver.js';
import { resolveSelectionTarget, resolveSelectionPointPosition } from '../helpers/selection-target-resolver.js';
import { expandDeleteSelection } from '../helpers/expand-delete-selection.js';

export interface CompiledStep {
  step: MutationStep;
  targets: CompiledTarget[];
}

export interface CompiledPlan {
  mutationSteps: CompiledStep[];
  assertSteps: AssertStep[];
  /** Document revision captured at compile start — used by executor to detect drift. */
  compiledRevision: string;
}

function isAssertStep(step: MutationStep): step is AssertStep {
  return step.op === 'assert';
}

function isCreateOp(op: string): boolean {
  return op === 'create.heading' || op === 'create.paragraph';
}

/** Valid position values for create operations. */
const VALID_CREATE_POSITIONS = ['before', 'after'] as const;

function isSelectWhere(where: MutationStep['where']): where is SelectWhere {
  return where.by === 'select';
}

function isRefWhere(where: MutationStep['where']): where is RefWhere {
  return where.by === 'ref';
}

function isTargetWhere(where: MutationStep['where']): where is TargetWhere {
  return where.by === 'target';
}

// ---------------------------------------------------------------------------
// Create-step position validation
// ---------------------------------------------------------------------------

/**
 * Validates and defaults the `args.position` field for create operations.
 * Mutates the step's args to apply the default when position is omitted.
 */
function validateCreateStepPosition(step: MutationStep): void {
  const args = step.args as Record<string, unknown>;
  if (args.position === undefined || args.position === null) {
    args.position = 'after';
    return;
  }
  if (!(VALID_CREATE_POSITIONS as readonly string[]).includes(args.position as string)) {
    throw planError('INVALID_INPUT', `create step requires args.position to be 'before' or 'after'`, step.id, {
      receivedPosition: args.position,
      allowedValues: [...VALID_CREATE_POSITIONS],
      default: 'after',
    });
  }
}

// ---------------------------------------------------------------------------
// Create-step insertion context validation
// ---------------------------------------------------------------------------

/**
 * Resolves the anchor block ID from a compiled target for create operations.
 * - range target → target.blockId directly
 * - span target → first segment for 'before', last segment for 'after'
 */
function resolveCreateAnchorFromTargets(
  targets: CompiledTarget[],
  position: 'before' | 'after',
  stepId: string,
): string {
  const target = targets[0];
  if (!target) throw planError('INVALID_INPUT', 'create step has no resolved targets', stepId);

  if (target.kind === 'range') return target.blockId;

  if (target.kind === 'span') {
    const segments = target.segments;
    if (!segments.length) throw planError('INVALID_INPUT', 'span target has no segments', stepId);
    return position === 'before' ? segments[0].blockId : segments[segments.length - 1].blockId;
  }

  // CompiledSelectionTarget — create ops should not typically receive these,
  // but handle gracefully. Use segments if available.
  if (target.segments && target.segments.length > 0) {
    return position === 'before' ? target.segments[0].blockId : target.segments[target.segments.length - 1].blockId;
  }
  throw planError('INVALID_INPUT', 'selection target has no block identity for create anchor', stepId);
}

/**
 * Validates that the anchor block's parent node accepts a paragraph child
 * at the computed insertion slot.
 *
 * Both create.heading and create.paragraph create paragraph-type PM nodes,
 * so this check is schema-based paragraph legality only.
 *
 * Uses `parent.canReplaceWith(index, index, paragraphType)` to validate at
 * the actual insertion position rather than the parent's start-state content
 * match — this correctly handles ordered content expressions where a node
 * type may be allowed at some sibling indices but not others.
 *
 * Throws INVALID_INSERTION_CONTEXT at compile time for invalid parent contexts
 * (e.g., inserting inside a node type that doesn't allow paragraph children).
 */
function validateInsertionContext(
  editor: Editor,
  index: BlockIndex,
  step: MutationStep,
  stepIndex: number,
  anchorBlockId: string,
  position: 'before' | 'after',
): void {
  const candidate = index.candidates.find((c) => c.nodeId === anchorBlockId);
  if (!candidate) return; // TARGET_NOT_FOUND will be thrown elsewhere

  const paragraphType = editor.state.schema?.nodes?.paragraph;
  if (!paragraphType) return; // Schema check will fail in executor

  const resolvedPos = editor.state.doc.resolve(candidate.pos);
  const parent = resolvedPos.parent;

  // Compute the sibling index at the actual insertion slot:
  // 'before' inserts at the anchor's index; 'after' inserts one past it.
  const anchorIndex = resolvedPos.index();
  const insertionIndex = position === 'before' ? anchorIndex : anchorIndex + 1;

  // canReplaceWith checks content expression validity at the specific slot
  const canInsert =
    typeof parent.canReplaceWith === 'function'
      ? parent.canReplaceWith(insertionIndex, insertionIndex, paragraphType)
      : parent.type.contentMatch.matchType(paragraphType);

  if (!canInsert) {
    const allowedChildTypes: string[] = [];
    // Walk the content expression to collect allowed types
    const match = parent.type.contentMatch;
    for (const nodeType of Object.values(editor.state.schema.nodes)) {
      if (match.matchType(nodeType)) {
        allowedChildTypes.push(nodeType.name);
      }
    }

    throw planError('INVALID_INSERTION_CONTEXT', `Cannot create ${step.op} inside ${parent.type.name}`, step.id, {
      stepIndex,
      stepId: step.id,
      operation: step.op,
      anchorBlockId,
      parentType: parent.type.name,
      allowedChildTypes,
      insertionIndex,
      requestedChildType: 'paragraph',
      requestedSemanticType: step.op === 'create.heading' ? 'heading' : 'paragraph',
    });
  }
}

// ---------------------------------------------------------------------------
// Text ref payload versions
// ---------------------------------------------------------------------------

/** V3: scope-aware ref with match/block/run targeting (D6). */
interface TextRefV3 {
  v: 3;
  rev: string;
  matchId: string;
  scope: 'match' | 'block' | 'run';
  segments: Array<{ blockId: string; start: number; end: number }>;
  blockIndex?: number;
  runIndex?: number;
}

function isV3Ref(payload: unknown): payload is TextRefV3 {
  return (
    typeof payload === 'object' && payload !== null && 'v' in payload && (payload as Record<string, unknown>).v === 3
  );
}

// ---------------------------------------------------------------------------
// Resolved address (intermediate) for selector resolution
// ---------------------------------------------------------------------------

interface ResolvedAddress {
  blockId: string;
  from: number;
  to: number;
  text: string;
  marks: readonly unknown[];
  blockPos: number;
}

// ---------------------------------------------------------------------------
// Absolute position resolver — used at compile time
// ---------------------------------------------------------------------------

function resolveAbsoluteRange(
  editor: Editor,
  candidate: Pick<BlockCandidate, 'node' | 'pos'>,
  from: number,
  to: number,
  stepId: string,
): { absFrom: number; absTo: number } {
  const resolved = resolveTextRangeInBlock(candidate.node, candidate.pos, { start: from, end: to });
  if (!resolved) {
    throw planError('INVALID_INPUT', `text offset [${from}, ${to}) out of range in block`, stepId);
  }
  return { absFrom: resolved.from, absTo: resolved.to };
}

// ---------------------------------------------------------------------------
// Single-block range normalizer — delegates to normalizeMatchSpan (D12)
// ---------------------------------------------------------------------------

/**
 * Coalesces text ranges from a single logical match into one contiguous range.
 * All ranges must belong to the same block.
 */
export function normalizeMatchRanges(
  stepId: string,
  ranges: TextAddress[],
): { blockId: string; from: number; to: number } {
  const span = normalizeMatchSpan(stepId, ranges);

  if (span.kind === 'cross-block') {
    throw planError('CROSS_BLOCK_MATCH', `mutation target spans multiple blocks`, stepId, {
      blockIds: span.segments.map((s) => s.blockId),
    });
  }

  return { blockId: span.blockId, from: span.from, to: span.to };
}

// ---------------------------------------------------------------------------
// Span normalizer — handles both single-block and cross-block matches (D12)
// ---------------------------------------------------------------------------

type SingleBlockSpan = { kind: 'single-block'; blockId: string; from: number; to: number };
type CrossBlockSpan = { kind: 'cross-block'; segments: Array<{ blockId: string; from: number; to: number }> };
type NormalizedSpan = SingleBlockSpan | CrossBlockSpan;

/**
 * Normalizes an array of text ranges from a single logical match into either
 * a contiguous single-block range or ordered cross-block segments.
 *
 * Validation rules:
 * - Per-range bounds must be valid (non-negative, start <= end).
 * - Within each block, ranges must be contiguous (no gaps).
 */
export function normalizeMatchSpan(stepId: string, ranges: TextAddress[]): NormalizedSpan {
  if (ranges.length === 0) {
    throw planError('INVALID_INPUT', 'logical match produced zero ranges', stepId);
  }

  // Validate per-range bounds
  for (const r of ranges) {
    if (r.range.start < 0 || r.range.end < r.range.start) {
      throw planError(
        'INVALID_INPUT',
        `invalid range bounds [${r.range.start}, ${r.range.end}) in block "${r.blockId}"`,
        stepId,
      );
    }
  }

  // Group ranges by blockId, preserving encounter order
  const byBlock = groupRangesByBlock(ranges);
  const blockIds = [...byBlock.keys()];

  if (blockIds.length === 1) {
    const blockId = blockIds[0];
    const coalesced = coalesceBlockRanges(stepId, blockId, byBlock.get(blockId)!);
    return { kind: 'single-block', blockId, from: coalesced.from, to: coalesced.to };
  }

  // Cross-block: coalesce within each block, return ordered segments
  const segments: Array<{ blockId: string; from: number; to: number }> = [];
  for (const blockId of blockIds) {
    const coalesced = coalesceBlockRanges(stepId, blockId, byBlock.get(blockId)!);
    segments.push({ blockId, from: coalesced.from, to: coalesced.to });
  }

  return { kind: 'cross-block', segments };
}

function groupRangesByBlock(ranges: TextAddress[]): Map<string, TextAddress[]> {
  const byBlock = new Map<string, TextAddress[]>();
  for (const r of ranges) {
    let group = byBlock.get(r.blockId);
    if (!group) {
      group = [];
      byBlock.set(r.blockId, group);
    }
    group.push(r);
  }
  return byBlock;
}

/** Coalesce contiguous/adjacent ranges within a single block. */
function coalesceBlockRanges(stepId: string, blockId: string, ranges: TextAddress[]): { from: number; to: number } {
  if (ranges.length === 1) {
    return { from: ranges[0].range.start, to: ranges[0].range.end };
  }

  const sorted = [...ranges].sort((a, b) => a.range.start - b.range.start);
  const from = sorted[0].range.start;
  let to = sorted[0].range.end;

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.range.start > to) {
      throw planError(
        'INVALID_INPUT',
        `match ranges are discontiguous within block "${blockId}" (gap between offset ${to} and ${r.range.start})`,
        stepId,
      );
    }
    if (r.range.end > to) to = r.range.end;
  }

  return { from, to };
}

// ---------------------------------------------------------------------------
// Compile a single target from a resolved address → CompiledRangeTarget
// ---------------------------------------------------------------------------

function buildRangeTarget(
  editor: Editor,
  step: MutationStep,
  addr: ResolvedAddress,
  candidate: Pick<BlockCandidate, 'node' | 'pos'>,
): CompiledRangeTarget {
  const abs = resolveAbsoluteRange(editor, candidate, addr.from, addr.to, step.id);
  const capturedStyle =
    step.op === 'text.rewrite' || step.op === 'format.apply'
      ? captureRunsInRange(editor, candidate.pos, addr.from, addr.to)
      : undefined;

  return {
    kind: 'range',
    stepId: step.id,
    op: step.op,
    blockId: addr.blockId,
    from: addr.from,
    to: addr.to,
    absFrom: abs.absFrom,
    absTo: abs.absTo,
    text: addr.text,
    marks: addr.marks,
    capturedStyle,
  };
}

// ---------------------------------------------------------------------------
// Compile span target from cross-block segments → CompiledSpanTarget
// ---------------------------------------------------------------------------

function buildSpanTarget(
  editor: Editor,
  index: BlockIndex,
  step: MutationStep,
  segments: Array<{ blockId: string; from: number; to: number }>,
  matchId: string,
): CompiledSpanTarget {
  // Validate segment ordering and contiguity in document order
  validateSegmentOrder(editor, index, segments, step.id);

  const compiledSegments: CompiledSegment[] = [];
  const capturedStyles = [];
  const textParts: string[] = [];

  for (const seg of segments) {
    const candidate = index.candidates.find((c) => c.nodeId === seg.blockId);
    if (!candidate) {
      throw planError('INVALID_INPUT', `block "${seg.blockId}" not found for span segment`, step.id);
    }

    const abs = resolveAbsoluteRange(editor, candidate, seg.from, seg.to, step.id);
    compiledSegments.push({
      blockId: seg.blockId,
      from: seg.from,
      to: seg.to,
      absFrom: abs.absFrom,
      absTo: abs.absTo,
    });

    const blockText = getBlockText(editor, candidate);
    textParts.push(blockText.slice(seg.from, seg.to));

    if (step.op === 'text.rewrite' || step.op === 'format.apply') {
      capturedStyles.push(captureRunsInRange(editor, candidate.pos, seg.from, seg.to));
    }
  }

  return {
    kind: 'span',
    stepId: step.id,
    op: step.op,
    matchId,
    segments: compiledSegments,
    text: textParts.join(''),
    marks: [],
    capturedStyleBySegment: capturedStyles.length > 0 ? capturedStyles : undefined,
  };
}

/** Validates segments are in strict document order with no overlap or unknown blocks. */
function validateSegmentOrder(
  _editor: Editor,
  index: BlockIndex,
  segments: Array<{ blockId: string; from: number; to: number }>,
  stepId: string,
): void {
  const orderedCandidates = [...index.candidates].sort((a, b) => a.pos - b.pos);
  const orderByBlockId = new Map<string, number>();
  for (let i = 0; i < orderedCandidates.length; i++) {
    const id = orderedCandidates[i].nodeId;
    if (!orderByBlockId.has(id)) {
      orderByBlockId.set(id, i);
    }
  }

  let lastOrder = -1;
  let previousBlockId: string | undefined;

  for (const seg of segments) {
    const candidate = index.candidates.find((c) => c.nodeId === seg.blockId);
    if (!candidate) {
      throw planError('INVALID_INPUT', `unknown block "${seg.blockId}" in span target`, stepId);
    }

    const currentOrder = orderByBlockId.get(seg.blockId);
    if (currentOrder === undefined) {
      throw planError('INVALID_INPUT', `unknown block "${seg.blockId}" in span target`, stepId);
    }

    if (currentOrder <= lastOrder) {
      throw planError(
        'INVALID_INPUT',
        `span segments are not in strict document order (block "${seg.blockId}" appears before or at the same position as a prior segment)`,
        stepId,
      );
    }

    if (lastOrder >= 0 && currentOrder !== lastOrder + 1) {
      throw planError(
        'INVALID_INPUT',
        `span segments are not contiguous in document order (gap between "${previousBlockId}" and "${seg.blockId}")`,
        stepId,
      );
    }

    lastOrder = currentOrder;
    previousBlockId = seg.blockId;
  }
}

// ---------------------------------------------------------------------------
// Selector resolution
// ---------------------------------------------------------------------------

function resolveTextSelector(
  editor: Editor,
  index: BlockIndex,
  selector: TextSelector | NodeSelector,
  within: import('@superdoc/document-api').BlockNodeAddress | undefined,
  stepId: string,
  options?: { allBlockTypes?: boolean },
): { addresses: ResolvedAddress[] } {
  if (selector.type === 'text') {
    const query = {
      select: selector,
      within: within as import('@superdoc/document-api').BlockNodeAddress | undefined,
      includeNodes: false,
    };
    const result = executeTextSelector(editor, index, query, []);

    const addresses: ResolvedAddress[] = [];

    if (result.context) {
      for (const ctx of result.context) {
        if (!ctx.textRanges?.length) continue;

        const coalesced = normalizeMatchRanges(stepId, ctx.textRanges);
        const candidate = index.candidates.find((c) => c.nodeId === coalesced.blockId);
        if (!candidate) continue;

        const blockText = getBlockText(editor, candidate);
        const matchText = blockText.slice(coalesced.from, coalesced.to);
        const captured = captureRunsInRange(editor, candidate.pos, coalesced.from, coalesced.to);

        addresses.push({
          blockId: coalesced.blockId,
          from: coalesced.from,
          to: coalesced.to,
          text: matchText,
          marks: captured.runs.length > 0 ? captured.runs[0].marks : [],
          blockPos: candidate.pos,
        });
      }
    }

    return { addresses };
  }

  // Node selector — resolve to block positions
  const query = {
    select: selector,
    within: within as import('@superdoc/document-api').BlockNodeAddress | undefined,
    includeNodes: false,
  };
  const result = executeBlockSelector(index, query, []);

  // When allBlockTypes is set, allow non-text blocks (tables, images) through.
  // Structural operations need this because they target whole blocks, not text ranges.
  const eligibleCandidates = options?.allBlockTypes ? index.candidates : index.candidates.filter(isTextBlockCandidate);

  const addresses: ResolvedAddress[] = [];
  for (const match of result.matches) {
    if (match.kind !== 'block') continue;
    const candidate = eligibleCandidates.find((c) => c.nodeId === match.nodeId);
    if (!candidate) continue;

    if (isTextBlockCandidate(candidate)) {
      const blockText = getBlockText(editor, candidate);
      addresses.push({
        blockId: match.nodeId,
        from: 0,
        to: blockText.length,
        text: blockText,
        marks: [],
        blockPos: candidate.pos,
      });
    } else {
      // Non-text block (table, image wrapper, etc.): no text offsets needed.
      // Structural executors resolve targets by blockId, ignoring from/to.
      addresses.push({
        blockId: match.nodeId,
        from: 0,
        to: 0,
        text: '',
        marks: [],
        blockPos: candidate.pos,
      });
    }
  }

  return { addresses };
}

function getBlockText(editor: Editor, candidate: { pos: number; end: number }): string {
  const blockStart = candidate.pos + 1;
  const blockEnd = candidate.end - 1;
  return editor.state.doc.textBetween(blockStart, blockEnd, '\n', '\ufffc');
}

// ---------------------------------------------------------------------------
// Ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a V3 text ref into compiled targets.
 *
 * Resolution is purely segment-based (D6 rule 3): scope, blockIndex, and
 * runIndex are diagnostic metadata and do not affect target construction.
 * Single-segment refs produce a CompiledRangeTarget; multi-segment refs
 * produce a CompiledSpanTarget.
 */
function resolveV3TextRef(editor: Editor, index: BlockIndex, step: MutationStep, refData: TextRefV3): CompiledTarget[] {
  const currentRevision = getRevision(editor);
  if (refData.rev !== currentRevision) {
    throw planError(
      'REVISION_MISMATCH',
      `Text ref is ephemeral and revision-scoped. Re-run query.match to obtain a fresh handle.ref for revision ${currentRevision}.`,
      step.id,
      {
        refRevision: refData.rev,
        currentRevision,
        refStability: 'ephemeral',
        refScope: refData.scope,
        blockId: refData.segments?.[0]?.blockId,
        remediation: `Re-run query.match() to obtain a fresh ref valid for the current revision.`,
      },
    );
  }

  if (!refData.segments?.length) return [];

  const segments = refData.segments.map((s) => ({ blockId: s.blockId, from: s.start, to: s.end }));

  // Single-segment refs (block/run scope, or single-block match) → range target
  if (segments.length === 1) {
    const seg = segments[0];
    const candidate = index.candidates.find((c) => c.nodeId === seg.blockId);
    if (!candidate) return [];

    const blockText = getBlockText(editor, candidate);
    const matchText = blockText.slice(seg.from, seg.to);

    const addr: ResolvedAddress = {
      blockId: seg.blockId,
      from: seg.from,
      to: seg.to,
      text: matchText,
      marks: [],
      blockPos: candidate.pos,
    };

    const target = buildRangeTarget(editor, step, addr, candidate);
    target.matchId = refData.matchId;
    return [target];
  }

  // Multi-segment match refs → span target
  return [buildSpanTarget(editor, index, step, segments, refData.matchId)];
}

/**
 * Resolves a V4 text ref into compiled targets.
 *
 * V4 refs include a storyKey for multi-story support. The compiler
 * accepts any storyKey — the caller is responsible for passing the
 * correct story editor (via runtime resolution in the adapter layer).
 *
 * The only cross-story constraint enforced here is that ALL refs
 * within a single plan must share the same storyKey (single-story-per-call).
 * That check is performed at the plan level in {@link compilePlan},
 * not per-ref.
 */
function resolveV4TextRef(
  editor: Editor,
  index: BlockIndex,
  step: MutationStep,
  refData: StoryRefV4,
): CompiledTarget[] {
  // Node-scope V4 refs (from non-body block matches) carry the block
  // identity in the `node` field instead of text segments. These refs are
  // stable (nodeId-based) and skip revision checking — same semantics as
  // raw nodeId block refs.
  if (refData.scope === 'node' && refData.node?.nodeId) {
    return resolveBlockRef(editor, index, step, refData.node.nodeId);
  }

  const currentRevision = getRevision(editor);
  if (refData.rev !== currentRevision) {
    throw planError(
      'REVISION_MISMATCH',
      `Text ref is ephemeral and revision-scoped. Re-run query.match to obtain a fresh handle.ref for revision ${currentRevision}.`,
      step.id,
      {
        refRevision: refData.rev,
        currentRevision,
        refStability: 'ephemeral',
        storyKey: refData.storyKey,
        remediation: 'Re-run query.match() to obtain a fresh ref valid for the current revision.',
      },
    );
  }

  if (!refData.segments?.length) return [];

  const segments = refData.segments.map((s) => ({ blockId: s.blockId, from: s.start, to: s.end }));

  // Single-segment → range target
  if (segments.length === 1) {
    const seg = segments[0];
    const candidate = index.candidates.find((c) => c.nodeId === seg.blockId);
    if (!candidate) return [];

    const blockText = getBlockText(editor, candidate);
    const matchText = blockText.slice(seg.from, seg.to);

    const addr: ResolvedAddress = {
      blockId: seg.blockId,
      from: seg.from,
      to: seg.to,
      text: matchText,
      marks: [],
      blockPos: candidate.pos,
    };

    const target = buildRangeTarget(editor, step, addr, candidate);
    if (refData.matchId) target.matchId = refData.matchId;
    return [target];
  }

  // Multi-segment → span target
  return [buildSpanTarget(editor, index, step, segments, refData.matchId ?? `v4:${step.id}`)];
}

function resolveTextRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  // Use the shared codec to decode both V3 and V4 refs
  const decoded = decodeRef(ref);

  if (!decoded) {
    throw planError('INVALID_INPUT', 'invalid text ref encoding', step.id);
  }

  if (decoded.v === 4) {
    return resolveV4TextRef(editor, index, step, decoded as StoryRefV4);
  }

  // V3 fallback
  return resolveV3TextRef(editor, index, step, decoded as TextRefV3);
}

function resolveBlockRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  const primaryMatches = index.candidates.filter((c) => c.nodeId === ref);
  if (primaryMatches.length > 1) {
    throw planError('AMBIGUOUS_TARGET', `Multiple blocks share nodeId "${ref}".`, step.id, {
      ref,
      count: primaryMatches.length,
    });
  }

  // Alias-aware fallback: if the ref is an sdBlockId registered as an alias
  // (e.g., volatile UUID replaced by a deterministic para-auto-* primary ID),
  // try the shared resolveBlockAlias helper which enforces ambiguity checks.
  const candidate = primaryMatches[0] ?? resolveBlockAlias(index, ref);
  if (!candidate) return [];

  const blockText = getBlockText(editor, candidate);
  const addr: ResolvedAddress = {
    blockId: candidate.nodeId,
    from: 0,
    to: blockText.length,
    text: blockText,
    marks: [],
    blockPos: candidate.pos,
  };

  return [buildRangeTarget(editor, step, addr, candidate)];
}

// ---------------------------------------------------------------------------
// Ref handler registry — dispatches by prefix (C4)
// ---------------------------------------------------------------------------

type RefHandler = (editor: Editor, index: BlockIndex, step: MutationStep, ref: string) => CompiledTarget[];

/**
 * Prefix-based ref handler registry.
 * Entries are checked in registration order; the first matching prefix wins.
 * The default handler (empty prefix) must be registered last.
 */
const REF_HANDLERS: Array<{ prefix: string; handler: RefHandler }> = [
  { prefix: 'text:', handler: resolveTextRef },
  {
    prefix: 'tc:',
    handler: (_editor, _index, step, ref) => {
      throw planError(
        'INVALID_INPUT',
        `entity ref "${ref}" (tracked change) cannot be used as a text mutation target`,
        step.id,
      );
    },
  },
  {
    prefix: 'comment:',
    handler: (_editor, _index, step, ref) => {
      throw planError(
        'INVALID_INPUT',
        `entity ref "${ref}" (comment) cannot be used as a text mutation target`,
        step.id,
      );
    },
  },
  // Default: raw nodeId → block ref (must be last)
  { prefix: '', handler: resolveBlockRef },
];

function dispatchRefHandler(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  for (const entry of REF_HANDLERS) {
    if (entry.prefix === '' || ref.startsWith(entry.prefix)) {
      return entry.handler(editor, index, step, ref);
    }
  }
  // Unreachable — the default handler (empty prefix) always matches
  return resolveBlockRef(editor, index, step, ref);
}

function resolveRefTargets(editor: Editor, index: BlockIndex, step: MutationStep, where: RefWhere): CompiledTarget[] {
  return dispatchRefHandler(editor, index, step, where.ref);
}

// ---------------------------------------------------------------------------
// Target-where resolution (where.by: 'target')
// ---------------------------------------------------------------------------

/**
 * Resolves a `where.by: 'target'` clause into a single CompiledSelectionTarget.
 *
 * Uses the selection-target-resolver to map the SelectionTarget to absolute
 * PM positions. For `text.delete` with `behavior: 'selection'`, applies
 * block-edge expansion so fully-covered boundary blocks are removed.
 */
function resolveTargetWhereClause(editor: Editor, step: MutationStep, where: TargetWhere): CompiledSelectionTarget {
  const resolved = resolveSelectionTarget(editor, where.target);

  let { absFrom, absTo } = resolved;

  // Apply delete expansion for `behavior: 'selection'`.
  // After position normalization, absFrom may correspond to target.end if
  // the caller passed a reversed selection. Determine which original point
  // maps to each physical boundary for correct per-endpoint expansion.
  const args = step.args as Record<string, unknown> | undefined;
  if (step.op === 'text.delete' && args?.behavior !== 'exact') {
    const rawStartPos = resolveSelectionPointPosition(editor, where.target.start);
    const fromPoint = rawStartPos === absFrom ? where.target.start : where.target.end;
    const toPoint = rawStartPos === absFrom ? where.target.end : where.target.start;
    const expanded = expandDeleteSelection(editor, absFrom, absTo, fromPoint, toPoint);
    absFrom = expanded.absFrom;
    absTo = expanded.absTo;
  }

  // Re-snapshot text after potential expansion.
  const text =
    absFrom !== resolved.absFrom || absTo !== resolved.absTo
      ? editor.state.doc.textBetween(absFrom, absTo, '\n', '\ufffc')
      : resolved.text;

  // Capture inline style for style-preserving operations (mirrors buildRangeTarget logic).
  const capturedStyle =
    step.op === 'text.rewrite' || step.op === 'format.apply'
      ? captureStyleAtAbsoluteRange(editor, absFrom, absTo)
      : undefined;

  return {
    kind: 'selection',
    stepId: step.id,
    op: step.op,
    absFrom,
    absTo,
    normalizedTarget: where.target,
    text,
    capturedStyle,
  };
}

/**
 * Captures inline style runs for an absolute PM position range.
 *
 * Walks all text blocks between `absFrom` and `absTo`, captures runs from
 * each block's overlapping portion, and merges them into a single
 * CapturedStyle with a continuous offset sequence. This ensures cross-block
 * selections capture formatting from all blocks, not just the first.
 */
function captureStyleAtAbsoluteRange(editor: Editor, absFrom: number, absTo: number): CapturedStyle | undefined {
  const doc = editor.state.doc;
  const allRuns: CapturedStyle['runs'] = [];
  let runOffset = 0;

  doc.nodesBetween(absFrom, absTo, (node, pos) => {
    if (!node.isTextblock) return true;

    const blockEnd = pos + node.nodeSize;
    const overlapFrom = Math.max(absFrom, pos + 1);
    const overlapTo = Math.min(absTo, blockEnd - 1);
    if (overlapFrom >= overlapTo) return false;

    const relFrom = overlapFrom - pos - 1;
    const relTo = overlapTo - pos - 1;
    const captured = captureRunsInRange(editor, pos, relFrom, relTo);

    for (const run of captured.runs) {
      allRuns.push({
        ...run,
        from: runOffset + (run.from - relFrom),
        to: runOffset + (run.to - relFrom),
      });
    }
    runOffset += relTo - relFrom;

    return false; // Don't descend into inline content (captureRunsInRange handles that)
  });

  if (allRuns.length === 0) return undefined;

  return { runs: allRuns, isUniform: checkUniformity(allRuns) };
}

// ---------------------------------------------------------------------------
// Step target resolution
// ---------------------------------------------------------------------------

function resolveStepTargets(editor: Editor, index: BlockIndex, step: MutationStep): CompiledTarget[] {
  const where = step.where;
  const refWhere = isRefWhere(where) ? where : undefined;
  const selectWhere = isSelectWhere(where) ? where : undefined;
  const targetWhere = isTargetWhere(where) ? where : undefined;

  let targets: CompiledTarget[];

  if (targetWhere) {
    const selectionTarget = resolveTargetWhereClause(editor, step, targetWhere);
    targets = [selectionTarget];
  } else if (refWhere) {
    targets = resolveRefTargets(editor, index, step, refWhere);
  } else if (selectWhere) {
    const isStructuralOp = step.op === 'structural.insert' || step.op === 'structural.replace';
    const resolved = resolveTextSelector(editor, index, selectWhere.select, selectWhere.within, step.id, {
      allBlockTypes: isStructuralOp,
    });
    targets = resolved.addresses.map((addr) => {
      const candidate = index.candidates.find((c) => c.nodeId === addr.blockId);
      if (!candidate) {
        throw planError('TARGET_NOT_FOUND', `block "${addr.blockId}" not in index`, step.id);
      }

      // Non-text blocks (tables, images): build target directly from block range.
      // Structural executors resolve by blockId — text offsets are unused.
      if (isStructuralOp && !isTextBlockCandidate(candidate)) {
        return {
          kind: 'range' as const,
          stepId: step.id,
          op: step.op,
          blockId: addr.blockId,
          from: 0,
          to: 0,
          absFrom: candidate.pos,
          absTo: candidate.pos + candidate.node.nodeSize,
          text: '',
          marks: [] as readonly import('prosemirror-model').Mark[],
          capturedStyle: undefined,
        };
      }

      return buildRangeTarget(editor, step, addr, candidate);
    });
  } else {
    throw planError('INVALID_INPUT', 'unsupported where.by value', step.id);
  }

  // Sort range targets by document position
  targets.sort((a, b) => {
    if (a.kind === 'range' && b.kind === 'range') {
      if (a.blockId === b.blockId) return a.from - b.from;
      return a.absFrom - b.absFrom;
    }
    // Span targets: sort by first segment
    const posA = a.kind === 'span' ? a.segments[0].absFrom : a.absFrom;
    const posB = b.kind === 'span' ? b.segments[0].absFrom : b.absFrom;
    return posA - posB;
  });

  // Deduplicate identical range targets
  targets = targets.filter((t, i) => {
    if (i === 0) return true;
    const prev = targets[i - 1];
    if (t.kind !== 'range' || prev.kind !== 'range') return true;
    return t.blockId !== prev.blockId || t.from !== prev.from || t.to !== prev.to;
  });

  // Target-where always produces exactly one target — return immediately.
  if (targetWhere) {
    return targets;
  }

  if (refWhere) {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', `ref "${refWhere.ref}" did not resolve to any targets`, step.id, {
        selectorType: 'ref',
        selectorPattern: refWhere.ref,
        candidateCount: 0,
      });
    }
    if (targets.length > 1) {
      throw planError('AMBIGUOUS_MATCH', `ref "${refWhere.ref}" resolved to ${targets.length} targets`, step.id, {
        matchCount: targets.length,
      });
    }
    return targets;
  }

  if (!selectWhere) {
    throw planError('INVALID_INPUT', 'unsupported where.by value', step.id);
  }

  // Apply cardinality rules (select-only)
  applyCardinalityCheck(step, targets);

  // Apply cardinality truncation (select-only)
  const require = selectWhere.require;
  if (require === 'first' && targets.length > 1) {
    targets = [targets[0]];
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Cardinality
// ---------------------------------------------------------------------------

function buildMatchNotFoundDetails(step: MutationStep): Record<string, unknown> {
  const where = step.where;
  const select =
    'select' in where ? (where as { select?: { type?: string; pattern?: string; mode?: string } }).select : undefined;
  const within = 'within' in where ? (where as { within?: { blockId?: string } }).within : undefined;
  return {
    selectorType: select?.type ?? 'unknown',
    selectorPattern: select?.pattern ?? '',
    selectorMode: select?.mode ?? 'contains',
    searchScope: within?.blockId ?? 'document',
    candidateCount: 0,
  };
}

function applyCardinalityCheck(step: MutationStep, targets: CompiledTarget[]): void {
  const where = step.where;
  if (!('require' in where) || where.require === undefined) return;

  const require = where.require;

  if (require === 'first') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id, buildMatchNotFoundDetails(step));
    }
  } else if (require === 'exactlyOne') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id, buildMatchNotFoundDetails(step));
    }
    if (targets.length > 1) {
      throw planError('AMBIGUOUS_MATCH', `selector matched ${targets.length} ranges, expected exactly one`, step.id, {
        matchCount: targets.length,
      });
    }
  } else if (require === 'all') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id, buildMatchNotFoundDetails(step));
    }
  }
}

// ---------------------------------------------------------------------------
// Step interaction matrix (Workstream C)
// ---------------------------------------------------------------------------

type InteractionVerdict = 'allow' | 'reject';
type OverlapClass = 'same_target' | 'overlapping' | 'same_block';

interface OverlapClassification {
  overlapClass: OverlapClass;
  blockId: string;
  rangeA: { from: number; to: number };
  rangeB: { from: number; to: number };
}

/**
 * Canonical step interaction matrix. This is the single source of truth for
 * overlap verdicts when two steps target non-disjoint ranges.
 *
 * Key format: `${opA}::${opB}::${overlapClass}`
 * - Order is significant: (A, B) means A appears before B in plan order.
 * - Unlisted pairs are rejected by default (allowlist model).
 */
export const STEP_INTERACTION_MATRIX: ReadonlyMap<string, InteractionVerdict> = new Map<string, InteractionVerdict>([
  // text.rewrite combinations
  ['text.rewrite::format.apply::same_target', 'allow'],
  ['text.rewrite::text.rewrite::same_target', 'reject'],
  ['text.rewrite::text.delete::overlapping', 'reject'],
  ['text.rewrite::create.*::same_block', 'allow'],
  ['text.rewrite::text.insert::same_target', 'reject'],

  // format.apply combinations
  ['format.apply::format.apply::same_target', 'allow'],
  ['format.apply::text.rewrite::same_target', 'reject'],
  ['format.apply::text.delete::overlapping', 'reject'],
  ['format.apply::create.*::same_block', 'allow'],
  ['format.apply::text.insert::same_target', 'allow'],

  // text.delete combinations
  ['text.delete::text.rewrite::overlapping', 'reject'],
  ['text.delete::text.delete::overlapping', 'reject'],
  ['text.delete::format.apply::overlapping', 'reject'],
  ['text.delete::create.*::same_block', 'allow'],
  ['text.delete::text.insert::overlapping', 'reject'],

  // create.* combinations
  ['create.*::text.rewrite::same_block', 'allow'],
  ['create.*::format.apply::same_block', 'allow'],
  ['create.*::text.delete::same_block', 'allow'],
  ['create.*::create.*::same_block', 'allow'],
  ['create.*::text.insert::same_block', 'allow'],

  // text.insert combinations
  ['text.insert::format.apply::same_target', 'allow'],
  ['text.insert::text.rewrite::same_target', 'reject'],
  ['text.insert::text.delete::overlapping', 'reject'],
  ['text.insert::create.*::same_block', 'allow'],
  ['text.insert::text.insert::same_target', 'reject'],
]);

/** Operations exempt from matrix lookup (non-mutating). */
export const MATRIX_EXEMPT_OPS = new Set(['assert']);

/** Normalize an op key for matrix lookup (create.heading/create.paragraph → create.*). */
function normalizeOpForMatrix(op: string): string {
  return op.startsWith('create.') ? 'create.*' : op;
}

/**
 * Classify the overlap relationship between two steps' target ranges.
 * Returns undefined if the ranges are disjoint (different blocks, no overlap).
 */
function classifyOverlap(
  stepA: CompiledStep,
  stepB: CompiledStep,
  index: BlockIndex,
): OverlapClassification | undefined {
  const rangesA = extractBlockRanges(stepA, index);
  const rangesB = extractBlockRanges(stepB, index);

  const opA = normalizeOpForMatrix(stepA.step.op);
  const opB = normalizeOpForMatrix(stepB.step.op);
  const isCreateA = opA === 'create.*';
  const isCreateB = opB === 'create.*';

  for (const [blockId, aEntries] of rangesA) {
    const bEntries = rangesB.get(blockId);
    if (!bEntries) continue;

    // Both steps target the same block — classify the overlap
    for (const a of aEntries) {
      for (const b of bEntries) {
        // One is block-boundary (create), other is inline → same_block
        if (isCreateA || isCreateB) {
          return { overlapClass: 'same_block', blockId, rangeA: a, rangeB: b };
        }

        // Check if ranges actually overlap
        if (a.to <= b.from || b.to <= a.from) continue;

        // Same range → same_target
        if (a.from === b.from && a.to === b.to) {
          return { overlapClass: 'same_target', blockId, rangeA: a, rangeB: b };
        }

        // Partial overlap
        return { overlapClass: 'overlapping', blockId, rangeA: a, rangeB: b };
      }
    }
  }

  return undefined;
}

/**
 * Extracts per-block absolute ranges for overlap detection.
 *
 * All target kinds are normalized to absolute positions keyed by blockId.
 * CompiledSelectionTargets scan the block index to enumerate every block
 * whose PM range intersects `[absFrom, absTo)`, ensuring middle blocks in
 * cross-block selections are correctly registered for overlap checks.
 */
function extractBlockRanges(
  compiled: CompiledStep,
  index: BlockIndex,
): Map<string, Array<{ from: number; to: number }>> {
  const result = new Map<string, Array<{ from: number; to: number }>>();
  for (const target of compiled.targets) {
    if (target.kind === 'range') {
      // Use absolute positions for consistent comparison across target kinds.
      pushBlockRange(result, target.blockId, target.absFrom, target.absTo);
    } else if (target.kind === 'span') {
      for (const seg of target.segments) {
        pushBlockRange(result, seg.blockId, seg.absFrom, seg.absTo);
      }
    } else {
      // CompiledSelectionTarget — scan the block index for every block
      // whose range overlaps [absFrom, absTo). This correctly captures
      // start, middle, and end blocks for cross-block selections, as well
      // as nodeEdge-only selections.
      const sel = target;
      const coveredBlocks = findCoveredBlocks(index, sel.absFrom, sel.absTo);

      if (coveredBlocks.length > 0) {
        for (const blockId of coveredBlocks) {
          pushBlockRange(result, blockId, sel.absFrom, sel.absTo);
        }
      } else {
        // Degenerate case: no blocks found in range (shouldn't happen in
        // practice). Register the full absolute range under a synthetic key
        // so overlap detection still catches collisions.
        pushBlockRange(result, `__unresolved_${sel.absFrom}_${sel.absTo}__`, sel.absFrom, sel.absTo);
      }
    }
  }
  return result;
}

/**
 * Finds all block candidate nodeIds whose PM range intersects `[absFrom, absTo)`.
 * Returns a deduplicated list of nodeIds in document order.
 */
function findCoveredBlocks(index: BlockIndex, absFrom: number, absTo: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of index.candidates) {
    // candidate.pos = start of the node, candidate.end = end of the node
    // A block is covered if its range overlaps with [absFrom, absTo).
    if (candidate.end <= absFrom || candidate.pos >= absTo) continue;
    if (!seen.has(candidate.nodeId)) {
      seen.add(candidate.nodeId);
      result.push(candidate.nodeId);
    }
  }

  return result;
}

function pushBlockRange(
  map: Map<string, Array<{ from: number; to: number }>>,
  blockId: string,
  from: number,
  to: number,
): void {
  let entries = map.get(blockId);
  if (!entries) {
    entries = [];
    map.set(blockId, entries);
  }
  entries.push({ from, to });
}

/**
 * Validates step interactions for all compiled step pairs using the interaction matrix.
 * Disjoint pairs are always allowed without consulting the matrix.
 */
function validateStepInteractions(steps: CompiledStep[], index: BlockIndex): void {
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const stepA = steps[i];
      const stepB = steps[j];

      // Exempt non-mutating ops
      if (MATRIX_EXEMPT_OPS.has(stepA.step.op) || MATRIX_EXEMPT_OPS.has(stepB.step.op)) continue;

      const overlap = classifyOverlap(stepA, stepB, index);
      if (!overlap) continue; // Disjoint — always allowed

      const opA = normalizeOpForMatrix(stepA.step.op);
      const opB = normalizeOpForMatrix(stepB.step.op);
      const matrixKey = `${opA}::${opB}::${overlap.overlapClass}`;
      const verdict = STEP_INTERACTION_MATRIX.get(matrixKey) ?? 'reject';

      if (verdict === 'reject') {
        throw planError(
          'PLAN_CONFLICT_OVERLAP',
          `steps "${stepA.step.id}" and "${stepB.step.id}" target overlapping ranges in block "${overlap.blockId}"`,
          stepB.step.id,
          {
            blockId: overlap.blockId,
            stepIdA: stepA.step.id,
            stepIdB: stepB.step.id,
            opKeyA: stepA.step.op,
            opKeyB: stepB.step.op,
            rangeA: overlap.rangeA,
            rangeB: overlap.rangeB,
            overlapRegion: {
              from: Math.max(overlap.rangeA.from, overlap.rangeB.from),
              to: Math.min(overlap.rangeA.to, overlap.rangeB.to),
            },
            matrixVerdict: verdict,
            matrixKey,
          },
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Block identity integrity (Workstream E)
// ---------------------------------------------------------------------------

/**
 * Detects duplicate block IDs in the block index before compilation.
 * Throws `DOCUMENT_IDENTITY_CONFLICT` if any two blocks share the same ID.
 */
function assertNoDuplicateBlockIds(index: BlockIndex): void {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (const candidate of index.candidates) {
    const count = seen.get(candidate.nodeId) ?? 0;
    seen.set(candidate.nodeId, count + 1);
    if (count === 1) duplicates.push(candidate.nodeId);
  }

  if (duplicates.length > 0) {
    throw planError(
      'DOCUMENT_IDENTITY_CONFLICT',
      'Document contains blocks with duplicate identities. This must be resolved before mutations can be applied.',
      undefined,
      {
        duplicateBlockIds: duplicates,
        blockCount: duplicates.length,
        remediation: 'Re-import the document or call document.repair() to assign unique identities.',
      },
    );
  }
}

/**
 * Validates that all V4 refs in a plan share the same storyKey.
 *
 * Plans are single-story-per-call in the current model. If two steps
 * carry V4 refs targeting different stories, this is a compile-time error.
 */
function assertSingleStoryKey(steps: MutationStep[]): void {
  let seenStoryKey: string | undefined;
  let seenStepId: string | undefined;

  for (const step of steps) {
    const where = step.where;
    if (!isRefWhere(where)) continue;
    const ref = where.ref;
    if (!ref.startsWith('text:v4:')) continue;

    const decoded = decodeRef(ref);
    if (!decoded || decoded.v !== 4) continue;

    const v4 = decoded as StoryRefV4;
    if (seenStoryKey === undefined) {
      seenStoryKey = v4.storyKey;
      seenStepId = step.id;
    } else if (v4.storyKey !== seenStoryKey) {
      throw planError(
        'CROSS_STORY_PLAN',
        `Plan contains refs targeting different stories: step "${seenStepId}" targets "${seenStoryKey}" but step "${step.id}" targets "${v4.storyKey}". A single plan call must target one story.`,
        step.id,
        {
          storyKeyA: seenStoryKey,
          stepIdA: seenStepId,
          storyKeyB: v4.storyKey,
          stepIdB: step.id,
        },
      );
    }
  }
}

export function compilePlan(editor: Editor, steps: MutationStep[]): CompiledPlan {
  // D8: plan step limit
  if (steps.length > MAX_PLAN_STEPS) {
    throw planError('INVALID_INPUT', `plan contains ${steps.length} steps, maximum is ${MAX_PLAN_STEPS}`);
  }

  // Capture revision at compile start — single read point for consistency (D3)
  const compiledRevision = getRevision(editor);

  const index = getBlockIndex(editor);

  // E1: Pre-compilation identity integrity check
  assertNoDuplicateBlockIds(index);
  const mutationSteps: CompiledStep[] = [];
  const assertSteps: AssertStep[] = [];

  // Validate step IDs are unique
  const seenIds = new Set<string>();
  for (const step of steps) {
    if (!step.id) {
      throw planError('INVALID_INPUT', 'step.id is required');
    }
    if (seenIds.has(step.id)) {
      throw planError('INVALID_INPUT', `duplicate step id "${step.id}"`, step.id);
    }
    seenIds.add(step.id);
  }

  // Cross-story validation: all V4 refs in a plan must share the same storyKey.
  // This enforces the single-story-per-call constraint at compile time.
  assertSingleStoryKey(steps);

  // Separate assert steps from mutation steps
  let totalTargets = 0;
  let stepIndex = 0;
  for (const step of steps) {
    if (isAssertStep(step)) {
      assertSteps.push(step);
      stepIndex++;
      continue;
    }

    // Enforce explicit allowlist for user-authored mutation steps.
    // This prevents broad prefix executors (e.g. "tables.*") from accepting
    // unknown ops that would otherwise silently no-op at runtime.
    if (!isPublicMutationStepOp(step.op)) {
      throw planError('INVALID_INPUT', `unknown step op "${step.op}"`, step.id);
    }

    if (!hasStepExecutor(step.op)) {
      throw planError('INVALID_INPUT', `unknown step op "${step.op}"`, step.id);
    }

    // Validate and default create-step position at compile time
    if (isCreateOp(step.op)) {
      validateCreateStepPosition(step);
    }

    const targets = resolveStepTargets(editor, index, step);

    // Validate insertion context for create ops (B0 invariant 5)
    if (isCreateOp(step.op) && targets.length > 0) {
      const position = ((step.args as Record<string, unknown>).position as 'before' | 'after') ?? 'after';
      const anchorBlockId = resolveCreateAnchorFromTargets(targets, position, step.id);
      validateInsertionContext(editor, index, step, stepIndex, anchorBlockId, position);
    }

    totalTargets += targets.length;
    mutationSteps.push({ step, targets });
    stepIndex++;
  }

  // D8: resolved target limit
  if (totalTargets > MAX_PLAN_RESOLVED_TARGETS) {
    throw planError(
      'INVALID_INPUT',
      `plan resolved ${totalTargets} total targets, maximum is ${MAX_PLAN_RESOLVED_TARGETS}`,
    );
  }

  validateStepInteractions(mutationSteps, index);

  return { mutationSteps, assertSteps, compiledRevision };
}
