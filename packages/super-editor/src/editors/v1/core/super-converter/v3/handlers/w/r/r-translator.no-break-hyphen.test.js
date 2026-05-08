import { describe, it, expect } from 'vitest';
import { defaultNodeListHandler } from '../../../../v2/importer/docxImporter.js';
import { translator } from './r-translator.js';

describe('w:r translator <w:noBreakHyphen/> handling', () => {
  it('encodes <w:noBreakHyphen/> as a noBreakHyphen atom inside the run', () => {
    const runNode = {
      name: 'w:r',
      elements: [
        { name: 'w:t', elements: [{ type: 'text', text: '24' }] },
        { name: 'w:noBreakHyphen' },
        { name: 'w:t', elements: [{ type: 'text', text: 'Apr' }] },
        { name: 'w:noBreakHyphen' },
        { name: 'w:t', elements: [{ type: 'text', text: '2026' }] },
      ],
    };

    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });

    expect(result).toMatchObject({ type: 'run' });
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: '24' }),
      expect.objectContaining({ type: 'noBreakHyphen' }),
      expect.objectContaining({ type: 'text', text: 'Apr' }),
      expect.objectContaining({ type: 'noBreakHyphen' }),
      expect.objectContaining({ type: 'text', text: '2026' }),
    ]);
  });

  it('does NOT collapse the atom into a passthroughInline (the bug)', () => {
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:noBreakHyphen' }],
    };
    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    expect(result.content[0].type).toBe('noBreakHyphen');
    expect(result.content[0].type).not.toBe('passthroughInline');
  });

  it('keeps literal U+2011 in <w:t> as a text node (does not promote it to the atom)', () => {
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'A‑B' }] }],
    };
    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('A‑B');
  });
});

describe('w:r translator <w:noBreakHyphen/> round-trip', () => {
  it('encode then decode round-trips the bare <w:noBreakHyphen/> element back', () => {
    const runNode = {
      name: 'w:r',
      elements: [
        { name: 'w:t', elements: [{ type: 'text', text: '24' }] },
        { name: 'w:noBreakHyphen' },
        { name: 'w:t', elements: [{ type: 'text', text: 'Apr' }] },
        { name: 'w:noBreakHyphen' },
        { name: 'w:t', elements: [{ type: 'text', text: '2026' }] },
      ],
    };
    const handler = defaultNodeListHandler();

    const encoded = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    expect(encoded?.type).toBe('run');

    const decoded = translator.decode({ node: encoded });
    const decodedRuns = Array.isArray(decoded) ? decoded : [decoded];

    // Flatten run children, ignoring rPr wrappers
    const tokens = [];
    for (const run of decodedRuns) {
      for (const el of run.elements || []) {
        if (el.name === 'w:rPr') continue;
        if (el.name === 'w:t') {
          const text = (el.elements || []).find((e) => e.type === 'text')?.text;
          tokens.push({ kind: 'text', text });
        } else if (el.name === 'w:noBreakHyphen') {
          tokens.push({ kind: 'nbh' });
        } else {
          tokens.push({ kind: el.name });
        }
      }
    }

    // Tier 1 ordered-token contract from the plan: structural identity preserved
    expect(tokens).toEqual([
      { kind: 'text', text: '24' },
      { kind: 'nbh' },
      { kind: 'text', text: 'Apr' },
      { kind: 'nbh' },
      { kind: 'text', text: '2026' },
    ]);
  });

  it('exports <w:noBreakHyphen/> as a bare element, not as <w:t>U+2011</w:t>', () => {
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:noBreakHyphen' }],
    };
    const handler = defaultNodeListHandler();

    const encoded = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    const decoded = translator.decode({ node: encoded });
    const runs = Array.isArray(decoded) ? decoded : [decoded];

    const allChildren = runs.flatMap((r) => (r.elements || []).filter((el) => el.name !== 'w:rPr'));
    // Match by intent (exactly one child, named w:noBreakHyphen) instead of
    // strict deep-equality — the encode/decode pipeline normalizes through
    // xml-js shapes that introduce ancillary undefined fields (`attributes`,
    // `text`, `type`) along with the required `elements: []`.
    expect(allChildren).toHaveLength(1);
    expect(allChildren[0]).toMatchObject({ name: 'w:noBreakHyphen' });
    // Specifically: no <w:t> emitted in lieu of the element
    expect(allChildren.some((el) => el.name === 'w:t')).toBe(false);
  });

  it('preserves <w:hyperlink> wrapper when the run carries a link mark', () => {
    // Reproduces the issue raised in review: a hyperlink whose only inline
    // child is a noBreakHyphen must round-trip back as <w:hyperlink> wrapping
    // the run, not as a bare <w:r><w:noBreakHyphen/></w:r>.
    const linkMark = {
      type: 'link',
      attrs: {
        href: 'https://example.com',
        rId: 'rId42',
        anchor: null,
        history: null,
        tooltip: null,
        target: null,
      },
    };
    // Simulate the post-import shape: a run carrying a link mark, containing
    // the noBreakHyphen atom. The run translator's encode would propagate the
    // link mark down to the atom too.
    const runNode = {
      type: 'run',
      attrs: { runProperties: {}, runPropertiesInlineKeys: [] },
      marks: [linkMark],
      content: [{ type: 'noBreakHyphen', marks: [linkMark] }],
    };

    const decoded = translator.decode({ node: runNode, relationships: [] });
    // Decoded should be a w:hyperlink wrapping a w:r with the bare element
    expect(decoded?.name).toBe('w:hyperlink');
    const innerRun = (decoded.elements || []).find((el) => el.name === 'w:r');
    expect(innerRun).toBeTruthy();
    expect((innerRun.elements || []).some((el) => el.name === 'w:noBreakHyphen')).toBe(true);
  });
});
