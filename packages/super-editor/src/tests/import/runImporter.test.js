import { expect, describe, it } from 'vitest';
import { handleRunNode } from '@core/super-converter/v2/importer/runNodeImporter.js';

// Helper functions to create common mocks
const inferFamilyType = (fontName = '') => {
  const lower = fontName.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono')) return 'modern';
  if (lower.includes('script')) return 'script';
  if (lower.includes('decor')) return 'decorative';
  if (lower.includes('roman') || lower.includes('times') || lower.includes('serif')) return 'roman';
  if (lower.includes('system')) return 'system';
  return 'swiss';
};

const buildFontTable = (fontNames = []) => {
  if (!fontNames.length) return undefined;
  return {
    elements: [
      {
        name: 'w:fonts',
        elements: fontNames.map((fontName) => ({
          name: 'w:font',
          attributes: { 'w:name': fontName },
          elements: [
            {
              name: 'w:family',
              attributes: { 'w:val': inferFamilyType(fontName) },
            },
          ],
        })),
      },
    ],
  };
};

const createMockDocx = (styles = []) => {
  const fonts = new Set();
  styles.forEach((style) => {
    style?.elements?.forEach((styleChild) => {
      styleChild?.elements?.forEach((runProp) => {
        if (runProp?.name === 'w:rFonts') {
          const ascii = runProp?.attributes?.['w:ascii'];
          if (ascii) fonts.add(ascii);
        }
      });
    });
  });

  const fontTable = buildFontTable([...fonts]);

  const docx = {
    'word/styles.xml': {
      elements: [
        {
          elements: styles,
        },
      ],
    },
  };

  if (fontTable) {
    docx['word/fontTable.xml'] = fontTable;
  }

  return docx;
};

const createMockStyle = (styleId, runProperties = [], type = 'paragraph') => ({
  name: 'w:style',
  attributes: { 'w:styleId': styleId, 'w:type': type },
  elements: [
    {
      name: 'w:rPr',
      elements: runProperties,
    },
  ],
});

const createMockRunProperty = (name, attributes = {}) => ({
  name,
  attributes,
});

const createMockRunNode = (runProperties = [], text = 'Test text') => ({
  name: 'w:r',
  elements: [
    {
      name: 'w:rPr',
      elements: runProperties,
    },
    {
      name: 'w:t',
      elements: [{ text }],
    },
  ],
});

const createMockNodeListHandler = (returnType = 'text', returnText = 'Test text') => ({
  handler: () => [{ type: returnType, text: returnText, marks: [] }],
});

const createMockRunStyle = (styleId) => createMockRunProperty('w:rStyle', { 'w:val': styleId });

const createMockFont = (fontFamily) => createMockRunProperty('w:rFonts', { 'w:ascii': fontFamily });

const createMockSize = (size) => createMockRunProperty('w:sz', { 'w:val': size });

const createMockColor = (color) => createMockRunProperty('w:color', { 'w:val': color });

const createMockBold = () => createMockRunProperty('w:b', {});

const createMockItalic = () => createMockRunProperty('w:i', {});

const parseRunProperties = (runProperties = []) => {
  const resolved = {};
  runProperties.forEach((prop) => {
    if (!prop || typeof prop !== 'object') return;
    switch (prop.name) {
      case 'w:rFonts': {
        const ascii = prop.attributes?.['w:ascii'];
        if (ascii) {
          resolved.fontFamily = {
            ascii,
            hAnsi: prop.attributes?.['w:hAnsi'] || ascii,
            eastAsia: prop.attributes?.['w:eastAsia'],
            cs: prop.attributes?.['w:cs'],
          };
        }
        break;
      }
      case 'w:sz': {
        const size = Number(prop.attributes?.['w:val']);
        if (Number.isFinite(size)) resolved.fontSize = size;
        break;
      }
      case 'w:color': {
        const val = prop.attributes?.['w:val'];
        if (val) resolved.color = { val };
        break;
      }
      case 'w:b':
        resolved.bold = true;
        break;
      case 'w:i':
        resolved.italic = true;
        break;
      default:
        break;
    }
  });
  return resolved;
};

