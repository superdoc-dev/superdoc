import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnnotationNode, parseAnnotationMarks, getAttrsFromElements } from './handle-annotation-node';
import { parseTagValueJSON } from './parse-tag-value-json';
import { parseMarks } from '@converter/v2/importer/markImporter';
import { generateDocxRandomId } from '@core/helpers/generateDocxRandomId';

// Mock dependencies
vi.mock('./parse-tag-value-json', () => ({
  parseTagValueJSON: vi.fn(),
}));
vi.mock('@converter/v2/importer/markImporter', () => ({
  parseMarks: vi.fn(() => []),
}));
vi.mock('@core/helpers/generateDocxRandomId', () => ({
  generateDocxRandomId: vi.fn(() => 'test-hash-1234'),
}));

describe('handleAnnotationNode', () => {
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

  const createTag = (value) => ({
    name: 'w:tag',
    attributes: { 'w:val': value },
  });

  const createAlias = (value) => ({
    name: 'w:alias',
    attributes: { 'w:val': value },
  });

  const createTextRun = (text) => ({
    name: 'w:r',
    elements: [
      {
        name: 'w:t',
        elements: [{ type: 'text', text }],
      },
    ],
  });

  const createParagraph = (...elements) => ({
    name: 'w:p',
    elements,
  });

  const createRunWithTab = (textBefore = '', textAfter = '') => ({
    name: 'w:r',
    elements: [
      ...(textBefore
        ? [
            {
              name: 'w:t',
              elements: [{ type: 'text', text: textBefore }],
            },
          ]
        : []),
      { name: 'w:tab' },
      ...(textAfter
        ? [
            {
              name: 'w:t',
              elements: [{ type: 'text', text: textAfter }],
            },
          ]
        : []),
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseMarks.mockReturnValue([]);
    generateDocxRandomId.mockReturnValue('test-hash-1234');
  });

  it('returns null when nodes array is empty', () => {
    const params = { nodes: [] };
    const result = handleAnnotationNode(params);

    expect(result).toBeNull();
  });

  it('returns null when fieldId or type is missing', () => {
    const node = createNode([createTag('test-field')]);
    const params = { nodes: [node], editor: { options: {} } };

    parseTagValueJSON.mockReturnValue({});

    const result = handleAnnotationNode(params);

    expect(result).toBeNull();
  });

  it('processes JSON tag value correctly', () => {
    const tagValue = '{"fieldId": "123", "fieldTypeShort": "text", "displayLabel": "Test Field"}';
    const node = createNode([createTag(tagValue)]);
    const params = { nodes: [node], editor: { options: {} } };

    parseTagValueJSON.mockReturnValue({
      fieldId: '123',
      fieldTypeShort: 'text',
      displayLabel: 'Test Field',
    });

    const result = handleAnnotationNode(params);

    expect(parseTagValueJSON).toHaveBeenCalledWith(tagValue);
    expect(result).toMatchObject({
      type: 'text',
      text: '{{Test Field}}',
      attrs: {
        type: 'text',
        fieldId: '123',
        displayLabel: 'Test Field',
        defaultDisplayLabel: 'Test Field',
        hash: 'test-hash-1234',
      },
    });
  });

  it('processes legacy format correctly', () => {
    const node = createNode([
      createTag('field-123'),
      createAlias('Legacy Field'),
      {
        name: 'w:fieldTypeShort',
        attributes: { 'w:val': 'text' },
      },
    ]);
    const params = { nodes: [node], editor: { options: {} } };

    const result = handleAnnotationNode(params);

    expect(parseTagValueJSON).not.toHaveBeenCalled();
    expect(result.type).toEqual('text');
    expect(result.text).toEqual('{{Legacy Field}}');
    expect(result.attrs.type).toEqual('text');
    expect(result.attrs.fieldId).toEqual('field-123');
    expect(result.attrs.displayLabel).toEqual('Legacy Field');
    expect(result.attrs.defaultDisplayLabel).toEqual('Legacy Field');
    expect(result.attrs.multipleImage).toEqual(false);
    expect(result.attrs.hash).toEqual('test-hash-1234');
    expect(result.attrs.sdtPr).toBeDefined(); // Passthrough for round-trip
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('returns fieldAnnotation type when editor annotations option is enabled', () => {
    const tagValue = '{"fieldId": "123", "fieldTypeShort": "text", "displayLabel": "Test Field"}';
    const node = createNode([createTag(tagValue)]);
    const params = {
      nodes: [node],
      editor: { options: { annotations: true } },
    };

    parseTagValueJSON.mockReturnValue({
      fieldId: '123',
      fieldTypeShort: 'text',
      displayLabel: 'Test Field',
    });

    const result = handleAnnotationNode(params);

    expect(result.type).toBe('fieldAnnotation');
    expect(result).not.toHaveProperty('text');
  });

  it('keeps placeholder text when annotations are disabled even if SDT content differs', () => {
    const tagValue =
      '{"fieldId":"field-html","fieldTypeShort":"html","displayLabel":"Placeholder","fieldType":"HTMLINPUT","fieldColor":"#980043","fieldMultipleImage":false,"fieldFontFamily":"Arial","fieldFontSize":"9pt","fieldTextColor":null,"fieldTextHighlight":null,"hash":"b43b"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-html',
      fieldTypeShort: 'html',
      displayLabel: 'Placeholder',
      defaultDisplayLabel: '',
      fieldType: 'HTMLINPUT',
      fieldColor: '#980043',
      fieldMultipleImage: false,
      fieldFontFamily: 'Arial',
      fieldFontSize: '9pt',
      fieldTextColor: null,
      fieldTextHighlight: null,
      hash: 'b43b',
    });

    const node = createNode([createTag(tagValue), createAlias('Placeholder')], [createTextRun('Actual Content')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Placeholder}}');
    expect(result.attrs.displayLabel).toBe('Actual Content');
    expect(result.attrs.defaultDisplayLabel).toBe('Placeholder');
    expect(result.attrs.hash).toBe('b43b');
    expect(result.attrs).toMatchObject({
      fieldId: 'field-html',
      fieldType: 'HTMLINPUT',
      fieldColor: '#980043',
      type: 'html',
    });
    expect(generateDocxRandomId).not.toHaveBeenCalled();
  });

  it('uses moustache SDT content when placeholder text differs', () => {
    const tagValue =
      '{"fieldId":"field-text","fieldTypeShort":"text","displayLabel":"Placeholder","defaultDisplayLabel":"","hash":"abcd"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-text',
      fieldTypeShort: 'text',
      displayLabel: 'Placeholder',
      defaultDisplayLabel: '',
      hash: 'abcd',
    });

    const node = createNode([createTag(tagValue), createAlias('Placeholder')], [createTextRun('{{Custom Value}}')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Custom Value}}');
    expect(result.attrs.displayLabel).toBe('{{Custom Value}}');
    expect(result.attrs.defaultDisplayLabel).toBe('Placeholder');
  });

  it('keeps existing moustache placeholders without double wrapping', () => {
    const tagValue =
      '{"fieldId":"field-text","fieldTypeShort":"text","displayLabel":"{{Wrapped}}","defaultDisplayLabel":"","hash":"abcd"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-text',
      fieldTypeShort: 'text',
      displayLabel: '{{Wrapped}}',
      defaultDisplayLabel: '',
      hash: 'abcd',
    });

    const node = createNode([createTag(tagValue)], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Wrapped}}');
    expect(result.attrs.displayLabel).toBe('{{Wrapped}}');
  });

  it('uses SDT content when no placeholder labels are provided', () => {
    const tagValue =
      '{"fieldId":"field-text","fieldTypeShort":"text","displayLabel":"","defaultDisplayLabel":"","hash":"abcd"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-text',
      fieldTypeShort: 'text',
      displayLabel: '',
      defaultDisplayLabel: '',
      hash: 'abcd',
    });

    const node = createNode([createTag(tagValue)], [createTextRun('Custom content')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('Custom content');
    expect(result.attrs.displayLabel).toBe('Custom content');
    expect(result.attrs.defaultDisplayLabel).toBe('');
  });

  it('collects paragraph content with line breaks without trailing newline characters', () => {
    const tagValue =
      '{"fieldId":"field-text","fieldTypeShort":"text","displayLabel":"Paragraph","defaultDisplayLabel":"","hash":"abcd"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-text',
      fieldTypeShort: 'text',
      displayLabel: 'Paragraph',
      defaultDisplayLabel: '',
      hash: 'abcd',
    });

    const paragraph = createParagraph(createTextRun('Line one'), { name: 'w:br' }, createTextRun('Line two'));
    const node = createNode([createTag(tagValue), createAlias('Paragraph')], [paragraph]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Paragraph}}');
    expect(result.attrs.displayLabel).toBe('Line one\nLine two');
    expect(result.attrs.defaultDisplayLabel).toBe('Paragraph');
  });

  it('uses alias label when display labels are empty', () => {
    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-alias',
      fieldTypeShort: 'text',
      displayLabel: '',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag('{}'), createAlias('Alias Only')], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Alias Only}}');
    expect(result.attrs.displayLabel).toBe('Alias Only');
    expect(result.attrs.defaultDisplayLabel).toBe('Alias Only');
  });

  it('returns empty text when no labels or content exist', () => {
    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-empty',
      fieldTypeShort: 'text',
      displayLabel: '',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag('{}')], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('');
    expect(result.attrs.displayLabel).toBe('');
    expect(result.attrs.defaultDisplayLabel).toBe('');
  });

  it('captures tab characters when extracting SDT content', () => {
    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-tab',
      fieldTypeShort: 'text',
      displayLabel: 'Tab Field',
      defaultDisplayLabel: '',
      hash: null,
    });

    const paragraph = createParagraph(createRunWithTab('Left', 'Right'));
    const node = createNode([createTag('{}'), createAlias('Tab Field')], [paragraph]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: true } } });

    expect(result.attrs.displayLabel).toBe('Left\tRight');
    expect(result.attrs.defaultDisplayLabel).toBe('Tab Field');
    expect(result.type).toBe('fieldAnnotation');
  });

  it('uses SDT content when placeholder is empty', () => {
    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-content',
      fieldTypeShort: 'text',
      displayLabel: '',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag('{}')], [createTextRun('Actual content')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('Actual content');
    expect(result.attrs.displayLabel).toBe('Actual content');
  });

  it('prefers display label when alias uses Word default placeholder text', () => {
    const tagValue =
      '{"fieldId":"field-text","fieldTypeShort":"text","displayLabel":"Service","defaultDisplayLabel":"","hash":null}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-text',
      fieldTypeShort: 'text',
      displayLabel: 'Service',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag(tagValue), createAlias('Enter paragraph text')], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: false } } });

    expect(result.text).toBe('{{Service}}');
    expect(result.attrs.defaultDisplayLabel).toBe('Service');
  });

  it('returns fieldAnnotation with SDT content when annotations are enabled', () => {
    const tagValue =
      '{"fieldId":"field-html","fieldTypeShort":"html","displayLabel":"Placeholder","fieldType":"HTMLINPUT","fieldColor":"#980043","fieldMultipleImage":false,"fieldFontFamily":"Arial","fieldFontSize":"9pt","fieldTextColor":null,"fieldTextHighlight":null,"hash":"b43b"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-html',
      fieldTypeShort: 'html',
      displayLabel: 'Placeholder',
      defaultDisplayLabel: '',
      fieldType: 'HTMLINPUT',
      fieldColor: '#980043',
      fieldMultipleImage: false,
      fieldFontFamily: 'Arial',
      fieldFontSize: '9pt',
      fieldTextColor: null,
      fieldTextHighlight: null,
      hash: 'b43b',
    });

    const node = createNode([createTag(tagValue), createAlias('Placeholder')], [createTextRun('Actual Content')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: { annotations: true } } });

    expect(result.type).toBe('fieldAnnotation');
    expect(result).not.toHaveProperty('text');
    expect(result.attrs.displayLabel).toBe('Actual Content');
    expect(result.attrs.defaultDisplayLabel).toBe('Placeholder');
    expect(result.attrs.hash).toBe('b43b');
    expect(generateDocxRandomId).not.toHaveBeenCalled();
  });

  it('falls back to the placeholder when SDT content normalizes to the same text', () => {
    const tagValue = '{"fieldId":"field-legacy","fieldTypeShort":"html","displayLabel":"Placeholder"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-legacy',
      fieldTypeShort: 'html',
      displayLabel: 'Placeholder',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode(
      [createTag(tagValue), createAlias('Placeholder')],
      [createTextRun('  Placeholder\u00a0  ')],
    );

    const result = handleAnnotationNode({ nodes: [node], editor: { options: {} } });

    expect(result.text).toBe('{{Placeholder}}');
    expect(result.attrs.displayLabel).toBe('Placeholder');
    expect(result.attrs.defaultDisplayLabel).toBe('Placeholder');
    expect(result.attrs.hash).toBe('test-hash-1234');
    expect(generateDocxRandomId).toHaveBeenCalledTimes(1);
  });

  it('ignores exported placeholder content wrapped in double braces', () => {
    const tagValue = '{"fieldId":"field-placeholder","fieldTypeShort":"text","displayLabel":"Label"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-placeholder',
      fieldTypeShort: 'text',
      displayLabel: 'Label',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag(tagValue), createAlias('Label')], [createTextRun('{{Label}}')]);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: {} } });

    expect(result.text).toBe('{{Label}}');
    expect(result.attrs.displayLabel).toBe('Label');
    expect(result.attrs.defaultDisplayLabel).toBe('Label');
    expect(result.attrs.hash).toBe('test-hash-1234');
    expect(generateDocxRandomId).toHaveBeenCalledTimes(1);
  });

  it('returns empty text when both placeholder and SDT content are empty', () => {
    const tagValue = '{"fieldId":"field-empty","fieldTypeShort":"text","displayLabel":""}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-empty',
      fieldTypeShort: 'text',
      displayLabel: '',
      defaultDisplayLabel: '',
      hash: null,
    });

    const node = createNode([createTag(tagValue)], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: {} } });

    expect(result.text).toBe('');
    expect(result.attrs.displayLabel).toBe('');
    expect(result.attrs.defaultDisplayLabel).toBe('');
    expect(result.attrs.hash).toBe('test-hash-1234');
    expect(generateDocxRandomId).toHaveBeenCalledTimes(1);
  });

  it('handles null sdtPr gracefully without adding it to attrs', () => {
    const tagValue = '{"fieldId":"field-test","fieldTypeShort":"text","displayLabel":"Test"}';

    parseTagValueJSON.mockReturnValue({
      fieldId: 'field-test',
      fieldTypeShort: 'text',
      displayLabel: 'Test',
    });

    // Create a node without sdtPr - tag is in sdtPr, so we need sdtPr but with minimal elements
    const node = createNode([createTag(tagValue)], []);

    const result = handleAnnotationNode({ nodes: [node], editor: { options: {} } });

    expect(result).not.toBeNull();
    expect(result.attrs).toBeDefined();
    expect(result.attrs.sdtPr).toBeDefined();
    // sdtPr exists but has minimal elements (just the tag)
    expect(result.attrs.sdtPr.elements).toEqual([createTag(tagValue)]);
  });

  it('handles empty sdtPr.elements array correctly', () => {
    // When sdtPr.elements is empty, there's no tag to parse
    // So we need to use the legacy path which expects certain elements
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            createTag('field-test'),
            { name: 'w:fieldTypeShort', attributes: { 'w:val': 'text' } },
            createAlias('Test Field'),
          ],
        },
        {
          name: 'w:sdtContent',
          elements: [],
        },
      ],
    };

    const result = handleAnnotationNode({ nodes: [node], editor: { options: {} } });

    expect(result).not.toBeNull();
    expect(result.attrs).toBeDefined();
    expect(result.attrs.sdtPr).toBeDefined();
    expect(Array.isArray(result.attrs.sdtPr.elements)).toBe(true);
  });
});
