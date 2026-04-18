import { describe, it, expect, vi } from 'vitest';
import { sdtNodeTypeStrategy } from './sdt-node-type-strategy';
import { parseTagValueJSON } from './parse-tag-value-json';
import { handleAnnotationNode } from './handle-annotation-node';
import { handleDocPartObj } from './handle-doc-part-obj';
import { handleDocumentSectionNode } from './handle-document-section-node';
import { handleStructuredContentNode } from './handle-structured-content-node';

vi.mock('./parse-tag-value-json');
vi.mock('./handle-annotation-node');
vi.mock('./handle-doc-part-obj');
vi.mock('./handle-document-section-node');
vi.mock('./handle-structured-content-node');

describe('sdtNodeTypeStrategy', () => {
  const createBaseNode = (elements = []) => ({
    elements,
  });

  const createSdtPr = (elements = []) => ({
    name: 'w:sdtPr',
    elements,
  });

  const createSdtContent = () => ({
    name: 'w:sdtContent',
  });

  const createTag = (value) => ({
    name: 'w:tag',
    attributes: { 'w:val': value },
  });

  const createDocPartObj = () => ({
    name: 'w:docPartObj',
  });

  const createFieldTypeShort = (value) => ({
    name: 'w:fieldTypeShort',
    attributes: { 'w:val': value },
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('docPartObj handler', () => {
    it('should return docPartObj type when docPartObj element exists', () => {
      const node = createBaseNode([createSdtPr([createDocPartObj()])]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'docPartObj',
        handler: handleDocPartObj,
      });
    });

    it('should prioritize docPartObj over other types', () => {
      const node = createBaseNode([
        createSdtPr([createDocPartObj(), createTag('{"type": "documentSection"}')]),
        createSdtContent(),
      ]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'docPartObj',
        handler: handleDocPartObj,
      });
    });
  });

  describe('documentSection handler', () => {
    it('should return documentSection type when tag is JSON with type documentSection', () => {
      const tagValue = '{"type": "documentSection"}';
      const mockParsedTag = { type: 'documentSection' };

      parseTagValueJSON.mockReturnValue(mockParsedTag);

      const node = createBaseNode([createSdtPr([createTag(tagValue)])]);

      const result = sdtNodeTypeStrategy(node);

      expect(parseTagValueJSON).toHaveBeenCalledWith(tagValue);
      expect(result).toEqual({
        type: 'documentSection',
        handler: handleDocumentSectionNode,
      });
    });
  });

  describe('fieldAnnotation handler (JSON format)', () => {
    it('should return fieldAnnotation type when tag has fieldId and fieldTypeShort', () => {
      const tagValue = '{"fieldId": "123", "fieldTypeShort": "text"}';
      const mockParsedTag = { fieldId: '123', fieldTypeShort: 'text' };

      parseTagValueJSON.mockReturnValue(mockParsedTag);

      const node = createBaseNode([createSdtPr([createTag(tagValue)])]);

      const result = sdtNodeTypeStrategy(node);

      expect(parseTagValueJSON).toHaveBeenCalledWith(tagValue);
      expect(result).toEqual({
        type: 'fieldAnnotation',
        handler: handleAnnotationNode,
      });
    });

    it('should not process as fieldAnnotation if only fieldId is present', () => {
      const tagValue = '{"fieldId": "123"}';
      const mockParsedTag = { fieldId: '123' };

      parseTagValueJSON.mockReturnValue(mockParsedTag);

      const node = createBaseNode([createSdtPr([createTag(tagValue)]), createSdtContent()]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'structuredContent',
        handler: handleStructuredContentNode,
      });
    });
  });

  describe('fieldAnnotation handler (legacy format)', () => {
    it('should return fieldAnnotation type for legacy format with fieldId and fieldTypeShort', () => {
      const tagValue = 'field123';

      const node = createBaseNode([createSdtPr([createTag(tagValue), createFieldTypeShort('text')])]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'fieldAnnotation',
        handler: handleAnnotationNode,
      });
    });

    it('should not process as legacy fieldAnnotation if fieldTypeShort is missing', () => {
      const tagValue = 'field123';

      const node = createBaseNode([createSdtPr([createTag(tagValue)]), createSdtContent()]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'structuredContent',
        handler: handleStructuredContentNode,
      });
    });
  });

  describe('structuredContent handler', () => {
    it('should return structuredContent type when sdtContent exists and no other handlers match', () => {
      const node = createBaseNode([createSdtContent()]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'structuredContent',
        handler: handleStructuredContentNode,
      });
    });
  });

  describe('unknown handler', () => {
    it('should return unknown type when no elements match', () => {
      const node = createBaseNode([]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });

    it('should return unknown type when only irrelevant elements exist', () => {
      const node = createBaseNode([{ name: 'w:someOtherElement' }]);

      const result = sdtNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });
  });
});
