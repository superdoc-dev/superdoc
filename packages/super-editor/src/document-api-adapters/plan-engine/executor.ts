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
  InlineRunPatchKey,
  UnderlinePatch,
  RFontsPatch,
  BorderPatch,
  StyleApplyInput,
} from '@superdoc/document-api';
import { INLINE_PROPERTY_BY_KEY } from '@superdoc/document-api';
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
import { TOGGLE_MARK_SPECS } from './mark-directives.js';
import { mapBlockNodeType } from '../helpers/node-address-resolver.js';
import { resolveWithinScope, scopeByRange } from '../helpers/adapter-utils.js';
import { normalizeReplacementText } from './replacement-normalizer.js';
import { Fragment, Slice } from 'prosemirror-model';
import type { Mark as ProseMirrorMark, MarkType, Node as ProseMirrorNode, NodeType } from 'prosemirror-model';
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
const CORE_SET_MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const;

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

  for (const key of CORE_SET_MARK_KEYS) {
    const directive = setMarks[key];
    if (!directive) continue;

    const spec = TOGGLE_MARK_SPECS[key];
    const markType = schema.marks[spec.schemaName];
    if (!markType) continue;

    if (directive === 'on') {
      marks.push(spec.createOn(markType as unknown as { create: MarkType['create'] }) as unknown as ProseMirrorMark);
      continue;
    }
    if (directive === 'off') {
      marks.push(markType.create(spec.offAttrs));
    }
    // `clear` intentionally emits no mark.
  }

  return marks;
}

// ---------------------------------------------------------------------------
// Shared inline style patch — registry-driven mark + runAttribute mutation
// ---------------------------------------------------------------------------

type InlineRunPatch = StyleApplyInput['inline'];
type TextStylePatchKey = 'color' | 'fontSize' | 'letterSpacing' | 'vertAlign' | 'position';
type TextStylePatch = Partial<Pick<InlineRunPatch, TextStylePatchKey>>;

interface InlineTextSegment {
  from: number;
  to: number;
  marks: readonly ProseMirrorMark[];
}

interface OverlappingRun {
  pos: number;
}

const BOOLEAN_INLINE_MARK_KEYS = ['bold', 'italic', 'strike'] as const;
const TEXT_STYLE_KEYS = ['color', 'fontSize', 'letterSpacing', 'vertAlign', 'position'] as const;
const PRESERVE_RUN_PROPERTIES_META_KEY = 'sdPreserveRunPropertiesKeys';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  if (/^[0-9a-fA-F]{3,8}$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

function toPointString(value: number): string {
  return `${value}pt`;
}

function toHalfPoints(value: number): number {
  return Math.round(value * 2);
}

function collectInlineTextSegments(doc: ProseMirrorNode, absFrom: number, absTo: number): InlineTextSegment[] {
  const segments: InlineTextSegment[] = [];

  doc.nodesBetween(absFrom, absTo, (node, pos) => {
    if (!node.isText) return;

    const from = Math.max(absFrom, pos);
    const to = Math.min(absTo, pos + node.nodeSize);
    if (from >= to) return;

    segments.push({
      from,
      to,
      marks: (node.marks ?? []) as readonly ProseMirrorMark[],
    });
  });

  return segments;
}

function findMark(marks: readonly ProseMirrorMark[], markTypeName: string): ProseMirrorMark | undefined {
  return marks.find((mark) => mark.type.name === markTypeName);
}

function compactAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined));
}

function applyTriStateMarkPatch(
  tr: Transaction,
  markType: MarkType | undefined,
  absFrom: number,
  absTo: number,
  value: boolean | null | undefined,
): boolean {
  if (value === undefined || !markType) return false;

  if (value === null) {
    tr.removeMark(absFrom, absTo, markType);
    return true;
  }

  if (value === true) {
    tr.addMark(absFrom, absTo, markType.create());
    return true;
  }

  tr.addMark(absFrom, absTo, markType.create({ value: '0' }));
  return true;
}

function applyHighlightPatch(
  tr: Transaction,
  markType: MarkType | undefined,
  absFrom: number,
  absTo: number,
  value: string | null | undefined,
): boolean {
  if (value === undefined || !markType) return false;

  if (value === null) {
    tr.removeMark(absFrom, absTo, markType);
    return true;
  }

  tr.addMark(absFrom, absTo, markType.create({ color: value }));
  return true;
}

