/**
 * Style policy types for mutation plan steps.
 *
 * Defines how inline and paragraph styles are handled during text rewrites.
 */

export type NonUniformStrategy = 'error' | 'useLeadingRun' | 'majority' | 'union';

/** Canonical mark key set — single source of truth for contract, runtime, and schema. */
export const MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const;

/** A single canonical mark key. Derived from {@link MARK_KEYS}. */
export type MarkKey = (typeof MARK_KEYS)[number];

/** Runtime set for O(1) mark key validation. */
export const MARK_KEY_SET: ReadonlySet<string> = new Set(MARK_KEYS);

export interface SetMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
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
