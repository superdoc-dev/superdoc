import { describe, it, expect } from 'vitest';
import { handlePermStartNode } from './permStartImporter.js';
import { handlePermEndNode } from './permEndImporter.js';

const createParams = (node, extra = {}) => ({
  nodes: [node],
  docx: {},
  nodeListHandler: { handler: () => [], handlerEntities: [] },
  ...extra,
});

describe('permission range importers', () => {
  it('creates block-level permStart when not in inline context', () => {
    const node = { name: 'w:permStart', attributes: { 'w:id': '1' } };
    const { nodes, consumed } = handlePermStartNode(createParams(node, { path: [{ name: 'w:body' }] }));
    expect(consumed).toBe(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('permStartBlock');
    expect(nodes[0].attrs.id).toBe('1');
  });

  it('creates block-level permEnd when not in inline context', () => {
    const node = { name: 'w:permEnd', attributes: { 'w:id': '2', 'w:displacedByCustomXml': 'prev' } };
    const { nodes, consumed } = handlePermEndNode(createParams(node, { path: [{ name: 'w:body' }] }));
    expect(consumed).toBe(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('permEndBlock');
    expect(nodes[0].attrs.id).toBe('2');
  });
});
