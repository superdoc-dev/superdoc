import type { Node as ProseMirrorNode, Mark as ProseMirrorMark } from 'prosemirror-model';
import type { BlockCandidate } from './node-address-resolver.js';
import type { InlineCandidate } from './inline-address-resolver.js';
import type { InlineAnchor, InlineNodeType, NodeType } from '@superdoc/document-api';
import { mapNodeInfo } from './node-info-mapper.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlockNode(typeName: string, attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return {
    type: { name: typeName },
    attrs,
    isBlock: true,
    isInline: false,
    isText: false,
  } as unknown as ProseMirrorNode;
}

function makeBlockCandidate(
  nodeType: BlockCandidate['nodeType'],
  nodeId: string,
  attrs: Record<string, unknown> = {},
  typeName?: string,
): BlockCandidate {
  return {
    node: makeBlockNode(typeName ?? nodeType, attrs),
    pos: 0,
    end: 10,
    nodeType,
    nodeId,
  };
}

function makeAnchor(blockId: string, start = 0, end = 1): InlineAnchor {
  return {
    start: { blockId, offset: start },
    end: { blockId, offset: end },
  };
}

function makeInlineCandidate(
  nodeType: InlineNodeType,
  options: {
    blockId?: string;
    attrs?: Record<string, unknown>;
    markAttrs?: Record<string, unknown>;
    markName?: string;
    nodeAttrs?: Record<string, unknown>;
  } = {},
): InlineCandidate {
  const blockId = options.blockId ?? 'p1';
  return {
    nodeType,
    anchor: makeAnchor(blockId),
    blockId,
    pos: 0,
    end: 1,
    attrs: options.attrs,
    mark: options.markAttrs
      ? ({ type: { name: options.markName ?? nodeType }, attrs: options.markAttrs } as unknown as ProseMirrorMark)
      : undefined,
    node: options.nodeAttrs
      ? ({ type: { name: nodeType }, attrs: options.nodeAttrs } as unknown as ProseMirrorNode)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Block node mapping
// ---------------------------------------------------------------------------

describe('mapNodeInfo — block nodes', () => {
  it('maps paragraph with properties', () => {
    const result = mapNodeInfo(
      makeBlockCandidate('paragraph', 'p1', {
        paragraphProperties: { styleId: 'Normal', justification: 'center' },
      }),
    );

    expect(result.nodeType).toBe('paragraph');
    expect(result.kind).toBe('block');
    expect(result.properties).toMatchObject({
      styleId: 'Normal',
      alignment: 'center',
    });
  });

  it('maps heading with level from styleId', () => {
    const result = mapNodeInfo(
      makeBlockCandidate('heading', 'h1', {
        paragraphProperties: { styleId: 'Heading2' },
      }),
    );

    expect(result.nodeType).toBe('heading');
    expect(result.properties).toMatchObject({ headingLevel: 2 });
  });

  it('throws for heading without valid level', () => {
    expect(() =>
      mapNodeInfo(
        makeBlockCandidate('heading', 'h1', {
          paragraphProperties: { styleId: 'Normal' },
        }),
      ),
    ).toThrow('does not have a valid heading level');
  });

  it('maps listItem with numbering', () => {
    const result = mapNodeInfo(
      makeBlockCandidate('listItem', 'li1', {
        listRendering: { markerText: '1.', path: [1] },
      }),
    );

    expect(result.nodeType).toBe('listItem');
    expect(result.properties).toMatchObject({
      numbering: { marker: '1.', path: [1], ordinal: 1 },
    });
  });

  it('maps table with layout and width', () => {
    const result = mapNodeInfo(
      makeBlockCandidate('table', 't1', {
        tableProperties: { tableLayout: 'fixed', tableWidth: 5000, justification: 'center' },
      }),
    );

    expect(result.nodeType).toBe('table');
    expect(result.properties).toMatchObject({
      layout: 'fixed',
      width: 5000,
      alignment: 'center',
    });
  });

  it('maps tableRow with empty properties', () => {
    const result = mapNodeInfo(makeBlockCandidate('tableRow', 'tr1'));

    expect(result.nodeType).toBe('tableRow');
    expect(result.properties).toEqual({});
  });

  it('maps tableCell with width and shading', () => {
    const result = mapNodeInfo(
      makeBlockCandidate('tableCell', 'tc1', {
        tableCellProperties: { cellWidth: 2500, shading: { fill: '#FF0000' } },
      }),
    );

    expect(result.nodeType).toBe('tableCell');
    expect(result.properties).toMatchObject({ width: 2500, shading: '#FF0000' });
  });
});

// ---------------------------------------------------------------------------
// overrideType behavior
// ---------------------------------------------------------------------------

describe('mapNodeInfo — overrideType', () => {
  it('uses overrideType="sdt" for sdt block candidates', () => {
    const candidate = makeBlockCandidate('sdt', 'sdt2', { tag: 'MyTag' }, 'structuredContentBlock');
    const result = mapNodeInfo(candidate, 'sdt');

    expect(result.nodeType).toBe('sdt');
    expect(result.properties).toMatchObject({ tag: 'MyTag' });
  });
});

// ---------------------------------------------------------------------------
// Inline node mapping
// ---------------------------------------------------------------------------

describe('mapNodeInfo — inline nodes', () => {
  it('maps hyperlink from mark attrs', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('hyperlink', {
        markAttrs: { href: 'https://example.com', tooltip: 'Click me' },
        markName: 'link',
      }),
    );

    expect(result.nodeType).toBe('hyperlink');
    expect(result.kind).toBe('inline');
    expect(result.properties).toMatchObject({
      href: 'https://example.com',
      tooltip: 'Click me',
    });
  });

  it('maps comment from mark attrs', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('comment', {
        markAttrs: { commentId: 'c42' },
        markName: 'comment',
      }),
    );

    expect(result.nodeType).toBe('comment');
    expect(result.properties).toMatchObject({ commentId: 'c42' });
  });

  it('maps comment with importedId fallback', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('comment', {
        markAttrs: { importedId: 'imp1' },
        markName: 'comment',
      }),
    );

    expect(result.properties).toMatchObject({ commentId: 'imp1' });
  });

  it('maps bookmark from attrs', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('bookmark', {
        attrs: { name: 'Bookmark1', id: 'bk1' },
      }),
    );

    expect(result.nodeType).toBe('bookmark');
    expect(result.properties).toMatchObject({ name: 'Bookmark1', bookmarkId: 'bk1' });
  });

  it('maps footnoteRef from node attrs', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('footnoteRef', {
        nodeAttrs: { id: 'fn1' },
      }),
    );

    expect(result.nodeType).toBe('footnoteRef');
    expect(result.properties).toMatchObject({ noteId: 'fn1' });
  });

  it('maps tab with empty properties', () => {
    const result = mapNodeInfo(makeInlineCandidate('tab'));
    expect(result).toEqual({ nodeType: 'tab', kind: 'inline', properties: {} });
  });

  it('maps lineBreak with empty properties', () => {
    const result = mapNodeInfo(makeInlineCandidate('lineBreak'));
    expect(result).toEqual({ nodeType: 'lineBreak', kind: 'inline', properties: {} });
  });

  it('maps image with properties', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('image', {
        nodeAttrs: { src: 'pic.png', alt: 'A picture', size: { width: 100, height: 50 } },
      }),
    );

    expect(result.nodeType).toBe('image');
    expect(result.kind).toBe('inline');
    expect(result.properties).toMatchObject({
      src: 'pic.png',
      alt: 'A picture',
      size: { width: 100, height: 50 },
    });
  });

  it('maps run with text-style properties', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('run', {
        nodeAttrs: {
          runProperties: {
            bold: true,
            italic: true,
            underline: { val: 'single' },
            rFonts: { ascii: 'Calibri' },
            sz: 24,
            color: { val: 'FF0000' },
            highlight: 'yellow',
            rStyle: 'Strong',
            lang: { val: 'en-US' },
          },
        },
      }),
    );

    expect(result.nodeType).toBe('run');
    expect(result.kind).toBe('inline');
    expect(result.properties).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      font: 'Calibri',
      size: 24,
      color: 'FF0000',
      highlight: 'yellow',
      styleId: 'Strong',
      language: 'en-US',
    });
  });

  it('maps run from OOXML-style boolean tokens and fallback fields', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('run', {
        nodeAttrs: {
          runProperties: {
            bold: { 'w:val': '0' },
            italic: 'on',
            underline: { 'w:val': 'none' },
            dstrike: { val: 'true' },
            fontFamily: { hAnsi: 'Cambria' },
            fontSize: '16pt',
            color: { 'w:val': '00FF00' },
            highlight: { 'w:fill': 'FF00AA' },
            styleId: 'Emphasis',
            lang: 'fr-CA',
          },
        },
      }),
    );

    expect(result.nodeType).toBe('run');
    expect(result.properties).toMatchObject({
      bold: false,
      italic: true,
      underline: false,
      strike: true,
      font: 'Cambria',
      size: 16,
      color: '00FF00',
      highlight: '#FF00AA',
      styleId: 'Emphasis',
      language: 'fr-CA',
    });
  });

  it('maps run highlight "none" to transparent and keeps explicit false strike', () => {
    const result = mapNodeInfo(
      makeInlineCandidate('run', {
        nodeAttrs: {
          runProperties: {
            strike: { val: 'off' },
            u: { val: 'single' },
            rFonts: { ascii: 'Calibri' },
            size: '24',
            color: '112233',
            highlight: { val: 'none' },
            rStyle: 'Strong',
            lang: { val: 'de-DE' },
          },
        },
      }),
    );

    expect(result.nodeType).toBe('run');
    expect(result.properties).toMatchObject({
      strike: false,
      underline: true,
      font: 'Calibri',
      size: 24,
      color: '112233',
      highlight: 'transparent',
      styleId: 'Strong',
      language: 'de-DE',
    });
  });
});

