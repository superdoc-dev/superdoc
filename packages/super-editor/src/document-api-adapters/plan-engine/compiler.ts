/**
 * Plan compiler — resolves step selectors against pre-mutation document state.
 *
 * Phase 1 (compile): resolve all mutation step selectors, capture style data,
 * detect overlapping targets.
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
import type { Editor } from '../../core/Editor.js';
import type { CompiledTarget } from './executor-registry.types.js';
import { planError } from './errors.js';
import { hasStepExecutor } from './executor-registry.js';
import { captureRunsInRange } from './style-resolver.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { getRevision } from './revision-tracker.js';
import { executeTextSelector } from '../find/text-strategy.js';
import { executeBlockSelector } from '../find/block-strategy.js';
import { isTextBlockCandidate, type BlockIndex } from '../helpers/node-address-resolver.js';

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

/** Resolved address with captured style data from the matched range. */
interface ResolvedAddress {
  blockId: string;
  from: number;
  to: number;
  text: string;
  marks: readonly unknown[];
  /** Block position in PM doc coordinates (needed for style capture). */
  blockPos: number;
}

// ---------------------------------------------------------------------------
// Logical-match range normalizer
// ---------------------------------------------------------------------------

/**
 * Coalesces an array of text ranges (from a single logical match) into one
 * contiguous range.  All ranges must belong to the same block and be
 * contiguous/adjacent — otherwise an appropriate error is thrown.
 */
export function normalizeMatchRanges(
  stepId: string,
  ranges: TextAddress[],
): { blockId: string; from: number; to: number } {
  if (ranges.length === 0) {
    throw planError('INVALID_INPUT', 'logical match produced zero ranges', stepId);
  }

  // Validate per-range bounds (guards against malformed ref payloads)
  for (const r of ranges) {
    if (r.range.start < 0 || r.range.end < r.range.start) {
      throw planError(
        'INVALID_INPUT',
        `invalid range bounds [${r.range.start}, ${r.range.end}) in block "${r.blockId}"`,
        stepId,
      );
    }
  }

  const blockId = ranges[0].blockId;

  // Cross-block check
  if (ranges.some((r) => r.blockId !== blockId)) {
    throw planError('CROSS_BLOCK_MATCH', `mutation target spans multiple blocks`, stepId, {
      blockIds: [...new Set(ranges.map((r) => r.blockId))],
    });
  }

  if (ranges.length === 1) {
    return { blockId, from: ranges[0].range.start, to: ranges[0].range.end };
  }

  // Sort by start position
  const sorted = [...ranges].sort((a, b) => a.range.start - b.range.start);

  // Walk ranges and verify contiguity
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
    // Extend (handles adjacent and overlapping sub-ranges)
    if (r.range.end > to) to = r.range.end;
  }

  return { blockId, from, to };
}

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

        // One context entry = one logical match.
        // Coalesce its range fragments into a single contiguous range.
        const coalesced = normalizeMatchRanges(stepId, ctx.textRanges);
        const candidate = index.candidates.find((c) => c.nodeId === coalesced.blockId);
        if (!candidate) continue;

        // Build text from actual document bounds, not snippet
        const blockText = getBlockText(editor, candidate);
        const matchText = blockText.slice(coalesced.from, coalesced.to);

        // Capture inline mark runs from the coalesced range
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
  // Use the same separator/leaf arguments as toTextAddress in common.ts so that
  // block-relative offsets computed by the selector engine align with this text.
  const blockStart = candidate.pos + 1;
  const blockEnd = candidate.end - 1;
  return editor.state.doc.textBetween(blockStart, blockEnd, '\n', '\ufffc');
}

function applyCardinalityCheck(step: MutationStep, targets: CompiledTarget[]): void {
  const where = step.where;
  if (!('require' in where)) return;

  const require = where.require;

  if (require === 'first') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', `selector matched zero ranges`, step.id);
    }
  } else if (require === 'exactlyOne') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', `selector matched zero ranges`, step.id);
    }
    if (targets.length > 1) {
      throw planError('AMBIGUOUS_MATCH', `selector matched ${targets.length} ranges, expected exactly one`, step.id, {
        matchCount: targets.length,
      });
    }
  } else if (require === 'all') {
    if (targets.length === 0) {
      throw planError('MATCH_NOT_FOUND', `selector matched zero ranges`, step.id);
    }
  }
}

function isRefWhere(where: MutationStep['where']): where is RefWhere {
  return where.by === 'ref';
}

// ---------------------------------------------------------------------------
// Ref resolution — text refs and block refs
// ---------------------------------------------------------------------------

function resolveTextRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  const encoded = ref.slice(5); // strip 'text:' prefix
  let refData: { rev: string; addr: unknown; ranges?: TextAddress[] };
  try {
    refData = JSON.parse(atob(encoded));
  } catch {
    throw planError('INVALID_INPUT', `invalid text ref encoding`, step.id);
  }

  const currentRevision = getRevision(editor);
  if (refData.rev !== currentRevision) {
    throw planError(
      'REVISION_MISMATCH',
      `text ref was created at revision "${refData.rev}" but document is at "${currentRevision}"`,
      step.id,
      { refRevision: refData.rev, currentRevision },
    );
  }

  if (!refData.ranges?.length) return [];

  // All ranges in a text ref represent one logical match — coalesce them.
  const coalesced = normalizeMatchRanges(step.id, refData.ranges);
  const candidate = index.candidates.find((c) => c.nodeId === coalesced.blockId);
  if (!candidate) return [];

  const blockText = getBlockText(editor, candidate);
  const matchText = blockText.slice(coalesced.from, coalesced.to);

  const capturedStyle =
    step.op === 'text.rewrite' ? captureRunsInRange(editor, candidate.pos, coalesced.from, coalesced.to) : undefined;

  return [
    {
      stepId: step.id,
      op: step.op,
      blockId: coalesced.blockId,
      from: coalesced.from,
      to: coalesced.to,
      text: matchText,
      marks: [],
      capturedStyle,
    },
  ];
}

function resolveBlockRef(editor: Editor, index: BlockIndex, step: MutationStep, ref: string): CompiledTarget[] {
  const candidate = index.candidates.find((c) => c.nodeId === ref);
  if (!candidate) return [];

  const blockText = getBlockText(editor, candidate);
  const capturedStyle =
    step.op === 'text.rewrite' ? captureRunsInRange(editor, candidate.pos, 0, blockText.length) : undefined;

  return [
    {
      stepId: step.id,
      op: step.op,
      blockId: candidate.nodeId,
      from: 0,
      to: blockText.length,
      text: blockText,
      marks: [],
      capturedStyle,
    },
  ];
}

function resolveRefTargets(editor: Editor, index: BlockIndex, step: MutationStep, where: RefWhere): CompiledTarget[] {
  const ref = where.ref;
  if (ref.startsWith('text:')) {
    return resolveTextRef(editor, index, step, ref);
  }
  return resolveBlockRef(editor, index, step, ref);
}

// ---------------------------------------------------------------------------

function resolveStepTargets(editor: Editor, index: BlockIndex, step: MutationStep): CompiledTarget[] {
  const where = step.where;

  let targets: CompiledTarget[];

  if (isRefWhere(where)) {
    targets = resolveRefTargets(editor, index, step, where);
  } else if (isSelectWhere(where)) {
    const resolved = resolveTextSelector(editor, index, where.select, where.within, step.id);
    targets = resolved.addresses.map((addr) => {
      const capturedStyle =
        step.op === 'text.rewrite' ? captureRunsInRange(editor, addr.blockPos, addr.from, addr.to) : undefined;

      return {
        stepId: step.id,
        op: step.op,
        blockId: addr.blockId,
        from: addr.from,
        to: addr.to,
        text: addr.text,
        marks: addr.marks,
        capturedStyle,
      };
    });
  } else {
    throw planError('INVALID_INPUT', `unsupported where.by value`, step.id);
  }

  // Sort by document position (ascending)
  targets.sort((a, b) => {
    if (a.blockId === b.blockId) return a.from - b.from;
    const posA = index.candidates.find((c) => c.nodeId === a.blockId)?.pos ?? 0;
    const posB = index.candidates.find((c) => c.nodeId === b.blockId)?.pos ?? 0;
    return posA - posB;
  });

  // Deduplicate identical ranges
  targets = targets.filter(
    (t, i) =>
      i === 0 || t.blockId !== targets[i - 1].blockId || t.from !== targets[i - 1].from || t.to !== targets[i - 1].to,
  );

  // Apply cardinality rules
  applyCardinalityCheck(step, targets);

  // Apply cardinality truncation
  const require = 'require' in where ? where.require : undefined;
  if (require === 'first' && targets.length > 1) {
    targets = [targets[0]];
  }

  return targets;
}

export function compilePlan(editor: Editor, steps: MutationStep[]): CompiledPlan {
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
  for (const step of steps) {
    if (isAssertStep(step)) {
      assertSteps.push(step);
      continue;
    }

    // Validate known op via executor registry
    if (!hasStepExecutor(step.op)) {
      throw planError('INVALID_INPUT', `unknown step op "${step.op}"`, step.id);
    }

    const targets = resolveStepTargets(editor, index, step);
    mutationSteps.push({ step, targets });
  }

  // Overlap detection across mutation steps
  detectOverlaps(mutationSteps);

  return { mutationSteps, assertSteps };
}

function detectOverlaps(steps: CompiledStep[]): void {
  // Collect all target ranges grouped by blockId
  const rangesByBlock = new Map<string, Array<{ stepId: string; from: number; to: number }>>();

  for (const compiled of steps) {
    for (const target of compiled.targets) {
      let blockRanges = rangesByBlock.get(target.blockId);
      if (!blockRanges) {
        blockRanges = [];
        rangesByBlock.set(target.blockId, blockRanges);
      }
      blockRanges.push({ stepId: target.stepId, from: target.from, to: target.to });
    }
  }

  // Check for overlaps within each block
  for (const [blockId, ranges] of rangesByBlock) {
    ranges.sort((a, b) => a.from - b.from);
    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1];
      const curr = ranges[i];
      // Different steps overlapping
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
