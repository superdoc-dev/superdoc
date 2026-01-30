/**
 * @superdoc/engines-paragraph contract
 *
 * Resolves paragraph spacing and indentation from computed styles and numbering overrides.
 * Consumed by both PM adapter and layout measurer to ensure consistent geometry.
 */

export interface ParagraphSpacing {
  before: number; // pt
  after: number; // pt
  line: number; // pt or multiplier (depends on lineUnit)
  lineUnit?: 'px' | 'multiplier'; // unit for line spacing value
  lineRule: 'auto' | 'exact' | 'atLeast';
}

export interface ParagraphIndent {
  left: number; // pt
  right: number; // pt
  firstLine: number; // pt
  hanging: number; // pt
}

/**
 * Minimal subset of ComputedStyle required for spacing/indent resolution.
 * The full ComputedStyle lives in @superdoc/style-engine.
 */
export interface ParagraphStyleInput {
  spacing?: {
    before?: number;
    after?: number;
    line?: number;
    lineRule?: 'auto' | 'exact' | 'atLeast';
  };
  indent?: {
    left?: number;
    right?: number;
    firstLine?: number;
    hanging?: number;
  };
}

export interface NumberingStyleInput {
  indent?: {
    left?: number;
    hanging?: number;
  };
}

/**
 * Resolve final spacing and indentation values from styles + numbering overrides.
 *
 * Word resolution rules:
 * 1. Start with base paragraph style spacing/indent
 * 2. Apply numbering definition overrides (if list item)
 * 3. Apply direct formatting overrides
 *
 * @param style - Computed paragraph style slice
 * @param numbering - Optional numbering overrides (for list items)
 * @returns Resolved spacing and indent in pt
 */
export function resolveSpacingIndent(
  style: ParagraphStyleInput,
  numbering?: NumberingStyleInput,
): { spacing: ParagraphSpacing; indent: ParagraphIndent } {
  // Default values matching Word's defaults
  const spacing: ParagraphSpacing = {
    before: style.spacing?.before ?? 0,
    after: style.spacing?.after ?? 0,
    line: style.spacing?.line ?? 12, // Default line spacing
    lineRule: style.spacing?.lineRule ?? 'auto',
  };

  let indent: ParagraphIndent = {
    left: style.indent?.left ?? 0,
    right: style.indent?.right ?? 0,
    firstLine: style.indent?.firstLine ?? 0,
    hanging: style.indent?.hanging ?? 0,
  };

  // Apply numbering overrides if present
  if (numbering?.indent) {
    indent = {
      ...indent,
      left: numbering.indent.left ?? indent.left,
      hanging: numbering.indent.hanging ?? indent.hanging,
    };
  }

  return { spacing, indent };
}
