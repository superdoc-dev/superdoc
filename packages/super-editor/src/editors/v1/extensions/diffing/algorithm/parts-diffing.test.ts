import { describe, expect, it } from 'vitest';

import { capturePartsState, diffParts } from './parts-diffing';

describe('parts-diffing', () => {
  it('captures nested relationship parts relative to the part directory', () => {
    const editor = {
      converter: {
        convertedXml: {
          'word/_rels/document.xml.rels': {
            elements: [
              {
                name: 'Relationships',
                elements: [
                  {
                    name: 'Relationship',
                    attributes: {
                      Id: 'rIdChart1',
                      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
                      Target: 'charts/chart1.xml',
                    },
                  },
                ],
              },
            ],
          },
          'word/charts/chart1.xml': {
            elements: [{ name: 'c:chartSpace', elements: [] }],
          },
          'word/charts/_rels/chart1.xml.rels': {
            elements: [
              {
                name: 'Relationships',
                elements: [
                  {
                    name: 'Relationship',
                    attributes: {
                      Id: 'rIdWorkbook1',
                      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
                      Target: '../embeddings/Microsoft_Excel_Sheet1.xlsx',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      options: {
        mediaFiles: {
          'word/embeddings/Microsoft_Excel_Sheet1.xlsx': 'base64-embedded-workbook',
        },
      },
      storage: {
        image: {
          media: {},
        },
      },
    };

    const partsState = capturePartsState(editor, null);

    expect(partsState.bodyClosure['word/charts/chart1.xml']).toBeTruthy();
    expect(partsState.bodyClosure['word/charts/_rels/chart1.xml.rels']).toBeTruthy();
    expect(partsState.bodyClosure['word/embeddings/Microsoft_Excel_Sheet1.xlsx']).toEqual({
      kind: 'binary',
      content: 'base64-embedded-workbook',
    });
  });

  it('diffs asset-only body changes even when semantic diffs are empty', () => {
    const previousPartsState = {
      bodyClosure: {
        'word/_rels/document.xml.rels': {
          kind: 'xml',
          content: {
            elements: [
              {
                name: 'Relationships',
                elements: [
                  {
                    name: 'Relationship',
                    attributes: {
                      Id: 'rIdImage1',
                      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                      Target: 'media/image1.png',
                    },
                  },
                ],
              },
            ],
          },
        },
        'word/media/image1.png': {
          kind: 'binary',
          content: 'base64-old-image',
        },
      },
      headerFooterClosures: {},
    };

    const nextPartsState = {
      bodyClosure: {
        'word/_rels/document.xml.rels': {
          kind: 'xml',
          content: {
            elements: [
              {
                name: 'Relationships',
                elements: [
                  {
                    name: 'Relationship',
                    attributes: {
                      Id: 'rIdImage1',
                      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                      Target: 'media/image1.png',
                    },
                  },
                ],
              },
            ],
          },
        },
        'word/media/image1.png': {
          kind: 'binary',
          content: 'base64-new-image',
        },
      },
      headerFooterClosures: {},
    };

    const partsDiff = diffParts(previousPartsState, nextPartsState);

    expect(partsDiff).not.toBeNull();
    expect(partsDiff?.upserts['word/media/image1.png']).toEqual({
      kind: 'binary',
      content: 'base64-new-image',
    });
    expect(partsDiff?.upserts['word/document.xml']).toBeUndefined();
    expect(partsDiff?.deletes).toEqual([]);
  });
});
