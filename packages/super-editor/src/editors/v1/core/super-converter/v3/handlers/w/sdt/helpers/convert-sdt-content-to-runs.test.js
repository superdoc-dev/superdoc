import { describe, it, expect } from 'vitest';
import { convertSdtContentToRuns } from './convert-sdt-content-to-runs.js';

describe('convertSdtContentToRuns', () => {
  it('wraps non-run elements into w:r nodes and ignores w:sdtPr', () => {
    const textElement = { name: 'w:t', text: 'Hello' };
    const existingRun = { name: 'w:r', elements: [{ name: 'w:t', text: 'World' }] };

    const result = convertSdtContentToRuns([{ name: 'w:sdtPr' }, textElement, existingRun]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'w:r',
      type: 'element',
      elements: [textElement],
    });
    expect(result[1]).toBe(existingRun);
  });

  it('flattens nested SDTs and preserves run-level wrappers', () => {
    const nestedRun = {
      name: 'w:r',
      elements: [{ name: 'w:t', text: 'Inner' }],
    };
    const nestedSdt = {
      name: 'w:sdt',
      elements: [{ name: 'w:sdtContent', elements: [nestedRun] }],
    };
    const hyperlink = {
      name: 'w:hyperlink',
      attributes: { 'r:id': 'rId1' },
      elements: [nestedSdt],
    };
    const root = {
      name: 'w:sdt',
      elements: [
        { name: 'w:sdtPr' },
        {
          name: 'w:sdtContent',
          elements: [hyperlink, { name: 'w:t', text: 'Tail' }],
        },
      ],
    };

    const result = convertSdtContentToRuns(root);

    expect(result).toHaveLength(2);

    const hyperlinkResult = result[0];
    expect(hyperlinkResult.name).toBe('w:hyperlink');
    expect(hyperlinkResult.attributes).toEqual({ 'r:id': 'rId1' });
    expect(hyperlinkResult.elements).toHaveLength(1);
    expect(hyperlinkResult.elements[0]).toEqual(nestedRun);

    const tailRun = result[1];
    expect(tailRun.name).toBe('w:r');
    expect(tailRun.elements[0]).toEqual({ name: 'w:t', text: 'Tail' });
  });

  it('filters runs without child elements', () => {
    const emptyElement = { name: 'w:none', elements: [] };
    const result = convertSdtContentToRuns(emptyElement);
    expect(result).toEqual([]);
  });
});
