/**
 * Style resolver — captures inline marks from matched ranges and applies
 * non-uniform resolution strategies for text.rewrite operations.
 *
 * Phase 7: Style capture and style-aware rewrite.
 */

import type { InlineStylePolicy, SetMarks, MarkKey, InlineToggleDirective } from '@superdoc/document-api';
import { MARK_KEYS } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { planError } from './errors.js';
import { TOGGLE_MARK_SPECS, applyDirectiveToMarks } from './mark-directives.js';

// ---------------------------------------------------------------------------
// Run types — describes contiguous spans sharing identical marks within a block
// ---------------------------------------------------------------------------

/** A ProseMirror mark as seen on inline text nodes. */
interface PmMark {
  type: { name: string; create: (attrs?: Record<string, unknown> | null) => PmMark };
  attrs: Record<string, unknown>;
  eq: (other: PmMark) => boolean;
}

/** One contiguous run of text sharing identical marks. */
export interface CapturedRun {
  /** Offset relative to block start. */
  from: number;
  /** Offset relative to block start. */
  to: number;
  /** Character count (to - from). */
  charCount: number;
  /** The active marks on this run. */
  marks: readonly PmMark[];
}

/** Mark capture result for a matched range. */
export interface CapturedStyle {
  /** Runs within the matched range, sorted by position. */
  runs: CapturedRun[];
  /** True if all runs share the exact same mark set. */
  isUniform: boolean;
}

// ---------------------------------------------------------------------------
// Core mark names — the four marks that setMarks can override
// ---------------------------------------------------------------------------

const CORE_MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const;
type CoreMarkName = (typeof CORE_MARK_KEYS)[number];
const CORE_MARK_NAMES = new Set<CoreMarkName>(CORE_MARK_KEYS);

/** Mark names that are metadata (never affected by style policy). */
const METADATA_MARK_NAMES = new Set([
  'trackInsert',
  'trackDelete',
  'trackFormat',
  'commentMark',
  'aiMark',
  'aiAnimationMark',
]);

// ---------------------------------------------------------------------------
// Capture — extract runs from a matched range
// ---------------------------------------------------------------------------

/**
 * Capture inline runs (mark spans) from a block-relative text range.
 *
 * Walks the ProseMirror document between the absolute positions corresponding
 * to the block-relative `from`/`to` offsets, collecting each inline text node
 * as a run with its marks.
 */
export function captureRunsInRange(editor: Editor, blockPos: number, from: number, to: number): CapturedStyle {
  const doc = editor.state.doc;
  const blockNode = doc.nodeAt(blockPos);
  if (!blockNode || from < 0 || to < from || from === to) {
    return { runs: [], isUniform: true };
  }

  const runs: CapturedRun[] = [];
  let offset = 0;

  const maybePushRun = (start: number, end: number, marks: readonly PmMark[]) => {
    const overlapStart = Math.max(start, from);
    const overlapEnd = Math.min(end, to);
    if (overlapStart >= overlapEnd) return;

    runs.push({
      from: overlapStart,
      to: overlapEnd,
      charCount: overlapEnd - overlapStart,
      marks: marks.filter((m) => !METADATA_MARK_NAMES.has(m.type.name)),
    });
  };

  const walkNode = (node: import('prosemirror-model').Node): void => {
    if (node.isText) {
      const text = node.text ?? '';
      if (text.length > 0) {
        const start = offset;
        const end = offset + text.length;
        const marks = Array.isArray((node as { marks?: unknown }).marks)
          ? ((node as unknown as { marks: PmMark[] }).marks as readonly PmMark[])
          : [];
        maybePushRun(start, end, marks);
        offset = end;
      }
      return;
    }

    if (node.isLeaf) {
      // Inline leaf nodes (bookmarks, images, etc.) occupy one offset slot in
      // the flattened text model. Emit a synthetic run so the runs array tiles
      // contiguously — without this, assertRunTilingInvariant sees a gap.
      const start = offset;
      offset += 1;
      maybePushRun(start, offset, []);
      return;
    }

    let isFirstChild = true;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);

      // Block separators contribute one offset slot in the flattened model.
      if (child.isBlock && !isFirstChild) {
        offset += 1;
      }

      walkNode(child);
      isFirstChild = false;
    }
  };

  walkNode(blockNode);

  const isUniform = checkUniformity(runs);

  return { runs, isUniform };
}

/**
 * Check whether all runs share the exact same mark set.
 */
