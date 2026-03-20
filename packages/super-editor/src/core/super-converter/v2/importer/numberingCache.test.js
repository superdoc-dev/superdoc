import { describe, it, expect } from 'vitest';
import {
  buildNumberingCache,
  ensureNumberingCache,
  getNumberingCache,
  LEVELS_MAP_KEY,
  NUMBERING_CACHE_KEY,
} from './numberingCache.js';

const createDocxPackage = ({ abstractId = '1', templateId = 'tmpl-1', numId = '8', includeLevels = true } = {}) => {
  const abstractElements = [];
  if (templateId != null) {
    abstractElements.push({ name: 'w:tmpl', attributes: { 'w:val': templateId } });
  }
  if (includeLevels) {
    abstractElements.push({ name: 'w:lvl', attributes: { 'w:ilvl': '0' } });
    abstractElements.push({ name: 'w:lvl', attributes: { 'w:ilvl': '1' } });
  }

  return {
    'word/numbering.xml': {
      elements: [
        {
          elements: [
            {
              name: 'w:abstractNum',
              attributes: { 'w:abstractNumId': String(abstractId) },
              elements: abstractElements,
            },
            {
              name: 'w:num',
              attributes: { 'w:numId': String(numId) },
              elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractId) } }],
            },
          ],
        },
      ],
    },
  };
};

const expectEmptyCache = (cache) => {
  expect(cache.numToAbstractId.size).toBe(0);
  expect(cache.abstractById.size).toBe(0);
  expect(cache.templateById.size).toBe(0);
  expect(cache.numToDefinition.size).toBe(0);
  expect(cache.numNodesById.size).toBe(0);
};

