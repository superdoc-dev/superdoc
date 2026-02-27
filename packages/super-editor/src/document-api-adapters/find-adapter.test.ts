import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import type { Query } from '@superdoc/document-api';
import { findAdapter } from './find-adapter.js';

// ---------------------------------------------------------------------------
// Helpers — lightweight ProseMirror-like stubs
// ---------------------------------------------------------------------------

/**
 * Creates a minimal ProseMirrorNode stub.
 *
 * `textContent` is an optional flat string representing the text in the doc.
 * `textBetween(from, to, blockSep)` slices from it, inserting `blockSep` at
 * every position where a child boundary is crossed. This is a simplified model
 * sufficient for testing snippet generation.
 */
function makeNode(
  typeName: string,
  attrs: Record<string, unknown> = {},
  nodeSize = 10,
  children: Array<{ node: ProseMirrorNode; offset: number }> = [],
  textContent = '',
): ProseMirrorNode {
  const inlineTypes = new Set([
    'text',
    'run',
    'image',
    'tab',
    'lineBreak',
    'hardBreak',
    'bookmarkStart',
    'bookmarkEnd',
    'commentRangeStart',
    'commentRangeEnd',
    'commentReference',
    'structuredContent',
    'footnoteReference',
  ]);
  const isText = typeName === 'text';
  const isInline = inlineTypes.has(typeName);
  const isBlock = typeName !== 'doc' && !isInline;
  const inlineContent = isBlock && typeName === 'paragraph';
  const computedNodeSize = isText ? textContent.length : nodeSize;
  const contentSize = children.reduce((max, child) => Math.max(max, child.offset + child.node.nodeSize), 0);

  // Collect boundary positions where block separators should be inserted.
  const boundaries = new Set<number>();
  for (const child of children) {
    boundaries.add(child.offset);
    boundaries.add(child.offset + (child.node as unknown as { nodeSize: number }).nodeSize);
  }

  return {
    type: { name: typeName },
    attrs,
    nodeSize: computedNodeSize,
    content: { size: contentSize },
    textContent,
    text: isText ? textContent : undefined,
    isText,
    isLeaf: isText || (isInline && children.length === 0),
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    marks: (attrs.__marks ?? []) as unknown as ProseMirrorNode['marks'],
    textBetween(from: number, to: number, blockSep = '') {
      // Build text character-by-character, inserting blockSep at boundaries
      let result = '';
      for (let i = from; i < to; i++) {
        if (i > from && boundaries.has(i) && blockSep) {
          result += blockSep;
        }
        if (i < textContent.length) {
          result += textContent[i];
        }
      }
      return result;
    },
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      for (const child of children) {
        callback(child.node, child.offset);
      }
    },
    childCount: children.length,
    child(index: number) {
      return children[index]!.node;
    },
    forEach(callback: (node: ProseMirrorNode, offset: number) => void) {
      for (const child of children) {
        callback(child.node, child.offset);
      }
    },
  } as unknown as ProseMirrorNode;
}

type SearchFn = (pattern: string | RegExp, options?: Record<string, unknown>) => unknown[];

function makeEditor(docNode: ProseMirrorNode, search?: SearchFn): Editor {
  return {
    state: { doc: docNode },
    commands: search ? { search } : {},
  } as unknown as Editor;
}

/** Builds a doc with paragraph children at specified offsets. */
function buildDoc(
  ...entries: Array<{ typeName: string; attrs?: Record<string, unknown>; nodeSize?: number; offset: number }>
): ProseMirrorNode;
function buildDoc(
  textContent: string,
  ...entries: Array<{ typeName: string; attrs?: Record<string, unknown>; nodeSize?: number; offset: number }>
): ProseMirrorNode;
function buildDoc(...args: unknown[]): ProseMirrorNode {
  let textContent = '';
  let entries: Array<{ typeName: string; attrs?: Record<string, unknown>; nodeSize?: number; offset: number }>;
  if (typeof args[0] === 'string') {
    textContent = args[0] as string;
    entries = args.slice(1) as typeof entries;
  } else {
    entries = args as typeof entries;
  }
  const children = entries.map((e) => ({
    node: makeNode(e.typeName, e.attrs ?? {}, e.nodeSize ?? 10),
    offset: e.offset,
  }));
  const totalSize = entries.reduce((max, e) => Math.max(max, e.offset + (e.nodeSize ?? 10)), 0) + 2;
  return makeNode('doc', {}, totalSize, children, textContent);
}

