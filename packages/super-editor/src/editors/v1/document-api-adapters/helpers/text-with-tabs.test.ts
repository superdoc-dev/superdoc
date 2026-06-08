import { describe, expect, it, vi } from 'vitest';
import { Fragment, Schema } from 'prosemirror-model';
import { buildTextWithTabs, parentAllowsNodeAt, textBetweenWithTabs } from './text-with-tabs.js';

function makeRealSchema(
  options: { hasTab?: boolean; hasLineBreak?: boolean; hasNoBreakHyphen?: boolean; hasGenericLeaf?: boolean } = {},
) {
  const nodes: Record<string, any> = {
    doc: { content: 'paragraph+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
  };
  if (options.hasTab) {
    // Mirrors the real extensions/tab/tab.js shape: inline atom with `content: 'inline*'`.
    // Tab is non-leaf, which is why `textBetweenWithTabs` (not PM's built-in textBetween) is needed.
    nodes.tab = { group: 'inline', inline: true, atom: true, content: 'inline*' };
  }
  if (options.hasLineBreak) {
    // Mirrors the real extensions/line-break/line-break.js shape: inline atom
    // that disallows marks (`marks: ''`) and renders to <br> / exports to <w:br/>.
    nodes.lineBreak = { group: 'inline', inline: true, atom: true, marks: '' };
  }
  if (options.hasNoBreakHyphen) {
    // Mirrors the real extensions/no-break-hyphen schema: inline leaf atom with leafText.
    nodes.noBreakHyphen = { group: 'inline', inline: true, atom: true, leafText: () => '‑' };
  }
  if (options.hasGenericLeaf) {
    // An inline leaf atom WITHOUT leafText — should fall back to leafFallback.
    nodes.genericLeaf = { group: 'inline', inline: true, atom: true };
  }
  return new Schema({
    nodes,
    marks: {
      bold: {},
    },
  });
}

describe('buildTextWithTabs', () => {
  it('returns a plain text node when the text has no tab character', () => {
    const schema = makeRealSchema({ hasTab: true });
    const result = buildTextWithTabs(schema, 'hello world', undefined);
    expect((result as any).isText).toBe(true);
    expect((result as any).text).toBe('hello world');
  });

  it('returns a plain text node when the schema has no tab node type', () => {
    const schema = makeRealSchema({ hasTab: false });
    const result = buildTextWithTabs(schema, 'a\tb', undefined);
    expect((result as any).isText).toBe(true);
    expect((result as any).text).toBe('a\tb');
  });

  it('returns a plain text node when parentAllowsTab is false', () => {
    const schema = makeRealSchema({ hasTab: true });
    const result = buildTextWithTabs(schema, 'a\tb', undefined, { parentAllowsTab: false });
    expect((result as any).isText).toBe(true);
    expect((result as any).text).toBe('a\tb');
  });

  it('splits text around a single tab into text + tab + text', () => {
    const schema = makeRealSchema({ hasTab: true });
    const result = buildTextWithTabs(schema, 'left\tright', undefined);
    expect(result).toBeInstanceOf(Fragment);
    const fragment = result as Fragment;
    expect(fragment.childCount).toBe(3);
    expect(fragment.child(0).text).toBe('left');
    expect(fragment.child(1).type.name).toBe('tab');
    expect(fragment.child(2).text).toBe('right');
  });

  it('omits empty segments so a leading or trailing tab does not emit an empty text node', () => {
    const schema = makeRealSchema({ hasTab: true });
    const lead = buildTextWithTabs(schema, '\tfoo', undefined) as Fragment;
    expect(lead.childCount).toBe(2);
    expect(lead.child(0).type.name).toBe('tab');
    expect(lead.child(1).text).toBe('foo');

    const trail = buildTextWithTabs(schema, 'foo\t', undefined) as Fragment;
    expect(trail.childCount).toBe(2);
    expect(trail.child(0).text).toBe('foo');
    expect(trail.child(1).type.name).toBe('tab');
  });

  it('emits consecutive tab nodes for adjacent tab characters', () => {
    const schema = makeRealSchema({ hasTab: true });
    const result = buildTextWithTabs(schema, 'a\t\tb', undefined) as Fragment;
    expect(result.childCount).toBe(4);
    expect(result.child(0).text).toBe('a');
    expect(result.child(1).type.name).toBe('tab');
    expect(result.child(2).type.name).toBe('tab');
    expect(result.child(3).text).toBe('b');
  });

  it('forwards marks to both the text segments and the tab node so exporter keeps formatting unbroken across the tab', () => {
    const schema = makeRealSchema({ hasTab: true });
    const boldMark = schema.marks.bold.create();
    const result = buildTextWithTabs(schema, 'x\ty', [boldMark]) as Fragment;
    expect(result.childCount).toBe(3);
    expect(result.child(0).text).toBe('x');
    expect(result.child(0).marks.some((m: any) => m.type.name === 'bold')).toBe(true);
    expect(result.child(1).type.name).toBe('tab');
    // Tab carries the run's marks. The OOXML exporter reads node.marks on tab
    // nodes (tab-translator.js:53) to emit matching <w:rPr> around <w:tab/>.
    expect(result.child(1).marks.some((m: any) => m.type.name === 'bold')).toBe(true);
    expect(result.child(2).text).toBe('y');
    expect(result.child(2).marks.some((m: any) => m.type.name === 'bold')).toBe(true);
  });

  // SD-3278: a literal '\n' inside a text node exports as raw newline
  // inside <w:t>, which Word collapses. It must become a `lineBreak` node so the
  // exporter emits a Word-native <w:br/>.
  it('splits text around a single newline into text + lineBreak + text', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'Alpha\nBeta', undefined);
    expect(result).toBeInstanceOf(Fragment);
    const fragment = result as Fragment;
    expect(fragment.childCount).toBe(3);
    expect(fragment.child(0).text).toBe('Alpha');
    expect(fragment.child(1).type.name).toBe('lineBreak');
    expect(fragment.child(2).text).toBe('Beta');
  });

  it('emits a lineBreak node even when the schema has no tab node type', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'Alpha\nBeta', undefined) as Fragment;
    expect(result).toBeInstanceOf(Fragment);
    expect(result.childCount).toBe(3);
    expect(result.child(1).type.name).toBe('lineBreak');
  });

  it('keeps the raw newline in a single text node when the schema has no lineBreak node type', () => {
    const schema = makeRealSchema({ hasTab: true });
    const result = buildTextWithTabs(schema, 'Alpha\nBeta', undefined);
    expect((result as any).isText).toBe(true);
    expect((result as any).text).toBe('Alpha\nBeta');
  });

  it('creates the lineBreak node bare in the creation path', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const boldMark = schema.marks.bold.create();
    const result = buildTextWithTabs(schema, 'Alpha\nBeta', [boldMark]) as Fragment;
    expect(result.child(0).marks.some((m: any) => m.type.name === 'bold')).toBe(true);
    expect(result.child(1).type.name).toBe('lineBreak');
    expect(result.child(1).marks.length).toBe(0);
    expect(result.child(2).marks.some((m: any) => m.type.name === 'bold')).toBe(true);
  });

  it('omits empty segments around leading, trailing, and consecutive newlines', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const lead = buildTextWithTabs(schema, '\nfoo', undefined) as Fragment;
    expect(lead.childCount).toBe(2);
    expect(lead.child(0).type.name).toBe('lineBreak');
    expect(lead.child(1).text).toBe('foo');

    const doubled = buildTextWithTabs(schema, 'a\n\nb', undefined) as Fragment;
    expect(doubled.childCount).toBe(4);
    expect(doubled.child(0).text).toBe('a');
    expect(doubled.child(1).type.name).toBe('lineBreak');
    expect(doubled.child(2).type.name).toBe('lineBreak');
    expect(doubled.child(3).text).toBe('b');
  });

  it('interleaves tab and lineBreak nodes when both control characters are present', () => {
    const schema = makeRealSchema({ hasTab: true, hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'a\tb\nc', undefined) as Fragment;
    expect(result.childCount).toBe(5);
    expect(result.child(0).text).toBe('a');
    expect(result.child(1).type.name).toBe('tab');
    expect(result.child(2).text).toBe('b');
    expect(result.child(3).type.name).toBe('lineBreak');
    expect(result.child(4).text).toBe('c');
  });

  it('keeps the raw tab literal but still splits the newline when tabs are disallowed', () => {
    const schema = makeRealSchema({ hasTab: true, hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'a\tb\nc', undefined, { parentAllowsTab: false }) as Fragment;
    expect(result.childCount).toBe(3);
    expect(result.child(0).text).toBe('a\tb');
    expect(result.child(1).type.name).toBe('lineBreak');
    expect(result.child(2).text).toBe('c');
  });

  // Generated/SDK text often uses CRLF; normalize CRLF and bare CR to
  // line breaks so no stray carriage return survives in a text segment.
  it('normalizes CRLF to a lineBreak node', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'Alpha\r\nBeta', undefined) as Fragment;
    expect(result.childCount).toBe(3);
    expect(result.child(0).text).toBe('Alpha');
    expect(result.child(1).type.name).toBe('lineBreak');
    expect(result.child(2).text).toBe('Beta');
  });

  it('normalizes a bare CR to a lineBreak node without leaving a stray carriage return', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'Alpha\rBeta', undefined) as Fragment;
    expect(result.childCount).toBe(3);
    expect(result.child(0).text).toBe('Alpha');
    expect(result.child(1).type.name).toBe('lineBreak');
    expect(result.child(2).text).toBe('Beta');
  });

  // A `text*`-only parent (e.g. total-page-number) rejects lineBreak.
  it('keeps the raw newline in a single text node when parentAllowsLineBreak is false', () => {
    const schema = makeRealSchema({ hasLineBreak: true });
    const result = buildTextWithTabs(schema, 'Alpha\nBeta', undefined, { parentAllowsLineBreak: false });
    expect((result as any).isText).toBe(true);
    expect((result as any).text).toBe('Alpha\nBeta');
  });
});

