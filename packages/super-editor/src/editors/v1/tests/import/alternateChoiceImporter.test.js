import { describe, expect, it, vi } from 'vitest';
import { alternateChoiceHandler } from '@converter/v2/importer/alternateChoiceImporter.js';

const callHandler = (nodes, extra = {}) => {
  const handlerSpy = vi.fn(({ nodes: innerNodes }) => innerNodes);
  const result = alternateChoiceHandler.handler({
    nodes,
    nodeListHandler: { handler: handlerSpy },
    path: [],
    ...extra,
  });

  return { handlerSpy, result };
};

const createTextRun = (text, attrs = {}) => ({
  type: 'element',
  name: 'w:r',
  elements: [
    {
      type: 'element',
      name: 'w:t',
      attributes: attrs,
      elements: [{ type: 'text', text }],
    },
  ],
});

describe('alternateChoiceHandler', () => {
  it('replaces mc:AlternateContent inside paragraph without losing sibling runs', () => {
    const paragraph = {
      type: 'element',
      name: 'w:p',
      elements: [
        createTextRun('Run-level AlternateContent: ', { 'xml:space': 'preserve' }),
        {
          type: 'element',
          name: 'mc:AlternateContent',
          attributes: { 'mc:Ignorable': 'w14' },
          elements: [
            {
              type: 'element',
              name: 'mc:Choice',
              attributes: { Requires: 'w14' },
              elements: [
                {
                  type: 'element',
                  name: 'w:r',
                  elements: [
                    { type: 'element', name: 'w:rPr', elements: [{ type: 'element', name: 'w:b' }] },
                    { type: 'element', name: 'w:t', elements: [{ type: 'text', text: 'choice run' }] },
                  ],
                },
              ],
            },
            {
              type: 'element',
              name: 'mc:Fallback',
              elements: [createTextRun('fallback run')],
            },
          ],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([paragraph]);

    expect(result.consumed).toBe(1);
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    const handledNodes = handlerSpy.mock.calls[0][0].nodes;
    expect(Array.isArray(handledNodes)).toBe(true);
    expect(handledNodes).toHaveLength(1);

    const processedParagraph = handledNodes[0];
    const elementNames = processedParagraph.elements.map((el) => el.name);

    expect(elementNames).toContain('w:r');
    expect(elementNames).not.toContain('mc:AlternateContent');
    const [firstRun, secondRun] = processedParagraph.elements;
    expect(firstRun.elements[0].elements[0].text).toBe('Run-level AlternateContent: ');
    expect(secondRun.elements.some((el) => el.name === 'w:rPr')).toBe(true);
    expect(secondRun.elements.some((el) => el.name === 'w:t')).toBe(true);
  });

  it('flattens a bare mc:AlternateContent node using the supported choice', () => {
    const altNode = {
      type: 'element',
      name: 'mc:AlternateContent',
      elements: [
        {
          type: 'element',
          name: 'mc:Choice',
          attributes: { Requires: 'w15' },
          elements: [
            {
              type: 'element',
              name: 'w:p',
              elements: [createTextRun('choice paragraph')],
            },
          ],
        },
        {
          type: 'element',
          name: 'mc:Fallback',
          elements: [
            {
              type: 'element',
              name: 'w:p',
              elements: [createTextRun('fallback paragraph')],
            },
          ],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([altNode]);

    expect(result.consumed).toBe(1);
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    const handledNodes = handlerSpy.mock.calls[0][0].nodes;
    expect(handledNodes).toHaveLength(1);
    expect(handledNodes[0].name).toBe('w:p');
    const firstRun = handledNodes[0].elements[0];
    expect(firstRun.elements[0].elements[0].text).toBe('choice paragraph');
  });

  it('falls back to mc:Fallback content when no supported choice exists', () => {
    const altNode = {
      type: 'element',
      name: 'mc:AlternateContent',
      elements: [
        {
          type: 'element',
          name: 'mc:Choice',
          attributes: { Requires: 'unsupported' },
          elements: [createTextRun('unsupported choice')],
        },
        {
          type: 'element',
          name: 'mc:Fallback',
          elements: [createTextRun('fallback content')],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([altNode]);

    expect(result.consumed).toBe(1);
    const handledNodes = handlerSpy.mock.calls[0][0].nodes;
    expect(handledNodes).toHaveLength(1);
    const run = handledNodes[0];
    expect(run.elements[0].elements[0].text).toBe('fallback content');
  });

  it('handles mc:AlternateContent nested inside table cell', () => {
    const tableCell = {
      type: 'element',
      name: 'w:tc',
      elements: [
        { type: 'element', name: 'w:tcPr', elements: [] },
        {
          type: 'element',
          name: 'mc:AlternateContent',
          elements: [
            {
              type: 'element',
              name: 'mc:Choice',
              attributes: { Requires: 'w14' },
              elements: [
                {
                  type: 'element',
                  name: 'w:p',
                  elements: [createTextRun('cell choice')],
                },
              ],
            },
          ],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([tableCell]);

    expect(result.consumed).toBe(1);
    const handledNodes = handlerSpy.mock.calls[0][0].nodes;
    expect(handledNodes).toHaveLength(1);
    const processedCell = handledNodes[0];
    expect(processedCell.name).toBe('w:tc');
    const paragraph = processedCell.elements.find((el) => el.name === 'w:p');
    expect(paragraph).toBeDefined();
    const text = paragraph.elements[0].elements[0].elements[0].text;
    expect(text).toBe('cell choice');
  });

  it('selects a supported choice when Requires contains multiple namespaces', () => {
    const altNode = {
      type: 'element',
      name: 'mc:AlternateContent',
      elements: [
        {
          type: 'element',
          name: 'mc:Choice',
          attributes: { Requires: 'foo wps bar' },
          elements: [createTextRun('supported choice')],
        },
        {
          type: 'element',
          name: 'mc:Fallback',
          elements: [createTextRun('unused fallback')],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([altNode]);

    expect(result.consumed).toBe(1);
    expect(handlerSpy).toHaveBeenCalledTimes(1);
    const handledCall = handlerSpy.mock.calls[0][0];
    const handledNodes = handledCall?.nodes ?? [];
    expect(handledNodes).toHaveLength(1);
    const run = handledNodes[0];
    const textElement = run.elements?.find((el) => el.name === 'w:t');
    const textNode = textElement?.elements?.find((el) => el.type === 'text');
    expect(textNode?.text).toBe('supported choice');
  });

  it('returns skipHandlerResponse when node contains no AlternateContent', () => {
    const paragraph = {
      type: 'element',
      name: 'w:p',
      elements: [createTextRun('plain paragraph')],
    };

    const { handlerSpy, result } = callHandler([paragraph]);
    expect(result).toEqual({ nodes: [], consumed: 0 });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('returns skipHandlerResponse when nodes array is empty', () => {
    const { handlerSpy, result } = callHandler([]);
    expect(result).toEqual({ nodes: [], consumed: 0 });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('falls back to the first Choice when no supported namespace or fallback exists', () => {
    const paragraph = {
      type: 'element',
      name: 'w:p',
      elements: [
        createTextRun('before '),
        {
          type: 'element',
          name: 'mc:AlternateContent',
          elements: [
            {
              type: 'element',
              name: 'mc:Choice',
              attributes: { Requires: 'unsupported' },
              elements: [createTextRun('unsupported choice')],
            },
          ],
        },
      ],
    };

    const { handlerSpy, result } = callHandler([paragraph]);

    expect(result.consumed).toBe(1);
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    const handledCall = handlerSpy.mock.calls[0][0];
    const handledNodes = handledCall?.nodes ?? [];
    expect(handledNodes).toHaveLength(1);
    const sanitizedParagraph = handledNodes[0];
    const paragraphText = sanitizedParagraph.elements
      ?.filter((el) => el.name === 'w:r')
      .flatMap((run) => run.elements || [])
      .filter((el) => el.name === 'w:t')
      .flatMap((textEl) => textEl.elements || [])
      .filter((el) => el.type === 'text')
      .map((el) => el.text)
      .join('');

    expect(paragraphText).toBe('before unsupported choice');
  });
});
