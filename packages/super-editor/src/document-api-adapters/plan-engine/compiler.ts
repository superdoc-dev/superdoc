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
  TextAddress,
} from '@superdoc/document-api';
import { MAX_PLAN_STEPS, MAX_PLAN_RESOLVED_TARGETS } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type {
  CompiledTarget,
  CompiledRangeTarget,
  CompiledSpanTarget,
  CompiledSegment,
} from './executor-registry.types.js';
import { planError } from './errors.js';
import { hasStepExecutor } from './executor-registry.js';
import { captureRunsInRange } from './style-resolver.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { getRevision } from './revision-tracker.js';
import { executeTextSelector } from '../find/text-strategy.js';
import { executeBlockSelector } from '../find/block-strategy.js';
import { isTextBlockCandidate, type BlockCandidate, type BlockIndex } from '../helpers/node-address-resolver.js';
import { resolveTextRangeInBlock } from '../helpers/text-offset-resolver.js';

export interface CompiledStep {
  step: MutationStep;
  targets: CompiledTarget[];
}

export interface CompiledPlan {
  mutationSteps: CompiledStep[];
  assertSteps: AssertStep[];
}

function isAssertStep(step: MutationStep): step is AssertStep {
  return step.op === 'assert';
}

function isSelectWhere(where: MutationStep['where']): where is SelectWhere {
  return where.by === 'select';
}

function isRefWhere(where: MutationStep['where']): where is RefWhere {
  return where.by === 'ref';
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
  within: import('@superdoc/document-api').NodeAddress | undefined,
  stepId: string,
): { addresses: ResolvedAddress[] } {
  if (selector.type === 'text') {
    const query = {
      select: selector,
      within: within as import('@superdoc/document-api').NodeAddress | undefined,
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
    within: within as import('@superdoc/document-api').NodeAddress | undefined,
    includeNodes: false,
  };
  const result = executeBlockSelector(index, query, []);
  const textBlocks = index.candidates.filter(isTextBlockCandidate);

  const addresses: ResolvedAddress[] = [];
  for (const match of result.matches) {
    if (match.kind !== 'block') continue;
    const candidate = textBlocks.find((c) => c.nodeId === match.nodeId);
    if (!candidate) continue;
    const blockText = getBlockText(editor, candidate);
    addresses.push({
      blockId: match.nodeId,
      from: 0,
      to: blockText.length,
      text: blockText,
      marks: [],
      blockPos: candidate.pos,
    });
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

function decodeTextRefPayload(encoded: string, stepId: string): unknown {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    throw planError('INVALID_INPUT', 'invalid text ref encoding', stepId);
  }
}

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
      `text ref was created at revision "${refData.rev}" but document is at "${currentRevision}"`,
      step.id,
      { refRevision: refData.rev, currentRevision },
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

function resolveTextRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  const encoded = ref.slice(5); // strip 'text:' prefix
  const payload = decodeTextRefPayload(encoded, step.id);

  if (!isV3Ref(payload)) {
    throw planError('INVALID_INPUT', 'only V3 text refs are supported', step.id);
  }

  return resolveV3TextRef(editor, index, step, payload);
}

function resolveBlockRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  const candidate = index.candidates.find((c) => c.nodeId === ref);
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
// Step target resolution
// ---------------------------------------------------------------------------

function resolveStepTargets(editor: Editor, index: BlockIndex, step: MutationStep): CompiledTarget[] {
  const where = step.where;
  const refWhere = isRefWhere(where) ? where : undefined;
  const selectWhere = isSelectWhere(where) ? where : undefined;

  let targets: CompiledTarget[];

  if (refWhere) {
    targets = resolveRefTargets(editor, index, step, refWhere);
  } else if (selectWhere) {
    const resolved = resolveTextSelector(editor, index, selectWhere.select, selectWhere.within, step.id);
    targets = resolved.addresses.map((addr) => {
      const candidate = index.candidates.find((c) => c.nodeId === addr.blockId);
      if (!candidate) {
        throw planError('TARGET_NOT_FOUND', `block "${addr.blockId}" not in index`, step.id);
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

  if (refWhere) {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', `ref "${refWhere.ref}" did not resolve to any targets`, step.id);
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

function applyCardinalityCheck(step: MutationStep, targets: CompiledTarget[]): void {
  const where = step.where;
  if (!('require' in where) || where.require === undefined) return;

  const require = where.require;

  if (require === 'first') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id);
    }
  } else if (require === 'exactlyOne') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id);
    }
    if (targets.length > 1) {
      throw planError('AMBIGUOUS_MATCH', `selector matched ${targets.length} ranges, expected exactly one`, step.id, {
        matchCount: targets.length,
      });
    }
  } else if (require === 'all') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges', step.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

function detectOverlaps(steps: CompiledStep[]): void {
  const rangesByBlock = new Map<string, Array<{ stepId: string; from: number; to: number }>>();

  for (const compiled of steps) {
    for (const target of compiled.targets) {
      if (target.kind === 'range') {
        addRange(rangesByBlock, target.blockId, target.stepId, target.from, target.to);
      } else {
        for (const seg of target.segments) {
          addRange(rangesByBlock, seg.blockId, target.stepId, seg.from, seg.to);
        }
      }
    }
  }

  for (const [blockId, ranges] of rangesByBlock) {
    ranges.sort((a, b) => a.from - b.from);
    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1];
      const curr = ranges[i];
      if (prev.stepId !== curr.stepId && prev.to > curr.from) {
        throw planError(
          'PLAN_CONFLICT_OVERLAP',
          `steps "${prev.stepId}" and "${curr.stepId}" target overlapping ranges in block "${blockId}"`,
          curr.stepId,
          { blockId, rangeA: { from: prev.from, to: prev.to }, rangeB: { from: curr.from, to: curr.to } },
        );
      }
    }
  }
}

function addRange(
  map: Map<string, Array<{ stepId: string; from: number; to: number }>>,
  blockId: string,
  stepId: string,
  from: number,
  to: number,
): void {
  let blockRanges = map.get(blockId);
  if (!blockRanges) {
    blockRanges = [];
    map.set(blockId, blockRanges);
  }
  blockRanges.push({ stepId, from, to });
}

// ---------------------------------------------------------------------------
// Plan compilation entry point
// ---------------------------------------------------------------------------

export function compilePlan(editor: Editor, steps: MutationStep[]): CompiledPlan {
  // D8: plan step limit
  if (steps.length > MAX_PLAN_STEPS) {
    throw planError('INVALID_INPUT', `plan contains ${steps.length} steps, maximum is ${MAX_PLAN_STEPS}`);
  }

  const index = getBlockIndex(editor);
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

  // Separate assert steps from mutation steps
  let totalTargets = 0;
  for (const step of steps) {
    if (isAssertStep(step)) {
      assertSteps.push(step);
      continue;
    }

    if (!hasStepExecutor(step.op)) {
      throw planError('INVALID_INPUT', `unknown step op "${step.op}"`, step.id);
    }

    const targets = resolveStepTargets(editor, index, step);
    totalTargets += targets.length;
    mutationSteps.push({ step, targets });
  }

  // D8: resolved target limit
  if (totalTargets > MAX_PLAN_RESOLVED_TARGETS) {
    throw planError(
      'INVALID_INPUT',
      `plan resolved ${totalTargets} total targets, maximum is ${MAX_PLAN_RESOLVED_TARGETS}`,
    );
  }

  detectOverlaps(mutationSteps);

  return { mutationSteps, assertSteps };
}
