// @ts-nocheck
import { describe, it, expect, afterEach } from 'vitest';
import { SearchIndex } from './SearchIndex.js';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { Fragment, Slice } from 'prosemirror-model';

/**
 * Phase 0 — Risk gate spike for cross-paragraph replace.
 *
 * Validates that SearchIndex can find matches spanning multiple paragraphs
 * and that tr.replace() can replace them correctly.
 */
describe('cross-paragraph replace spike', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
  });

  /**
   * Helper: build a doc with the given paragraphs, run a search,
   * replace the first match, and return the resulting doc text.
   */
  function setupEditor(paragraphs) {
    const content = paragraphs.map((text) => `<p>${text}</p>`).join('');
    ({ editor } = initTestEditor({ mode: 'html', content }));
    return editor;
  }

  function getDocParagraphs(doc) {
    const paragraphs = [];
    doc.forEach((node) => {
      if (node.type.name === 'paragraph') {
        paragraphs.push(node.textContent);
      }
    });
    return paragraphs;
  }

  function replaceMatch(ed, match, replacement) {
    const { state } = ed;
    const from = match.ranges[0].from;
    const to = match.ranges[match.ranges.length - 1].to;
    const slice = replacement ? new Slice(Fragment.from(state.schema.text(replacement)), 0, 0) : Slice.empty;
    const tr = state.tr.replace(from, to, slice);
    ed.view.dispatch(tr);
  }

  function replaceAllMatches(ed, matches, replacement) {
    const { state } = ed;
    const { schema } = state;
    let tr = state.tr;
    // Apply in reverse order to avoid position shifts
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const from = match.ranges[0].from;
      const to = match.ranges[match.ranges.length - 1].to;
      const slice = replacement ? new Slice(Fragment.from(schema.text(replacement)), 0, 0) : Slice.empty;
      tr = tr.replace(from, to, slice);
    }
    ed.view.dispatch(tr);
  }

  function findMatches(ed, query) {
    const index = new SearchIndex();
    index.build(ed.state.doc);
    const raw = index.search(query, { caseSensitive: false });
    return raw.map((m) => ({
      ...m,
      ranges: index.offsetRangeToDocRanges(m.start, m.end),
    }));
  }

  it('replaces a match spanning exactly 2 paragraphs', () => {
    const ed = setupEditor(['The quick brown', 'fox jumps over']);
    const matches = findMatches(ed, 'brown fox');

    expect(matches).toHaveLength(1);
    expect(matches[0].ranges).toHaveLength(2);

    replaceMatch(ed, matches[0], 'red dog');

    const paras = getDocParagraphs(ed.state.doc);
    // The two paragraphs should be merged into one since we replaced across the boundary
    expect(paras.join(' ')).toContain('red dog');
    // Verify surrounding text is intact
    const fullText = paras.join(' ');
    expect(fullText).toContain('quick');
    expect(fullText).toContain('jumps over');
  });

  it('replaces a match spanning 3 paragraphs', () => {
    const ed = setupEditor(['Start of the', 'middle section', 'end of text']);
    const matches = findMatches(ed, 'the middle section end');

    expect(matches).toHaveLength(1);
    expect(matches[0].ranges.length).toBeGreaterThanOrEqual(2);

    replaceMatch(ed, matches[0], 'REPLACED');

    const paras = getDocParagraphs(ed.state.doc);
    const fullText = paras.join(' ');
    expect(fullText).toContain('REPLACED');
    expect(fullText).toContain('Start of');
    expect(fullText).toContain('of text');
  });

  it('replaces a match at paragraph boundary (end of P1 + start of P2)', () => {
    const ed = setupEditor(['Hello world', 'Goodbye moon']);
    const matches = findMatches(ed, 'world Goodbye');

    expect(matches).toHaveLength(1);
    expect(matches[0].ranges).toHaveLength(2);

    replaceMatch(ed, matches[0], 'BOUNDARY');

    const paras = getDocParagraphs(ed.state.doc);
    const fullText = paras.join(' ');
    expect(fullText).toContain('Hello BOUNDARY');
    expect(fullText).toContain('moon');
  });

  it('replaces all matches back-to-front in a single transaction', () => {
    const ed = setupEditor(['The cat sat', 'on the mat', 'the cat napped']);
    const matches = findMatches(ed, 'the');

    expect(matches.length).toBeGreaterThanOrEqual(3);

    replaceAllMatches(ed, matches, 'A');

    const fullText = getDocParagraphs(ed.state.doc).join(' ');
    expect(fullText).not.toMatch(/the/i);
    expect(fullText).toContain('A cat sat');
  });

  it('single-paragraph replace preserves paragraph structure', () => {
    const ed = setupEditor(['Hello world', 'Goodbye moon']);
    const matches = findMatches(ed, 'world');

    expect(matches).toHaveLength(1);
    expect(matches[0].ranges).toHaveLength(1);

    replaceMatch(ed, matches[0], 'earth');

    const paras = getDocParagraphs(ed.state.doc);
    expect(paras).toHaveLength(2);
    expect(paras[0]).toBe('Hello earth');
    expect(paras[1]).toBe('Goodbye moon');
  });

  it('cross-paragraph replace with empty replacement merges paragraphs', () => {
    const ed = setupEditor(['First part', 'Second part']);
    const matches = findMatches(ed, 'part Second');

    expect(matches).toHaveLength(1);
    expect(matches[0].ranges).toHaveLength(2);

    replaceMatch(ed, matches[0], '');

    const paras = getDocParagraphs(ed.state.doc);
    const fullText = paras.join(' ');
    expect(fullText).toContain('First');
    expect(fullText).toContain('part');
    // "part Second" is removed, leaving "First " and " part"
  });
});
