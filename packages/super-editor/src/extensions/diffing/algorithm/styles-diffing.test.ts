import { describe, expect, it } from 'vitest';
import type { StylesDocumentProperties } from '@superdoc/style-engine/ooxml';
import { diffStyles } from './styles-diffing';

/**
 * Builds a minimal style snapshot for diff tests.
 */
function createStyleSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    docDefaults: {},
    latentStyles: {},
    styles: {},
    ...overrides,
  } as StylesDocumentProperties;
}

describe('diffStyles', () => {
  it('returns null when style snapshots are effectively equal', () => {
    const oldStyles = createStyleSnapshot({
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal' },
      },
    });
    const newStyles = createStyleSnapshot({
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal' },
      },
    });

    expect(diffStyles(oldStyles, newStyles)).toBeNull();
  });

  it('captures added, removed, and modified style definitions', () => {
    const oldStyles = createStyleSnapshot({
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal' },
        Heading1: { styleId: 'Heading1', type: 'paragraph', name: 'Heading 1' },
      },
    });
    const newStyles = createStyleSnapshot({
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal Updated' },
        Heading2: { styleId: 'Heading2', type: 'paragraph', name: 'Heading 2' },
      },
    });

    const result = diffStyles(oldStyles, newStyles);

    expect(result).not.toBeNull();
    expect(result?.addedStyles).toHaveProperty('Heading2');
    expect(result?.removedStyles).toHaveProperty('Heading1');
    expect(result?.modifiedStyles).toHaveProperty('Normal');
    expect(result?.modifiedStyles.Normal.modified.name).toEqual({
      from: 'Normal',
      to: 'Normal Updated',
    });
  });

  it('captures doc defaults and latent styles changes', () => {
    const oldStyles = createStyleSnapshot({
      docDefaults: {
        runProperties: {
          bold: false,
        },
      },
      latentStyles: {
        defQFormat: false,
      },
    });
    const newStyles = createStyleSnapshot({
      docDefaults: {
        runProperties: {
          bold: true,
        },
      },
      latentStyles: {
        defQFormat: true,
      },
    });

    const result = diffStyles(oldStyles, newStyles);

    expect(result).not.toBeNull();
    expect(result?.docDefaultsDiff?.modified['runProperties.bold']).toEqual({
      from: false,
      to: true,
    });
    expect(result?.latentStylesDiff?.modified.defQFormat).toEqual({
      from: false,
      to: true,
    });
    expect(result?.addedStyles).toEqual({});
    expect(result?.removedStyles).toEqual({});
    expect(result?.modifiedStyles).toEqual({});
  });
});
