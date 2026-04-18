import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@converter/v3/handlers/w/rpr', () => ({
  translator: {
    encode: vi.fn(() => ({})),
  },
}));

const { getParagraphStyleRunPropertiesFromStylesXml } = await import('./run-properties-export.js');
const { translator: wRPrTranslator } = await import('@converter/v3/handlers/w/rpr');

function makeStylesDocx(styles) {
  return {
    'word/styles.xml': {
      elements: [
        {
          name: 'w:styles',
          type: 'element',
          elements: styles,
        },
      ],
    },
  };
}

function makeStyle({ styleId, basedOn, rPrElements = [] }) {
  const elements = [];
  if (basedOn) {
    elements.push({
      name: 'w:basedOn',
      type: 'element',
      attributes: { 'w:val': basedOn },
    });
  }
  if (rPrElements.length) {
    elements.push({
      name: 'w:rPr',
      type: 'element',
      elements: rPrElements,
    });
  }
  return {
    name: 'w:style',
    type: 'element',
    attributes: { 'w:styleId': styleId },
    elements,
  };
}

describe('getParagraphStyleRunPropertiesFromStylesXml', () => {
  beforeEach(() => {
    wRPrTranslator.encode.mockReset();
  });

  it('returns empty object when styles part is missing or has no styles', () => {
    expect(getParagraphStyleRunPropertiesFromStylesXml({}, 'Heading1', {})).toEqual({});
    expect(
      getParagraphStyleRunPropertiesFromStylesXml(
        {
          'word/styles.xml': {
            elements: [{ name: 'w:styles', type: 'element', elements: [] }],
          },
        },
        'Heading1',
        {},
      ),
    ).toEqual({});
    expect(wRPrTranslator.encode).not.toHaveBeenCalled();
  });

  it('merges basedOn chain from base to derived so derived overrides base', () => {
    const baseStyle = makeStyle({
      styleId: 'Base',
      rPrElements: [
        { name: 'w:color', type: 'element', attributes: { 'w:val': '0000FF' } },
        { name: 'w:b', type: 'element', attributes: {} },
      ],
    });
    const derivedStyle = makeStyle({
      styleId: 'Heading1',
      basedOn: 'Base',
      rPrElements: [
        { name: 'w:color', type: 'element', attributes: { 'w:val': 'FF0000' } },
        { name: 'w:i', type: 'element', attributes: {} },
      ],
    });

    const docx = makeStylesDocx([baseStyle, derivedStyle]);

    wRPrTranslator.encode.mockImplementation(({ nodes }) => ({ fromNodes: nodes }));

    const result = getParagraphStyleRunPropertiesFromStylesXml(docx, 'Heading1', { docx: { theme: 'x' } });

    expect(wRPrTranslator.encode).toHaveBeenCalledTimes(1);
    const encodeArg = wRPrTranslator.encode.mock.calls[0][0];

    expect(encodeArg.docx).toEqual({ theme: 'x' });
    expect(Array.isArray(encodeArg.nodes)).toBe(true);
    expect(encodeArg.nodes).toHaveLength(1);

    const mergedRPr = encodeArg.nodes[0];
    expect(mergedRPr.name).toBe('w:rPr');

    const elementNames = (mergedRPr.elements || []).map((el) => el.name);
    expect(elementNames).toEqual(expect.arrayContaining(['w:b', 'w:i', 'w:color']));

    const colorElement = mergedRPr.elements.find((el) => el.name === 'w:color');
    expect(colorElement?.attributes?.['w:val']).toBe('FF0000');

    expect(result).toEqual({ fromNodes: expect.any(Array) });
  });

  it('falls back to docx argument when params.docx is not provided', () => {
    const style = makeStyle({
      styleId: 'Normal',
      rPrElements: [{ name: 'w:b', type: 'element', attributes: {} }],
    });
    const docx = makeStylesDocx([style]);

    getParagraphStyleRunPropertiesFromStylesXml(docx, 'Normal', {});

    expect(wRPrTranslator.encode).toHaveBeenCalledTimes(1);
    const encodeArg = wRPrTranslator.encode.mock.calls[0][0];
    expect(encodeArg.docx).toBe(docx);
  });
});
