import { describe, it, expect, vi } from 'vitest';
import { posToDOMRect } from './posToDOMRect.js';

describe('posToDOMRect', () => {
  it('clamps positions and returns a DOMRect-like object', () => {
    const coordsAtPos = vi.fn((pos) => {
      return {
        top: pos,
        bottom: pos + 10,
        left: pos + 1,
        right: pos + 11,
      };
    });

    const view = {
      state: {
        doc: {
          content: { size: 100 },
        },
      },
      coordsAtPos,
    };

    const rect = posToDOMRect(view, -5, 120);

    expect(coordsAtPos).toHaveBeenCalledTimes(2);
    expect(rect).toMatchObject({
      top: 0,
      bottom: 110,
      left: 1,
      right: 111,
      width: 110,
      height: 110,
      x: 1,
      y: 0,
    });

    expect(rect.toJSON()).toEqual({
      top: 0,
      bottom: 110,
      left: 1,
      right: 111,
      width: 110,
      height: 110,
      x: 1,
      y: 0,
    });
  });
});
