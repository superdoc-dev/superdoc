import { describe, it, expect, vi } from 'vitest';
import { handleShapeTextboxImport } from './handle-shape-textbox-import';
import { parseInlineStyles } from './parse-inline-styles';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter';
import { preProcessTextBoxContent } from '@converter/v3/handlers/wp/helpers/textbox-content-helpers.js';

vi.mock('./parse-inline-styles');
vi.mock('@converter/v2/importer/docxImporter');
vi.mock('@converter/v2/importer/paragraphNodeImporter');
vi.mock('@converter/v3/handlers/wp/helpers/textbox-content-helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    preProcessTextBoxContent: vi.fn((content) => content),
  };
});

describe('handleShapeTextboxImport', () => {
  const createShape = (attributes = {}, elements = []) => ({
    name: 'v:shape',
    attributes,
    elements,
  });

  const createTextbox = (attributes = {}, elements = []) => ({
    name: 'v:textbox',
    attributes,
    elements,
  });

  const createTextboxContent = (elements = []) => ({
    name: 'w:txbxContent',
    elements,
  });

  const createWrap = (attributes = {}) => ({
    name: 'w10:wrap',
    attributes,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseInlineStyles.mockReturnValue({});
    defaultNodeListHandler.mockReturnValue({});
    handleParagraphNode.mockReturnValue({ nodes: [] });
  });

  it('should create shapeContainer with basic shape attributes', () => {
    const pict = {
      elements: [
        createShape({
          id: '_x0000_s1026',
          type: '#_x0000_t202',
        }),
      ],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result).toEqual({
      type: 'shapeContainer',
      attrs: {
        attributes: {
          id: '_x0000_s1026',
          type: '#_x0000_t202',
        },
      },
      content: [
        {
          type: 'shapeTextbox',
          attrs: {},
          content: [],
        },
      ],
    });
  });

  it('should include fillcolor when present in shape attributes', () => {
    const pict = {
      elements: [
        createShape({
          fillcolor: '#4472C4',
        }),
      ],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result.attrs.fillcolor).toBe('#4472C4');
  });

  it('should parse and filter styles using buildStyles', () => {
    parseInlineStyles.mockReturnValue({
      width: '100pt',
      height: '50pt',
      'margin-left': '10pt', // should be filtered out
      'mso-position-horizontal': 'center', // should be filtered out
    });

    const pict = {
      elements: [
        createShape({
          style: 'width:100pt;height:50pt;margin-left:10pt',
        }),
      ],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(parseInlineStyles).toHaveBeenCalledWith('width:100pt;height:50pt;margin-left:10pt');
    expect(result.attrs.style).toBe('width: 100pt;height: 50pt;');
  });

  it('should include wrapAttributes when wrap element exists', () => {
    const pict = {
      elements: [
        createShape({}, [
          createWrap({
            type: 'square',
            side: 'both',
          }),
        ]),
      ],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result.attrs.wrapAttributes).toEqual({
      type: 'square',
      side: 'both',
    });
  });

  it('should include textbox attributes when present', () => {
    const pict = {
      elements: [
        createShape({}, [
          createTextbox({
            style: 'mso-fit-shape-to-text:t',
            inset: '0,0,0,0',
          }),
        ]),
      ],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result.content[0].attrs.attributes).toEqual({
      style: 'mso-fit-shape-to-text:t',
      inset: '0,0,0,0',
    });
  });

  it('should process textbox content and create paragraph nodes', () => {
    const mockParagraphNodes = [
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [] },
    ];

    handleParagraphNode
      .mockReturnValueOnce({ nodes: [mockParagraphNodes[0]] })
      .mockReturnValueOnce({ nodes: [mockParagraphNodes[1]] });

    const pict = {
      elements: [
        createShape({}, [
          createTextbox({}, [
            createTextboxContent([
              { name: 'w:p', elements: [] },
              { name: 'w:p', elements: [] },
            ]),
          ]),
        ]),
      ],
    };

    const options = {
      params: { docx: { some: 'data' } },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(handleParagraphNode).toHaveBeenCalledTimes(2);
    expect(result.content[0].content).toEqual(mockParagraphNodes);
  });

  it('should handle empty textbox content', () => {
    const pict = {
      elements: [createShape({}, [createTextbox({}, [createTextboxContent([])])])],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result.content[0].content).toEqual([]);
  });

  it('should handle missing textbox element', () => {
    const pict = {
      elements: [createShape({}, [])],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    const result = handleShapeTextboxImport(options);

    expect(result.content[0]).toEqual({
      type: 'shapeTextbox',
      attrs: {},
      content: [],
    });
  });

  it('should preprocess textbox content for field codes (PAGE, NUMPAGES, etc.)', () => {
    const textboxContentElement = createTextboxContent([{ name: 'w:p', elements: [] }]);

    const pict = {
      elements: [createShape({}, [createTextbox({}, [textboxContentElement])])],
    };

    const params = { docx: { some: 'data' }, filename: 'header1.xml' };
    const options = {
      params,
      pNode: {},
      pict,
    };

    handleShapeTextboxImport(options);

    expect(preProcessTextBoxContent).toHaveBeenCalledWith(textboxContentElement, params);
  });

  it('should use preprocessed content for paragraph extraction', () => {
    const originalParagraph = { name: 'w:p', elements: [{ name: 'w:r', elements: [] }] };
    const processedParagraph = { name: 'w:p', elements: [{ name: 'sd:pageRef', attributes: {} }] };

    const textboxContentElement = createTextboxContent([originalParagraph]);

    // Mock preprocessing to return modified content
    preProcessTextBoxContent.mockReturnValueOnce({
      name: 'w:txbxContent',
      elements: [processedParagraph],
    });

    handleParagraphNode.mockReturnValue({ nodes: [{ type: 'paragraph', content: [] }] });

    const pict = {
      elements: [createShape({}, [createTextbox({}, [textboxContentElement])])],
    };

    const options = {
      params: { docx: {} },
      pNode: {},
      pict,
    };

    handleShapeTextboxImport(options);

    // Verify handleParagraphNode received the preprocessed paragraph, not the original
    expect(handleParagraphNode).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [processedParagraph],
      }),
    );
  });
});
