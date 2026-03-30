import { baseNumbering } from '../exporter/helpers/base-list.definitions.js';

/**
 * @typedef {Object} DocxXmlElement
 * @property {string} [name]
 * @property {Record<string, unknown>} [attributes]
 * @property {DocxXmlElement[]} [elements]
 */

/**
 * @typedef {Record<string, { elements?: DocxXmlElement[] }>} DocxPackage
 */

/**
 * @typedef {Object} NumberingCache
 * @property {Map<string, string>} numToAbstractId Maps w:numId values to their abstract numbering ids.
 * @property {Map<string, DocxXmlElement>} abstractById Stores abstract numbering definitions by id.
 * @property {Map<string, DocxXmlElement>} templateById Stores abstract numbering definitions keyed by the template value.
 * @property {Map<string, DocxXmlElement>} numToDefinition Maps w:numId to their resolved abstract numbering element.
 * @property {Map<string, DocxXmlElement>} numNodesById Stores the raw w:num nodes by id for quick lookup.
 */

/**
 * WeakMap fallback for numbering caches (kept for backwards compatibility).
 * Prefer storing on converter._numberingCache when converter is available.
 */
const docxNumberingCacheStore = new WeakMap();

/** Key used to store the numbering cache on the docx container. */
export const NUMBERING_CACHE_KEY = 'numbering-cache';

/** Symbol used to memoize level lookups on abstract numbering elements. */
export const LEVELS_MAP_KEY = Symbol('superdoc.numbering.levels');

/** Symbol used to track which docx package created the converter cache for invalidation detection. */
const NUMBERING_CACHE_DOCX_KEY = Symbol('superdoc.numbering.docx');

/**
 * Clears all numbering cache data from a converter instance.
 * @param {Object} [converter] - The converter instance to clear
 */
const clearConverterCache = (converter) => {
  if (!converter) return;
  delete converter[NUMBERING_CACHE_KEY];
  delete converter[NUMBERING_CACHE_DOCX_KEY];
};

/**
 * Stores a numbering cache on a converter instance and tracks the source docx package.
 * @param {Object} [converter] - The converter instance to store the cache on
 * @param {NumberingCache} cache - The numbering cache to store
 * @param {DocxPackage | null | undefined} docx - The docx package that generated this cache
 */
const setConverterCache = (converter, cache, docx) => {
  if (!converter) return;
  converter[NUMBERING_CACHE_KEY] = cache;
  if (docx && typeof docx === 'object') {
    converter[NUMBERING_CACHE_DOCX_KEY] = docx;
  } else {
    delete converter[NUMBERING_CACHE_DOCX_KEY];
  }
};

/** @returns {NumberingCache} */
const createEmptyCache = () => ({
  numToAbstractId: new Map(),
  abstractById: new Map(),
  templateById: new Map(),
  numToDefinition: new Map(),
  numNodesById: new Map(),
});

/**
 * Resolve the numbering XML array from the docx archive or fall back to the base numbering definition.
 * @param {DocxPackage | null | undefined} docx
 * @returns {DocxXmlElement[]}
 */
const ensureElementsArray = (docx) => {
  let numbering = docx?.['word/numbering.xml'];
  if (!numbering || !numbering.elements?.length || !numbering.elements[0].elements?.length) {
    numbering = baseNumbering;
  }

  return numbering?.elements?.[0]?.elements || [];
};

/**
 * Build a cache of numbering relationships and definitions for faster lookups.
 * @param {DocxPackage | null | undefined} docx
 * @returns {NumberingCache}
 */
export const buildNumberingCache = (docx) => {
  if (!docx || typeof docx !== 'object') return createEmptyCache();

  const elements = ensureElementsArray(docx);
  if (!elements.length) return createEmptyCache();

  const numToAbstractId = new Map();
  const abstractById = new Map();
  const templateById = new Map();
  const numToDefinition = new Map();
  const numNodesById = new Map();

  for (const element of elements) {
    if (element?.name === 'w:abstractNum') {
      const abstractIdRaw = element.attributes?.['w:abstractNumId'];
      if (abstractIdRaw == null) continue;
      const abstractId = String(abstractIdRaw);
      abstractById.set(abstractId, element);

      const levelEntries = element.elements?.filter((child) => child.name === 'w:lvl') || [];
      const levelsMap = new Map();
      for (const lvl of levelEntries) {
        const rawLevel = lvl?.attributes?.['w:ilvl'];
        const parsedLevel = rawLevel == null ? 0 : Number(rawLevel);
        if (!Number.isNaN(parsedLevel) && !levelsMap.has(parsedLevel)) {
          levelsMap.set(parsedLevel, lvl);
        }
      }
      if (!Object.prototype.hasOwnProperty.call(element, LEVELS_MAP_KEY)) {
        Object.defineProperty(element, LEVELS_MAP_KEY, {
          value: levelsMap,
          enumerable: false,
          configurable: false,
          writable: false,
        });
      }

      const templateTag = element.elements?.find((child) => child.name === 'w:tmpl');
      const templateVal = templateTag?.attributes?.['w:val'];
      if (templateVal != null && levelsMap.size) {
        templateById.set(String(templateVal), element);
      }
    } else if (element?.name === 'w:num') {
      const numIdRaw = element.attributes?.['w:numId'];
      if (numIdRaw == null) continue;
      const numId = String(numIdRaw);
      numNodesById.set(numId, element);
      const abstractRef = element.elements?.find((child) => child.name === 'w:abstractNumId');
      const abstractVal = abstractRef?.attributes?.['w:val'];
      if (abstractVal != null) {
        numToAbstractId.set(numId, String(abstractVal));
      }
    }
  }

  for (const [numId, abstractId] of numToAbstractId.entries()) {
    const abstract = abstractById.get(abstractId);
    if (abstract) {
      numToDefinition.set(numId, abstract);
    }
  }

  return { numToAbstractId, abstractById, templateById, numToDefinition, numNodesById };
};

/**
 * Retrieve an existing numbering cache from the converter or build and store a new one.
 * @param {DocxPackage | null | undefined} docx
 * @param {Object} [converter] - The SuperConverter instance (preferred storage location)
 * @returns {NumberingCache}
 */
export const ensureNumberingCache = (docx, converter) => {
  // First check if we have a converter cache
  if (converter?.[NUMBERING_CACHE_KEY]) {
    const cachedDocx = converter[NUMBERING_CACHE_DOCX_KEY];
    if (docx && cachedDocx && cachedDocx !== docx) {
      clearConverterCache(converter);
    } else {
      return converter[NUMBERING_CACHE_KEY];
    }
  }

  if (!docx || typeof docx !== 'object') return createEmptyCache();

  // Secondary: Check WeakMap for backwards compatibility
  const existingCache = docxNumberingCacheStore.get(docx);
  if (existingCache) {
    setConverterCache(converter, existingCache, docx);
    return existingCache;
  }

  const cache = buildNumberingCache(docx);

  if (converter) {
    setConverterCache(converter, cache, docx);
  } else {
    docxNumberingCacheStore.set(docx, cache);
  }

  return cache;
};

/**
 * Get the numbering cache associated with the converter or docx package.
 * @param {Object} converterOrDocx - The SuperConverter instance or docx package
 * @returns {NumberingCache}
 */
export const getNumberingCache = (converterOrDocx) => {
  if (!converterOrDocx || typeof converterOrDocx !== 'object') return createEmptyCache();

  if (converterOrDocx[NUMBERING_CACHE_KEY]) {
    return converterOrDocx[NUMBERING_CACHE_KEY];
  }

  return docxNumberingCacheStore.get(converterOrDocx) || createEmptyCache();
};
