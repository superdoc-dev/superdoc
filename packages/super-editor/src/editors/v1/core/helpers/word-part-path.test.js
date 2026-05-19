import { describe, expect, it } from 'vitest';
import { getWordPartRelsPath, normalizeWordPartPath } from './word-part-path.js';

describe('word-part-path', () => {
  describe('normalizeWordPartPath', () => {
    it('normalizes flat and prefixed targets', () => {
      expect(normalizeWordPartPath('header1.xml')).toBe('word/header1.xml');
      expect(normalizeWordPartPath('word/header1.xml')).toBe('word/header1.xml');
      expect(normalizeWordPartPath('headers/header1.xml')).toBe('word/headers/header1.xml');
    });
  });

  describe('getWordPartRelsPath', () => {
    it('places rels beside flat word parts', () => {
      expect(getWordPartRelsPath('word/header1.xml')).toBe('word/_rels/header1.xml.rels');
      expect(getWordPartRelsPath('word/footer2.xml')).toBe('word/_rels/footer2.xml.rels');
    });

    it('places rels beside nested word parts', () => {
      expect(getWordPartRelsPath('word/headers/header1.xml')).toBe('word/headers/_rels/header1.xml.rels');
      expect(getWordPartRelsPath('word/customXml/item1.xml')).toBe('word/customXml/_rels/item1.xml.rels');
    });
  });
});
