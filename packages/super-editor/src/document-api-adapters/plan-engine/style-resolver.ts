/**
 * Style resolver — captures inline marks from matched ranges and applies
 * non-uniform resolution strategies for text.rewrite operations.
 *
 * Phase 7: Style capture and style-aware rewrite.
 */

import type { InlineStylePolicy, SetMarks } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { planError } from './errors.js';

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

const CORE_MARK_NAMES = new Set(['bold', 'italic', 'underline', 'strike']);

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
  // Block content starts at blockPos + 1 (the +1 skips the block node's opening token)
  const contentStart = blockPos + 1;
  const absFrom = contentStart + from;
  const absTo = contentStart + to;

  const runs: CapturedRun[] = [];

  // Walk inline content between absFrom and absTo
  doc.nodesBetween(absFrom, absTo, (node, pos) => {
    if (!node.isText) return true;

    // Clamp to the matched range
    const nodeStart = Math.max(pos, absFrom);
    const nodeEnd = Math.min(pos + node.nodeSize, absTo);
    if (nodeStart >= nodeEnd) return true;

    const relFrom = nodeStart - contentStart;
    const relTo = nodeEnd - contentStart;

    // Filter out metadata marks
    const formattingMarks = (node.marks as unknown as PmMark[]).filter((m) => !METADATA_MARK_NAMES.has(m.type.name));

    runs.push({
      from: relFrom,
      to: relTo,
      charCount: relTo - relFrom,
      marks: formattingMarks,
    });

    return true;
  });

  const isUniform = checkUniformity(runs);

  return { runs, isUniform };
}

/**
 * Check whether all runs share the exact same mark set.
 */
function checkUniformity(runs: CapturedRun[]): boolean {
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
 * Per-mark character-weighted voting. A mark is included if it covers strictly
 * more than half the total characters. For value-bearing attributes, the value
 * covering the most characters wins; ties go to the first run's value.
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
    if (CORE_MARK_NAMES.has(markName)) {
      // Boolean mark — include if active chars > totalChars / 2 (strict majority)
      let activeChars = 0;
      for (const run of runs) {
        if (run.marks.some((m) => m.type.name === markName)) {
          activeChars += run.charCount;
        }
      }
      if (activeChars > totalChars / 2) {
        // Find the mark instance from any run
        for (const run of runs) {
          const found = run.marks.find((m) => m.type.name === markName);
          if (found) {
            resultMarks.push(found);
            break;
          }
        }
      }
      // Tie (exactly 50/50) → excluded
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
 * Include a mark if it appears on any run. For value-bearing attributes, use
 * the value from the first run that has the attribute.
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
    if (CORE_MARK_NAMES.has(markName)) {
      // Boolean mark — include if present on any run
      for (const run of runs) {
        const found = run.marks.find((m) => m.type.name === markName);
        if (found) {
          resultMarks.push(found);
          break;
        }
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
// setMarks override helpers
// ---------------------------------------------------------------------------

/**
 * Build PM marks from a SetMarks declaration (for mode: 'set').
 */
function buildMarksFromPolicy(editor: Editor, setMarks?: SetMarks): PmMark[] {
  if (!setMarks) return [];
  const { schema } = editor.state;
  const marks: PmMark[] = [];

  if (setMarks.bold && schema.marks.bold) marks.push(schema.marks.bold.create() as unknown as PmMark);
  if (setMarks.italic && schema.marks.italic) marks.push(schema.marks.italic.create() as unknown as PmMark);
  if (setMarks.underline && schema.marks.underline) marks.push(schema.marks.underline.create() as unknown as PmMark);
  if (setMarks.strike && schema.marks.strike) marks.push(schema.marks.strike.create() as unknown as PmMark);

  return marks;
}

/**
 * Apply setMarks overrides to an existing resolved mark set.
 * setMarks acts as a patch: true adds, false removes, undefined leaves untouched.
 */
function applySetMarksToResolved(editor: Editor, existingMarks: readonly PmMark[], setMarks: SetMarks): PmMark[] {
  const { schema } = editor.state;
  let marks = [...existingMarks];

  const overrides: Array<[boolean | undefined, unknown]> = [
    [setMarks.bold, schema.marks.bold],
    [setMarks.italic, schema.marks.italic],
    [setMarks.underline, schema.marks.underline],
    [setMarks.strike, schema.marks.strike],
  ];

  for (const [value, markType] of overrides) {
    if (value === undefined || !markType) continue;
    if (value) {
      if (!marks.some((m) => m.type === (markType as any))) {
        marks.push((markType as any).create() as PmMark);
      }
    } else {
      marks = marks.filter((m) => m.type !== (markType as any));
    }
  }

  return marks;
}