const buildTranslatedLinkedStyles = (styles = []) => {
  const translated = {
    docDefaults: {
      runProperties: {},
      paragraphProperties: {},
    },
    latentStyles: {},
    styles: {
      Normal: {
        styleId: 'Normal',
        type: 'paragraph',
        default: true,
        name: 'Normal',
        runProperties: {},
        paragraphProperties: {},
      },
    },
  };

  styles.forEach((style) => {
    const styleId = style?.attributes?.['w:styleId'];
    if (!styleId) return;
    const type = style?.attributes?.['w:type'] || 'paragraph';
    const runPropsNode = style?.elements?.find((child) => child?.name === 'w:rPr');
    const runProps = parseRunProperties(runPropsNode?.elements ?? []);
    translated.styles[styleId] = {
      styleId,
      type,
      runProperties: runProps,
      paragraphProperties: {},
    };
  });

  return translated;
};

describe('runImporter', () => {
  describe('runStyle attributes override paragraphStyleAttributes', () => {
    it('should override paragraph style attributes with run style attributes', () => {
      // Create styles with paragraph and run styles
      const paragraphStyle = createMockStyle(
        'ParagraphStyle',
        [createMockFont('Times New Roman'), createMockSize('24')],
        'paragraph',
      );

      const runStyle = createMockStyle('RunStyle', [createMockFont('Arial'), createMockSize('32')], 'character');

      const mockDocx = createMockDocx([paragraphStyle, runStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([paragraphStyle, runStyle]);
      const mockRunNode = createMockRunNode([createMockRunStyle('RunStyle')]);
      const mockNodeListHandler = createMockNodeListHandler();

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        extraParams: {
          paragraphProperties: {
            styleId: 'ParagraphStyle',
          },
        },
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.consumed).toBe(1);

      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');
      expect(textNode?.text).toBe('Test text');

      // Check that run style attributes override paragraph style attributes
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      expect(textStyleMark).toBeDefined();
      expect(textStyleMark.attrs.fontFamily).toBe('Arial, sans-serif'); // Run style font
      expect(textStyleMark.attrs.fontSize).toBe('16pt'); // Run style size
      expect(textStyleMark.attrs.styleId).toBe('RunStyle'); // Run style ID
    });

    it('should combine paragraph and run styles with correct precedence', () => {
      // Create styles with paragraph and run styles
      const paragraphStyle = createMockStyle(
        'ParagraphStyle',
        [createMockFont('Times New Roman'), createMockSize('24'), createMockBold()],
        'paragraph',
      );

      const runStyle = createMockStyle('RunStyle', [createMockFont('Arial'), createMockItalic()], 'character');

      const mockDocx = createMockDocx([paragraphStyle, runStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([paragraphStyle, runStyle]);
      const mockRunNode = createMockRunNode([createMockRunStyle('RunStyle')]);
      const mockNodeListHandler = createMockNodeListHandler();

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        extraParams: {
          paragraphProperties: {
            styleId: 'ParagraphStyle',
          },
        },
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Check that all marks are present with correct precedence
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      const boldMark = textNode.marks.find((mark) => mark.type === 'bold');
      const italicMark = textNode.marks.find((mark) => mark.type === 'italic');

      expect(textStyleMark).toBeDefined();
      expect(boldMark).toBeDefined();
      expect(italicMark).toBeDefined();

      // Run style should override paragraph style for font properties
      expect(textStyleMark.attrs.fontFamily).toBe('Arial, sans-serif'); // Run style overrides
      expect(textStyleMark.attrs.fontSize).toBe('12pt'); // Paragraph style (no override)
    });

    it('should handle run nodes without run styles', () => {
      // Create style with only paragraph styles
      const paragraphStyle = createMockStyle(
        'ParagraphStyle',
        [createMockFont('Times New Roman'), createMockSize('24')],
        'paragraph',
      );

      const mockDocx = createMockDocx([paragraphStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([paragraphStyle]);
      const mockRunNode = createMockRunNode([createMockBold()]);
      const mockNodeListHandler = createMockNodeListHandler();

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        extraParams: {
          paragraphProperties: {
            styleId: 'ParagraphStyle',
          },
        },
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Should have paragraph style attributes
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      const boldMark = textNode.marks.find((mark) => mark.type === 'bold');

      expect(textStyleMark).toBeDefined();
      expect(textStyleMark.attrs.fontFamily).toBe('Times New Roman, serif');
      expect(textStyleMark.attrs.fontSize).toBe('12pt');
      expect(boldMark).toBeDefined();

      // Should not have styleId since no run style was applied
      expect(textStyleMark.attrs.styleId).toBeUndefined();
    });
  });

  describe('textStyle mark stores the styleId', () => {
    it('should store run style ID in textStyle mark', () => {
      const runStyle = createMockStyle('CustomRunStyle', [createMockFont('Calibri')], 'character');

      const mockDocx = createMockDocx([runStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([runStyle]);
      const mockRunNode = createMockRunNode([createMockRunStyle('CustomRunStyle')]);
      const mockNodeListHandler = createMockNodeListHandler('text', 'Styled text');

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        parentStyleId: null,
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Check that styleId is stored in textStyle mark
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      expect(textStyleMark).toBeDefined();
      expect(textStyleMark.attrs.styleId).toBe('CustomRunStyle');
      expect(textStyleMark.attrs.fontFamily).toBe('Calibri, Arial, sans-serif');
    });

    it('should not add styleId when no run style is present', () => {
      const mockDocx = createMockDocx([]);
      const mockRunNode = createMockRunNode([createMockBold()]);
      const mockNodeListHandler = createMockNodeListHandler('text', 'Plain text');

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        parentStyleId: null,
        docx: mockDocx,
        translatedLinkedStyles: buildTranslatedLinkedStyles([]),
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Should not have textStyle mark with styleId
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      if (textStyleMark) {
        expect(textStyleMark.attrs.styleId).toBeUndefined();
      }
    });

    it('should handle multiple textStyle marks correctly', () => {
      const runStyle = createMockStyle('MultiStyle', [createMockFont('Verdana'), createMockSize('40')], 'character');

      const mockDocx = createMockDocx([runStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([runStyle]);
      const mockRunNode = createMockRunNode([createMockRunStyle('MultiStyle'), createMockColor('FF0000')]);
      const mockNodeListHandler = createMockNodeListHandler('text', 'Multi-styled text');

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        parentStyleId: null,
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Should have combined textStyle mark with all attributes
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      expect(textStyleMark).toBeDefined();
      expect(textStyleMark.attrs.styleId).toBe('MultiStyle');
      expect(textStyleMark.attrs.fontFamily).toBe('Verdana, Arial, sans-serif');
      expect(textStyleMark.attrs.fontSize).toBe('20pt');
      expect(textStyleMark.attrs.color).toBe('#FF0000');
    });
  });

  describe('integration with real document structure', () => {
    it('should handle run nodes with complex style hierarchies', () => {
      // Create a more complex document structure
      const headingStyle = createMockStyle(
        'Heading1',
        [createMockFont('Georgia'), createMockSize('48'), createMockBold()],
        'paragraph',
      );

      const emphasisStyle = createMockStyle('Emphasis', [createMockItalic(), createMockColor('0000FF')], 'character');

      const mockDocx = createMockDocx([headingStyle, emphasisStyle]);
      const translatedLinkedStyles = buildTranslatedLinkedStyles([headingStyle, emphasisStyle]);
      const mockRunNode = createMockRunNode([createMockRunStyle('Emphasis')], 'emphasized text');
      const mockNodeListHandler = createMockNodeListHandler('text', 'emphasized text');

      const result = handleRunNode({
        nodes: [mockRunNode],
        nodeListHandler: mockNodeListHandler,
        extraParams: {
          paragraphProperties: {
            styleId: 'Heading1',
          },
        },
        docx: mockDocx,
        translatedLinkedStyles,
      });

      expect(result.nodes).toHaveLength(1);
      const runNode = result.nodes[0];
      expect(runNode.type).toBe('run');
      const textNode = runNode.content.find((child) => child.type === 'text');

      // Should have both paragraph and run styles with correct precedence
      const textStyleMark = textNode.marks.find((mark) => mark.type === 'textStyle');
      const boldMark = textNode.marks.find((mark) => mark.type === 'bold');
      const italicMark = textNode.marks.find((mark) => mark.type === 'italic');

      expect(textStyleMark).toBeDefined();
      expect(textStyleMark.attrs.styleId).toBe('Emphasis'); // Run style ID
      expect(textStyleMark.attrs.fontFamily).toBe('Georgia, Arial, sans-serif'); // From paragraph style
      expect(textStyleMark.attrs.fontSize).toBe('24pt'); // From paragraph style
      expect(textStyleMark.attrs.color).toBe('#0000FF'); // From run style
      expect(boldMark).toBeDefined(); // From paragraph style
      expect(italicMark).toBeDefined(); // From run style
    });
  });
});
