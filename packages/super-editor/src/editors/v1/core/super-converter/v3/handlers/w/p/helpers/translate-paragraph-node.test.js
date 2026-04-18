import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateChildNodes } from '@converter/v2/exporter/helpers/index.js';
import { generateParagraphProperties } from './generate-paragraph-properties.js';

vi.mock('@converter/v2/exporter/helpers/index.js', () => ({
  translateChildNodes: vi.fn(),
}));

vi.mock('./generate-paragraph-properties.js', () => ({
  generateParagraphProperties: vi.fn(),
}));

import { translateParagraphNode } from './translate-paragraph-node.js';

const baseParams = () => ({
  node: { attrs: {} },
});

describe('translateParagraphNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns html annotation elements when present', () => {
    const params = baseParams();
    const annotationElements = [{ name: 'w:r', elements: [{ text: 'rich html' }] }];
    translateChildNodes.mockReturnValue([
      { name: 'w:r', elements: [] },
      { name: 'htmlAnnotation', elements: annotationElements },
      { name: 'w:bookmarkStart' },
    ]);

    const result = translateParagraphNode(params);

    expect(result).toBe(annotationElements);
    expect(translateChildNodes).toHaveBeenCalledWith({
      ...params,
      extraParams: { ...params.extraParams, paragraphProperties: params.node?.attrs?.paragraphProperties },
    });
    expect(generateParagraphProperties).not.toHaveBeenCalled();
  });

  it('prepends generated paragraph properties when html annotation is absent', () => {
    const params = baseParams();
    const paragraphProperties = { name: 'w:pPr', elements: [{ name: 'w:spacing' }] };
    const childElements = [{ name: 'w:r', elements: [{ text: 'content' }] }];
    translateChildNodes.mockReturnValue([...childElements]);
    generateParagraphProperties.mockReturnValue(paragraphProperties);

    const result = translateParagraphNode(params);

    expect(result).toEqual({
      name: 'w:p',
      elements: [paragraphProperties, ...childElements],
      attributes: {},
    });
    expect(translateChildNodes).toHaveBeenCalledWith({
      ...params,
      extraParams: { ...params.extraParams, paragraphProperties: params.node?.attrs?.paragraphProperties },
    });
    expect(generateParagraphProperties).toHaveBeenCalledWith(params);
  });

  it('adds rsid default attribute when provided and leaves children untouched when no paragraph properties exist', () => {
    const params = {
      node: { attrs: { rsidRDefault: '00DE1' } },
    };
    const childElements = [{ name: 'w:r', elements: [] }];
    translateChildNodes.mockReturnValue(childElements);
    generateParagraphProperties.mockReturnValue(null);

    const result = translateParagraphNode(params);

    expect(result).toEqual({
      name: 'w:p',
      elements: childElements,
      attributes: { 'w:rsidRDefault': '00DE1' },
    });
    expect(translateChildNodes).toHaveBeenCalledWith({
      ...params,
      extraParams: { ...params.extraParams, paragraphProperties: params.node?.attrs?.paragraphProperties },
    });
    expect(generateParagraphProperties).toHaveBeenCalledWith(params);
  });
});
