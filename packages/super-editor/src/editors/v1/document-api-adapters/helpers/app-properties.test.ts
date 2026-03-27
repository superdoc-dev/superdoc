import { describe, it, expect } from 'vitest';
import { writeAppStatistics, readAppStatistic } from './app-properties.js';
import type { WordStatistics } from './word-statistics.js';

function makeStats(overrides: Partial<WordStatistics> = {}): WordStatistics {
  return {
    words: 100,
    characters: 500,
    charactersWithSpaces: 600,
    pages: 3,
    ...overrides,
  };
}

function makeAppXml(): Record<string, unknown> {
  return {
    'docProps/app.xml': {
      elements: [
        {
          type: 'element',
          name: 'Properties',
          attributes: { xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties' },
          elements: [
            { type: 'element', name: 'Application', elements: [{ type: 'text', text: 'Microsoft Office Word' }] },
            { type: 'element', name: 'Template', elements: [{ type: 'text', text: 'Normal.dotm' }] },
            { type: 'element', name: 'TotalTime', elements: [{ type: 'text', text: '33' }] },
            { type: 'element', name: 'Words', elements: [{ type: 'text', text: '50' }] },
          ],
        },
      ],
    },
  };
}

describe('app-properties', () => {
  describe('writeAppStatistics', () => {
    it('upserts Words, Characters, CharactersWithSpaces, and Pages', () => {
      const xml = makeAppXml();
      writeAppStatistics(xml, makeStats());

      expect(readAppStatistic(xml, 'Words')).toBe('100');
      expect(readAppStatistic(xml, 'Characters')).toBe('500');
      expect(readAppStatistic(xml, 'CharactersWithSpaces')).toBe('600');
      expect(readAppStatistic(xml, 'Pages')).toBe('3');
    });

    it('preserves unrelated elements', () => {
      const xml = makeAppXml();
      writeAppStatistics(xml, makeStats());

      expect(readAppStatistic(xml, 'Application')).toBe('Microsoft Office Word');
      expect(readAppStatistic(xml, 'Template')).toBe('Normal.dotm');
      expect(readAppStatistic(xml, 'TotalTime')).toBe('33');
    });

    it('updates existing Words value in place', () => {
      const xml = makeAppXml();
      expect(readAppStatistic(xml, 'Words')).toBe('50');

      writeAppStatistics(xml, makeStats({ words: 200 }));
      expect(readAppStatistic(xml, 'Words')).toBe('200');
    });

    it('skips Pages when pagination is inactive', () => {
      const xml = makeAppXml();
      writeAppStatistics(xml, makeStats({ pages: undefined }));

      // Pages should not be written
      expect(readAppStatistic(xml, 'Pages')).toBeNull();
      // Other stats should still be written
      expect(readAppStatistic(xml, 'Words')).toBe('100');
    });

    it('creates app.xml when it does not exist', () => {
      const xml: Record<string, unknown> = {};
      writeAppStatistics(xml, makeStats());

      expect(readAppStatistic(xml, 'Words')).toBe('100');
      expect(readAppStatistic(xml, 'Characters')).toBe('500');
    });
  });

  describe('readAppStatistic', () => {
    it('returns null for missing elements', () => {
      const xml = makeAppXml();
      expect(readAppStatistic(xml, 'NonExistent')).toBeNull();
    });

    it('returns null when app.xml is absent', () => {
      expect(readAppStatistic({}, 'Words')).toBeNull();
    });
  });
});
