// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './hyperlink-translator.js';
import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';
import { exportSchemaToJson } from '@core/super-converter/exporter';

vi.mock('@helpers/generateDocxRandomId.js', () => ({
  generateDocxRandomId: vi.fn(),
}));

vi.mock('@core/super-converter/exporter', () => ({
  exportSchemaToJson: vi.fn(),
}));

describe('w:hyperlink translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportSchemaToJson).mockImplementation((p) => ({
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ type: 'text', text: p.node.text || 'link text' }] }],
    }));
  });

  describe('attribute handlers', () => {
    const findAttr = (sdName) => config.attributes.find((a) => a.sdName === sdName);

    it('handles w:anchor -> anchor', () => {
      const handler = findAttr('anchor');
      expect(handler.encode({ 'w:anchor': 'foo' })).toBe('foo');
      expect(handler.decode({ anchor: 'foo' })).toBe('foo');
    });

    it('handles w:docLocation -> docLocation', () => {
      const handler = findAttr('docLocation');
      expect(handler.encode({ 'w:docLocation': 'bar' })).toBe('bar');
      expect(handler.decode({ docLocation: 'bar' })).toBe('bar');
    });

    it('handles w:history -> history', () => {
      const handler = findAttr('history');
      expect(handler.encode({ 'w:history': '1' })).toBe(true);
      expect(handler.encode({ 'w:history': 'true' })).toBe(true);
      expect(handler.encode({ 'w:history': '0' })).toBe(false);
      expect(handler.encode({ 'w:history': 'false' })).toBe(false);
      expect(handler.decode({ history: true })).toBe('1');
      expect(handler.decode({ history: false })).toBe('0');
    });

    it('handles w:tooltip -> tooltip', () => {
      const handler = findAttr('tooltip');
      expect(handler.encode({ 'w:tooltip': 'click me' })).toBe('click me');
      expect(handler.decode({ tooltip: 'click me' })).toBe('click me');
    });

    it('handles r:id -> rId', () => {
      const handler = findAttr('rId');
      expect(handler.encode({ 'r:id': 'rId123' })).toBe('rId123');
      expect(handler.decode({ rId: 'rId123' })).toBe('rId123');
    });

    it('handles w:tgtFrame -> target', () => {
      const handler = findAttr('target');
      expect(handler.encode({ 'w:tgtFrame': '_blank' })).toBe('_blank');
      expect(handler.decode({ target: '_blank' })).toBe('_blank');
    });
  });

  describe('attributes mapping metadata', () => {
    it('exposes expected attributes handlers', () => {
      const attrMap = config.attributes;
      const names = attrMap.map((a) => [a.xmlName, a.sdName]);
      expect(names).toContainEqual(['w:anchor', 'anchor']);
      expect(names).toContainEqual(['w:docLocation', 'docLocation']);
      expect(names).toContainEqual(['w:history', 'history']);
      expect(names).toContainEqual(['w:tooltip', 'tooltip']);
      expect(names).toContainEqual(['r:id', 'rId']);
      expect(names).toContainEqual(['w:tgtFrame', 'target']);
      expect(names.length).toBe(6);
    });
  });

  describe('config.encode', () => {
    const mockNodeListHandler = {
      handler: vi.fn(({ nodes }) =>
        nodes.map((node, index) => ({
          type: 'text',
          text: `link text ${index + 1}`,
          marks: Array.isArray(node.marks) ? node.marks.map((mark) => ({ ...mark })) : [],
        })),
      ),
    };

    it('should resolve href from rId and add link mark to child runs', () => {
      const params = {
        nodes: [
          {
            name: 'w:hyperlink',
            attributes: { 'r:id': 'rId1' },
            elements: [
              { name: 'w:r', elements: [] },
              { name: 'w:r', elements: [] },
            ],
          },
        ],
        docx: {
          'word/_rels/document.xml.rels': {
            elements: [
              {
                name: 'Relationships',
                elements: [{ name: 'Relationship', attributes: { Id: 'rId1', Target: 'https://example.com' } }],
              },
            ],
          },
        },
        nodeListHandler: mockNodeListHandler,
        path: [],
      };
      const encodedAttrs = { rId: 'rId1' };

      const result = config.encode(params, encodedAttrs);

      expect(result).toHaveLength(2);
      const linkMark = { type: 'link', attrs: { rId: 'rId1', href: 'https://example.com' } };
      expect(result[0].type).toBe('text');
      expect(result[0].marks).toEqual([linkMark]);
      expect(result[1].type).toBe('text');
      expect(result[1].marks).toEqual([linkMark]);
      expect(mockNodeListHandler.handler).toHaveBeenCalledWith({
        ...params,
        nodes: params.nodes[0].elements,
        path: [...params.path, params.nodes[0]],
      });
    });

    it('should resolve href from anchor', () => {
      const params = {
        nodes: [
          {
            name: 'w:hyperlink',
            attributes: { 'w:anchor': 'my-anchor' },
            elements: [{ name: 'w:r', elements: [] }],
          },
        ],
        docx: { 'word/_rels/document.xml.rels': { elements: [{ name: 'Relationships', elements: [] }] } },
        nodeListHandler: mockNodeListHandler,
        path: [],
      };
      const encodedAttrs = { anchor: 'my-anchor' };

      const result = config.encode(params, encodedAttrs);

      const linkMark = { type: 'link', attrs: { anchor: 'my-anchor', href: '#my-anchor' } };
      expect(result[0].type).toBe('text');
      expect(result[0].marks).toEqual([linkMark]);
    });

    it('should add link mark to child runs and page reference nodes', () => {
      const params = {
        nodes: [
          {
            name: 'w:hyperlink',
            attributes: { 'r:id': 'rId1' },
            elements: [
              { name: 'w:r', elements: [] },
              {
                name: 'sd:pageReference',
                type: 'element',
                attributes: {
                  instruction: 'PAGEREF _Toc123456789 h',
                },
                elements: [{ type: 'text', text: '1' }],
              },
            ],
          },
        ],
        docx: {
          'word/_rels/document.xml.rels': {
            elements: [
              {
                name: 'Relationships',
                elements: [{ name: 'Relationship', attributes: { Id: 'rId1', Target: 'https://example.com' } }],
              },
            ],
          },
        },
        nodeListHandler: mockNodeListHandler,
        path: [],
      };
      const encodedAttrs = { rId: 'rId1' };

      const result = config.encode(params, encodedAttrs);

      expect(result).toHaveLength(2);
      const linkMark = { type: 'link', attrs: { rId: 'rId1', href: 'https://example.com' } };
      expect(result[0].type).toBe('text');
      expect(result[0].marks).toEqual([linkMark]);
      expect(result[1].type).toBe('text');
      expect(result[1].marks).toEqual([linkMark]);
      expect(mockNodeListHandler.handler).toHaveBeenCalledWith({
        ...params,
        nodes: params.nodes[0].elements,
        path: [...params.path, params.nodes[0]],
      });
    });
  });

  describe('config.decode', () => {
    it('should decode an external link', () => {
      const params = {
        node: {
          type: 'text',
          text: 'link text',
          marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com', rId: 'rId5' } }],
        },
        relationships: [],
      };

      vi.mocked(exportSchemaToJson).mockImplementation((p) => {
        expect(p.node.marks).toEqual([{ type: 'bold' }]);
        return { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] };
      });

      const result = translator.decode(params);

      expect(result.name).toBe('w:hyperlink');
      expect(result.attributes['r:id']).toBe('rId5');
      expect(params.relationships).toHaveLength(0);
      expect(exportSchemaToJson).toHaveBeenCalled();
    });

    it('should generate a new rId if not present on the mark', () => {
      vi.mocked(generateDocxRandomId).mockReturnValue('new-random-id');
      const params = {
        node: {
          type: 'text',
          text: 'link text',
          marks: [{ type: 'link', attrs: { href: 'https://another.com' } }],
        },
        relationships: [],
      };

      const result = translator.decode(params);

      expect(result.attributes['r:id']).toBe('rIdnew-random-id');
      expect(params.relationships[0].attributes.Id).toBe('rIdnew-random-id');
      expect(generateDocxRandomId).toHaveBeenCalled();
    });

    it('should not add a relationship if one with the same rId and Target already exists', () => {
      const existingRel = {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rId1',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          Target: 'https://example.com',
          TargetMode: 'External',
        },
      };
      const params = {
        node: {
          type: 'text',
          text: 'link text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', rId: 'rId1' } }],
        },
        relationships: [existingRel],
      };

      translator.decode(params);
      expect(params.relationships).toHaveLength(1);
      expect(params.relationships[0]).toBe(existingRel);
    });
  });

  describe('with hyperlinkGroup', () => {
    it('should wrap multiple nodes with the same link mark in a single w:hyperlink', () => {
      const params = {
        node: {
          type: 'text',
          text: 'link text 1',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', rId: 'rId1' } }],
        },
        extraParams: {
          hyperlinkGroup: [
            {
              type: 'text',
              text: 'link text 1',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', rId: 'rId1' } }],
            },
            {
              type: 'text',
              text: 'link text 2',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', rId: 'rId1' } }],
            },
          ],
        },
        relationships: [],
      };

      vi.mocked(exportSchemaToJson).mockImplementation((p) => ({
        name: 'w:r',
        elements: [{ name: 'w:t', elements: [{ type: 'text', text: p.node.text }] }],
      }));

      const result = translator.decode(params);

      expect(result.name).toBe('w:hyperlink');
      expect(result.attributes['r:id']).toBe('rId1');
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].elements[0].elements[0].text).toBe('link text 1');
      expect(result.elements[1].elements[0].elements[0].text).toBe('link text 2');
    });
  });
});
