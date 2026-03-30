import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDocumentSectionNode } from './handle-document-section-node';
import { parseTagValueJSON } from './parse-tag-value-json';

// Mock dependencies
vi.mock('./parse-tag-value-json', () => ({
  parseTagValueJSON: vi.fn(),
}));

describe('handleDocumentSectionNode', () => {
  const mockNodeListHandler = {
    handler: vi.fn(() => [{ type: 'paragraph', text: 'test content' }]),
  };

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

  const createId = (value) => ({
    name: 'w:id',
    attributes: { 'w:val': value },
  });

  const createAlias = (value) => ({
    name: 'w:alias',
    attributes: { 'w:val': value },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseTagValueJSON.mockReturnValue({});
  });

  it('returns null when nodes array is empty', () => {
    const params = { nodes: [], nodeListHandler: mockNodeListHandler };
    const result = handleDocumentSectionNode(params);

    expect(result).toBeNull();
  });

  it('returns null when first node is not w:sdt', () => {
    const params = {
      nodes: [{ name: 'w:p' }],
      nodeListHandler: mockNodeListHandler,
    };
    const result = handleDocumentSectionNode(params);

    expect(result).toBeNull();
  });

  it('processes document section with all attributes from elements', () => {
    const node = createNode(
      [createTag('{"type": "documentSection"}'), createId('section-123'), createAlias('Section Title')],
      [{ name: 'w:p', text: 'content' }],
    );

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
      path: [],
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
      description: 'Section description',
    });

    const result = handleDocumentSectionNode(params);

    expect(parseTagValueJSON).toHaveBeenCalledWith('{"type": "documentSection"}');
    expect(mockNodeListHandler.handler).toHaveBeenCalledWith({
      ...params,
      nodes: [{ name: 'w:p', text: 'content' }],
      path: [node],
    });
    expect(result.type).toEqual('documentSection');
    expect(result.content).toEqual([{ type: 'paragraph', text: 'test content' }]);
    expect(result.attrs.id).toEqual('section-123');
    expect(result.attrs.title).toEqual('Section Title');
    expect(result.attrs.description).toEqual('Section description');
    expect(result.attrs.isLocked).toEqual(false);
    expect(result.attrs.sdtPr).toBeDefined(); // Passthrough for round-trip
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('uses values from parsed JSON when element attributes are missing', () => {
    const node = createNode([createTag('{"type": "documentSection"}')]);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
      id: 'json-id',
      title: 'JSON Title',
      description: 'JSON description',
    });

    const result = handleDocumentSectionNode(params);

    expect(result.attrs.id).toEqual('json-id');
    expect(result.attrs.title).toEqual('JSON Title');
    expect(result.attrs.description).toEqual('JSON description');
    expect(result.attrs.isLocked).toEqual(false);
    expect(result.attrs.sdtPr).toBeDefined();
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('prioritizes element attributes over JSON values', () => {
    const node = createNode([
      createTag('{"type": "documentSection"}'),
      createId('element-id'),
      createAlias('Element Title'),
    ]);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
      id: 'json-id',
      title: 'JSON Title',
      description: 'JSON description',
    });

    const result = handleDocumentSectionNode(params);

    expect(result.attrs.id).toEqual('element-id');
    expect(result.attrs.title).toEqual('Element Title');
    expect(result.attrs.description).toEqual('JSON description');
    expect(result.attrs.isLocked).toEqual(false);
    expect(result.attrs.sdtPr).toBeDefined();
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('parses w:lock element and sets isLocked to true when sdtContentLocked', () => {
    const createLock = (value) => ({
      name: 'w:lock',
      attributes: { 'w:val': value },
    });

    const node = createNode([
      createTag('{"type": "documentSection"}'),
      createId('section-123'),
      createLock('sdtContentLocked'),
    ]);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
    });

    const result = handleDocumentSectionNode(params);

    expect(result.attrs.isLocked).toEqual(true);
  });

  it('handles null sdtPr gracefully without adding it to attrs', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtContent',
          elements: [],
        },
      ],
    };

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
    });

    const result = handleDocumentSectionNode(params);

    expect(result.attrs).toBeDefined();
    expect(result.attrs.sdtPr).toBeUndefined();
  });

  it('handles empty sdtPr.elements array correctly', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [],
        },
        {
          name: 'w:sdtContent',
          elements: [],
        },
      ],
    };

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseTagValueJSON.mockReturnValue({
      type: 'documentSection',
    });

    const result = handleDocumentSectionNode(params);

    expect(result.attrs).toBeDefined();
    expect(result.attrs.sdtPr).toBeDefined();
    expect(result.attrs.sdtPr.elements).toEqual([]);
  });
});