describe('parentAllowsNodeAt', () => {
  const nodeType = { name: 'tab' } as any;

  it('returns true when the mocked doc has no contentMatch (defensive fallback)', () => {
    const tr = { doc: { resolve: () => ({}) } } as any;
    expect(parentAllowsNodeAt(tr, 3, nodeType)).toBe(true);
  });

  it('returns true when contentMatch.matchType returns a truthy match', () => {
    const matchType = vi.fn(() => ({}));
    const tr = {
      doc: { resolve: () => ({ parent: { type: { contentMatch: { matchType } } } }) },
    } as any;
    expect(parentAllowsNodeAt(tr, 5, nodeType)).toBe(true);
    expect(matchType).toHaveBeenCalledWith(nodeType);
  });

  it('returns false when contentMatch.matchType returns null', () => {
    const matchType = vi.fn(() => null);
    const tr = {
      doc: { resolve: () => ({ parent: { type: { contentMatch: { matchType } } } }) },
    } as any;
    expect(parentAllowsNodeAt(tr, 5, nodeType)).toBe(false);
  });
});

describe('textBetweenWithTabs', () => {
  function makeDoc() {
    const schema = makeRealSchema({ hasTab: true });
    const doc = schema.nodes.doc.createAndFill({}, [
      schema.nodes.paragraph.create({}, [schema.text('hello'), schema.nodes.tab.create(), schema.text('world')]),
    ])!;
    return { schema, doc };
  }

  it('emits \\t for tab nodes even when PM treats tab as non-leaf', () => {
    const { doc } = makeDoc();
    const paragraph = doc.firstChild!;
    const result = textBetweenWithTabs(doc, 1, 1 + paragraph.content.size, '\n', '\ufffc');
    expect(result).toBe('hello\tworld');
  });

  it('slices partial text ranges correctly around tab nodes', () => {
    const { doc } = makeDoc();
    // Tab has content: 'inline*' so nodeSize = 2 (open + close).
    // Positions: h=1 e=2 l=3 l=4 o=5 | tab opens at 6 (closes at 7) | w=8 o=9 r=10 l=11 d=12.
    // Reading [2, 10) yields "ello" + tab + "wo".
    const result = textBetweenWithTabs(doc, 2, 10, '\n', '\ufffc');
    expect(result).toBe('ello\two');
  });

  it('emits the visible character for inline leaves that declare leafText (e.g. noBreakHyphen)', () => {
    // Repro for SD-2746 follow-up: search/get-text/diff consumers must see
    // the U+2011 glyph, not the leafFallback placeholder.
    const schema = makeRealSchema({ hasNoBreakHyphen: true });
    const doc = schema.nodes.doc.createAndFill({}, [
      schema.nodes.paragraph.create({}, [schema.text('a'), schema.nodes.noBreakHyphen.create(), schema.text('b')]),
    ])!;
    const paragraph = doc.firstChild!;
    const result = textBetweenWithTabs(doc, 1, 1 + paragraph.content.size, '\n', '\n');
    expect(result).toBe('a\u2011b');
  });

  it('falls back to leafFallback for inline leaves without leafText', () => {
    const schema = makeRealSchema({ hasGenericLeaf: true });
    const doc = schema.nodes.doc.createAndFill({}, [
      schema.nodes.paragraph.create({}, [schema.text('a'), schema.nodes.genericLeaf.create(), schema.text('b')]),
    ])!;
    const paragraph = doc.firstChild!;
    const result = textBetweenWithTabs(doc, 1, 1 + paragraph.content.size, '\n', '\ufffc');
    expect(result).toBe('a\ufffcb');
  });
});