function mergeTextStyleAttrs(currentAttrs: Record<string, unknown>, patch: TextStylePatch): Record<string, unknown> {
  const next = { ...currentAttrs };

  for (const key of TEXT_STYLE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;

    if (value === null) {
      delete next[key];
      continue;
    }

    if (key === 'color' && typeof value === 'string') {
      next.color = normalizeHexColor(value);
      continue;
    }
    if ((key === 'fontSize' || key === 'letterSpacing' || key === 'position') && typeof value === 'number') {
      next[key] = toPointString(value);
      continue;
    }

    next[key] = value as string;
  }

  return compactAttrs(next);
}

function applyTextStylePatch(
  tr: Transaction,
  markType: MarkType | undefined,
  absFrom: number,
  absTo: number,
  patch: TextStylePatch,
): boolean {
  if (!markType) return false;
  if (Object.keys(patch).length === 0) return false;

  const segments = collectInlineTextSegments(tr.doc, absFrom, absTo);
  let changed = false;

  for (const segment of segments) {
    const existingMark = findMark(segment.marks, markType.name);
    const existingAttrs = (existingMark?.attrs ?? {}) as Record<string, unknown>;
    const nextAttrs = mergeTextStyleAttrs(existingAttrs, patch);
    const hadMark = Boolean(existingMark);
    const shouldKeepMark = Object.keys(nextAttrs).length > 0;

    if (!hadMark && !shouldKeepMark) continue;
    if (hadMark && shouldKeepMark && isDeepEqual(existingAttrs, nextAttrs)) continue;

    tr.removeMark(segment.from, segment.to, markType);
    if (shouldKeepMark) {
      tr.addMark(segment.from, segment.to, markType.create(nextAttrs));
    }
    changed = true;
  }

  return changed;
}

function mergeUnderlineAttrs(currentAttrs: Record<string, unknown>, patchValue: InlineRunPatch['underline']) {
  if (patchValue === null) return null;

  const next = { ...currentAttrs };

  if (patchValue === true) {
    if (!next.underlineType || next.underlineType === 'none') next.underlineType = 'single';
    return compactAttrs(next);
  }

  if (patchValue === false) {
    next.underlineType = 'none';
    return compactAttrs(next);
  }

  const patch = patchValue as UnderlinePatch;

  if (patch.style !== undefined) {
    if (patch.style === null) delete next.underlineType;
    else next.underlineType = patch.style;
  }
  if (patch.color !== undefined) {
    if (patch.color === null) delete next.underlineColor;
    else next.underlineColor = normalizeHexColor(patch.color);
  }
  if (patch.themeColor !== undefined) {
    if (patch.themeColor === null) delete next.underlineThemeColor;
    else next.underlineThemeColor = patch.themeColor;
  }

  if (!next.underlineType && (next.underlineColor || next.underlineThemeColor)) {
    next.underlineType = 'single';
  }

  const compacted = compactAttrs(next);
  return Object.keys(compacted).length > 0 ? compacted : null;
}

function applyUnderlinePatch(
  tr: Transaction,
  markType: MarkType | undefined,
  absFrom: number,
  absTo: number,
  patchValue: InlineRunPatch['underline'],
): boolean {
  if (patchValue === undefined || !markType) return false;

  const segments = collectInlineTextSegments(tr.doc, absFrom, absTo);
  let changed = false;

  for (const segment of segments) {
    const existingMark = findMark(segment.marks, markType.name);
    const existingAttrs = (existingMark?.attrs ?? {}) as Record<string, unknown>;
    const nextAttrs = mergeUnderlineAttrs(existingAttrs, patchValue);
    const hadMark = Boolean(existingMark);

    if (!hadMark && nextAttrs === null) continue;
    if (hadMark && nextAttrs !== null && isDeepEqual(existingAttrs, nextAttrs)) continue;

    tr.removeMark(segment.from, segment.to, markType);
    if (nextAttrs !== null) {
      tr.addMark(segment.from, segment.to, markType.create(nextAttrs));
    }
    changed = true;
  }

  return changed;
}

function collectOverlappingRuns(
  doc: ProseMirrorNode,
  runType: NodeType,
  absFrom: number,
  absTo: number,
): OverlappingRun[] {
  const runs: OverlappingRun[] = [];

  doc.nodesBetween(absFrom, absTo, (node, pos) => {
    if (node.type !== runType) return true;

    const runFrom = pos + 1;
    const runTo = pos + node.nodeSize - 1;
    if (Math.max(absFrom, runFrom) < Math.min(absTo, runTo)) {
      runs.push({ pos });
    }
    return false;
  });

  return runs;
}

