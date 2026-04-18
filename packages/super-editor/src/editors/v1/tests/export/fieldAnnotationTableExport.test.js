import { exportSchemaToJson } from '@converter/exporter.js';

const dataUri =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR4nGNgYGD4z8DAwMDAwAEACfsD/QTpc7AAAAAASUVORK5CYII=';

const createFieldAnnotationCell = (fieldId, hash) => ({
  type: 'tableCell',
  attrs: {
    colspan: 1,
    rowspan: 1,
    colwidth: [100],
    borders: {
      top: { size: 0.66665, color: '#000000' },
      left: { size: 0.66665, color: '#000000' },
      bottom: { size: 0.66665, color: '#000000' },
      right: { size: 0.66665, color: '#000000' },
    },
    widthType: 'auto',
    widthUnit: 'px',
    cellMargins: { left: 8, right: 8 },
  },
  content: [
    {
      type: 'paragraph',
      attrs: {
        spacing: { lineSpaceAfter: 0, lineSpaceBefore: 0, line: 0, lineRule: null },
        extraAttrs: {},
      },
      content: [
        {
          type: 'fieldAnnotation',
          attrs: {
            type: 'signature',
            defaultDisplayLabel: 'Signature',
            displayLabel: 'Signature',
            imageSrc: dataUri,
            fieldId,
            fieldType: 'SIGNATUREINPUT',
            fieldColor: '#980043',
            highlighted: true,
            multipleImage: false,
            size: { width: 75, height: 33 },
            hash,
          },
        },
      ],
    },
  ],
});

const minimalDoc = {
  type: 'doc',
  content: [
    {
      type: 'table',
      attrs: {
        borders: {
          top: { size: 0.66665, color: '#000000' },
          left: { size: 0.66665, color: '#000000' },
          bottom: { size: 0.66665, color: '#000000' },
          right: { size: 0.66665, color: '#000000' },
          insideH: { size: 0.66665, color: '#000000' },
          insideV: { size: 0.66665, color: '#000000' },
        },
      },
      content: [
        {
          type: 'tableRow',
          attrs: {},
          content: [createFieldAnnotationCell('field-123', 'abcd')],
        },
      ],
    },
  ],
};

const complexDoc = {
  type: 'doc',
  content: [
    {
      type: 'table',
      attrs: {
        borders: {
          top: { size: 0.66665, color: '#000000' },
          left: { size: 0.66665, color: '#000000' },
          bottom: { size: 0.66665, color: '#000000' },
          right: { size: 0.66665, color: '#000000' },
          insideH: { size: 0.66665, color: '#000000' },
          insideV: { size: 0.66665, color: '#000000' },
        },
      },
      content: [
        {
          type: 'tableRow',
          attrs: {},
          content: [
            createFieldAnnotationCell('agreementinput-1758564220741-261745068086', 'e43f'),
            createFieldAnnotationCell('agreementinput-1758564225108-621405645357', 'ad86'),
          ],
        },
      ],
    },
  ],
};

const baseParams = {
  bodyNode: {
    name: 'w:body',
    elements: [
      {
        name: 'w:sectPr',
        elements: [
          {
            name: 'w:pgMar',
            attributes: {},
          },
        ],
      },
    ],
  },
  documentMedia: {},
  isFinalDoc: true,
  editorSchema: null,
  converter: {
    pageStyles: { pageMargins: {} },
    headerIds: {},
    footerIds: {},
  },
  pageStyles: { pageMargins: {} },
  comments: [],
  exportedCommentDefs: [],
  editor: {
    options: { isHeaderOrFooter: false },
    extensionService: { extensions: [] },
    converter: { pageStyles: { pageMargins: {} } },
  },
};

const exportDoc = (doc) => {
  const params = {
    node: doc,
    relationships: [],
    media: {},
    ...baseParams,
  };

  const [, updatedParams] = exportSchemaToJson(params);
  return updatedParams;
};

describe('field annotation table export', () => {
  it('adds media entry for signature field inside table', () => {
    const result = exportDoc(minimalDoc);

    const expectedFileName = 'word/media/field-123_abcd.png';
    expect(result.media).toHaveProperty(expectedFileName);
    expect(result.media[expectedFileName]).toContain('data:image/png;base64');

    const relationship = result.relationships.find((rel) => rel.attributes?.Target === 'media/field-123_abcd.png');
    expect(relationship).toBeTruthy();
  });

  it('exports complex table doc with multiple field annotations', () => {
    const result = exportDoc(complexDoc);

    const mediaKeys = Object.keys(result.media);
    expect(mediaKeys).toContain('word/media/agreementinput-1758564220741-261745068086_e43f.png');
    expect(mediaKeys).toContain('word/media/agreementinput-1758564225108-621405645357_ad86.png');

    const targets = result.relationships.map((rel) => rel.attributes?.Target);
    expect(targets).toContain('media/agreementinput-1758564220741-261745068086_e43f.png');
    expect(targets).toContain('media/agreementinput-1758564225108-621405645357_ad86.png');
  });
});
