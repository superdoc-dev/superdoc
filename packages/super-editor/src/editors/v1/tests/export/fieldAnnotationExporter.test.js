import { exportSchemaToJson } from '@converter/exporter.js';

describe('fieldAnnotation image export', () => {
  it('stores table field annotation media under word/media path', () => {
    const relationships = [];
    const media = {};

    const fieldAnnotationNode = {
      type: 'fieldAnnotation',
      attrs: {
        type: 'signature',
        defaultDisplayLabel: 'Signature',
        displayLabel: 'Signature',
        imageSrc:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/Ur/9wAAAABJRU5ErkJggg==',
        fieldId: 'field-123',
        fieldType: 'SIGNATUREINPUT',
        hash: 'abc123',
        size: {
          width: 75,
          height: 33,
        },
      },
    };

    exportSchemaToJson({
      node: fieldAnnotationNode,
      relationships,
      media,
      documentMedia: {},
      isFinalDoc: false,
      tableCell: {
        attrs: {
          colwidth: [120],
          cellMargins: {
            left: 0,
            right: 0,
          },
        },
      },
      editor: {
        extensionService: {
          extensions: [],
        },
        options: {
          isHeaderOrFooter: false,
        },
      },
      converter: null,
    });

    const expectedFileName = 'word/media/field-123_abc123.png';

    expect(media).toHaveProperty(expectedFileName);
    expect(media[expectedFileName]).toContain('data:image/png;base64');

    const relationship = relationships.find((rel) => rel.attributes?.Id);
    expect(relationship?.attributes?.Target).toBe('media/field-123_abc123.png');
  });
});
