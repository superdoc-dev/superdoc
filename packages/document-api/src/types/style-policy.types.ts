/**
 * Style policy types for mutation plan steps.
 *
 * Defines how inline and paragraph styles are handled during text rewrites.
 */

import { CORE_PROPERTY_IDS, CORE_PROPERTY_ID_SET } from '../inline-semantics/property-ids.js';
import type { CorePropertyId } from '../inline-semantics/property-ids.js';

export type NonUniformStrategy = 'error' | 'useLeadingRun' | 'majority' | 'union';

/**
 * Canonical mark key set — derived from inline-semantics property IDs.
 * Retained for backward compatibility; prefer {@link CORE_PROPERTY_IDS} in new code.
 */
export const MARK_KEYS = CORE_PROPERTY_IDS;

/** A single canonical mark key. Equivalent to {@link CorePropertyId}. */
export type MarkKey = CorePropertyId;

/** Runtime set for O(1) mark key validation. Equivalent to {@link CORE_PROPERTY_ID_SET}. */
export const MARK_KEY_SET: ReadonlySet<string> = CORE_PROPERTY_ID_SET;

// ---------------------------------------------------------------------------
// Inline toggle directive model — tri-state: on | off | clear
// ---------------------------------------------------------------------------

/** Canonical directive vocabulary for inline toggle properties. */
export const INLINE_DIRECTIVES = ['on', 'off', 'clear'] as const;

/** A single inline toggle directive. */
export type InlineToggleDirective = (typeof INLINE_DIRECTIVES)[number];

/** Runtime set for O(1) directive validation. */
export const INLINE_DIRECTIVE_SET: ReadonlySet<string> = new Set(INLINE_DIRECTIVES);

/**
 * Inline toggle directives for core-4 marks.
 *
 * - `'on'`    — write direct ON formatting.
 * - `'off'`   — write explicit run-level OFF/negation override.
 * - `'clear'` — remove direct run-level property (inherit from style cascade).
 */
export interface SetMarks {
  bold?: InlineToggleDirective;
  italic?: InlineToggleDirective;
  underline?: InlineToggleDirective;
  strike?: InlineToggleDirective;
}

export interface InlineStylePolicy {
  mode: 'preserve' | 'set' | 'clear' | 'merge';
  requireUniform?: boolean;
  onNonUniform?: NonUniformStrategy;
  setMarks?: SetMarks;
}

export interface ParagraphStylePolicy {
  mode: 'preserve' | 'set' | 'clear';
}

export interface StylePolicy {
  inline: InlineStylePolicy;
  paragraph?: ParagraphStylePolicy;
}

export interface InsertStylePolicy {
  inline: {
    mode: 'inherit' | 'set' | 'clear';
    setMarks?: SetMarks;
  };
}
