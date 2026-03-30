// @ts-check
import { describe, it, expect } from 'vitest';
import { buildComplexFieldRuns } from './build-complex-field-runs.js';

describe('buildComplexFieldRuns', () => {
  it('produces a 5-run structure with begin, instrText, separate, cached result, and end', () => {
    const result = buildComplexFieldRuns({
      instruction: 'NUMWORDS',
      cachedText: '42',
      outputMarks: [],
      dirty: false,
    });

    expect(result).toHaveLength(5);
    expect(result[0].elements[1].attributes['w:fldCharType']).toBe('begin');
    expect(result[1].elements[1].elements[0].text).toBe(' NUMWORDS');
    expect(result[2].elements[1].attributes['w:fldCharType']).toBe('separate');
    expect(result[3].elements[1].elements[0].text).toBe('42');
    expect(result[4].elements[1].attributes['w:fldCharType']).toBe('end');
  });

  it('sets w:dirty on the begin run when dirty is true', () => {
    const result = buildComplexFieldRuns({
      instruction: 'NUMPAGES',
      cachedText: '3',
      outputMarks: [],
      dirty: true,
    });

    expect(result[0].elements[1].attributes).toEqual({
      'w:fldCharType': 'begin',
      'w:dirty': 'true',
    });
  });

  it('omits w:dirty on the begin run when dirty is false', () => {
    const result = buildComplexFieldRuns({
      instruction: 'NUMPAGES',
      cachedText: '3',
      outputMarks: [],
      dirty: false,
    });

    expect(result[0].elements[1].attributes).toEqual({
      'w:fldCharType': 'begin',
    });
  });

  it('applies outputMarks as w:rPr on every run', () => {
    const marks = [{ name: 'w:b' }, { name: 'w:i' }];
    const result = buildComplexFieldRuns({
      instruction: 'NUMCHARS',
      cachedText: '100',
      outputMarks: marks,
      dirty: false,
    });

    for (const run of result) {
      expect(run.elements[0]).toEqual({ name: 'w:rPr', elements: marks });
    }
  });

  it('handles empty cachedText', () => {
    const result = buildComplexFieldRuns({
      instruction: 'NUMPAGES',
      cachedText: '',
      outputMarks: [],
      dirty: false,
    });

    expect(result[3].elements[1].elements[0].text).toBe('');
  });
});