// ---------------------------------------------------------------------------
// Block selector queries
// ---------------------------------------------------------------------------

describe('findAdapter — block selectors', () => {
  it('returns all paragraphs when select.type is "paragraph"', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p2' }, offset: 12 },
      { typeName: 'image', attrs: { sdBlockId: 'img1' }, offset: 24 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(2);
    expect(result.matches).toEqual([
      { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
    ]);
    expect(result.diagnostics).toBeUndefined();
  });

  it('returns headings for paragraphs with heading styleId', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'h1', paragraphProperties: { styleId: 'Heading1' } }, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 12 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', nodeType: 'heading' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0]).toEqual({ kind: 'block', nodeType: 'heading', nodeId: 'h1' });
  });

  it('uses node selector with kind filter', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
      { typeName: 'table', attrs: { sdBlockId: 't1' }, offset: 12 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', kind: 'block' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(2);
  });

  it('uses node selector with nodeType filter', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
      { typeName: 'table', attrs: { sdBlockId: 't1' }, offset: 12 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', nodeType: 'table' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0].nodeId).toBe('t1');
  });

  it('emits diagnostic for includeUnknown', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
      { typeName: 'mysteryBlock', attrs: { sdBlockId: 'm1' }, offset: 12 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' }, includeUnknown: true };

    const result = findAdapter(editor, query);

    expect(result.matches).toEqual([{ kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }]);
    expect(result.total).toBe(1);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0].message).toContain('Unknown block node type');
    expect(result.diagnostics![0].message).not.toContain('position');
    expect(result.diagnostics![0].hint).toContain('stable id "m1"');
  });

  it('emits actionable diagnostics for unknown inline nodes without raw positions', () => {
    const doc = buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-inline' }, nodeSize: 12, offset: 0 },
      { typeName: 'commentReference', nodeSize: 1, offset: 3 },
    );
    const editor = makeEditor(doc);
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' }, includeUnknown: true };

    const result = findAdapter(editor, query);

    const diagnostic = result.diagnostics?.find((entry) => entry.message.includes('Unknown inline node type'));
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message).not.toContain('position');
    expect(diagnostic!.address).toEqual({
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: 'p-inline',
    });
    expect(diagnostic!.hint).toContain('p-inline');
  });
});

// ---------------------------------------------------------------------------
// Within scope
// ---------------------------------------------------------------------------

describe('findAdapter — within scope', () => {
  it('limits block results to within a parent node', () => {
    const doc = buildDoc(
      { typeName: 'table', attrs: { sdBlockId: 'tbl1' }, nodeSize: 50, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-inside' }, nodeSize: 10, offset: 5 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-outside' }, nodeSize: 10, offset: 60 },
    );
    const editor = makeEditor(doc);
    const query: Query = {
      select: { type: 'node', nodeType: 'paragraph' },
      within: { kind: 'block', nodeType: 'table', nodeId: 'tbl1' },
    };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0].nodeId).toBe('p-inside');
  });

  it('returns empty when within target is not found', () => {
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 });
    const editor = makeEditor(doc);
    const query: Query = {
      select: { type: 'node', nodeType: 'paragraph' },
      within: { kind: 'block', nodeType: 'table', nodeId: 'no-such-table' },
    };

    const result = findAdapter(editor, query);

    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0].message).toContain('was not found');
  });

  it('returns empty with diagnostic for inline within scope', () => {
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 });
    const editor = makeEditor(doc);
    const query: Query = {
      select: { type: 'node', nodeType: 'paragraph' },
      within: {
        kind: 'inline',
        nodeType: 'run',
        anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 5 } },
      },
    };

    const result = findAdapter(editor, query);

    expect(result.matches).toEqual([]);
    expect(result.diagnostics![0].message).toContain('Inline');
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('findAdapter — pagination', () => {
  function buildThreeParagraphs() {
    return buildDoc(
      { typeName: 'paragraph', attrs: { sdBlockId: 'a' }, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'b' }, offset: 12 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'c' }, offset: 24 },
    );
  }

  it('limits results with limit', () => {
    const editor = makeEditor(buildThreeParagraphs());
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' }, limit: 2 };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(3);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].nodeId).toBe('a');
    expect(result.matches[1].nodeId).toBe('b');
  });

  it('skips results with offset', () => {
    const editor = makeEditor(buildThreeParagraphs());
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' }, offset: 1 };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(3);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].nodeId).toBe('b');
  });

  it('combines offset and limit', () => {
    const editor = makeEditor(buildThreeParagraphs());
    const query: Query = { select: { type: 'node', nodeType: 'paragraph' }, offset: 1, limit: 1 };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(3);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].nodeId).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Inline selectors