export function checkUniformity(runs: CapturedRun[]): boolean {
  if (runs.length <= 1) return true;

  const reference = runs[0].marks;
  for (let i = 1; i < runs.length; i++) {
    if (!marksEqual(reference, runs[i].marks)) return false;
  }
  return true;
}

/**
 * Compare two mark arrays for structural equality (same types, same attrs).
 */
function marksEqual(a: readonly PmMark[], b: readonly PmMark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!a[i].eq(b[i])) return false;
  }
  return true;
}

function isCoreMarkName(markName: string): markName is CoreMarkName {
  return CORE_MARK_NAMES.has(markName as CoreMarkName);
}

function deriveCoreMarkDirective(run: CapturedRun, markName: CoreMarkName): InlineToggleDirective {
  const spec = TOGGLE_MARK_SPECS[markName];
  const mark = run.marks.find((m) => m.type.name === spec.schemaName);
  if (!mark) return 'clear';
  return spec.isOff(mark) ? 'off' : 'on';
}

function findCoreMarkInState(
  runs: CapturedRun[],
  markName: CoreMarkName,
  directive: Exclude<InlineToggleDirective, 'clear'>,
): PmMark | undefined {
  for (const run of runs) {
    const state = deriveCoreMarkDirective(run, markName);
    if (state !== directive) continue;

    const spec = TOGGLE_MARK_SPECS[markName];
    const found = run.marks.find((m) => m.type.name === spec.schemaName);
    if (found) return found;
  }
  return undefined;
}

function createCoreMarkFromState(
  editor: Editor,
  markName: CoreMarkName,
  directive: Exclude<InlineToggleDirective, 'clear'>,
): PmMark | undefined {
  const spec = TOGGLE_MARK_SPECS[markName];
  const markType = editor.state.schema.marks[spec.schemaName];
  if (!markType) return undefined;

  if (directive === 'on') {
    return spec.createOn(markType) as unknown as PmMark;
  }
  return markType.create(spec.offAttrs) as unknown as PmMark;
}

function resolveMajorityDirectiveForCoreMark(runs: CapturedRun[], markName: CoreMarkName): InlineToggleDirective {
  const tally: Record<InlineToggleDirective, { chars: number; firstRunIdx: number }> = {
    on: { chars: 0, firstRunIdx: Number.POSITIVE_INFINITY },
    off: { chars: 0, firstRunIdx: Number.POSITIVE_INFINITY },
    clear: { chars: 0, firstRunIdx: Number.POSITIVE_INFINITY },
  };

  for (let i = 0; i < runs.length; i++) {
    const directive = deriveCoreMarkDirective(runs[i], markName);
    tally[directive].chars += runs[i].charCount;
    if (i < tally[directive].firstRunIdx) {
      tally[directive].firstRunIdx = i;
    }
  }

  let winner: InlineToggleDirective = 'clear';
  for (const directive of ['on', 'off', 'clear'] as const) {
    const current = tally[directive];
    const best = tally[winner];
    if (current.chars > best.chars || (current.chars === best.chars && current.firstRunIdx < best.firstRunIdx)) {
      winner = directive;
    }
  }
  return winner;
}

// ---------------------------------------------------------------------------
// Resolution — resolve non-uniform styles using strategies
// ---------------------------------------------------------------------------

/**
 * Resolve the mark set to apply for a text.rewrite step, given the captured
 * style data and the inline style policy.
 *
 * Returns an array of PM marks to apply to the replacement text.
 */
export function resolveInlineStyle(
  editor: Editor,
  captured: CapturedStyle,
  policy: InlineStylePolicy,
  stepId: string,
): readonly PmMark[] {
  if (policy.mode === 'clear') return [];

  if (policy.mode === 'set') {
    return buildMarksFromPolicy(editor, policy.setMarks);
  }

  // preserve or merge — need captured style data

  // requireUniform pre-check
  if (policy.requireUniform && !captured.isUniform) {
    throw planError(
      'STYLE_CONFLICT',
      'matched range has non-uniform inline styles and requireUniform is true',
      stepId,
      { runCount: captured.runs.length },
    );
  }

  let resolvedMarks: readonly PmMark[];

  if (captured.isUniform || captured.runs.length === 0) {
    // Uniform — use the marks from the first (and only distinct) run
    resolvedMarks = captured.runs.length > 0 ? captured.runs[0].marks : [];
  } else {
    // Non-uniform — apply resolution strategy
    const strategy = policy.onNonUniform ?? 'useLeadingRun';

    if (strategy === 'error') {
      throw planError(
        'STYLE_CONFLICT',
        'matched range has non-uniform inline styles and onNonUniform is "error"',
        stepId,
        { runCount: captured.runs.length },
      );
    }

    resolvedMarks = applyNonUniformStrategy(editor, captured.runs, strategy);
  }

  // Apply setMarks overrides (preserve + setMarks or merge mode)
  if (policy.setMarks) {
    return applySetMarksToResolved(editor, resolvedMarks, policy.setMarks);
  }

  return resolvedMarks;
}

