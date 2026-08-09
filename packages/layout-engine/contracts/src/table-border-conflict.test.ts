import { describe, expect, it } from 'vitest';

import { isExplicitNoneBorder, isPresentBorder, resolveBorderConflict } from './index.js';

describe('table border conflict contract', () => {
  it('selects the present side when the opposing cell explicitly has no border', () => {
    const present = { style: 'single' as const, width: 1, color: '#000000' };

    expect(resolveBorderConflict({ style: 'none', width: 0 }, present)).toEqual(present);
    expect(resolveBorderConflict(present, { style: 'none', width: 0 })).toEqual(present);
    expect(isExplicitNoneBorder({ none: true })).toBe(true);
    expect(isPresentBorder(present)).toBe(true);
  });

  it('uses ECMA-376 weight and color precedence for two visible cell borders', () => {
    const single = { style: 'single' as const, width: 1, color: '#000000' };
    const double = { style: 'double' as const, width: 1, color: '#FFFFFF' };

    expect(resolveBorderConflict(single, double)).toEqual(double);
    expect(
      resolveBorderConflict(
        { style: 'single', width: 1, color: '#FFFFFF' },
        { style: 'single', width: 1, color: '#000000' },
      ),
    ).toEqual({ style: 'single', width: 1, color: '#000000' });
  });
});