function normalizeRFontsPatch(patch: RFontsPatch): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'csTheme') {
      next.cstheme = value;
      continue;
    }
    next[key] = value;
  }

  return next;
}

function normalizeBorderPatch(patch: BorderPatch): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  if (patch.val !== undefined) next.val = patch.val;
  if (patch.sz !== undefined) next.size = patch.sz;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.space !== undefined) next.space = patch.space;

  return next;
}

function normalizeRunAttributePatchValue(key: InlineRunPatchKey, value: unknown): unknown {
  if (value === null) return null;

  switch (key) {
    case 'border':
      return normalizeBorderPatch(value as BorderPatch);
    case 'rFonts':
      return normalizeRFontsPatch(value as RFontsPatch);
    case 'fontSizeCs':
      return toHalfPoints(value as number);
    case 'kerning':
      return toHalfPoints(value as number);
    case 'stylisticSets':
      return Array.isArray(value) ? value.map((entry) => ({ ...entry })) : value;
    default:
      return value;
  }
}

function mergeRunAttributeValue(currentValue: unknown, patchValue: unknown): { changed: boolean; nextValue?: unknown } {
  if (patchValue === null) {
    return { changed: currentValue !== undefined };
  }

  if (Array.isArray(patchValue)) {
    if (isDeepEqual(currentValue, patchValue)) return { changed: false, nextValue: currentValue };
    return { changed: true, nextValue: patchValue };
  }

  if (isRecord(patchValue)) {
    const merged = isRecord(currentValue) ? { ...currentValue } : {};
    for (const [key, value] of Object.entries(patchValue)) {
      if (value === null || value === undefined) delete merged[key];
      else merged[key] = value;
    }
    if (Object.keys(merged).length === 0) {
      return { changed: currentValue !== undefined };
    }
    if (isDeepEqual(currentValue, merged)) return { changed: false, nextValue: currentValue };
    return { changed: true, nextValue: merged };
  }

  if (Object.is(currentValue, patchValue)) return { changed: false, nextValue: currentValue };
  return { changed: true, nextValue: patchValue };
}

function buildRunAttributeUpdates(inline: InlineRunPatch): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const keys = Object.keys(inline) as InlineRunPatchKey[];

  for (const key of keys) {
    const entry = INLINE_PROPERTY_BY_KEY[key];
    if (!entry || entry.storage !== 'runAttribute') continue;

    const value = inline[key];
    if (value === undefined) continue;

    const carrier = entry.carrier;
    const runPropertyKey =
      carrier.storage === 'runAttribute'
        ? carrier.runPropertyKey
        : (() => {
            throw planError('INTERNAL_ERROR', `Invalid carrier for runAttribute key "${key}"`);
          })();

    updates[runPropertyKey] = normalizeRunAttributePatchValue(key, value);
  }

  return updates;
}

