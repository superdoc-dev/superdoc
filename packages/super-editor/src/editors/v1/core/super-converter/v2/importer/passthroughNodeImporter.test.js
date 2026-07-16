import { describe, it, expect, vi } from 'vitest';
import { handlePassthroughNode, isInlineContext } from './passthroughNodeImporter.js';

const createParams = (node, extra = {}) => ({
  nodes: [node],
  docx: {},
  nodeListHandler: { handler: () => [], handlerEntities: [] },
  ...extra,
});

describe('passthrough node importer', () => {
  it('creates passthroughBlock for unknown block nodes', () => {
    const node = { name: 'w:customBlock', attributes: { 'w:id': '1' }, elements: [] };
    const { nodes, consumed } = handlePassthroughNode(createParams(node));
    expect(consumed).toBe(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('passthroughBlock');
    expect(nodes[0].attrs.originalName).toBe('w:customBlock');
    expect(nodes[0].attrs.originalXml).toEqual(node);
    expect(nodes[0].content).toBeUndefined();
  });

  it('creates passthroughInline when inside inline context', () => {
    const node = { name: 'w:customInline', attributes: {}, elements: [] };
    const params = createParams(node, { path: [{ name: 'w:r' }] });
    const { nodes } = handlePassthroughNode(params);
    expect(nodes[0].type).toBe('passthroughInline');
  });

  it('preserves original xml children but does not attach content to block passthrough', () => {
    const child = { name: 'w:r', elements: [{ name: 'w:t', elements: [], attributes: {} }] };
    const node = { name: 'w:unknown', elements: [child] };
    const handler = vi.fn(() => [{ type: 'text', text: 'child' }]);
    const params = createParams(node, {
      nodeListHandler: { handler, handlerEntities: [] },
    });
    const { nodes } = handlePassthroughNode(params);
    // Children still run through the handler (import side effects)...
    expect(handler).toHaveBeenCalled();
    expect(nodes[0].type).toBe('passthroughBlock');
    // ...but passthroughBlock is an atom: child markup is preserved only in originalXml.
    expect(nodes[0].attrs.originalXml.elements).toEqual([child]);
    expect(nodes[0].content).toBeUndefined();
  });

  it('treats math nodes as inline context', () => {
    const pathChain = [{ name: 'w:p' }, { name: 'm:oMathPara' }];
    expect(isInlineContext(pathChain)).toBe(true);

    const node = { name: 'm:oMathPara', elements: [] };
    const { nodes } = handlePassthroughNode(createParams(node, { path: pathChain }));
    expect(nodes[0].type).toBe('passthroughInline');
  });

  it('treats unknown nodes inside paragraphs as inline context', () => {
    const node = { name: 'w:unknown', elements: [] };
    const { nodes } = handlePassthroughNode(createParams(node, { path: [{ name: 'w:p' }] }));
    expect(nodes[0].type).toBe('passthroughInline');
  });

  it('does not attach content to inline passthrough with child text (w:instrText MERGEFIELD)', () => {
    const node = {
      name: 'w:instrText',
      attributes: { 'xml:space': 'preserve' },
      elements: [{ type: 'text', text: ' MERGEFIELD System_Date ' }],
    };
    const handler = vi.fn(() => [{ type: 'text', text: ' MERGEFIELD System_Date ' }]);
    const params = createParams(node, {
      path: [{ name: 'w:p' }, { name: 'w:r' }],
      nodeListHandler: { handler, handlerEntities: [] },
    });
    const { nodes } = handlePassthroughNode(params);
    expect(nodes[0].type).toBe('passthroughInline');
    expect(nodes[0].attrs.originalName).toBe('w:instrText');
    expect(nodes[0].attrs.originalXml.elements).toEqual(node.elements);
    expect(nodes[0].content).toBeUndefined();
  });
});
