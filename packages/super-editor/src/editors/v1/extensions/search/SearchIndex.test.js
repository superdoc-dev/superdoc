// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { SearchIndex } from './SearchIndex.js';

describe('SearchIndex.stripDiacritics', () => {
  it('strips Latin diacritics', () => {
    expect(SearchIndex.stripDiacritics('café')).toBe('cafe');
    expect(SearchIndex.stripDiacritics('naïve')).toBe('naive');
    expect(SearchIndex.stripDiacritics('résumé')).toBe('resume');
  });

  it('strips Hebrew nikkud (vowel points)', () => {
    // אֵל (alef + tsere + lamed) → אל
    expect(SearchIndex.stripDiacritics('אֵל')).toBe('אל');
    // אַ (alef + patach) → א
    expect(SearchIndex.stripDiacritics('אַ')).toBe('א');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(SearchIndex.stripDiacritics('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(SearchIndex.stripDiacritics('')).toBe('');
  });
});

describe('SearchIndex.buildDiacriticOffsetMap', () => {
  it('maps folded positions back to original positions for simple Latin', () => {
    const { folded, toOriginal } = SearchIndex.buildDiacriticOffsetMap('café');
    expect(folded).toBe('cafe');
    // 'c' → 0, 'a' → 1, 'f' → 2, 'e' → 3
    expect(toOriginal[0]).toBe(0); // c
    expect(toOriginal[1]).toBe(1); // a
    expect(toOriginal[2]).toBe(2); // f
    expect(toOriginal[3]).toBe(3); // e (from é)
    // Sentinel
    expect(toOriginal[4]).toBe(4);
  });

  it('maps folded positions for mixed diacritic/plain text', () => {
    const { folded, toOriginal } = SearchIndex.buildDiacriticOffsetMap('naïve');
    expect(folded).toBe('naive');
    expect(toOriginal[0]).toBe(0); // n
    expect(toOriginal[1]).toBe(1); // a
    expect(toOriginal[2]).toBe(2); // i (from ï)
    expect(toOriginal[3]).toBe(3); // v
    expect(toOriginal[4]).toBe(4); // e
  });

  it('handles plain ASCII with identity mapping', () => {
    const { folded, toOriginal } = SearchIndex.buildDiacriticOffsetMap('hello');
    expect(folded).toBe('hello');
    for (let i = 0; i < 5; i++) {
      expect(toOriginal[i]).toBe(i);
    }
  });

  it('handles empty string', () => {
    const { folded, toOriginal } = SearchIndex.buildDiacriticOffsetMap('');
    expect(folded).toBe('');
    expect(toOriginal).toEqual([0]);
  });
});

describe('SearchIndex.searchIgnoringDiacritics', () => {
  function buildIndex(text) {
    const index = new SearchIndex();
    // Manually set the flat text and a simple segment map
    index.text = text;
    index.valid = true;
    index.docSize = text.length + 2;
    index.segments = [
      {
        offsetStart: 0,
        offsetEnd: text.length,
        docFrom: 1,
        docTo: 1 + text.length,
        kind: 'text',
      },
    ];
    return index;
  }

  it('matches "cafe" in text containing "café"', () => {
    const index = buildIndex('I love café');
    const matches = index.searchIgnoringDiacritics('cafe');

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('café');
  });

  it('matches "naive" in text containing "naïve"', () => {
    const index = buildIndex('How naïve!');
    const matches = index.searchIgnoringDiacritics('naive');

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('naïve');
  });

  it('respects case-sensitive flag', () => {
    const index = buildIndex('Café and café');
    const matchesInsensitive = index.searchIgnoringDiacritics('cafe', { caseSensitive: false });
    expect(matchesInsensitive).toHaveLength(2);

    const matchesSensitive = index.searchIgnoringDiacritics('cafe', { caseSensitive: true });
    expect(matchesSensitive).toHaveLength(1);
    expect(matchesSensitive[0].text).toBe('café');
  });

  it('returns correct original offsets', () => {
    const index = buildIndex('abc café xyz');
    const matches = index.searchIgnoringDiacritics('cafe');

    expect(matches).toHaveLength(1);
    // "café" starts at offset 4, ends at offset 8
    expect(matches[0].start).toBe(4);
    expect(matches[0].end).toBe(8);
  });

  it('handles Hebrew diacritics', () => {
    const index = buildIndex('word אֵל end');
    const matches = index.searchIgnoringDiacritics('אל');

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('אֵל');
  });

  it('returns empty array for empty pattern', () => {
    const index = buildIndex('some text');
    expect(index.searchIgnoringDiacritics('')).toEqual([]);
    expect(index.searchIgnoringDiacritics(null)).toEqual([]);
  });

  it('handles multiple matches', () => {
    const index = buildIndex('résumé and résumé');
    const matches = index.searchIgnoringDiacritics('resume');

    expect(matches).toHaveLength(2);
    expect(matches[0].text).toBe('résumé');
    expect(matches[1].text).toBe('résumé');
  });
});

describe('SearchIndex searchModel: visible', () => {
  function textNode(text, { deleted = false } = {}) {
    return {
      isText: true,
      isLeaf: false,
      isBlock: false,
      text,
      nodeSize: text.length,
      marks: deleted ? [{ type: { name: 'trackDelete' } }] : [],
      forEach: () => {},
    };
  }

  function containerNode(children, { isBlock = false, textBetween = '' } = {}) {
    return {
      isText: false,
      isLeaf: false,
      isBlock,
      nodeSize: children.reduce((sum, child) => sum + child.nodeSize, 0) + 2,
      content: { size: children.reduce((sum, child) => sum + child.nodeSize, 0) },
      forEach(cb) {
        let offset = 0;
        for (const child of children) {
          cb(child, offset);
          offset += child.nodeSize;
        }
      },
      textBetween: () => textBetween,
    };
  }

  function buildDocWithTrackedDeletion() {
    const paragraph = containerNode([textNode('before'), textNode('DELETE', { deleted: true }), textNode('after')], {
      isBlock: true,
      textBetween: 'beforeDELETEafter',
    });

    const doc = containerNode([paragraph], {
      isBlock: false,
      textBetween: 'beforeDELETEafter',
    });

    return { doc };
  }

  function buildDocWithSplitTrackedDeletion() {
    const paragraph = containerNode(
      [textNode('before'), textNode('DEL', { deleted: true }), textNode('ETE', { deleted: true }), textNode('after')],
      {
        isBlock: true,
        textBetween: 'beforeDELETEafter',
      },
    );

    const doc = containerNode([paragraph], {
      isBlock: false,
      textBetween: 'beforeDELETEafter',
    });

    return { doc };
  }

  it('excludes pending tracked deletions in visible model', () => {
    const { doc } = buildDocWithTrackedDeletion();
    const index = new SearchIndex();

    index.ensureValid(doc, { searchModel: 'visible' });
    const matches = index.search('DELETE');

    expect(matches).toHaveLength(0);
  });

  it('does not match collapsed impossible strings across deleted spans', () => {
    const { doc } = buildDocWithTrackedDeletion();
    const index = new SearchIndex();

    index.ensureValid(doc, { searchModel: 'visible' });
    const matches = index.search('beforeafter');

    expect(matches).toHaveLength(0);
  });

  it('keeps raw model behavior unchanged by default', () => {
    const { doc } = buildDocWithTrackedDeletion();
    const index = new SearchIndex();

    index.ensureValid(doc);
    const matches = index.search('DELETE');

    expect(matches).toHaveLength(1);
  });

  it('keeps offset mapping aligned after contiguous deleted text nodes', () => {
    const { doc } = buildDocWithSplitTrackedDeletion();
    const index = new SearchIndex();

    index.ensureValid(doc, { searchModel: 'visible' });

    expect(index.segments[index.segments.length - 1]?.offsetEnd).toBe(index.text.length);

    const start = index.text.indexOf('after');
    expect(start).toBeGreaterThanOrEqual(0);

    const ranges = index.offsetRangeToDocRanges(start, start + 'after'.length);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].to - ranges[0].from).toBe('after'.length);
    expect(ranges[0]).toEqual({ from: 13, to: 18 });
  });
});