// ---------------------------------------------------------------------------

describe('findAdapter — inline selectors', () => {
  it('returns run matches', () => {
    const runText = makeNode('text', {}, 2, [], 'Hi');
    const runNode = makeNode('run', { runProperties: { bold: true } }, 4, [{ node: runText, offset: 0 }]);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p-run' }, 6, [{ node: runNode, offset: 0 }]);
    const doc = makeNode('doc', {}, 8, [{ node: paragraph, offset: 0 }]);
    const editor = makeEditor(doc);

    const result = findAdapter(editor, { select: { type: 'node', nodeType: 'run' } });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toEqual({
      kind: 'inline',
      nodeType: 'run',
      anchor: { start: { blockId: 'p-run', offset: 0 }, end: { blockId: 'p-run', offset: 2 } },
    });
  });

  it('returns hyperlink matches from inline marks', () => {
    const linkMark = {
      type: { name: 'link' },
      attrs: { href: 'https://example.com' },
    } as unknown as ProseMirrorNode['marks'][number];
    const textNode = makeNode('text', { __marks: [linkMark] }, 2, [], 'Hi');
    const imageNode = makeNode('image', {}, 1, []);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p1' }, 5, [
      { node: textNode, offset: 0 },
      { node: imageNode, offset: 2 },
    ]);
    const doc = makeNode('doc', {}, 7, [{ node: paragraph, offset: 0 }]);
    const editor = makeEditor(doc);

    const result = findAdapter(editor, { select: { type: 'node', nodeType: 'hyperlink' } });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toEqual({
      kind: 'inline',
      nodeType: 'hyperlink',
      anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 2 } },
    });
  });

  it('returns inline image matches', () => {
    const textNode = makeNode('text', {}, 2, [], 'Hi');
    const imageNode = makeNode('image', { src: 'x' }, 1, []);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p2' }, 5, [
      { node: textNode, offset: 0 },
      { node: imageNode, offset: 2 },
    ]);
    const doc = makeNode('doc', {}, 7, [{ node: paragraph, offset: 0 }]);
    const editor = makeEditor(doc);

    const result = findAdapter(editor, { select: { type: 'node', nodeType: 'image' } });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toEqual({
      kind: 'inline',
      nodeType: 'image',
      anchor: { start: { blockId: 'p2', offset: 2 }, end: { blockId: 'p2', offset: 3 } },
    });
  });

  it('returns both block and inline sdts when kind is omitted', () => {
    const inlineSdt = makeNode('structuredContent', { tag: 'inline-sdt' }, 1, []);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p-sdt' }, 5, [{ node: inlineSdt, offset: 0 }]);
    const blockSdt = makeNode('structuredContentBlock', { sdBlockId: 'sdt-block' }, 4, []);
    const doc = makeNode('doc', {}, 20, [
      { node: paragraph, offset: 0 },
      { node: blockSdt, offset: 10 },
    ]);
    const editor = makeEditor(doc);

    const shorthand = findAdapter(editor, { select: { type: 'node', nodeType: 'sdt' } });
    expect(shorthand.total).toBe(2);
    expect(shorthand.matches).toEqual(
      expect.arrayContaining([
        { kind: 'block', nodeType: 'sdt', nodeId: 'sdt-block' },
        {
          kind: 'inline',
          nodeType: 'sdt',
          anchor: { start: { blockId: 'p-sdt', offset: 0 }, end: { blockId: 'p-sdt', offset: 1 } },
        },
      ]),
    );

    const nodeSelector = findAdapter(editor, { select: { type: 'node', nodeType: 'sdt' } });
    expect(nodeSelector.total).toBe(2);
    expect(nodeSelector.matches).toEqual(
      expect.arrayContaining([
        { kind: 'block', nodeType: 'sdt', nodeId: 'sdt-block' },
        {
          kind: 'inline',
          nodeType: 'sdt',
          anchor: { start: { blockId: 'p-sdt', offset: 0 }, end: { blockId: 'p-sdt', offset: 1 } },
        },
      ]),
    );
  });

  it('respects explicit kind for sdt node selector', () => {
    const inlineSdt = makeNode('structuredContent', { tag: 'inline-sdt' }, 1, []);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p-sdt' }, 5, [{ node: inlineSdt, offset: 0 }]);
    const blockSdt = makeNode('structuredContentBlock', { sdBlockId: 'sdt-block' }, 4, []);
    const doc = makeNode('doc', {}, 20, [
      { node: paragraph, offset: 0 },
      { node: blockSdt, offset: 10 },
    ]);
    const editor = makeEditor(doc);

    const blockResult = findAdapter(editor, { select: { type: 'node', kind: 'block', nodeType: 'sdt' } });
    expect(blockResult.total).toBe(1);
    expect(blockResult.matches[0]).toEqual({ kind: 'block', nodeType: 'sdt', nodeId: 'sdt-block' });

    const inlineResult = findAdapter(editor, { select: { type: 'node', kind: 'inline', nodeType: 'sdt' } });
    expect(inlineResult.total).toBe(1);
    expect(inlineResult.matches[0]).toEqual({
      kind: 'inline',
      nodeType: 'sdt',
      anchor: { start: { blockId: 'p-sdt', offset: 0 }, end: { blockId: 'p-sdt', offset: 1 } },
    });
  });

  it('returns mapped nodes when includeNodes is true', () => {
    const runText = makeNode('text', {}, 2, [], 'Hi');
    const runNode = makeNode('run', { runProperties: { bold: true } }, 4, [{ node: runText, offset: 0 }]);
    const paragraph = makeNode('paragraph', { sdBlockId: 'p-run' }, 6, [{ node: runNode, offset: 0 }]);
    const doc = makeNode('doc', {}, 8, [{ node: paragraph, offset: 0 }]);
    const editor = makeEditor(doc);

    const result = findAdapter(editor, { select: { type: 'node', nodeType: 'run' }, includeNodes: true });

    expect(result.total).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes![0]).toMatchObject({
      nodeType: 'run',
      kind: 'inline',
      properties: { bold: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Text selector queries
// ---------------------------------------------------------------------------

describe('findAdapter — text selectors', () => {
  // Pad textContent to 102 chars so textBetween returns something for any position in the two paragraphs.
  const defaultText = 'a'.repeat(102);

  function makeSearchableEditor(
    searchResults: Array<{ from: number; to: number; text: string }>,
    textContent = defaultText,
  ) {
    const doc = buildDoc(
      textContent,
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p2' }, nodeSize: 50, offset: 52 },
    );
    const search: SearchFn = () => searchResults;
    return makeEditor(doc, search);
  }

  it('returns text matches with context', () => {
    // Place "hello" at positions 5-10 in the text content
    const text = '     hello' + 'a'.repeat(92);
    const editor = makeSearchableEditor([{ from: 5, to: 10, text: 'hello' }], text);
    const query: Query = { select: { type: 'text', pattern: 'hello' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0]).toEqual({ kind: 'block', nodeType: 'paragraph', nodeId: 'p1' });
    expect(result.context).toBeDefined();
    expect(result.context![0].snippet).toContain('hello');
    expect(result.context![0].textRanges).toEqual([{ kind: 'text', blockId: 'p1', range: { start: 4, end: 9 } }]);
  });

  it('maps matches to their containing blocks', () => {
    const editor = makeSearchableEditor([
      { from: 5, to: 10, text: 'first' },
      { from: 60, to: 65, text: 'second' },
    ]);
    const query: Query = { select: { type: 'text', pattern: 'test' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(2);
    expect(result.matches[0].nodeId).toBe('p1');
    expect(result.matches[1].nodeId).toBe('p2');
  });

  it('returns empty with diagnostic for empty pattern', () => {
    const editor = makeSearchableEditor([]);
    const query: Query = { select: { type: 'text', pattern: '' } };

    const result = findAdapter(editor, query);

    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0].message).toContain('non-empty');
  });

  it('returns empty with diagnostic for invalid regex', () => {
    const editor = makeSearchableEditor([]);
    const query: Query = { select: { type: 'text', pattern: '[invalid', mode: 'regex' } };

    const result = findAdapter(editor, query);

    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0].message).toContain('Invalid text query regex');
  });

  it('passes regex pattern to search for regex mode', () => {
    let capturedPattern: string | RegExp | undefined;
    const doc = buildDoc('a'.repeat(52), {
      typeName: 'paragraph',
      attrs: { sdBlockId: 'p1' },
      nodeSize: 50,
      offset: 0,
    });
    const search: SearchFn = (pattern) => {
      capturedPattern = pattern;
      return [{ from: 5, to: 10, text: 'hello' }];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'hel+o', mode: 'regex' } };

    findAdapter(editor, query);

    expect(capturedPattern).toBeInstanceOf(RegExp);
    expect((capturedPattern as RegExp).source).toBe('hel+o');
    expect((capturedPattern as RegExp).flags).toContain('i');
  });

  it('passes case-sensitive regex for regex mode', () => {
    let capturedPattern: string | RegExp | undefined;
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const search: SearchFn = (pattern) => {
      capturedPattern = pattern;
      return [];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'Hello', mode: 'regex', caseSensitive: true } };

    findAdapter(editor, query);

    expect(capturedPattern).toBeInstanceOf(RegExp);
    expect((capturedPattern as RegExp).flags).not.toContain('i');
  });

  it('passes escaped RegExp for default contains mode', () => {
    let capturedPattern: string | RegExp | undefined;
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const search: SearchFn = (pattern) => {
      capturedPattern = pattern;
      return [];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'hello' } };

    findAdapter(editor, query);

    expect(capturedPattern).toBeInstanceOf(RegExp);
    expect((capturedPattern as RegExp).source).toBe('hello');
    expect((capturedPattern as RegExp).flags).toContain('i');
  });

  it('treats slash-delimited contains patterns as literal text', () => {
    const text = 'foo /foo/ foo';
    const doc = buildDoc(text, {
      typeName: 'paragraph',
      attrs: { sdBlockId: 'p1' },
      nodeSize: text.length + 4,
      offset: 0,
    });
    const search: SearchFn = (pattern, options) => {
      const caseSensitive = (options as { caseSensitive?: boolean })?.caseSensitive ?? false;
      let effectivePattern: RegExp;

      if (pattern instanceof RegExp) {
        const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
        effectivePattern = new RegExp(pattern.source, flags);
      } else if (typeof pattern === 'string' && /^\/(.+)\/([gimsuy]*)$/.test(pattern)) {
        const [, body, flags] = pattern.match(/^\/(.+)\/([gimsuy]*)$/) as RegExpMatchArray;
        effectivePattern = new RegExp(body, flags.includes('g') ? flags : `${flags}g`);
      } else {
        const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        effectivePattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      }

      return Array.from(text.matchAll(effectivePattern)).map((match) => {
        const from = match.index ?? 0;
        return {
          from,
          to: from + match[0].length,
          text: match[0],
        };
      });
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: '/foo/' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.context).toBeDefined();
    const context = result.context![0];
    expect(context.snippet.slice(context.highlightRange.start, context.highlightRange.end)).toBe('/foo/');
  });

  it('passes case-sensitive escaped RegExp for contains mode', () => {
    let capturedPattern: string | RegExp | undefined;
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const search: SearchFn = (pattern) => {
      capturedPattern = pattern;
      return [];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'Hello', caseSensitive: true } };

    findAdapter(editor, query);

    expect(capturedPattern).toBeInstanceOf(RegExp);
    expect((capturedPattern as RegExp).source).toBe('Hello');
    expect((capturedPattern as RegExp).flags).not.toContain('i');
  });

  it('forwards caseSensitive option to search command for contains mode', () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const search: SearchFn = (_pattern, options) => {
      capturedOptions = options as Record<string, unknown>;
      return [];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'Hello', caseSensitive: true } };

    findAdapter(editor, query);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!.caseSensitive).toBe(true);
  });

  it('passes maxMatches: Infinity so pagination and scoping see the full result set', () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const search: SearchFn = (_pattern, options) => {
      capturedOptions = options as Record<string, unknown>;
      return [];
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'a' }, offset: 0, limit: 2 };

    findAdapter(editor, query);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!.maxMatches).toBe(Infinity);
  });

  it('throws when editor has no search command', () => {
    const doc = buildDoc({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 });
    const editor = makeEditor(doc); // no search command
    const query: Query = { select: { type: 'text', pattern: 'hello' } };

    expect(() => findAdapter(editor, query)).toThrow('command is not available');
  });

  it('paginates text results and contexts together', () => {
    const editor = makeSearchableEditor([
      { from: 5, to: 10, text: 'aaa' },
      { from: 15, to: 20, text: 'bbb' },
      { from: 25, to: 30, text: 'ccc' },
    ]);
    const query: Query = { select: { type: 'text', pattern: 'test' }, offset: 1, limit: 1 };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(3);
    expect(result.matches).toHaveLength(1);
    expect(result.context).toHaveLength(1);
    // The second match (from 15-20) should be the one returned
    expect(result.context![0].snippet).toBeDefined();
  });

  it('reports true total for paginated text queries (not capped by page window)', () => {
    // Build a search that respects maxMatches to expose the capping bug
    const allMatches = [
      { from: 5, to: 8, text: 'a' },
      { from: 15, to: 18, text: 'b' },
      { from: 25, to: 28, text: 'c' },
      { from: 35, to: 38, text: 'd' },
      { from: 45, to: 48, text: 'e' },
    ];
    const doc = buildDoc(
      'a'.repeat(102),
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p2' }, nodeSize: 50, offset: 52 },
    );
    const search: SearchFn = (_pattern, opts) => {
      const max = (opts as { maxMatches?: number })?.maxMatches ?? Infinity;
      return allMatches.slice(0, max);
    };
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'test' }, offset: 0, limit: 2 };

    const result = findAdapter(editor, query);

    expect(result.matches).toHaveLength(2);
    expect(result.total).toBe(5); // must be 5, not 2
  });

  it('supports paginating text results past the first 1000 matches', () => {
    const totalMatches = 1205;
    const allMatches = Array.from({ length: totalMatches }, (_, index) => ({
      from: 8,
      to: 9,
      text: `m-${index}`,
    }));
    const doc = buildDoc(
      'a'.repeat(102),
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p2' }, nodeSize: 50, offset: 52 },
    );
    const search: SearchFn = (_pattern, options) => {
      const max = (options as { maxMatches?: number })?.maxMatches ?? Infinity;
      return allMatches.slice(0, max);
    };
    const editor = makeEditor(doc, search);
    const query: Query = {
      select: { type: 'text', pattern: 'test' },
      offset: 1001,
      limit: 2,
    };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(totalMatches);
    expect(result.matches).toHaveLength(2);
  });

  it('supports paginating beyond 1000 matches when search default max is applied', () => {
    const totalMatches = 1205;
    const allMatches = Array.from({ length: totalMatches }, (_, index) => ({
      from: 8,
      to: 9,
      text: `m-${index}`,
    }));
    const doc = buildDoc(
      'a'.repeat(102),
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 50, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p2' }, nodeSize: 50, offset: 52 },
    );
    const search: SearchFn = (_pattern, options) => {
      // Mirror editor.commands.search default behavior when maxMatches is omitted.
      const max = (options as { maxMatches?: number })?.maxMatches ?? 1000;
      return allMatches.slice(0, max);
    };
    const editor = makeEditor(doc, search);
    const query: Query = {
      select: { type: 'text', pattern: 'test' },
      offset: 1001,
      limit: 2,
    };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(totalMatches);
    expect(result.matches).toHaveLength(2);
  });

  it('applies within filtering to the full text match set (not only the first 1000)', () => {
    const outsideScopeMatches = Array.from({ length: 1000 }, (_, index) => ({
      from: 92,
      to: 93,
      text: `outside-${index}`,
    }));
    const insideScopeMatches = [
      { from: 8, to: 9, text: 'inside-1' },
      { from: 10, to: 11, text: 'inside-2' },
    ];
    const allMatches = [...outsideScopeMatches, ...insideScopeMatches];

    const doc = buildDoc(
      'a'.repeat(140),
      { typeName: 'table', attrs: { sdBlockId: 'tbl1' }, nodeSize: 80, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-in' }, nodeSize: 20, offset: 5 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-out' }, nodeSize: 20, offset: 90 },
    );
    const search: SearchFn = (_pattern, options) => {
      const max = (options as { maxMatches?: number })?.maxMatches ?? Infinity;
      return allMatches.slice(0, max);
    };
    const editor = makeEditor(doc, search);
    const query: Query = {
      select: { type: 'text', pattern: 'test' },
      within: { kind: 'block', nodeType: 'table', nodeId: 'tbl1' },
    };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(2);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every((match) => match.nodeId === 'p-in')).toBe(true);
  });

  it('filters text matches by within scope', () => {
    const doc = buildDoc(
      'a'.repeat(70),
      { typeName: 'table', attrs: { sdBlockId: 'tbl1' }, nodeSize: 40, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-in' }, nodeSize: 10, offset: 5 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'p-out' }, nodeSize: 10, offset: 50 },
    );
    const search: SearchFn = () => [
      { from: 8, to: 13, text: 'inside' },
      { from: 55, to: 60, text: 'outside' },
    ];
    const editor = makeEditor(doc, search);
    const query: Query = {
      select: { type: 'text', pattern: 'test' },
      within: { kind: 'block', nodeType: 'table', nodeId: 'tbl1' },
    };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0].nodeId).toBe('p-in');
  });

  it('skips matches whose position does not resolve to a block', () => {
    const doc = buildDoc('a'.repeat(22), {
      typeName: 'paragraph',
      attrs: { sdBlockId: 'p1' },
      nodeSize: 10,
      offset: 10,
    });
    // Match at pos 0 is before any block candidate (paragraph starts at 10)
    const search: SearchFn = () => [
      { from: 0, to: 5, text: 'ghost' },
      { from: 12, to: 17, text: 'real' },
    ];
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'test' } };

    const result = findAdapter(editor, query);

    expect(result.total).toBe(1);
    expect(result.matches[0].nodeId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// Context / snippet building
// ---------------------------------------------------------------------------

describe('findAdapter — snippet context', () => {
  it('includes highlight range in context', () => {
    // Text: 40 chars of padding, then "hello" at positions 40-45, then more padding
    const text = 'a'.repeat(40) + 'hello' + 'a'.repeat(55);
    const doc = buildDoc(text, { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, nodeSize: 100, offset: 0 });
    const search: SearchFn = () => [{ from: 40, to: 45, text: 'hello' }];
    const editor = makeEditor(doc, search);
    const query: Query = { select: { type: 'text', pattern: 'hello' } };

    const result = findAdapter(editor, query);

    expect(result.context).toBeDefined();
    const ctx = result.context![0];
    // The snippet should contain the match, and the highlight range should point to it
    expect(ctx.snippet.slice(ctx.highlightRange.start, ctx.highlightRange.end)).toBe('hello');
  });
});
