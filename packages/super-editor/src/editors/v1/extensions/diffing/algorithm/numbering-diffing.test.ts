import { describe, expect, it } from 'vitest';
import type { NumberingProperties } from '@superdoc/style-engine/ooxml';
import { diffNumbering } from './numbering-diffing';

/**
 * Builds a minimal numbering snapshot for diff tests.
 */
function createNumberingSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    abstracts: {},
    definitions: {},
    ...overrides,
  } as NumberingProperties;
}

describe('diffNumbering', () => {
  it('returns null when numbering snapshots are effectively equal', () => {
    const oldNumbering = createNumberingSnapshot({
      abstracts: {
        '1': { abstractNumId: 1, name: 'Default' },
      },
      definitions: {
        '10': { numId: 10, abstractNumId: 1 },
      },
    });
    const newNumbering = createNumberingSnapshot({
      abstracts: {
        '1': { abstractNumId: 1, name: 'Default' },
      },
      definitions: {
        '10': { numId: 10, abstractNumId: 1 },
      },
    });

    expect(diffNumbering(oldNumbering, newNumbering)).toBeNull();
  });

  it('captures added and removed numbering definitions', () => {
    const oldNumbering = createNumberingSnapshot({
      definitions: {
        '10': { numId: 10, abstractNumId: 1 },
      },
    });
    const newNumbering = createNumberingSnapshot({
      definitions: {
        '11': { numId: 11, abstractNumId: 2 },
      },
    });

    const result = diffNumbering(oldNumbering, newNumbering);

    expect(result).not.toBeNull();
    expect(result?.added['definitions.11.numId']).toBe(11);
    expect(result?.deleted['definitions.10.numId']).toBe(10);
  });

  it('captures modified nested numbering properties', () => {
    const oldNumbering = createNumberingSnapshot({
      abstracts: {
        '1': {
          abstractNumId: 1,
          levels: {
            '0': {
              ilvl: 0,
              lvlText: '%1.',
            },
          },
        },
      },
    });
    const newNumbering = createNumberingSnapshot({
      abstracts: {
        '1': {
          abstractNumId: 1,
          levels: {
            '0': {
              ilvl: 0,
              lvlText: '%1)',
            },
          },
        },
      },
    });

    const result = diffNumbering(oldNumbering, newNumbering);

    expect(result).not.toBeNull();
    expect(result?.modified['abstracts.1.levels.0.lvlText']).toEqual({
      from: '%1.',
      to: '%1)',
    });
  });
});