function applyRunAttributePatch(
  tr: Transaction,
  runType: NodeType | undefined,
  absFrom: number,
  absTo: number,
  updates: Record<string, unknown>,
): boolean {
  if (!runType) return false;
  if (Object.keys(updates).length === 0) return false;

  const overlappingRuns = collectOverlappingRuns(tr.doc, runType, absFrom, absTo).sort(
    (left, right) => right.pos - left.pos,
  );
  if (overlappingRuns.length === 0) return false;

  if (Object.prototype.hasOwnProperty.call(updates, 'fontFamily')) {
    tr.setMeta(PRESERVE_RUN_PROPERTIES_META_KEY, ['fontFamily']);
  }

  let changed = false;

  for (const run of overlappingRuns) {
    const runPos = tr.mapping.map(run.pos, 1);
    const runNode = tr.doc.nodeAt(runPos);
    if (!runNode || runNode.type !== runType) continue;

    const mappedFrom = tr.mapping.map(absFrom, 1);
    const mappedTo = tr.mapping.map(absTo, -1);
    const runContentFrom = runPos + 1;
    const runContentTo = runPos + runNode.nodeSize - 1;

    const patchFrom = Math.max(mappedFrom, runContentFrom);
    const patchTo = Math.min(mappedTo, runContentTo);
    if (patchFrom >= patchTo) continue;

    const currentRunProperties = isRecord(runNode.attrs?.runProperties)
      ? { ...(runNode.attrs.runProperties as Record<string, unknown>) }
      : {};

    const nextRunProperties = { ...currentRunProperties };
    let runChanged = false;

    for (const [runPropertyKey, patchValue] of Object.entries(updates)) {
      const existingValue = nextRunProperties[runPropertyKey];
      const mergeResult = mergeRunAttributeValue(existingValue, patchValue);
      if (!mergeResult.changed) continue;

      if (mergeResult.nextValue === undefined) {
        delete nextRunProperties[runPropertyKey];
      } else {
        nextRunProperties[runPropertyKey] = mergeResult.nextValue;
      }

      runChanged = true;
    }

    if (!runChanged) continue;

    const normalizedNextRunProperties = Object.keys(nextRunProperties).length > 0 ? nextRunProperties : null;
    const fullRunSelected = patchFrom === runContentFrom && patchTo === runContentTo;

    if (fullRunSelected) {
      tr.setNodeMarkup(
        runPos,
        runNode.type,
        { ...runNode.attrs, runProperties: normalizedNextRunProperties },
        runNode.marks,
      );
      changed = true;
      continue;
    }

    const relativeFrom = patchFrom - runContentFrom;
    const relativeTo = patchTo - runContentFrom;
    if (relativeFrom === relativeTo) continue;

    const replacementRuns: ProseMirrorNode[] = [];

    if (relativeFrom > 0) {
      const leftContent = runNode.content.cut(0, relativeFrom);
      replacementRuns.push(runType.create(runNode.attrs, leftContent, runNode.marks));
    }

    const middleContent = runNode.content.cut(relativeFrom, relativeTo);
    replacementRuns.push(
      runType.create({ ...runNode.attrs, runProperties: normalizedNextRunProperties }, middleContent, runNode.marks),
    );

    if (relativeTo < runNode.content.size) {
      const rightContent = runNode.content.cut(relativeTo, runNode.content.size);
      replacementRuns.push(runType.create(runNode.attrs, rightContent, runNode.marks));
    }

    // Pass node array directly so the transaction builds Fragment using its own
    // prosemirror-model instance (avoids cross-instance Fragment errors).
    tr.replaceWith(runPos, runPos + runNode.nodeSize, replacementRuns);
    changed = true;
  }

  return changed;
}

function applyInlinePatchToRange(
  editor: Editor,
  tr: Transaction,
  absFrom: number,
  absTo: number,
  inline: InlineRunPatch,
): boolean {
  if (absFrom >= absTo) return false;

  const { schema } = editor.state;
  let changed = false;

  for (const key of BOOLEAN_INLINE_MARK_KEYS) {
    const markType = schema.marks[key];
    const value = inline[key] as boolean | null | undefined;
    if (applyTriStateMarkPatch(tr, markType, absFrom, absTo, value)) {
      changed = true;
    }
  }

  if (applyUnderlinePatch(tr, schema.marks.underline, absFrom, absTo, inline.underline)) {
    changed = true;
  }

  if (applyHighlightPatch(tr, schema.marks.highlight, absFrom, absTo, inline.highlight)) {
    changed = true;
  }

  const textStylePatch: TextStylePatch = {};
  for (const key of TEXT_STYLE_KEYS) {
    if (inline[key] !== undefined) {
      (textStylePatch as Record<string, unknown>)[key] = inline[key];
    }
  }
  if (applyTextStylePatch(tr, schema.marks.textStyle, absFrom, absTo, textStylePatch)) {
    changed = true;
  }

  const runAttributeUpdates = buildRunAttributeUpdates(inline);
  if (applyRunAttributePatch(tr, schema.nodes?.run, absFrom, absTo, runAttributeUpdates)) {
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
  return { changed: applyInlinePatchToRange(editor, tr, absFrom, absTo, step.args.inline) };
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

  return { changed: applyInlinePatchToRange(editor, tr, absFrom, absTo, step.args.inline) };
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
  options: { throwOnAssertFailure: boolean; changeMode?: 'direct' | 'tracked'; isPreview?: boolean },
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
    changeMode: options.changeMode ?? 'direct',
    planGroupId: '',
    commandDispatched: false,
    isPreview: options.isPreview ?? false,
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

  const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, {
    throwOnAssertFailure: true,
    changeMode,
    isPreview: false,
  });

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
