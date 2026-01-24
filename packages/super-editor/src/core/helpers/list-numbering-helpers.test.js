import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Schema } from '@core/Schema.js';
import { EditorState, TextSelection, NodeSelection } from 'prosemirror-state';
import * as listHelpers from './list-numbering-helpers.js';
import { Paragraph } from '@extensions/paragraph/paragraph.js';
import { Document } from '@extensions/document/document.js';
import { Text } from '@extensions/text/text.js';
import { OxmlNode, Attribute } from '@core/index.js';

// Mock the external dependencies
vi.mock('@core/super-converter/v2/importer/listImporter.js', () => ({
  getStyleTagFromStyleId: vi.fn(),
  getAbstractDefinition: vi.fn(),
  getDefinitionForLevel: vi.fn(),
}));

import { getStyleTagFromStyleId } from '@core/super-converter/v2/importer/listImporter.js';

// Import the function we want to test
const { getListDefinitionDetails, createNewList, ListHelpers } = listHelpers;

describe('getListDefinitionDetails', () => {
  let mockEditor;
  let mockDefinitions;
  let mockAbstracts;
  let generateNewListDefinitionSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create spies on the ListHelpers object methods
    generateNewListDefinitionSpy = vi.spyOn(ListHelpers, 'generateNewListDefinition').mockImplementation(() => {});

    mockDefinitions = {};
    mockAbstracts = {};

    mockEditor = {
      converter: {
        numbering: {
          definitions: mockDefinitions,
          abstracts: mockAbstracts,
        },
        translatedNumbering: {
          definitions: {},
          abstracts: {},
        },
        convertedXml: '<mock>xml</mock>',
      },
      emit: vi.fn(), // Add mock emit function
    };

    mockEditor.schema = Schema.createSchemaByExtensions([Document, Paragraph, Text], mockEditor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should return list definition details for valid numId and level', () => {
      // Setup mock data
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
              { name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
            ],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result).toEqual({
        start: '1',
        numFmt: 'decimal',
        lvlText: '%1.',
        listNumberingType: 'decimal',
        customFormat: undefined,
        abstract: mockAbstracts['abstract1'],
        abstractId: 'abstract1',
      });
    });

    it('should handle custom format when numFmt is custom', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              {
                name: 'w:numFmt',
                attributes: {
                  'w:val': 'custom',
                  'w:format': 'customPattern',
                },
              },
            ],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.customFormat).toBe('customPattern');
    });

    it('should handle bullet list format', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'bullet' } },
              { name: 'w:lvlText', attributes: { 'w:val': '•' } },
            ],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.numFmt).toBe('bullet');
      expect(result.lvlText).toBe('•');
    });

    it('should handle string level parameter by converting to number comparison', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '1' }, // String level in XML
            elements: [{ name: 'w:numFmt', attributes: { 'w:val': 'lowerRoman' } }],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 1, // Number level in function call
        editor: mockEditor,
      });

      expect(result.numFmt).toBe('lowerRoman');
    });
  });

  describe('Missing definition handling', () => {
    it('should generate new definition when numDef is missing and listType is provided', () => {
      const result = getListDefinitionDetails({
        numId: 999,
        level: 0,
        listType: 'orderedList',
        editor: mockEditor,
      });

      expect(generateNewListDefinitionSpy).toHaveBeenCalledWith({
        numId: 999,
        listType: 'orderedList',
        editor: mockEditor,
      });
    });

    it('should not generate new definition when listType is not provided', () => {
      getListDefinitionDetails({
        numId: 999,
        level: 0,
        editor: mockEditor,
      });

      expect(generateNewListDefinitionSpy).not.toHaveBeenCalled();
    });

    it('should generate new definition for bulletList type', () => {
      getListDefinitionDetails({
        numId: 888,
        level: 0,
        listType: 'bulletList',
        editor: mockEditor,
      });

      expect(generateNewListDefinitionSpy).toHaveBeenCalledWith({
        numId: 888,
        listType: 'bulletList',
        editor: mockEditor,
      });
    });

    it('should handle existing definition and not call generateNewListDefinition', () => {
      // Setup existing definition
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [{ name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
          },
        ],
      };

      getListDefinitionDetails({
        numId: 1,
        level: 0,
        listType: 'orderedList', // Even with listType, shouldn't generate since definition exists
        editor: mockEditor,
      });

      expect(generateNewListDefinitionSpy).not.toHaveBeenCalled();
    });
  });

  describe('Abstract handling', () => {
    it('should return null values when abstract is not found', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'nonexistent' },
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result).toEqual({
        start: null,
        numFmt: null,
        lvlText: null,
        listNumberingType: null,
        customFormat: null,
        justification: null,
        suffix: null,
        abstract: null,
        abstractId: 'nonexistent', // The function correctly returns the abstractId even when abstract is not found
      });
    });

    it('should return partial data when abstract exists but level definition is missing', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '1' }, // Different level
            elements: [{ name: 'w:start', attributes: { 'w:val': '1' } }],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0, // Looking for level 0, but only level 1 exists
        editor: mockEditor,
      });

      expect(result).toEqual({
        start: null,
        numFmt: null,
        lvlText: null,
        suffix: null,
        justification: null,
        listNumberingType: null,
        customFormat: null,
        abstract: mockAbstracts['abstract1'],
        abstractId: 'abstract1',
      });
    });
  });

  describe('Style link recursion', () => {
    it('should follow style link and recurse when tries < 1', () => {
      // Setup original definition
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:numStyleLink',
            attributes: { 'w:val': 'style1' },
          },
        ],
      };

      // Setup linked definition
      mockDefinitions[2] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract2' },
          },
        ],
      };

      mockAbstracts['abstract2'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
            ],
          },
        ],
      };

      // Mock getStyleTagFromStyleId
      getStyleTagFromStyleId.mockReturnValue({
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:numPr',
                elements: [
                  {
                    name: 'w:numId',
                    attributes: { 'w:val': '2' },
                  },
                ],
              },
            ],
          },
        ],
      });

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(getStyleTagFromStyleId).toHaveBeenCalledWith('style1', '<mock>xml</mock>');
      expect(result.start).toBe('1');
      expect(result.numFmt).toBe('decimal');
    });

    it('should not recurse when tries >= 1', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:numStyleLink',
            attributes: { 'w:val': 'style1' },
          },
        ],
      };

      getStyleTagFromStyleId.mockReturnValue({
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:numPr',
                elements: [
                  {
                    name: 'w:numId',
                    attributes: { 'w:val': '2' },
                  },
                ],
              },
            ],
          },
        ],
      });

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
        tries: 1, // Max tries reached
      });

      // Should not recurse, should return null values since no level definition exists
      expect(result.abstract).toBe(mockAbstracts['abstract1']);
      expect(result.start).toBe(null);
    });

    it('should handle missing style definition gracefully', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:numStyleLink',
            attributes: { 'w:val': 'nonexistent-style' },
          },
        ],
      };

      getStyleTagFromStyleId.mockReturnValue(null);

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.abstract).toBe(mockAbstracts['abstract1']);
      expect(result.start).toBe(null);
    });

    it('should handle incomplete style definition chain', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:numStyleLink',
            attributes: { 'w:val': 'style1' },
          },
        ],
      };

      // Mock incomplete style definition (missing numId)
      getStyleTagFromStyleId.mockReturnValue({
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:numPr',
                elements: [], // Empty - no numId element
              },
            ],
          },
        ],
      });

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.abstract).toBe(mockAbstracts['abstract1']);
      expect(result.start).toBe(null);
    });

    it('should handle style definition with missing nested elements', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:numStyleLink',
            attributes: { 'w:val': 'style1' },
          },
        ],
      };

      // Mock style definition missing w:numPr
      getStyleTagFromStyleId.mockReturnValue({
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:otherElement',
              },
            ],
          },
        ],
      });

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.abstract).toBe(mockAbstracts['abstract1']);
      expect(result.start).toBe(null);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing attributes gracefully', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              { name: 'w:start' }, // Missing attributes
              { name: 'w:numFmt', attributes: {} }, // Empty attributes
              { name: 'w:lvlText', attributes: { 'w:val': 'valid' } },
            ],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.start).toBe(undefined);
      expect(result.numFmt).toBe(undefined);
      expect(result.lvlText).toBe('valid');
    });

    it('should handle missing elements arrays', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        // Missing elements array
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0,
        editor: mockEditor,
      });

      expect(result.abstract).toBe(mockAbstracts['abstract1']);
      expect(result.start).toBe(null);
    });

    it('should handle undefined editor or numbering data', () => {
      const emptyEditor = {
        converter: {
          numbering: {
            definitions: {},
            abstracts: {},
          },
        },
      };

      const result = getListDefinitionDetails({
        numId: 999,
        level: 0,
        editor: emptyEditor,
      });

      expect(result).toEqual({
        start: null,
        numFmt: null,
        lvlText: null,
        justification: null,
        suffix: null,
        listNumberingType: null,
        customFormat: null,
        abstract: null,
        abstractId: undefined,
      });
    });
  });

  describe('Parameter validation and edge cases', () => {
    it('should handle numId as string and convert internally if needed', () => {
      mockDefinitions['1'] = {
        // String key
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [{ name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1, // Number input
        level: 0,
        editor: mockEditor,
      });

      expect(result.numFmt).toBe('decimal');
    });

    it('should handle zero-based level correctly', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' }, // Zero-based level
            elements: [{ name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
          },
        ],
      };

      const result = getListDefinitionDetails({
        numId: 1,
        level: 0, // Should match w:ilvl="0"
        editor: mockEditor,
      });

      expect(result.numFmt).toBe('decimal');
    });

    it('should handle missing converter gracefully', () => {
      const badEditor = {
        converter: null,
      };

      expect(() => {
        getListDefinitionDetails({
          numId: 1,
          level: 0,
          editor: badEditor,
        });
      }).toThrow();
    });

    it('should handle missing numbering gracefully', () => {
      const editorWithoutNumbering = {
        converter: {
          // Missing numbering property
        },
      };

      expect(() => {
        getListDefinitionDetails({
          numId: 1,
          level: 0,
          editor: editorWithoutNumbering,
        });
      }).toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should work with complex nested list structure', () => {
      mockDefinitions[1] = {
        elements: [
          {
            name: 'w:abstractNumId',
            attributes: { 'w:val': 'abstract1' },
          },
        ],
      };

      mockAbstracts['abstract1'] = {
        elements: [
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '0' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
              { name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
            ],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '1' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'lowerRoman' } },
              { name: 'w:lvlText', attributes: { 'w:val': '%2.' } },
            ],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '2' },
            elements: [
              { name: 'w:start', attributes: { 'w:val': '1' } },
              { name: 'w:numFmt', attributes: { 'w:val': 'lowerLetter' } },
              { name: 'w:lvlText', attributes: { 'w:val': '%3)' } },
            ],
          },
        ],
      };

      // Test level 0
      const level0 = getListDefinitionDetails({ numId: 1, level: 0, editor: mockEditor });
      expect(level0.numFmt).toBe('decimal');
      expect(level0.lvlText).toBe('%1.');

      // Test level 1
      const level1 = getListDefinitionDetails({ numId: 1, level: 1, editor: mockEditor });
      expect(level1.numFmt).toBe('lowerRoman');
      expect(level1.lvlText).toBe('%2.');

      // Test level 2
      const level2 = getListDefinitionDetails({ numId: 1, level: 2, editor: mockEditor });
      expect(level2.numFmt).toBe('lowerLetter');
      expect(level2.lvlText).toBe('%3)');
    });
  });

  describe('changeNumIdSameAbstract', () => {
    it('should generate a fresh definition when abstract is missing and return new numId', () => {
      // Ensure generateNewListDefinition calls through to real implementation so numbering updates
      const original = ListHelpers.generateNewListDefinition;
      generateNewListDefinitionSpy.mockRestore();
      const callThroughSpy = vi
        .spyOn(ListHelpers, 'generateNewListDefinition')
        .mockImplementation((args) => original(args));

      // Existing definition references a non-existent abstract
      mockEditor.converter.numbering.definitions[1] = {
        elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': 'abstract1' } }],
      };
      // abstracts does not include 'abstract1'

      const newNumId = ListHelpers.changeNumIdSameAbstract(1, 0, 'orderedList', mockEditor);

      expect(typeof newNumId).toBe('number');
      expect(newNumId).not.toBe(1);
      // New definition should exist for the returned id
      expect(mockEditor.converter.numbering.definitions[newNumId]).toBeTruthy();
      // And emit should be called by generateNewListDefinition
      expect(mockEditor.emit).toHaveBeenCalledWith(
        'list-definitions-change',
        expect.objectContaining({ numbering: mockEditor.converter.numbering, editor: mockEditor }),
      );

      callThroughSpy.mockRestore();
    });

    it('should clone existing abstract and persist numbering', () => {
      // Set a definition and a valid abstract
      mockEditor.converter.numbering.definitions[1] = {
        elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '10' } }],
      };
      mockEditor.converter.numbering.abstracts['10'] = {
        attributes: { 'w:abstractNumId': '10' },
        elements: [],
      };

      const newNumId = ListHelpers.changeNumIdSameAbstract(1, 0, 'orderedList', mockEditor);

      expect(typeof newNumId).toBe('number');
      expect(newNumId).not.toBe(1);
      const def = mockEditor.converter.numbering.definitions[newNumId];
      expect(def).toBeTruthy();
      const abstractRef = def.elements.find((e) => e.name === 'w:abstractNumId');
      expect(abstractRef).toBeTruthy();
      const newAbstractId = abstractRef.attributes['w:val'];
      // Persisted new abstract exists
      expect(mockEditor.converter.numbering.abstracts[newAbstractId]).toBeTruthy();
    });
  });
});