// ---------------------------------------------------------------------------
// Kind mismatch errors
// ---------------------------------------------------------------------------

describe('mapNodeInfo — kind mismatch errors', () => {
  const blockOnlyTypes = ['paragraph', 'heading', 'listItem', 'table', 'tableRow', 'tableCell'] as const;

  for (const nodeType of blockOnlyTypes) {
    it(`throws when ${nodeType} is mapped from an inline candidate`, () => {
      const inlineCandidate = makeInlineCandidate('hyperlink');
      expect(() => mapNodeInfo(inlineCandidate, nodeType)).toThrow();
    });
  }

  const inlineOnlyTypes = ['hyperlink', 'comment', 'bookmark', 'footnoteRef'] as const;

  for (const nodeType of inlineOnlyTypes) {
    it(`throws when ${nodeType} is mapped from a block candidate`, () => {
      const blockCandidate = makeBlockCandidate('paragraph', 'p1');
      expect(() => mapNodeInfo(blockCandidate, nodeType)).toThrow();
    });
  }
});

// ---------------------------------------------------------------------------
// Unknown type
// ---------------------------------------------------------------------------

describe('mapNodeInfo — unknown type', () => {
  it('throws for unimplemented node type', () => {
    const candidate = makeBlockCandidate('paragraph', 'p1');
    // Force an unknown type via overrideType
    expect(() => mapNodeInfo(candidate, 'not-a-real-node-type' as unknown as NodeType)).toThrow(
      'Node type "not-a-real-node-type" is not implemented yet.',
    );
  });
});
