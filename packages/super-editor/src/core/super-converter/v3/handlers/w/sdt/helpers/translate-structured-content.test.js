import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateStructuredContent } from './translate-structured-content';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';

// Mock dependencies
vi.mock('@converter/v2/exporter/helpers/translateChildNodes', () => ({
  translateChildNodes: vi.fn(),
}));

describe('translateStructuredContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translateChildNodes.mockReturnValue([{ name: 'w:p', elements: [{ name: 'w:t', text: 'Test content' }] }]);
  });

  it('returns correct XML structure with sdtPr and sdtContent', () => {
    const mockSdtPr = {
      name: 'w:sdtPr',
      elements: [],
      type: 'element',
    };

    const node = {
      content: [{ type: 'paragraph', text: 'Test' }],
      attrs: { sdtPr: mockSdtPr },
    };
    const params = { node };

    const result = translateStructuredContent(params);

    expect(translateChildNodes).toHaveBeenCalledWith({ ...params, node });
    expect(result).toEqual({
      name: 'w:sdt',
      elements: [
        mockSdtPr,
        {
          name: 'w:sdtContent',
          elements: [{ name: 'w:p', elements: [{ name: 'w:t', text: 'Test content' }] }],
        },
      ],
    });
  });

  it('returns runs when exporting structuredContent for final doc', () => {
    const node = {
      type: 'structuredContent',
      content: [{ type: 'text', text: 'Hello' }],
    };
    const params = { node, isFinalDoc: true };
    const childElements = [
      { name: 'w:r', elements: [{ name: 'w:t', text: 'Hello' }] },
      { name: 'w:t', text: 'World' },
    ];
    translateChildNodes.mockReturnValueOnce(childElements);

    const result = translateStructuredContent(params);

    expect(result).toEqual([
      childElements[0],
      {
        name: 'w:r',
        type: 'element',
        elements: [childElements[1]],
      },
    ]);
  });

  it('returns table element for structuredContentBlock in final doc', () => {
    const node = {
      type: 'structuredContentBlock',
      content: [
        {
          type: 'table',
          content: [],
        },
      ],
      attrs: {},
    };
    const params = { node, isFinalDoc: true };
    const childElements = [
      {
        name: 'w:tbl',
        elements: [
          {
            name: 'w:tr',
            elements: [{ name: 'w:tc', elements: [{ name: 'w:p', elements: [{ name: 'w:t', text: 'Cell' }] }] }],
          },
        ],
      },
    ];
    translateChildNodes.mockReturnValueOnce(childElements);

    const result = translateStructuredContent(params);

    expect(translateChildNodes).toHaveBeenCalledWith({ ...params, node });
    expect(result).toEqual(childElements[0]);
  });

  describe('w:lock export', () => {
    it('exports w:lock element for sdtLocked mode', () => {
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123', lockMode: 'sdtLocked' },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElement = sdtPr.elements.find((el) => el.name === 'w:lock');

      expect(lockElement).toBeDefined();
      expect(lockElement.attributes['w:val']).toBe('sdtLocked');
    });

    it('exports w:lock element for contentLocked mode', () => {
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123', lockMode: 'contentLocked' },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElement = sdtPr.elements.find((el) => el.name === 'w:lock');

      expect(lockElement).toBeDefined();
      expect(lockElement.attributes['w:val']).toBe('contentLocked');
    });

    it('exports w:lock element for sdtContentLocked mode', () => {
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123', lockMode: 'sdtContentLocked' },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElement = sdtPr.elements.find((el) => el.name === 'w:lock');

      expect(lockElement).toBeDefined();
      expect(lockElement.attributes['w:val']).toBe('sdtContentLocked');
    });

    it('does not export w:lock element for unlocked mode', () => {
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123', lockMode: 'unlocked' },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElement = sdtPr.elements.find((el) => el.name === 'w:lock');

      expect(lockElement).toBeUndefined();
    });

    it('does not export w:lock element when lockMode is not set', () => {
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123' },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElement = sdtPr.elements.find((el) => el.name === 'w:lock');

      expect(lockElement).toBeUndefined();
    });

    it('excludes w:lock from passthrough sdtPr elements to avoid duplication', () => {
      const originalSdtPr = {
        name: 'w:sdtPr',
        elements: [
          { name: 'w:lock', attributes: { 'w:val': 'contentLocked' } },
          { name: 'w:placeholder', elements: [] },
        ],
      };
      const node = {
        content: [{ type: 'text', text: 'Test' }],
        attrs: { id: '123', lockMode: 'sdtContentLocked', sdtPr: originalSdtPr },
      };
      const params = { node };

      const result = translateStructuredContent(params);

      const sdtPr = result.elements.find((el) => el.name === 'w:sdtPr');
      const lockElements = sdtPr.elements.filter((el) => el.name === 'w:lock');

      // Should only have one w:lock element with the new value
      expect(lockElements.length).toBe(1);
      expect(lockElements[0].attributes['w:val']).toBe('sdtContentLocked');
    });
  });
});
