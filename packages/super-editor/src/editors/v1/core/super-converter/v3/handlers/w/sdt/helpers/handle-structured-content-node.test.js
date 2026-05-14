import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStructuredContentNode } from './handle-structured-content-node';
import { parseAnnotationMarks } from './handle-annotation-node';

// Mock dependencies
vi.mock('./handle-annotation-node', () => ({
  parseAnnotationMarks: vi.fn(),
}));

describe('handleStructuredContentNode', () => {
  const mockNodeListHandler = {
    handler: vi.fn(() => [{ type: 'text', text: 'translated content' }]),
  };

  const createNode = (sdtPrElements = [], sdtContentElements = []) => ({
    name: 'w:sdt',
    elements: [
      {
        name: 'w:sdtPr',
        elements: sdtPrElements,
      },
      {
        name: 'w:sdtContent',
        elements: sdtContentElements,
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseAnnotationMarks.mockReturnValue({ marks: [] });
  });

  it('returns null when nodes array is empty', () => {
    const params = { nodes: [], nodeListHandler: mockNodeListHandler };
    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns null when first node is not w:sdt', () => {
    const params = {
      nodes: [{ name: 'w:p' }],
      nodeListHandler: mockNodeListHandler,
    };
    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns null when sdtContent is missing', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [],
        },
      ],
    };

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns structuredContent type when no paragraph found', () => {
    const sdtContentElements = [
      { name: 'w:r', text: 'some text' },
      { name: 'w:t', text: 'more text' },
    ];
    const node = createNode([], sdtContentElements);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
      path: [],
    };

    parseAnnotationMarks.mockReturnValue({ marks: [{ type: 'bold' }] });

    const result = handleStructuredContentNode(params);

    expect(result.type).toBe('structuredContent');
    expect(result.content).toEqual([{ type: 'text', text: 'translated content' }]);
    expect(result.marks).toEqual([{ type: 'bold' }]);
  });

  it('returns structuredContentBlock type when paragraph found', () => {
    const sdtContentElements = [
      { name: 'w:p', elements: [{ name: 'w:t', text: 'paragraph text' }] },
      { name: 'w:r', text: 'some text' },
    ];
    const node = createNode([], sdtContentElements);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseAnnotationMarks.mockReturnValue({ marks: [] });

    const result = handleStructuredContentNode(params);

    expect(result.type).toBe('structuredContentBlock');
  });

  it('includes sdtPr in result attrs', () => {
    const sdtPrElements = [{ name: 'w:tag', attributes: { 'w:val': 'test' } }];
    const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);
    const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseAnnotationMarks.mockReturnValue({ marks: [] });

    const result = handleStructuredContentNode(params);

    expect(result.attrs.sdtPr).toEqual(sdtPr);
  });

  describe('w:lock parsing', () => {
    it('parses sdtLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'sdtLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('sdtLocked');
    });

    it('parses contentLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'contentLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('contentLocked');
    });

    it('parses sdtContentLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'sdtContentLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('sdtContentLocked');
    });

    it('defaults to unlocked when w:lock element is missing', () => {
      const sdtPrElements = [{ name: 'w:tag', attributes: { 'w:val': 'test' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });

    it('defaults to unlocked for invalid lock mode values', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'invalidMode' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });

    it('parses unlocked lock mode explicitly', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'unlocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });
  });

  describe('controlType detection', () => {
    const detectFrom = (sdtPrElements) => {
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);
      const params = { nodes: [node], nodeListHandler: mockNodeListHandler };
      parseAnnotationMarks.mockReturnValue({ marks: [] });
      return handleStructuredContentNode(params).attrs.controlType;
    };

    it('detects explicit <w:text/> as "text"', () => {
      expect(detectFrom([{ name: 'w:text' }])).toBe('text');
    });

    it('detects explicit <w:richText/> as "richText"', () => {
      expect(detectFrom([{ name: 'w:richText' }])).toBe('richText');
    });

    it('resolves typeless sdtPr (only property children) as "richText" per ECMA-376 §17.5.2.26', () => {
      // Real-world case: Word emits this for ContentControls.Add(0, range) and
      // ContentControls.Add($null, range). The sdtPr carries only properties
      // (alias/tag/id/placeholder), no type-axis child.
      const propsOnly = [
        { name: 'w:alias', attributes: { 'w:val': 'Field' } },
        { name: 'w:tag', attributes: { 'w:val': 'x' } },
        { name: 'w:id', attributes: { 'w:val': '123' } },
        { name: 'w:placeholder', elements: [{ name: 'w:docPart', attributes: { 'w:val': 'default' } }] },
      ];
      expect(detectFrom(propsOnly)).toBe('richText');
    });

    it('detects <w:date/> as "date"', () => {
      expect(detectFrom([{ name: 'w:date' }])).toBe('date');
    });

    it('detects <w14:checkbox/> as "checkbox"', () => {
      expect(detectFrom([{ name: 'w14:checkbox' }])).toBe('checkbox');
    });

    it('detects <w:comboBox/> as "comboBox"', () => {
      expect(detectFrom([{ name: 'w:comboBox' }])).toBe('comboBox');
    });

    it('detects <w:dropDownList/> as "dropDownList"', () => {
      expect(detectFrom([{ name: 'w:dropDownList' }])).toBe('dropDownList');
    });

    it('detects <w15:repeatingSection/> as "repeatingSection"', () => {
      expect(detectFrom([{ name: 'w15:repeatingSection' }])).toBe('repeatingSection');
    });

    it('detects <w:group/> as "group"', () => {
      expect(detectFrom([{ name: 'w:group' }])).toBe('group');
    });

    it('returns null for unmodeled type children so resolveControlType coerces to "unknown"', () => {
      // detectControlType returns null for unmodeled type elements; resolveControlType
      // (in sdt-info-builder.ts) coerces null → 'unknown' downstream. Verifies that
      // 'unknown' keeps its semantics: "unsupported or unrecognized type child",
      // not "typeless rich-text control".
      expect(detectFrom([{ name: 'w:bibliography' }])).toBeNull();
      expect(detectFrom([{ name: 'w:citation' }])).toBeNull();
      expect(detectFrom([{ name: 'w:equation' }])).toBeNull();
      expect(detectFrom([{ name: 'w:picture' }])).toBeNull();
      expect(detectFrom([{ name: 'w:docPartList' }])).toBeNull();
    });
  });
});