vi.mock('@core/super-converter/v2/importer/listImporter.js', () => ({
  getStyleTagFromStyleId: vi.fn(),
  getAbstractDefinition: vi.fn(),
  getDefinitionForLevel: vi.fn(),
}));

describe('createSchemaOrderedListNode', () => {
  /** @type {import('prosemirror-model').Schema} */
  let schema;
  let editor;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    editor = {
      converter: {
        numbering: {
          definitions: {
            10: {
              elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '100' } }],
            },
            11: {
              elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '200' } }],
            },
          },
          abstracts: {
            100: {
              elements: [
                {
                  name: 'w:lvl',
                  attributes: { 'w:ilvl': '0' },
                  elements: [
                    { name: 'w:start', attributes: { 'w:val': '1' } },
                    { name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
                    { name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
                  ],
                },
              ],
            },
            200: {
              elements: [
                {
                  name: 'w:lvl',
                  attributes: { 'w:ilvl': '0' },
                  elements: [
                    { name: 'w:start', attributes: { 'w:val': '1' } },
                    { name: 'w:numFmt', attributes: { 'w:val': 'bullet' } },
                    { name: 'w:lvlText', attributes: { 'w:val': '•' } },
                  ],
                },
              ],
            },
          },
        },
        convertedXml: '<mock/>',
      },
    };
    schema = Schema.createSchemaByExtensions([Document, Paragraph, Text], editor);

    editor.schema = schema;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  const makeContentJSON = (text) => schema.text(text).toJSON();

  it('correctly creates a list', () => {
    const orderedNode = ListHelpers.createSchemaOrderedListNode({
      level: 0,
      numId: 10,
      editor,
      contentNode: makeContentJSON('item'),
    });
    expect(orderedNode.type.name).toBe('paragraph');
    expect(orderedNode.attrs.paragraphProperties).toEqual({ numberingProperties: { numId: 10, ilvl: 0 } });
  });
});

