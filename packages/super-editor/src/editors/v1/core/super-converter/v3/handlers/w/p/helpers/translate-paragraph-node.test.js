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

  describe('mergeConsecutiveTrackedChanges (via translateParagraphNode)', () => {
    const helloRun = { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Hell' }] }] };
    const commentRangeStart = { name: 'w:commentRangeStart', attributes: { 'w:id': '0' } };
    const commentRangeEnd = { name: 'w:commentRangeEnd', attributes: { 'w:id': '0' } };
    const commentReferenceRun = {
      name: 'w:r',
      elements: [{ name: 'w:commentReference', attributes: { 'w:id': '0' } }],
    };
    const restRun = { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: ' rest' }] }] };

    const buildDelWrapper = (id, innerText) => ({
      name: 'w:del',
      attributes: { 'w:id': id, 'w:author': 'a', 'w:date': 'd' },
      elements: [{ name: 'w:r', elements: [{ name: 'w:delText', elements: [{ type: 'text', text: innerText }] }] }],
    });

    it('keeps trailing comment markers as siblings when no same-id wrapper follows (SD-2528)', () => {
      const params = baseParams();
      generateParagraphProperties.mockReturnValue(null);
      translateChildNodes.mockReturnValue([
        helloRun,
        commentRangeStart,
        buildDelWrapper('1', 'o worl'),
        commentRangeEnd,
        commentReferenceRun,
        restRun,
      ]);

      const result = translateParagraphNode(params);
      const names = result.elements.map((e) => e.name);

      expect(names).toEqual(['w:r', 'w:commentRangeStart', 'w:del', 'w:commentRangeEnd', 'w:r', 'w:r']);

      const delNode = result.elements.find((e) => e.name === 'w:del');
      expect(delNode.elements.some((e) => e.name === 'w:commentRangeEnd')).toBe(false);
      expect(delNode.elements.some((e) => e.name === 'w:commentReference')).toBe(false);
      // The inner commentReference run check: delNode's children should be the original delText run only
      expect(delNode.elements).toHaveLength(1);
    });

    it('merges two consecutive same-id tracked changes and absorbs comment markers between them (SD-1519)', () => {
      const params = baseParams();
      generateParagraphProperties.mockReturnValue(null);
      translateChildNodes.mockReturnValue([
        buildDelWrapper('5', 'first'),
        commentRangeEnd,
        commentReferenceRun,
        buildDelWrapper('5', 'second'),
      ]);

      const result = translateParagraphNode(params);

      expect(result.elements).toHaveLength(1);
      const delNode = result.elements[0];
      expect(delNode.name).toBe('w:del');
      const innerNames = delNode.elements.map((e) => e.name);
      // first delText run, commentRangeEnd, commentReference run, second delText run
      expect(innerNames).toEqual(['w:r', 'w:commentRangeEnd', 'w:r', 'w:r']);
    });

    it('does not merge wrappers with different ids and keeps comment markers between them as siblings', () => {
      const params = baseParams();
      generateParagraphProperties.mockReturnValue(null);
      translateChildNodes.mockReturnValue([
        buildDelWrapper('1', 'first'),
        commentRangeEnd,
        buildDelWrapper('2', 'second'),
      ]);

      const result = translateParagraphNode(params);
      const names = result.elements.map((e) => e.name);

      expect(names).toEqual(['w:del', 'w:commentRangeEnd', 'w:del']);
      expect(result.elements[0].elements).toHaveLength(1);
      expect(result.elements[2].elements).toHaveLength(1);
    });
  });
});
