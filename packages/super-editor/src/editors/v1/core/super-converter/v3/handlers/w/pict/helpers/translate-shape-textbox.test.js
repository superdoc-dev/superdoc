import { describe, it, expect, vi } from 'vitest';
import { translateShapeTextbox } from './translate-shape-textbox';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';

vi.mock('@converter/v2/exporter/helpers/translateChildNodes');

describe('translateShapeTextbox', () => {
  it('should create textbox structure with translated child nodes and attributes', () => {
    const mockElements = [
      { name: 'w:p', elements: [] },
      { name: 'w:p', elements: [] },
    ];

    translateChildNodes.mockReturnValue(mockElements);

    const params = {
      node: {
        attrs: {
          attributes: {
            style: 'mso-fit-shape-to-text:t',
            inset: '0,0,0,0',
          },
        },
      },
    };

    const result = translateShapeTextbox(params);

    expect(result).toEqual({
      name: 'v:textbox',
      attributes: {
        style: 'mso-fit-shape-to-text:t',
        inset: '0,0,0,0',
      },
      elements: [
        {
          name: 'w:txbxContent',
          elements: mockElements,
        },
      ],
    });
  });

  it('should handle empty attributes and elements', () => {
    translateChildNodes.mockReturnValue([]);

    const params = {
      node: {
        attrs: {
          attributes: {},
        },
      },
    };

    const result = translateShapeTextbox(params);

    expect(result.attributes).toEqual({});
    expect(result.elements[0].elements).toEqual([]);
  });
});