describe('createNewList', () => {
  /** @type {import('prosemirror-model').Schema} */
  let schema;

  /** @type {any} */
  let editor;

  let getNewListIdSpy;
  let generateNewListDefinitionSpy;
  let createSchemaOrderedListNodeSpy;

  const makeStateWithParagraph = () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', { paragraphProperties: {} }, [schema.text('hello')]),
    ]);
    const sel = TextSelection.create(doc, 2); // inside text
    return EditorState.create({ doc, selection: sel, schema });
  };

  const makeStateWithWrapperNodeSelection = () => {
    const innerPara = schema.node('paragraph', { paragraphProperties: {} }, [schema.text('x')]);
    const wrapper = schema.node('wrapperNode', {}, [innerPara]);
    const doc = schema.node('doc', null, [wrapper]);
    // Select the wrapper node itself
    const sel = NodeSelection.create(doc, 1);
    return EditorState.create({ doc, selection: sel, schema });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    editor = {
      emit: vi.fn(),
      converter: {
        numbering: { definitions: {}, abstracts: {} },
        convertedXml: '<mock/>',
      },
    };
    const Wrapper = OxmlNode.create({
      name: 'wrapperNode',
      group: 'block',
      content: 'paragraph+',
      inline: false,
    });
    schema = Schema.createSchemaByExtensions([Document, Wrapper, Paragraph, Text], editor);

    editor.schema = schema;

    // Keep list ID/definition logic mocked (unit test scope)
    getNewListIdSpy = vi.spyOn(ListHelpers, 'getNewListId').mockReturnValue(1);
    generateNewListDefinitionSpy = vi.spyOn(ListHelpers, 'generateNewListDefinition').mockImplementation(() => {});

    // Return a real PM node for insertion
    createSchemaOrderedListNodeSpy = vi
      .spyOn(ListHelpers, 'createSchemaOrderedListNode')
      .mockImplementation(({ contentNode, editor: ed }) => {
        const para = ed.schema.nodeFromJSON(contentNode); // the original paragraph content
        const li = ed.schema.nodes.listItem.create(null, para);
        return ed.schema.nodes.orderedList.create({ 'list-style-type': 'decimal', listId: 1, order: 0 }, li);
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic behavior', () => {
    it('creates a new list by modifying the paragraph', () => {
      const state = makeStateWithParagraph();
      const tr = state.tr;

      const ok = createNewList({ listType: 'orderedList', tr, editor });
      expect(ok).toBe(true);

      expect(getNewListIdSpy).toHaveBeenCalledWith(editor);
      expect(generateNewListDefinitionSpy).toHaveBeenCalledWith({
        numId: 1,
        listType: 'orderedList',
        editor,
      });

      const first = tr.doc.firstChild;
      expect(first).toBeTruthy();
      expect(first.type.name).toBe('paragraph');
      expect(first.attrs.paragraphProperties).toEqual({ numberingProperties: { numId: 1, ilvl: 0 } });
    });

    it('returns false (no-op) when selection parent is not a paragraph', () => {
      const state = makeStateWithWrapperNodeSelection();
      const tr = state.tr;

      const ok = createNewList({ listType: 'orderedList', tr, editor });
      expect(ok).toBe(false);

      // These ARE called (function does ID/definition work up-front)
      expect(getNewListIdSpy).toHaveBeenCalledTimes(1);
      expect(generateNewListDefinitionSpy).toHaveBeenCalledTimes(1);

      // But we never build/insert a list node, and the doc is unchanged
      expect(createSchemaOrderedListNodeSpy).not.toHaveBeenCalled();
      expect(tr.steps.length).toBe(0);
      expect(tr.doc.eq(state.doc)).toBe(true);
    });
  });

  describe('Integration-ish sanity (minimal)', () => {
    it('preserves inline content/marks via contentNode JSON round-trip', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', { paragraphProperties: {} }, [schema.text('abc 123')]),
      ]);
      const sel = TextSelection.create(doc, 3);
      const state = EditorState.create({ doc, selection: sel, schema });
      const tr = state.tr;

      const ok = createNewList({ listType: 'orderedList', tr, editor });
      expect(ok).toBe(true);

      const ol = tr.doc.firstChild;
      expect(ol.type.name).toBe('paragraph');
      expect(ol.attrs.paragraphProperties).toEqual({ numberingProperties: { numId: 1, ilvl: 0 } });
      expect(ol.textContent).toBe('abc 123');
    });
  });
});
