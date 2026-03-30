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
    expect(nodes[0].content).toEqual([]);
  });

  it('creates passthroughInline when inside inline context', () => {
    const node = { name: 'w:customInline', attributes: {}, elements: [] };
    const params = createParams(node, { path: [{ name: 'w:r' }] });
    const { nodes } = handlePassthroughNode(params);
    expect(nodes[0].type).toBe('passthroughInline');
  });

  it('stores converted child content and original xml children', () => {
    const child = { name: 'w:r', elements: [{ name: 'w:t', elements: [], attributes: {} }] };
    const node = { name: 'w:unknown', elements: [child] };
    const handler = vi.fn(() => [{ type: 'text', text: 'child' }]);
    const params = createParams(node, {
      nodeListHandler: { handler, handlerEntities: [] },
    });
    const { nodes } = handlePassthroughNode(params);
    expect(handler).toHaveBeenCalled();
    expect(nodes[0].content).toEqual([{ type: 'text', text: 'child' }]);
    expect(nodes[0].attrs.originalXml.elements).toEqual([child]);
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
});
