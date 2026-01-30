import { describe, expect, it } from 'bun:test';
import { resolveSpacingIndent } from '../paragraph.js';

describe('engines-paragraph resolveSpacingIndent', () => {
  it('returns defaults when style empty', () => {
    const result = resolveSpacingIndent({});
    expect(result.spacing).toEqual({
      before: 0,
      after: 0,
      line: 12,
      lineRule: 'auto',
    });
    expect(result.indent).toEqual({
      left: 0,
      right: 0,
      firstLine: 0,
      hanging: 0,
    });
  });

  it('applies style spacing and indent values', () => {
    const result = resolveSpacingIndent({
      spacing: { before: 6, after: 12, line: 14, lineRule: 'exact' },
      indent: { left: 24, right: 12, firstLine: 18 },
    });
    expect(result.spacing).toEqual({
      before: 6,
      after: 12,
      line: 14,
      lineRule: 'exact',
    });
    expect(result.indent).toEqual({
      left: 24,
      right: 12,
      firstLine: 18,
      hanging: 0,
    });
  });

  it('applies numbering overrides', () => {
    const result = resolveSpacingIndent(
      {
        indent: { left: 12, hanging: 0 },
      },
      { indent: { left: 36, hanging: 18 } },
    );
    expect(result.indent.left).toBe(36);
    expect(result.indent.hanging).toBe(18);
  });
});
