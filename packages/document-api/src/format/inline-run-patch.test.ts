import { describe, expect, it } from 'vitest';
import { INLINE_PROPERTY_BY_KEY } from './inline-run-patch.js';

describe('INLINE_PROPERTY_REGISTRY: caps entry', () => {
  const entry = INLINE_PROPERTY_BY_KEY['caps'];

  it('exists in the registry', () => {
    expect(entry).toBeDefined();
  });

  it('uses mark storage (not runAttribute)', () => {
    expect(entry.storage).toBe('mark');
  });

  it('targets the textStyle mark with textTransform attribute', () => {
    expect(entry.carrier).toEqual({
      storage: 'mark',
      markName: 'textStyle',
      textStyleAttr: 'textTransform',
    });
  });

  it('accepts boolean input type', () => {
    expect(entry.type).toBe('boolean');
  });

  it('maps to the w:caps OOXML element', () => {
    expect(entry.ooxmlElement).toBe('w:caps');
  });
});

describe('INLINE_PROPERTY_REGISTRY: smallCaps entry', () => {
  const entry = INLINE_PROPERTY_BY_KEY['smallCaps'];

  it('uses runAttribute storage (distinct from caps)', () => {
    expect(entry.storage).toBe('runAttribute');
  });

  it('targets the run node with smallCaps property key', () => {
    expect(entry.carrier).toEqual({
      storage: 'runAttribute',
      nodeName: 'run',
      runPropertyKey: 'smallCaps',
    });
  });
});
