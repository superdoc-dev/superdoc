// @ts-check
import { describe, it, expect } from 'vitest';
import { translateDocumentPartObj } from './translate-document-part-obj.js';

describe('translateDocumentPartObj', () => {
  it('reuses passthrough sdtPr when docPartGallery is missing to avoid invalid XML', () => {
    const passthroughSdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '123' } },
        { name: 'w:docPartObj', elements: [] },
        { name: 'w:foo', attributes: { 'w:val': 'bar' } },
      ],
    };

    const node = {
      type: 'documentPartObject',
      content: [],
      attrs: {
        id: '123',
        docPartGallery: null,
        docPartUnique: true,
        sdtPr: passthroughSdtPr,
      },
    };

    const result = translateDocumentPartObj({ node });

    expect(result.elements[0]).toEqual(passthroughSdtPr);
    expect(
      result.elements[0].elements.find(
        (el) => el.name === 'w:docPartGallery' && el.attributes?.['w:val'] === 'undefined',
      ),
    ).toBeUndefined();
  });

  it('omits w:id when document part id is empty', () => {
    const node = {
      type: 'documentPartObject',
      content: [],
      attrs: {
        id: '',
        docPartGallery: 'Table of Contents',
        docPartUnique: true,
        sdtPr: {
          name: 'w:sdtPr',
          elements: [
            { name: 'w:id', attributes: { 'w:val': '' } },
            {
              name: 'w:docPartObj',
              elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Table of Contents' } }],
            },
          ],
        },
      },
    };

    const result = translateDocumentPartObj({ node });
    const sdtPr = result.elements[0];

    expect(sdtPr.elements.find((el) => el.name === 'w:id')).toBeUndefined();
    expect(sdtPr.elements.find((el) => el.name === 'w:docPartObj')).toBeDefined();
  });

  it('strips empty passthrough w:id when docPartGallery is unknown', () => {
    const passthroughSdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '' } },
        { name: 'w:docPartObj', elements: [] },
        { name: 'w:foo', attributes: { 'w:val': 'bar' } },
      ],
    };

    const node = {
      type: 'documentPartObject',
      content: [],
      attrs: {
        id: '',
        docPartGallery: null,
        docPartUnique: true,
        sdtPr: passthroughSdtPr,
      },
    };

    const result = translateDocumentPartObj({ node });
    const sdtPr = result.elements[0];

    expect(sdtPr).not.toBe(passthroughSdtPr);
    expect(sdtPr.elements.find((el) => el.name === 'w:id')).toBeUndefined();
    expect(sdtPr.elements.find((el) => el.name === 'w:docPartObj')).toBeDefined();
    expect(sdtPr.elements.find((el) => el.name === 'w:foo')).toBeDefined();
    expect(passthroughSdtPr.elements.find((el) => el.name === 'w:id')).toBeDefined();
  });
});