describe('numbering cache helpers', () => {
  it('returns empty cache when provided docx package is invalid', () => {
    expectEmptyCache(buildNumberingCache(null));
    expectEmptyCache(buildNumberingCache(undefined));
    expectEmptyCache(buildNumberingCache(42));
  });

  it('builds cache relationships and memoizes levels when numbering definitions are present', () => {
    const docx = createDocxPackage();
    const cache = buildNumberingCache(docx);

    expect(cache.numToAbstractId.get('8')).toBe('1');

    const abstract = cache.abstractById.get('1');
    expect(abstract).toBe(docx['word/numbering.xml'].elements[0].elements[0]);

    const levelsMap = abstract[LEVELS_MAP_KEY];
    expect(levelsMap).toBeInstanceOf(Map);
    expect(levelsMap.get(0)?.attributes?.['w:ilvl']).toBe('0');
    expect(levelsMap.get(1)?.attributes?.['w:ilvl']).toBe('1');
    expect(Object.prototype.propertyIsEnumerable.call(abstract, LEVELS_MAP_KEY)).toBe(false);

    expect(cache.templateById.get('tmpl-1')).toBe(abstract);
    expect(cache.numToDefinition.get('8')).toBe(abstract);

    const numNode = cache.numNodesById.get('8');
    expect(numNode?.attributes?.['w:numId']).toBe('8');
  });

  it('skips template caching when abstract levels are missing', () => {
    const docx = createDocxPackage({ includeLevels: false });
    const cache = buildNumberingCache(docx);

    expect(cache.templateById.size).toBe(0);
    expect(cache.numToDefinition.get('8')).toBe(cache.abstractById.get('1'));

    const abstract = cache.abstractById.get('1');
    const levelsMap = abstract[LEVELS_MAP_KEY];
    expect(levelsMap.size).toBe(0);
  });

  it('falls back to the base numbering definition when numbering xml is missing', () => {
    const cache = buildNumberingCache({});
    expect(cache.abstractById.size).toBeGreaterThan(0);
    expect(cache.numNodesById.size).toBeGreaterThan(0);
  });

  it('memoizes cache instances for the same docx package without mutating it', () => {
    const docx = createDocxPackage();

    const firstCache = ensureNumberingCache(docx);
    const secondCache = ensureNumberingCache(docx);
    expect(secondCache).toBe(firstCache);
    expect(Object.prototype.hasOwnProperty.call(docx, 'numbering-cache')).toBe(false);
    expect(getNumberingCache(docx)).toBe(firstCache);
  });

  it('returns empty cache when ensureNumberingCache receives invalid input', () => {
    expectEmptyCache(ensureNumberingCache(null));
    expectEmptyCache(ensureNumberingCache(undefined));
  });

  it('reads cached instances through getNumberingCache', () => {
    const docx = createDocxPackage();
    const cache = ensureNumberingCache(docx);

    expect(getNumberingCache(docx)).toBe(cache);
    expectEmptyCache(getNumberingCache(null));
  });

  it('stores the cache on converter instances so headless consumers can reuse it', () => {
    const converter = {};
    const docx = createDocxPackage({ numId: '21', abstractId: '7' });
    const cache = ensureNumberingCache(docx, converter);

    expect(converter[NUMBERING_CACHE_KEY]).toBe(cache);
    expect(getNumberingCache(converter)).toBe(cache);
    expect(cache.numToDefinition.has('21')).toBe(true);
  });

  it('returns the converter cache when docx input is unavailable', () => {
    const converter = {};
    const docx = createDocxPackage({ numId: '11', abstractId: '17' });
    const cache = ensureNumberingCache(docx, converter);

    const reusedCache = ensureNumberingCache(undefined, converter);
    expect(reusedCache).toBe(cache);
    expect(reusedCache.numToDefinition.has('11')).toBe(true);
  });

  it('rebuilds caches when the converter is reused for a different document', () => {
    const converter = {};
    const firstDocx = createDocxPackage({ numId: '1', abstractId: '10' });
    const secondDocx = createDocxPackage({ numId: '2', abstractId: '20' });

    const firstCache = ensureNumberingCache(firstDocx, converter);
    expect(firstCache.numToDefinition.has('1')).toBe(true);

    const secondCache = ensureNumberingCache(secondDocx, converter);
    expect(secondCache).not.toBe(firstCache);
    expect(secondCache.numToDefinition.has('2')).toBe(true);
    expect(secondCache.numToDefinition.has('1')).toBe(false);
    expect(getNumberingCache(converter)).toBe(secondCache);
  });

  it('returns cached version when docx becomes null after initial cache build', () => {
    const converter = {};
    const docx = createDocxPackage({ numId: '5', abstractId: '15' });
    const initialCache = ensureNumberingCache(docx, converter);

    expect(initialCache.numToDefinition.has('5')).toBe(true);

    // Subsequent call with null should return the cached version
    const cachedVersion = ensureNumberingCache(null, converter);
    expect(cachedVersion).toBe(initialCache);
    expect(cachedVersion.numToDefinition.has('5')).toBe(true);
  });

  it('does not rebuild cache when same docx is passed multiple times', () => {
    const converter = {};
    const docx = createDocxPackage({ numId: '3', abstractId: '13' });

    const firstCall = ensureNumberingCache(docx, converter);
    const secondCall = ensureNumberingCache(docx, converter);
    const thirdCall = ensureNumberingCache(docx, converter);

    expect(secondCall).toBe(firstCall);
    expect(thirdCall).toBe(firstCall);
    expect(firstCall.numToDefinition.has('3')).toBe(true);
  });

  it('handles converter reuse with docx → null → different docx sequence', () => {
    const converter = {};
    const firstDocx = createDocxPackage({ numId: '7', abstractId: '17' });
    const secondDocx = createDocxPackage({ numId: '9', abstractId: '19' });

    // Build initial cache
    const firstCache = ensureNumberingCache(firstDocx, converter);
    expect(firstCache.numToDefinition.has('7')).toBe(true);

    // Call with null - should return cached version
    const nullCache = ensureNumberingCache(null, converter);
    expect(nullCache).toBe(firstCache);

    // Call with different docx - should rebuild
    const secondCache = ensureNumberingCache(secondDocx, converter);
    expect(secondCache).not.toBe(firstCache);
    expect(secondCache.numToDefinition.has('9')).toBe(true);
    expect(secondCache.numToDefinition.has('7')).toBe(false);
  });

  it('uses WeakMap fallback when no converter is provided', () => {
    const docx = createDocxPackage({ numId: '4', abstractId: '14' });

    // Build cache without converter - should use WeakMap
    const firstCache = ensureNumberingCache(docx);
    expect(firstCache.numToDefinition.has('4')).toBe(true);

    // Second call without converter should reuse WeakMap-stored cache
    const secondCache = ensureNumberingCache(docx);
    expect(secondCache).toBe(firstCache);

    // Now with a converter, it should reuse the WeakMap cache
    const converter = {};
    const thirdCache = ensureNumberingCache(docx, converter);
    expect(thirdCache).toBe(firstCache);
    expect(getNumberingCache(converter)).toBe(firstCache);
  });
});
