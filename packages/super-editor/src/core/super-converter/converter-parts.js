/**
 * Unified `converter.parts` write/read/remove API.
 *
 * `converter.parts` is the canonical store for all part data (xmljs, model,
 * pmjson). These pure functions route mutations through one gate and maintain
 * the `convertedXml` compatibility alias for xmljs keys.
 *
 * @module converter-parts
 */

import {
  syncDocDefaultsToConvertedXml,
  syncLatentStylesToConvertedXml,
  syncAllStyleDefinitionsToConvertedXml,
} from '../../document-api-adapters/styles-xml-sync.js';
import { translator as docDefaultsTranslator } from './v3/handlers/w/docDefaults/docDefaults-translator.js';
import { translator as latentStylesTranslator } from './v3/handlers/w/latentStyles/latentStyles-translator.js';
import { translator as styleTranslator } from './v3/handlers/w/style/style-translator.js';

// ---------------------------------------------------------------------------
// Key classification
// ---------------------------------------------------------------------------

/**
 * Returns true if the key represents a raw xmljs part (real OOXML path).
 *
 * Convention:
 * - xmljs keys contain `/` (e.g. `word/styles.xml`) or start with `[` (`[Content_Types].xml`)
 * - Model/pmjson keys are logical IDs (e.g. `styles`, `header:rId8`)
 *
 * @param {string} partId
 * @returns {boolean}
 */
export function isXmlJsPartKey(partId) {
  return partId.includes('/') || partId.startsWith('[');
}

// ---------------------------------------------------------------------------
// XML sync registry
// ---------------------------------------------------------------------------

/**
 * Map of model partId → sync function that updates the xmljs convertedXml tree.
 *
 * When a model part is written, the corresponding sync function (if any) is
 * called to keep the export-facing XML in sync.
 *
 * @type {Record<string, (converter: object) => void>}
 */
export const PART_XML_SYNC = {
  styles: (converter) => {
    syncDocDefaultsToConvertedXml(converter, docDefaultsTranslator);
    syncLatentStylesToConvertedXml(converter, latentStylesTranslator);
    syncAllStyleDefinitionsToConvertedXml(converter, styleTranslator);
  },
};

// ---------------------------------------------------------------------------
// Write / Read / Remove
// ---------------------------------------------------------------------------

/**
 * Single write gate for all part data.
 *
 * - Sets `converter.parts[partId] = value`
 * - If xmljs key, also sets `converter.convertedXml[partId] = value` (same ref)
 * - If `PART_XML_SYNC[partId]` exists, calls it to sync model → xmljs
 *
 * @param {object} converter — SuperConverter instance
 * @param {string} partId
 * @param {unknown} value
 */
export function writePart(converter, partId, value) {
  if (!converter.parts) converter.parts = {};
  converter.parts[partId] = value;

  if (isXmlJsPartKey(partId)) {
    if (!converter.convertedXml) converter.convertedXml = {};
    converter.convertedXml[partId] = value;
  }

  const sync = PART_XML_SYNC[partId];
  if (sync) {
    sync(converter);
  }
}

/**
 * Read a part from the canonical store.
 *
 * @param {object} converter
 * @param {string} partId
 * @returns {unknown}
 */
export function readPart(converter, partId) {
  return converter.parts?.[partId];
}

/**
 * Remove a part from both `parts` and `convertedXml`.
 *
 * @param {object} converter
 * @param {string} partId
 */
export function removePart(converter, partId) {
  if (converter.parts) delete converter.parts[partId];

  if (isXmlJsPartKey(partId) && converter.convertedXml) {
    delete converter.convertedXml[partId];
  }
}

/**
 * List all part keys that match a given prefix.
 *
 * @param {object} converter
 * @param {string} prefix — e.g. 'header:' or 'footer:'
 * @returns {string[]}
 */
export function listPartsByPrefix(converter, prefix) {
  return Object.keys(converter.parts ?? {}).filter((k) => k.startsWith(prefix));
}
