// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './smartTag-translator.js';

describe('w:smartTag translator', () => {
  describe('attribute handlers', () => {
    const findAttr = (sdName) => config.attributes.find((a) => a.sdName === sdName);

    it('encodes w:element -> element', () => {
      const handler = findAttr('element');
      expect(handler.encode({ 'w:element': 'country-region' })).toBe('country-region');
      expect(handler.decode({ element: 'country-region' })).toBe('country-region');
    });

    it('encodes w:uri -> uri', () => {
      const handler = findAttr('uri');
      expect(handler.encode({ 'w:uri': 'urn:schemas-microsoft-com:office:smarttags' })).toBe(
        'urn:schemas-microsoft-com:office:smarttags',
      );
      expect(handler.decode({ uri: 'urn:schemas-microsoft-com:office:smarttags' })).toBe(
        'urn:schemas-microsoft-com:office:smarttags',
      );
    });
  });

  describe('encode (import: <w:smartTag> -> PM smartTag node)', () => {
    let nodeListHandler;
    beforeEach(() => {
      // Stub nodeListHandler to mirror what the real importer would do for one w:r
      nodeListHandler = {
        handler: vi.fn(({ nodes }) => {
          // Pretend each non-smartTagPr child is a run that became a text node.
          return nodes.map((n, i) => ({ type: 'text', text: `child-${i}-${n.name}` }));
        }),
      };
    });

    it('produces a smartTag PM node with element + uri attrs from encodedAttrs', () => {
      const node = {
        name: 'w:smartTag',
        attributes: {
          'w:element': 'country-region',
          'w:uri': 'urn:schemas-microsoft-com:office:smarttags',
        },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'AFGHANISTAN' }] }] }],
      };
      const result = config.encode(
        { nodes: [node], nodeListHandler, path: [] },
        { element: 'country-region', uri: 'urn:schemas-microsoft-com:office:smarttags' },
      );
      expect(result.type).toBe('smartTag');
      expect(result.attrs.element).toBe('country-region');
      expect(result.attrs.uri).toBe('urn:schemas-microsoft-com:office:smarttags');
      expect(result.attrs.smartTagPr).toBeNull();
      expect(result.content).toEqual([{ type: 'text', text: 'child-0-w:r' }]);
    });

    it('routes the full child list through nodeListHandler.handler (not just w:r)', () => {
      // EG_PContent allows runs, hyperlinks, fields, nested smartTags, etc.
      // The translator must NOT filter to w:r; that would silently drop these
      // siblings inside a smartTag, recreating the SD-2647 bug for richer content.
      const node = {
        name: 'w:smartTag',
        attributes: { 'w:element': 'place' },
        elements: [
          { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'before' }] }] },
          { name: 'w:hyperlink', elements: [] },
          {
            name: 'w:smartTag',
            attributes: { 'w:element': 'country-region' },
            elements: [{ name: 'w:r' }],
          },
        ],
      };
      config.encode({ nodes: [node], nodeListHandler, path: [] }, { element: 'place' });
      const handlerCall = nodeListHandler.handler.mock.calls[0][0];
      // Confirm all three siblings (not just w:r) were passed through.
      expect(handlerCall.nodes.map((n) => n.name)).toEqual(['w:r', 'w:hyperlink', 'w:smartTag']);
    });

    it('captures <w:smartTagPr> into attrs.smartTagPr (round-trip metadata) and strips it from content', () => {
      const smartTagPrXml = {
        name: 'w:smartTagPr',
        elements: [{ name: 'w:attr', attributes: { 'w:name': 'date', 'w:val': '2026-05-28' } }],
      };
      const node = {
        name: 'w:smartTag',
        attributes: { 'w:element': 'stockticker' },
        elements: [smartTagPrXml, { name: 'w:r' }],
      };
      const result = config.encode({ nodes: [node], nodeListHandler, path: [] }, { element: 'stockticker' });
      // smartTagPr lives on attrs, not in content.
      expect(result.attrs.smartTagPr).not.toBeNull();
      expect(result.attrs.smartTagPr.name).toBe('w:smartTagPr');
      // The child list passed to nodeListHandler must NOT include the smartTagPr.
      const handlerCall = nodeListHandler.handler.mock.calls[0][0];
      expect(handlerCall.nodes.map((n) => n.name)).toEqual(['w:r']);
    });

    it('handles empty smartTag (no children) without error', () => {
      const node = { name: 'w:smartTag', attributes: { 'w:element': 'empty' }, elements: [] };
      const result = config.encode({ nodes: [node], nodeListHandler, path: [] }, { element: 'empty' });
      expect(result.type).toBe('smartTag');
      expect(result.content).toEqual([]);
      // nodeListHandler.handler is NOT called when there are no visible children.
      expect(nodeListHandler.handler).not.toHaveBeenCalled();
    });

    it('nests via the schema content model when the PM importer recurses', () => {
      // Simulate a nested smartTag where nodeListHandler returns a PM smartTag
      // child (mimicking the recursive import). The outer smartTag's content
      // should hold that nested PM node natively, without flattening attrs.
      nodeListHandler.handler = vi.fn(() => [
        {
          type: 'smartTag',
          attrs: { element: 'country-region', uri: null, smartTagPr: null },
          content: [{ type: 'text', text: 'U.S.' }],
        },
      ]);
      const node = {
        name: 'w:smartTag',
        attributes: { 'w:element': 'place' },
        elements: [
          {
            name: 'w:smartTag',
            attributes: { 'w:element': 'country-region' },
            elements: [{ name: 'w:r' }],
          },
        ],
      };
      const result = config.encode({ nodes: [node], nodeListHandler, path: [] }, { element: 'place' });
      expect(result.attrs.element).toBe('place');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('smartTag');
      expect(result.content[0].attrs.element).toBe('country-region');
      expect(result.content[0].content[0].text).toBe('U.S.');
    });
  });

  describe('decode (export: PM smartTag node -> <w:smartTag>)', () => {
    // The decoder uses translateChildNodes, which is wired through the real
    // exporter pipeline. For the unit test we verify the shape and that the
    // smartTagPr round-trip path works.

    it('emits <w:smartTag> with the decoded attributes', () => {
      const node = {
        type: 'smartTag',
        attrs: { element: 'country-region', uri: 'urn:schemas-microsoft-com:office:smarttags', smartTagPr: null },
        content: [],
      };
      const result = config.decode(
        { node, relationships: [] },
        { 'w:element': 'country-region', 'w:uri': 'urn:schemas-microsoft-com:office:smarttags' },
      );
      expect(result.name).toBe('w:smartTag');
      expect(result.attributes).toEqual({
        'w:element': 'country-region',
        'w:uri': 'urn:schemas-microsoft-com:office:smarttags',
      });
    });

    it('re-emits <w:smartTagPr> when preserved on attrs', () => {
      const preservedSmartTagPr = {
        name: 'w:smartTagPr',
        elements: [{ name: 'w:attr', attributes: { 'w:name': 'date', 'w:val': '2026-05-28' } }],
      };
      const node = {
        type: 'smartTag',
        attrs: { element: 'stockticker', uri: null, smartTagPr: preservedSmartTagPr },
        content: [],
      };
      const result = config.decode({ node, relationships: [] }, { 'w:element': 'stockticker' });
      expect(result.elements?.[0]?.name).toBe('w:smartTagPr');
      // Must be a clone, not the same reference, so callers can't accidentally
      // mutate the PM-state copy via the exported tree.
      expect(result.elements[0]).not.toBe(preservedSmartTagPr);
    });
  });

  describe('config', () => {
    it('binds the translator to <w:smartTag>', () => {
      expect(config.xmlName).toBe('w:smartTag');
      expect(config.sdNodeOrKeyName).toBe('smartTag');
    });

    it('exports a NodeTranslator instance', () => {
      expect(translator).toBeDefined();
    });
  });
});
