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

  it('keeps w:smartTagPr as smartTag metadata, not as a fake w:r (SD-2647)', () => {
    const smartTagPr = {
      name: 'w:smartTagPr',
      elements: [{ name: 'w:attr', attributes: { 'w:name': 'CountryRegion', 'w:val': 'BR' } }],
    };
    const innerRun = { name: 'w:r', elements: [{ name: 'w:t', text: 'Brazil' }] };
    const smartTag = {
      name: 'w:smartTag',
      attributes: { 'w:element': 'country-region' },
      elements: [smartTagPr, innerRun],
    };

    const result = convertSdtContentToRuns([{ name: 'w:sdtPr' }, smartTag]);

    expect(result).toHaveLength(1);
    const wrapper = result[0];
    expect(wrapper.name).toBe('w:smartTag');
    expect(wrapper.elements[0]).toEqual(smartTagPr);
    expect(wrapper.elements[1]).toBe(innerRun);
    expect(wrapper.elements.every((el) => el.name !== 'w:r' || el === innerRun)).toBe(true);
  });
});
