import { describe, it, expect, vi } from 'vitest';
import { createRelationshipsValidator } from './relationships-validator.js';

function makeEditorWithRelationships(relsXmlLike, documentXmlLike = null, contentTypesXmlLike = null) {
  const convertedXml = {
    'word/_rels/document.xml.rels': relsXmlLike,
  };

  if (documentXmlLike) {
    convertedXml['word/document.xml'] = documentXmlLike;
  }

  if (contentTypesXmlLike) {
    convertedXml['[Content_Types].xml'] = contentTypesXmlLike;
  }

  return {
    converter: {
      convertedXml,
    },
  };
}

function makeLogger() {
  return { debug: vi.fn(), withPrefix: vi.fn(() => ({ debug: vi.fn() })) };
}

function createValidRelationship(id, type, target, targetMode = null) {
  const rel = {
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: id,
      Type: type,
      Target: target,
    },
  };

  if (targetMode) {
    rel.attributes.TargetMode = targetMode;
  }

  return rel;
}

function createValidRelationshipsRoot(relationships = []) {
  return {
    elements: [
      {
        type: 'element',
        name: 'Relationships',
        attributes: {
          xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
        },
        elements: relationships,
      },
    ],
  };
}

describe('relationships-validator', () => {
  describe('basic validation', () => {
    it('returns no changes when no convertedXml', () => {
      const editor = { converter: null };
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toEqual([]);
    });

    it('returns no changes when convertedXml is not an object', () => {
      const editor = { converter: { convertedXml: 'string' } };
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toEqual([]);
    });

    it('returns no changes when no relationships file found', () => {
      const editor = { converter: { convertedXml: {} } };
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toEqual([]);
    });

    it('normalizes relationships file location', () => {
      const rels = createValidRelationshipsRoot([]);
      const editor = {
        converter: {
          convertedXml: {
            'word/document.xml.rels': rels,
          },
        },
      };
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain(
        'Normalized relationships location to word/_rels/document.xml.rels (was word/document.xml.rels)',
      );
      expect(editor.converter.convertedXml['word/_rels/document.xml.rels']).toBe(rels);
      expect(editor.converter.convertedXml['word/document.xml.rels']).toBeUndefined();
    });

    it('validates XML structure and fixes root element', () => {
      const rels = {
        elements: [
          {
            type: 'element',
            name: 'WrongName',
            attributes: {},
            elements: [],
          },
        ],
      };
      const editor = makeEditorWithRelationships(rels);
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Fixed relationships root element name to "Relationships"');
      expect(result.results).toContain(
        'Set relationships xmlns to http://schemas.openxmlformats.org/package/2006/relationships',
      );

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.name).toBe('Relationships');
      expect(root.attributes.xmlns).toBe('http://schemas.openxmlformats.org/package/2006/relationships');
    });
  });

  describe('relationship ID validation', () => {
    it('assigns missing IDs', () => {
      const relationships = [
        createValidRelationship(
          '',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          'settings.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };
      editor.converter.convertedXml['word/settings.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Assigned missing Id "rId2"');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      const relWithoutId = root.elements.find((r) => r.attributes.Target === 'styles.xml');
      expect(relWithoutId.attributes.Id).toBe('rId2');
    });

    it('ensures relationship IDs are unique and properly formatted', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'invalidId',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings',
          'webSettings.xml',
        ), // invalid format
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };
      editor.converter.convertedXml['word/webSettings.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Removed duplicate relationship with ID "rId1"');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      const ids = root.elements.map((r) => r.attributes.Id);
      expect(ids).toContain('rId1');
      expect(ids).toContain('invalidId'); // Invalid format is kept as-is
      expect(root.elements).toHaveLength(2); // Duplicate removed
    });
  });

  describe('relationship validation', () => {
    it('removes relationships without targets', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId2',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          '',
        ), // empty target
        createValidRelationship(
          'rId3',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings',
        ), // missing target
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Removed relationship "rId2" without Target');
      expect(result.results).toContain('Removed relationship "rId3" without Target');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(1);
      expect(root.elements[0].attributes.Target).toBe('styles.xml');
    });

    it('fixes hyperlink TargetMode for external URLs', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          'https://example.com',
        ),
        createValidRelationship(
          'rId2',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          'mailto:test@example.com',
        ),
        createValidRelationship(
          'rId3',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          'https://example.com',
          'Internal',
        ), // wrong mode
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels);
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Set TargetMode="External" for hyperlink rId1');
      expect(result.results).toContain('Set TargetMode="External" for hyperlink rId2');
      expect(result.results).toContain('Set TargetMode="External" for hyperlink rId3');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      root.elements.forEach((rel) => {
        expect(rel.attributes.TargetMode).toBe('External');
      });
    });

    it('preserves relationships with same target but different IDs', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          'https://example.com',
          'External',
        ),
        createValidRelationship(
          'rId2',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          'https://example.com',
          'External',
        ),
        createValidRelationship(
          'rId3',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          'settings.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/settings.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false); // No changes should be made
      expect(result.results).not.toContain('Removed duplicate relationship');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(3); // All relationships preserved
      const ids = root.elements.map((r) => r.attributes.Id);
      expect(ids).toEqual(['rId1', 'rId2', 'rId3']);
    });

    it('removes duplicate relationships', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId1', // Same ID as above - this should be removed
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId3',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          'settings.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };
      editor.converter.convertedXml['word/settings.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Removed duplicate relationship with ID "rId1"');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(2);
      const ids = root.elements.map((r) => r.attributes.Id);
      expect(ids).toEqual(['rId1', 'rId3']);
    });
  });

  describe('target validation', () => {
    it('removes relationships with missing internal targets', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId2',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          'missing.xml',
        ), // missing file
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Removed relationship rId2 with missing target: missing.xml');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(1);
      expect(root.elements[0].attributes.Target).toBe('styles.xml');
    });

    it('preserves customXml relationships with relative paths going up from word/', () => {
      // customXml files are stored at the package root (e.g., customXml/item1.xml)
      // but referenced from word/_rels/document.xml.rels with relative paths like ../customXml/item1.xml
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
        createValidRelationship(
          'rId2',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
          '../customXml/item1.xml',
        ),
        createValidRelationship(
          'rId3',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
          '../customXml/item2.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml - note: customXml files are at package root, not word/
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };
      editor.converter.convertedXml['customXml/item1.xml'] = { elements: [] };
      editor.converter.convertedXml['customXml/item2.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      // customXml relationships should be preserved (not removed as "missing")
      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(3);

      const customXmlRels = root.elements.filter((r) => r.attributes.Target?.includes('customXml'));
      expect(customXmlRels).toHaveLength(2);
      expect(customXmlRels[0].attributes.Target).toBe('../customXml/item1.xml');
      expect(customXmlRels[1].attributes.Target).toBe('../customXml/item2.xml');
    });

    it('keeps image relationships even with missing targets', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          'media/missing.png',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels);
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toContain('Warning: image relationship rId1 target not found: media/missing.png.');

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(1); // Image relationship kept
    });

    it('collects .bin media files for Content_Types.xml', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          'media/image.bin',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, null, {
        elements: [{ type: 'element', name: 'Types', elements: [] }],
      });

      // Add the media file to convertedXml
      editor.converter.convertedXml['word/media/image.bin'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Added Content Types Override for "/word/media/image.bin" as image/png');
    });
  });

  describe('document.xml processing', () => {
    it('fixes missing relationship references in document.xml', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);

      const documentXml = {
        elements: [
          {
            type: 'element',
            name: 'document',
            elements: [
              {
                type: 'element',
                name: 'paragraph',
                attributes: {
                  'r:id': 'rId1', // valid reference
                },
                elements: [],
              },
              {
                type: 'element',
                name: 'paragraph',
                attributes: {
                  'r:id': 'rId999',
                },
                elements: [],
              },
            ],
          },
        ],
      };

      const editor = makeEditorWithRelationships(rels, documentXml);
      // Add the target file to convertedXml so the relationship is valid
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();
      expect(result.modified).toBe(true);
      expect(result.results).toContain('Fixed 1 missing relationship references');

      // Check that invalid reference was removed
      const document = editor.converter.convertedXml['word/document.xml'];
      const paragraphs = document.elements[0].elements;
      const validPara = paragraphs.find((p) => p.attributes['r:id'] === 'rId1');
      const invalidPara = paragraphs.find((p) => p.attributes['r:id'] === 'rId999');

      expect(validPara).toBeTruthy();
      expect(invalidPara).toBeFalsy();
    });
  });

  describe('Content_Types.xml processing', () => {
    it('handles Content_Types.xml as string', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          'media/image.bin',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);

      const contentTypesXml = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

      const editor = makeEditorWithRelationships(rels, null, contentTypesXml);
      editor.converter.convertedXml['word/media/image.bin'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Added Content Types Override for "/word/media/image.bin" as image/png');

      const updatedContentTypes = editor.converter.convertedXml['[Content_Types].xml'];
      expect(updatedContentTypes).toContain(
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      );
      expect(updatedContentTypes).toContain('<Default Extension="xml" ContentType="application/xml"/>');
      expect(updatedContentTypes).toContain('<Override PartName="/word/media/image.bin" ContentType="image/png" />');
    });

    it('handles Content_Types.xml as JSON structure', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          'media/image.bin',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);

      const contentTypesXml = {
        elements: [
          {
            type: 'element',
            name: 'Types',
            attributes: {
              xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types',
            },
            elements: [],
          },
        ],
      };

      const editor = makeEditorWithRelationships(rels, null, contentTypesXml);
      editor.converter.convertedXml['word/media/image.bin'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);
      expect(result.results).toContain('Added Content Types Override for "/word/media/image.bin" as image/png');

      const typesRoot = editor.converter.convertedXml['[Content_Types].xml'].elements[0];
      const defaults = typesRoot.elements.filter((el) => el.name === 'Default');
      const overrides = typesRoot.elements.filter((el) => el.name === 'Override');

      expect(defaults).toHaveLength(2);
      expect(overrides).toHaveLength(1);
      expect(overrides[0].attributes.PartName).toBe('/word/media/image.bin');
      expect(overrides[0].attributes.ContentType).toBe('image/png');
    });

    it('handles missing Content_Types.xml gracefully', () => {
      const relationships = [
        createValidRelationship(
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
          'styles.xml',
        ),
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels);

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.results).toContain('[Content_Types].xml not found or not parseable. Skipped content types patch.');
    });
  });

  describe('edge cases', () => {
    it('handles relationships with whitespace in attributes', () => {
      const relationships = [
        {
          type: 'element',
          name: 'Relationship',
          attributes: {
            Id: ' rId1 ',
            Type: ' http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles ',
            Target: ' styles.xml ',
          },
        },
      ];
      const rels = createValidRelationshipsRoot(relationships);
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false); // No changes needed

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      const rel = root.elements[0];
      expect(rel.attributes.Id).toBe(' rId1 '); // Whitespace preserved
      expect(rel.attributes.Type).toBe(' http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles ');
      expect(rel.attributes.Target).toBe(' styles.xml ');
    });

    it('handles non-element children in relationships root', () => {
      const rels = {
        elements: [
          {
            type: 'element',
            name: 'Relationships',
            attributes: {
              xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
            },
            elements: [
              createValidRelationship(
                'rId1',
                'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
                'styles.xml',
              ),
              { type: 'text', text: 'some text' }, // non-element child
              { type: 'element', name: 'NotRelationship', attributes: {} }, // wrong element name
            ],
          },
        ],
      };
      const editor = makeEditorWithRelationships(rels, {
        elements: [{ type: 'element', name: 'document', elements: [] }],
      });
      // Add the target files to convertedXml
      editor.converter.convertedXml['word/styles.xml'] = { elements: [] };

      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(true);

      const root = editor.converter.convertedXml['word/_rels/document.xml.rels'].elements[0];
      expect(root.elements).toHaveLength(1); // Only valid relationship kept
      expect(root.elements[0].attributes.Id).toBe('rId1');
    });

    it('handles empty relationships file', () => {
      const rels = createValidRelationshipsRoot([]);
      const editor = makeEditorWithRelationships(rels);
      const logger = makeLogger();
      const validator = createRelationshipsValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toEqual(['[Content_Types].xml not found or not parseable. Skipped content types patch.']);
    });
  });
});
