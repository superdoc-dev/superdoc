import { describe, it, expect } from 'vitest';
import { computeColumnWidths } from './computeColumnWidths.js';

describe('computeColumnWidths', () => {
  it('returns null when editor is null', () => {
    expect(computeColumnWidths(null, 3)).toBeNull();
  });

  it('returns null when editor is undefined', () => {
    expect(computeColumnWidths(undefined, 3)).toBeNull();
  });

  it('returns null when converter has no pageStyles', () => {
    const editor = { converter: {} };
    expect(computeColumnWidths(editor, 3)).toBeNull();
  });

  it('returns null when pageSize has no width', () => {
    const editor = { converter: { pageStyles: { pageSize: {}, pageMargins: {} } } };
    expect(computeColumnWidths(editor, 3)).toBeNull();
  });

  it('computes equal widths for standard US Letter (8.5in, 1in margins, 3 cols)', () => {
    const editor = {
      converter: {
        pageStyles: {
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      },
    };
    // (8.5 - 1 - 1) * 96 = 624, 624 / 3 = 208
    const widths = computeColumnWidths(editor, 3);
    expect(widths).toEqual([208, 208, 208]);
  });

  it('single column gets full content width', () => {
    const editor = {
      converter: {
        pageStyles: {
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      },
    };
    // (8.5 - 1 - 1) * 96 = 624
    const widths = computeColumnWidths(editor, 1);
    expect(widths).toEqual([624]);
  });

  it('defaults margins to 0 when not provided', () => {
    const editor = {
      converter: {
        pageStyles: {
          pageSize: { width: 10 },
        },
      },
    };
    // (10 - 0 - 0) * 96 = 960, 960 / 2 = 480
    const widths = computeColumnWidths(editor, 2);
    expect(widths).toEqual([480, 480]);
  });

  it('floors fractional pixel widths', () => {
    const editor = {
      converter: {
        pageStyles: {
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      },
    };
    // (8.5 - 1 - 1) * 96 = 624, 624 / 7 = 89.14... → 89
    const widths = computeColumnWidths(editor, 7);
    expect(widths).toEqual(Array(7).fill(89));
  });
});
