import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFieldAttrs, annotateDocument } from './annotator.js';

globalThis.dateFormat = vi.fn(() => '2025-01-30');

const createEditorsCollection = () => [];

describe('annotator helpers', () => {
  beforeEach(() => {
    globalThis.dateFormat.mockClear();
  });

  it('returns expected field attributes for different types', () => {
    const fieldNode = { attrs: { type: 'link' } };
    expect(getFieldAttrs(fieldNode, 'example.com')).toEqual({ linkUrl: 'http://example.com' });

    fieldNode.attrs.type = 'text';
    expect(getFieldAttrs(fieldNode, 'Hello')).toEqual({ displayLabel: 'Hello' });

    fieldNode.attrs.type = 'date';
    const attrs = getFieldAttrs(fieldNode, '2025-01-30', { input_format: 'yyyy-mm-dd' });
    expect(globalThis.dateFormat).toHaveBeenCalled();
    expect(attrs).toEqual({ displayLabel: '2025-01-30' });

    fieldNode.attrs.type = 'checkbox';
    expect(getFieldAttrs(fieldNode, 'Yes')).toEqual({ displayLabel: 'Yes' });

    fieldNode.attrs.type = 'yesno';
    expect(getFieldAttrs(fieldNode, ['yes'])).toEqual({ displayLabel: 'Yes' });

    fieldNode.attrs.type = 'image';
    expect(getFieldAttrs(fieldNode, 'http://img')).toEqual({ imageSrc: 'http://img' });

    fieldNode.attrs.type = 'html';
    expect(getFieldAttrs(fieldNode, '<p>html</p>')).toEqual({ rawHtml: '<p>html</p>' });
  });

  // header/footer annotation removed with pagination legacy; related tests skipped

  it('annotates document nodes and prunes empty fields', () => {
    const FieldType = Symbol('fieldAnnotation');
    const annotationValues = [{ input_id: 'field-1', input_value: 'Hello', input_field_type: 'TEXTINPUT' }];

    const editor = {
      converter: {
        headers: {},
        footers: {},
        headerEditors: createEditorsCollection(),
        footerEditors: createEditorsCollection(),
      },
    };

    const node = {
      type: FieldType,
      attrs: { type: 'text', fieldType: 'TEXTINPUT', fieldId: 'field-1', generatorIndex: null },
      nodeSize: 1,
    };

    const tr = {
      doc: {
        descendants: (cb) => cb(node, 5),
      },
      setNodeMarkup: vi.fn(function () {
        return this;
      }),
      delete: vi.fn(function () {
        return this;
      }),
    };

    const schema = { nodes: { fieldAnnotation: FieldType } };
    const updatedTr = annotateDocument({
      annotationValues,
      hiddenFieldIds: [],
      removeEmptyFields: true,
      schema,
      tr,
      editor,
    });

    expect(updatedTr.setNodeMarkup).toHaveBeenCalledWith(
      5,
      undefined,
      expect.objectContaining({ displayLabel: 'Hello' }),
    );

    // Now ensure missing values queue deletions
    const emptyNode = {
      type: FieldType,
      attrs: { type: 'text', fieldType: 'TEXTINPUT', fieldId: 'missing', generatorIndex: null },
      nodeSize: 2,
    };

    const trRemove = {
      doc: {
        descendants: (cb) => cb(emptyNode, 3),
      },
      setNodeMarkup: vi.fn(function () {
        return this;
      }),
      delete: vi.fn(function () {
        return this;
      }),
    };

    annotateDocument({
      annotationValues,
      hiddenFieldIds: [],
      removeEmptyFields: true,
      schema,
      tr: trRemove,
      editor,
    });

    expect(trRemove.delete).toHaveBeenCalledWith(3, 5);
  });
});
