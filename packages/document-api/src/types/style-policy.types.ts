/**
 * Style policy types for mutation plan steps.
 *
 * Defines how inline and paragraph styles are handled during text rewrites.
 */

export type NonUniformStrategy = 'error' | 'useLeadingRun' | 'majority' | 'union';

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
