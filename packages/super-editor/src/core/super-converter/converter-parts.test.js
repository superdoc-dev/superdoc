import { describe, it, expect, vi } from 'vitest';
import {
  isXmlJsPartKey,
  writePart,
  readPart,
  removePart,
  listPartsByPrefix,
  PART_XML_SYNC,
} from './converter-parts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConverter() {
  return {
    parts: {},
    convertedXml: {},
    translatedLinkedStyles: { docDefaults: {}, latentStyles: { lsdExceptions: [] }, styles: [] },
  };
}

// ---------------------------------------------------------------------------
// isXmlJsPartKey
// ---------------------------------------------------------------------------

describe('isXmlJsPartKey', () => {
  it('returns true for paths with slashes', () => {
    expect(isXmlJsPartKey('word/document.xml')).toBe(true);
    expect(isXmlJsPartKey('word/styles.xml')).toBe(true);
    expect(isXmlJsPartKey('word/_rels/document.xml.rels')).toBe(true);
    expect(isXmlJsPartKey('docProps/core.xml')).toBe(true);
  });

  it('returns true for [Content_Types].xml', () => {
    expect(isXmlJsPartKey('[Content_Types].xml')).toBe(true);
  });

  it('returns false for model/logical keys', () => {
    expect(isXmlJsPartKey('styles')).toBe(false);
    expect(isXmlJsPartKey('numbering')).toBe(false);
    expect(isXmlJsPartKey('themeColors')).toBe(false);
    expect(isXmlJsPartKey('pageStyles')).toBe(false);
    expect(isXmlJsPartKey('comments')).toBe(false);
    expect(isXmlJsPartKey('footnotes')).toBe(false);
  });

  it('returns false for header/footer pmjson keys', () => {
    expect(isXmlJsPartKey('header:rId8')).toBe(false);
    expect(isXmlJsPartKey('footer:rId10')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writePart
// ---------------------------------------------------------------------------

describe('writePart', () => {
  it('sets xmljs key in both parts and convertedXml (same reference)', () => {
    const converter = makeConverter();
    const value = { elements: [{ name: 'w:settings' }] };

    writePart(converter, 'word/settings.xml', value);

    expect(converter.parts['word/settings.xml']).toBe(value);
    expect(converter.convertedXml['word/settings.xml']).toBe(value);
  });

  it('sets model key in parts only, not convertedXml', () => {
    const converter = makeConverter();
    const value = { abstracts: [], definitions: [] };

    writePart(converter, 'numbering', value);

    expect(converter.parts.numbering).toBe(value);
    expect(converter.convertedXml.numbering).toBeUndefined();
  });

  it('sets header/footer pmjson key in parts only', () => {
    const converter = makeConverter();
    const doc = { type: 'doc', content: [] };

    writePart(converter, 'header:rId8', doc);

    expect(converter.parts['header:rId8']).toBe(doc);
    expect(converter.convertedXml['header:rId8']).toBeUndefined();
  });

  it('calls PART_XML_SYNC for styles key', () => {
    const syncSpy = vi.fn();
    const originalSync = PART_XML_SYNC.styles;
    PART_XML_SYNC.styles = syncSpy;

    try {
      const converter = makeConverter();
      const model = { docDefaults: {}, latentStyles: { lsdExceptions: [] }, styles: [] };

      writePart(converter, 'styles', model);

      expect(syncSpy).toHaveBeenCalledWith(converter);
      expect(converter.parts.styles).toBe(model);
    } finally {
      PART_XML_SYNC.styles = originalSync;
    }
  });

  it('does not call PART_XML_SYNC for non-registered keys', () => {
    const syncSpy = vi.fn();
    const originalSync = PART_XML_SYNC.styles;
    PART_XML_SYNC.styles = syncSpy;

    try {
      const converter = makeConverter();
      writePart(converter, 'themeColors', { accent1: '#000' });

      expect(syncSpy).not.toHaveBeenCalled();
    } finally {
      PART_XML_SYNC.styles = originalSync;
    }
  });
});

// ---------------------------------------------------------------------------
// readPart
// ---------------------------------------------------------------------------

describe('readPart', () => {
  it('returns parts[partId]', () => {
    const converter = makeConverter();
    converter.parts.styles = { docDefaults: {} };

    expect(readPart(converter, 'styles')).toBe(converter.parts.styles);
  });

  it('returns undefined for missing key', () => {
    const converter = makeConverter();
    expect(readPart(converter, 'nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// removePart
// ---------------------------------------------------------------------------

describe('removePart', () => {
  it('removes xmljs key from both parts and convertedXml', () => {
    const converter = makeConverter();
    const value = { elements: [] };
    converter.parts['word/settings.xml'] = value;
    converter.convertedXml['word/settings.xml'] = value;

    removePart(converter, 'word/settings.xml');

    expect(converter.parts['word/settings.xml']).toBeUndefined();
    expect(converter.convertedXml['word/settings.xml']).toBeUndefined();
  });

  it('removes model key from parts only', () => {
    const converter = makeConverter();
    converter.parts.numbering = { abstracts: [] };

    removePart(converter, 'numbering');

    expect(converter.parts.numbering).toBeUndefined();
  });

  it('removes header/footer key from parts only', () => {
    const converter = makeConverter();
    converter.parts['header:rId8'] = { type: 'doc', content: [] };

    removePart(converter, 'header:rId8');

    expect(converter.parts['header:rId8']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listPartsByPrefix
// ---------------------------------------------------------------------------

describe('listPartsByPrefix', () => {
  it('lists all header parts', () => {
    const converter = makeConverter();
    converter.parts['header:rId1'] = {};
    converter.parts['header:rId2'] = {};
    converter.parts['footer:rId3'] = {};
    converter.parts.styles = {};

    const result = listPartsByPrefix(converter, 'header:');
    expect(result).toEqual(['header:rId1', 'header:rId2']);
  });

  it('lists all footer parts', () => {
    const converter = makeConverter();
    converter.parts['header:rId1'] = {};
    converter.parts['footer:rId3'] = {};
    converter.parts['footer:rId4'] = {};

    const result = listPartsByPrefix(converter, 'footer:');
    expect(result).toEqual(['footer:rId3', 'footer:rId4']);
  });

  it('returns empty array when no matches', () => {
    const converter = makeConverter();
    expect(listPartsByPrefix(converter, 'header:')).toEqual([]);
  });
});