// ---------------------------------------------------------------------------
// Non-uniform resolution strategies
// ---------------------------------------------------------------------------

function applyNonUniformStrategy(
  editor: Editor,
  runs: CapturedRun[],
  strategy: 'useLeadingRun' | 'majority' | 'union',
): readonly PmMark[] {
  switch (strategy) {
    case 'useLeadingRun':
      return resolveUseLeadingRun(runs);
    case 'majority':
      return resolveMajority(editor, runs);
    case 'union':
      return resolveUnion(editor, runs);
  }
}

/**
 * Use the mark set of the first run (lowest document position).
 */
function resolveUseLeadingRun(runs: CapturedRun[]): readonly PmMark[] {
  return runs.length > 0 ? runs[0].marks : [];
}

/**
 * Per-mark character-weighted voting.
 * - Core toggle marks (bold/italic/underline/strike): vote over tri-state
 *   directives (`on` | `off` | `clear`), with ties broken by first run.
 * - Value-bearing marks: vote each attribute independently by covered chars.
 */
function resolveMajority(editor: Editor, runs: CapturedRun[]): readonly PmMark[] {
  const totalChars = runs.reduce((sum, r) => sum + r.charCount, 0);
  if (totalChars === 0) return [];

  // Collect all unique mark type names across all runs
  const allMarkNames = new Set<string>();
  for (const run of runs) {
    for (const mark of run.marks) {
      allMarkNames.add(mark.type.name);
    }
  }

  const resultMarks: PmMark[] = [];

  for (const markName of allMarkNames) {
    if (isCoreMarkName(markName)) {
      const winningDirective = resolveMajorityDirectiveForCoreMark(runs, markName);
      if (winningDirective === 'clear') {
        continue;
      }

      const resolvedMark =
        findCoreMarkInState(runs, markName, winningDirective) ??
        createCoreMarkFromState(editor, markName, winningDirective);
      if (resolvedMark) {
        resultMarks.push(resolvedMark);
      }
    } else {
      // Value-bearing mark (e.g., textStyle) — per-attribute majority voting
      resolveValueBearingMarkMajority(runs, markName, totalChars, resultMarks);
    }
  }

  return resultMarks;
}

/**
 * For value-bearing marks (textStyle, etc.), resolve each attribute independently
 * using character-weighted majority. Ties go to the first run's value.
 */
function resolveValueBearingMarkMajority(
  runs: CapturedRun[],
  markName: string,
  totalChars: number,
  resultMarks: PmMark[],
): void {
  // Check if any run has this mark
  let anyRunHasMark = false;
  for (const run of runs) {
    if (run.marks.some((m) => m.type.name === markName)) {
      anyRunHasMark = true;
      break;
    }
  }
  if (!anyRunHasMark) return;

  // Collect all attribute keys across all instances of this mark
  const allAttrKeys = new Set<string>();
  const markInstances: Array<{ mark: PmMark; run: CapturedRun }> = [];

  for (const run of runs) {
    const mark = run.marks.find((m) => m.type.name === markName);
    if (mark) {
      markInstances.push({ mark, run });
      for (const key of Object.keys(mark.attrs)) {
        allAttrKeys.add(key);
      }
    }
  }

  // For each attribute, find the majority value
  const resolvedAttrs: Record<string, unknown> = {};
  let hasAnyAttr = false;

  for (const key of allAttrKeys) {
    // Tally: value → total chars
    const valueTally = new Map<string, { chars: number; firstRunIdx: number; value: unknown }>();

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const mark = run.marks.find((m) => m.type.name === markName);
      const value = mark ? mark.attrs[key] : undefined;
      const serialized = JSON.stringify(value);

      const existing = valueTally.get(serialized);
      if (existing) {
        existing.chars += run.charCount;
      } else {
        valueTally.set(serialized, { chars: run.charCount, firstRunIdx: i, value });
      }
    }

    // Find winner — strict majority, ties go to first run's value
    let winner: { chars: number; firstRunIdx: number; value: unknown } | undefined;
    for (const entry of valueTally.values()) {
      if (
        !winner ||
        entry.chars > winner.chars ||
        (entry.chars === winner.chars && entry.firstRunIdx < winner.firstRunIdx)
      ) {
        winner = entry;
      }
    }

    if (winner && winner.value !== undefined) {
      resolvedAttrs[key] = winner.value;
      hasAnyAttr = true;
    }
  }

  if (hasAnyAttr && markInstances.length > 0) {
    // Create a mark with the resolved attrs using the first instance's type
    const templateMark = markInstances[0].mark;
    try {
      const resolvedMark = templateMark.type.create(resolvedAttrs);
      resultMarks.push(resolvedMark as unknown as PmMark);
    } catch {
      // If creation fails, use the first run's mark instance
      resultMarks.push(templateMark);
    }
  }
}

