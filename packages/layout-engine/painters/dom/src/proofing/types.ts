/**
 * Proofing rendering types for the DomPainter layer.
 *
 * These types bridge between the proofing session manager's paint slices
 * and the DOM decoration pass.
 */

/**
 * A proofing annotation keyed by PM range, ready for DOM decoration.
 * This is the input format the decoration pass consumes.
 */
export type ProofingAnnotation = {
  pmFrom: number;
  pmTo: number;
  kind: 'spelling' | 'grammar' | 'style';
};

/**
 * CSS class names used for proofing decorations.
 */
export const PROOFING_CSS = {
  /** Applied to spans containing misspelled text. */
  SPELLING: 'sd-proofing-spelling',
  /** Applied to spans containing grammar issues (future). */
  GRAMMAR: 'sd-proofing-grammar',
  /** Applied to spans containing style issues (future). */
  STYLE: 'sd-proofing-style',
  /** Data attribute marking a span as proofing-decorated (for cleanup). */
  DATA_ATTR: 'data-sd-proofing',
  /** Data attribute marking a span as a proofing sibling split. */
  SPLIT_ATTR: 'data-sd-proofing-split',
} as const;

/** Map issue kind to CSS class. */
export function cssClassForKind(kind: ProofingAnnotation['kind']): string {
  switch (kind) {
    case 'spelling':
      return PROOFING_CSS.SPELLING;
    case 'grammar':
      return PROOFING_CSS.GRAMMAR;
    case 'style':
      return PROOFING_CSS.STYLE;
  }
}
