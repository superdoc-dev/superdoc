/**
 * Shared mark directive helpers — single source of truth for ON/OFF/CLEAR
 * canonical forms and directive application logic.
 *
 * Used by: executor, style-resolver, match-style-helpers.
 */

import type { InlineToggleDirective, MarkKey } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// ProseMirror mark type interface (minimal shape for directive logic)
// ---------------------------------------------------------------------------

interface PmMark {
  type: { name: string; create: (attrs?: Record<string, unknown> | null) => PmMark };
  attrs: Record<string, unknown>;
  eq: (other: PmMark) => boolean;
}

interface PmMarkType {
  create: (attrs?: Record<string, unknown> | null) => PmMark;
}

// ---------------------------------------------------------------------------
// Canonical ON/OFF mark attr tables — single source of truth
// ---------------------------------------------------------------------------

interface ToggleMarkSpec {
  schemaName: string;
  isOff: (mark: PmMark) => boolean;
  isOn: (mark: PmMark) => boolean;
  offAttrs: Record<string, unknown>;
  createOn: (markType: PmMarkType, existingMark?: PmMark) => PmMark;
}

/**
 * Core-4 toggle OFF values seen across import paths:
 * - canonical string token: `'0'`
 * - legacy/strict parser boolean token: `false`
 * - numeric token from permissive decoders: `0`
 */
export function isSimpleToggleOffValue(value: unknown): boolean {
  return value === '0' || value === false || value === 0;
}

function isSimpleToggleOff(mark: PmMark): boolean {
  return isSimpleToggleOffValue(mark.attrs.value);
}

function isSimpleToggleOn(mark: PmMark): boolean {
  return !isSimpleToggleOff(mark);
}

function isUnderlineOff(mark: PmMark): boolean {
  return mark.attrs.underlineType === 'none';
}

function isUnderlineOn(mark: PmMark): boolean {
  return !isUnderlineOff(mark);
}

/** Canonical mark spec table for core-4 toggle marks. */
export const TOGGLE_MARK_SPECS: Record<MarkKey, ToggleMarkSpec> = {
  bold: {
    schemaName: 'bold',
    isOff: isSimpleToggleOff,
    isOn: isSimpleToggleOn,
    offAttrs: { value: '0' },
    createOn: (mt) => mt.create(),
  },
  italic: {
    schemaName: 'italic',
    isOff: isSimpleToggleOff,
    isOn: isSimpleToggleOn,
    offAttrs: { value: '0' },
    createOn: (mt) => mt.create(),
  },
  strike: {
    schemaName: 'strike',
    isOff: isSimpleToggleOff,
    isOn: isSimpleToggleOn,
    offAttrs: { value: '0' },
    createOn: (mt) => mt.create(),
  },
  underline: {
    schemaName: 'underline',
    isOff: isUnderlineOff,
    isOn: isUnderlineOn,
    offAttrs: { underlineType: 'none' },
    createOn: (mt, existingMark) => {
      // Preserve rich underline attrs if an ON underline already exists
      if (existingMark && isUnderlineOn(existingMark)) return existingMark;
      return mt.create({ underlineType: 'single' });
    },
  },
};

// ---------------------------------------------------------------------------
// Directive state derivation (for query.match read-side)
// ---------------------------------------------------------------------------

/**
 * Derives the direct toggle state of a mark from the PM mark set.
 *
 * - Mark present with ON attrs → `'on'`
 * - Mark present with OFF attrs → `'off'`
 * - Mark absent → `'clear'`
 */
export function deriveToggleState(marks: readonly PmMark[], markKey: MarkKey): InlineToggleDirective {
  const spec = TOGGLE_MARK_SPECS[markKey];
  const mark = marks.find((m) => m.type.name === spec.schemaName);
  if (!mark) return 'clear';
  return spec.isOff(mark) ? 'off' : 'on';
}

// ---------------------------------------------------------------------------
// Directive application helpers (for executor + style-resolver)
// ---------------------------------------------------------------------------

/**
 * Applies an inline toggle directive to a mark array, returning the new mark set.
 * This is the shared logic used by both the executor and style-resolver.
 */
export function applyDirectiveToMarks(
  marks: readonly PmMark[],
  markKey: MarkKey,
  directive: InlineToggleDirective,
  markType: PmMarkType,
): PmMark[] {
  const spec = TOGGLE_MARK_SPECS[markKey];
  const existingMark = marks.find((m) => m.type.name === spec.schemaName);
  const otherMarks = marks.filter((m) => m.type.name !== spec.schemaName);

  switch (directive) {
    case 'on': {
      if (existingMark && spec.isOn(existingMark)) {
        // Already ON — no-op (preserves rich attrs for underline)
        return [...marks];
      }
      return [...otherMarks, spec.createOn(markType, existingMark)];
    }
    case 'off': {
      if (existingMark && spec.isOff(existingMark)) {
        // Already OFF — no-op
        return [...marks];
      }
      return [...otherMarks, markType.create(spec.offAttrs)];
    }
    case 'clear': {
      if (!existingMark) {
        // Already absent — no-op
        return [...marks];
      }
      return otherMarks;
    }
  }
}