/**
 * Union strategy for non-uniform marks.
 * - Core toggle marks: prefer ON if present on any run; otherwise OFF if present;
 *   otherwise CLEAR (omitted).
 * - Value-bearing marks: use the first run instance that has the mark.
 */
function resolveUnion(editor: Editor, runs: CapturedRun[]): readonly PmMark[] {
  // Collect all unique mark type names
  const allMarkNames = new Set<string>();
  for (const run of runs) {
    for (const mark of run.marks) {
      allMarkNames.add(mark.type.name);
    }
  }

  const resultMarks: PmMark[] = [];

  for (const markName of allMarkNames) {
    if (isCoreMarkName(markName)) {
      const hasOn = runs.some((run) => deriveCoreMarkDirective(run, markName) === 'on');
      const hasOff = !hasOn && runs.some((run) => deriveCoreMarkDirective(run, markName) === 'off');
      const unionDirective: InlineToggleDirective = hasOn ? 'on' : hasOff ? 'off' : 'clear';
      if (unionDirective === 'clear') {
        continue;
      }

      const resolvedMark =
        findCoreMarkInState(runs, markName, unionDirective) ??
        createCoreMarkFromState(editor, markName, unionDirective);
      if (resolvedMark) {
        resultMarks.push(resolvedMark);
      }
    } else {
      // Value-bearing mark — use first run's instance that has it
      for (const run of runs) {
        const found = run.marks.find((m) => m.type.name === markName);
        if (found) {
          resultMarks.push(found);
          break;
        }
      }
    }
  }

  return resultMarks;
}

// ---------------------------------------------------------------------------
// setMarks override helpers — tri-state directive model
// ---------------------------------------------------------------------------

/**
 * Build PM marks from a SetMarks declaration (for mode: 'set').
 * Used when building marks from scratch (no existing marks to preserve).
 */
function buildMarksFromPolicy(editor: Editor, setMarks?: SetMarks): PmMark[] {
  if (!setMarks) return [];
  const { schema } = editor.state;
  const marks: PmMark[] = [];

  for (const key of MARK_KEYS) {
    const directive = setMarks[key as MarkKey] as InlineToggleDirective | undefined;
    if (!directive) continue;

    const spec = TOGGLE_MARK_SPECS[key as MarkKey];
    const markType = schema.marks[spec.schemaName];
    if (!markType) continue;

    if (directive === 'on') {
      marks.push(spec.createOn(markType) as unknown as PmMark);
    } else if (directive === 'off') {
      marks.push(markType.create(spec.offAttrs) as unknown as PmMark);
    }
    // 'clear' → skip (no mark)
  }

  return marks;
}

/**
 * Apply setMarks overrides to an existing resolved mark set.
 * Uses the shared `applyDirectiveToMarks` helper for correct ON-preservation
 * semantics (e.g., underline ON preserves rich attrs).
 */
function applySetMarksToResolved(editor: Editor, existingMarks: readonly PmMark[], setMarks: SetMarks): PmMark[] {
  const { schema } = editor.state;
  let marks = [...existingMarks];

  for (const key of MARK_KEYS) {
    const directive = setMarks[key as MarkKey] as InlineToggleDirective | undefined;
    if (!directive) continue;

    const spec = TOGGLE_MARK_SPECS[key as MarkKey];
    const markType = schema.marks[spec.schemaName];
    if (!markType) continue;

    marks = applyDirectiveToMarks(marks, key as MarkKey, directive, markType);
  }

  return marks;
}
