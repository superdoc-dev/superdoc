/**
 * Part spec registry — declarative definitions for every collaboration-synced
 * OOXML part, plus registry lookup helpers.
 *
 * Each spec describes how to read/write one part's sections between the
 * local converter and a Y.Map channel. The part-sync engine uses these
 * specs generically — no part-specific transaction code outside this file.
 *
 * @module part-spec-registry
 *
 * @typedef {object} PartSpec
 * @property {string} id — Unique identifier (e.g. 'styles', 'numbering')
 * @property {string} partPath — OOXML part path (e.g. 'word/styles.xml')
 * @property {string} channel — Y.Map name (e.g. 'stylesModel', 'ooxmlPartModels')
 * @property {number} version — Channel version sentinel
 * @property {(section: string) => string} sectionKey — Derive Y.Map key from section
 * @property {(key: string) => string | null} parseKey — Reverse: Y.Map key → section (null if unrecognized)
 * @property {(converter: object) => string[]} listSections — All available sections
 * @property {(converter: object, section: string) => unknown} readSection — Read section from converter
 * @property {(section: string, value: unknown) => boolean} validateSection — Validate incoming value
 * @property {(converter: object, section: string, value: unknown) => void} applySection — Apply to converter
 * @property {((converter: object, section: string) => void) | undefined} removeSection — Remove section from converter
 * @property {((editor: object, changedSections: string[]) => void) | undefined} afterApply — Post-apply hook
 */

import { ensureTranslatedLinkedStylesModel } from '../../../core/super-converter/translated-linked-styles-model.js';
import { writePart, readPart, removePart } from '../../../core/super-converter/converter-parts.js';
import {
  syncDocDefaultsToConvertedXml,
  syncLatentStylesToConvertedXml,
  syncAllStyleDefinitionsToConvertedXml,
} from '../../../document-api-adapters/styles-xml-sync.js';
import { translator as docDefaultsTranslator } from '../../../core/super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js';
import { translator as latentStylesTranslator } from '../../../core/super-converter/v3/handlers/w/latentStyles/latentStyles-translator.js';
import { translator as styleTranslator } from '../../../core/super-converter/v3/handlers/w/style/style-translator.js';
import { incrementRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';

// ---------------------------------------------------------------------------
// Factory: xml-js parts with a single 'root' section
// ---------------------------------------------------------------------------

/**
 * Create a PartSpec for a standard xml-js part stored in convertedXml.
 *
 * Uses a single 'root' section containing the root xml-js element.
 * Suitable for any part that doesn't require multi-section decomposition.
 *
 * @param {string} id
 * @param {string} partPath
 * @returns {PartSpec}
 */
function createXmlPartSpec(id, partPath) {
  const prefix = `${id}/`;

  return {
    id,
    partPath,
    channel: 'ooxmlPartModels',
    version: 1,

    sectionKey: (section) => `${prefix}${section}`,
    parseKey: (key) => (key.startsWith(prefix) ? key.slice(prefix.length) : null),

    listSections: (converter) => {
      const part = converter.parts?.[partPath] ?? converter.convertedXml?.[partPath];
      return part?.elements?.[0] ? ['root'] : [];
    },

    readSection: (converter, _section) => {
      const part = converter.parts?.[partPath] ?? converter.convertedXml?.[partPath];
      return part?.elements?.[0] ?? null;
    },

    validateSection: (_section, value) => {
      return value != null && typeof value === 'object';
    },

    applySection: (converter, _section, value) => {
      const existing = converter.parts?.[partPath] ?? converter.convertedXml?.[partPath];
      const wrapped = existing ? { ...existing, elements: [value] } : { elements: [value] };
      writePart(converter, partPath, wrapped);
    },

    removeSection: (converter, _section) => {
      removePart(converter, partPath);
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: dynamic xml-js parts (pattern-matched paths like header/footer rels)
// ---------------------------------------------------------------------------

/**
 * Create a PartSpec for a family of xml-js parts matched by regex.
 *
 * Each concrete part path becomes its own section in ooxmlPartModels.
 * Useful for `word/_rels/header*.xml.rels` and similar dynamic sets.
 *
 * @param {string} id
 * @param {RegExp} pathPattern
 * @returns {PartSpec}
 */
function createDynamicXmlPartSpec(id, pathPattern) {
  const prefix = `${id}/`;

  return {
    id,
    partPath: pathPattern.source,
    channel: 'ooxmlPartModels',
    version: 1,

    sectionKey: (section) => `${prefix}${section}`,
    parseKey: (key) => (key.startsWith(prefix) ? key.slice(prefix.length) : null),

    listSections: (converter) => {
      const store = converter.parts ?? converter.convertedXml ?? {};
      return Object.keys(store).filter((path) => pathPattern.test(path));
    },

    readSection: (converter, section) => {
      const part = converter.parts?.[section] ?? converter.convertedXml?.[section];
      return part?.elements?.[0] ?? null;
    },

    validateSection: (_section, value) => {
      return value != null && typeof value === 'object';
    },

    applySection: (converter, section, value) => {
      const existing = converter.parts?.[section] ?? converter.convertedXml?.[section];
      const wrapped = existing ? { ...existing, elements: [value] } : { elements: [value] };
      writePart(converter, section, wrapped);
    },

    removeSection: (converter, section) => {
      removePart(converter, section);
    },
  };
}

// ---------------------------------------------------------------------------
// [Content_Types].xml normalization
// ---------------------------------------------------------------------------

const CONTENT_TYPES_PART_PATH = '[Content_Types].xml';
const CONTENT_TYPES_KEY = 'contentTypes';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAttributes(attributes) {
  if (!isPlainObject(attributes)) return {};

  const sortedKeys = Object.keys(attributes).sort();
  const normalized = {};
  for (const key of sortedKeys) {
    normalized[key] = attributes[key];
  }
  return normalized;
}

function contentTypesElementSortKey(element) {
  if (!isPlainObject(element)) return 'z:';

  const name = typeof element.name === 'string' ? element.name : '';
  const attributes = normalizeAttributes(element.attributes);
  if (name === 'Default') {
    const ext = String(attributes.Extension ?? '');
    const contentType = String(attributes.ContentType ?? '');
    return `a:${ext}:${contentType}`;
  }
  if (name === 'Override') {
    const partName = String(attributes.PartName ?? '');
    const contentType = String(attributes.ContentType ?? '');
    return `b:${partName}:${contentType}`;
  }
  return `z:${name}:${JSON.stringify(attributes)}`;
}

function isContentTypeDeclarationElement(element) {
  return isPlainObject(element) && (element.name === 'Default' || element.name === 'Override');
}

/**
 * Normalize [Content_Types].xml root for deterministic semantic comparisons.
 *
 * Sorting defaults/overrides avoids churn from equivalent-but-differently-ordered
 * content type declarations produced by different clients/export cycles.
 *
 * @param {unknown} root
 * @returns {unknown}
 */
function normalizeContentTypesRoot(root) {
  if (!isPlainObject(root)) return root;

  const clone = structuredClone(root);
  if (!Array.isArray(clone.elements)) return clone;

  const normalizedChildren = clone.elements.map((child) => {
    if (!isPlainObject(child)) return child;
    if (child.name !== 'Default' && child.name !== 'Override') return child;
    return {
      ...child,
      attributes: normalizeAttributes(child.attributes),
    };
  });

  const sortedDeclarations = normalizedChildren
    .filter((child) => isContentTypeDeclarationElement(child))
    .sort((a, b) => {
      const keyA = contentTypesElementSortKey(a);
      const keyB = contentTypesElementSortKey(b);
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

  let declarationIndex = 0;
  clone.elements = normalizedChildren.map((child) => {
    if (!isContentTypeDeclarationElement(child)) return child;
    const next = sortedDeclarations[declarationIndex];
    declarationIndex += 1;
    return next;
  });

  return clone;
}

// ---------------------------------------------------------------------------
// Styles spec (dedicated channel: stylesModel)
// ---------------------------------------------------------------------------

const STYLE_SECTIONS = ['docDefaults', 'latentStyles', 'styles'];

/** @type {PartSpec} */
export const STYLES_SPEC = {
  id: 'styles',
  partPath: 'word/styles.xml',
  channel: 'stylesModel',
  version: 1,

  sectionKey: (section) => section,
  parseKey: (key) => (STYLE_SECTIONS.includes(key) ? key : null),

  listSections: (converter) => {
    const model = ensureTranslatedLinkedStylesModel(converter);
    return STYLE_SECTIONS.filter((s) => model[s] != null);
  },

  readSection: (converter, section) => {
    const model = ensureTranslatedLinkedStylesModel(converter);
    return model[section];
  },

  validateSection: (section, value) => {
    if (section === 'styles') return Array.isArray(value);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  },

  applySection: (converter, section, value) => {
    const model = ensureTranslatedLinkedStylesModel(converter);
    model[section] = value;
  },

  afterApply: (editor, changedSections) => {
    const converter = editor.converter;
    if (changedSections.includes('docDefaults')) syncDocDefaultsToConvertedXml(converter, docDefaultsTranslator);
    if (changedSections.includes('latentStyles')) syncLatentStylesToConvertedXml(converter, latentStylesTranslator);
    if (changedSections.includes('styles')) syncAllStyleDefinitionsToConvertedXml(converter, styleTranslator);
    incrementRevision(editor);
    // partChanged is emitted by the engine after afterApply returns — no emit here.
  },
};

// ---------------------------------------------------------------------------
// Header/footer content spec (dedicated channel: headerFooterModel)
// ---------------------------------------------------------------------------

const HEADER_FOOTER_KEY_RE = /^(header|footer):(.+)$/;

/**
 * Parse a header/footer section key into its type and sectionId.
 * @param {string} section — e.g. 'header:rId1'
 * @returns {{ type: string, sectionId: string }}
 */
function parseHeaderFooterSection(section) {
  const [type, ...rest] = section.split(':');
  return { type, sectionId: rest.join(':') };
}

/** @type {PartSpec} */
export const HEADER_FOOTER_CONTENT_SPEC = {
  id: 'headerFooterContent',
  partPath: 'word/header-footer',
  channel: 'headerFooterModel',
  version: 1,

  sectionKey: (section) => section,
  parseKey: (key) => (HEADER_FOOTER_KEY_RE.test(key) ? key : null),

  listSections: (converter) => {
    // Scan converter.parts for header:/footer: keys (canonical source)
    const sections = [];
    for (const key of Object.keys(converter.parts ?? {})) {
      if (key.startsWith('header:') || key.startsWith('footer:')) {
        sections.push(key);
      }
    }
    // Fallback: also check legacy headers/footers dicts if parts is empty
    if (sections.length === 0) {
      for (const rId of Object.keys(converter.headers ?? {})) {
        sections.push(`header:${rId}`);
      }
      for (const rId of Object.keys(converter.footers ?? {})) {
        sections.push(`footer:${rId}`);
      }
    }
    return sections;
  },

  readSection: (converter, section) => {
    // Try canonical parts store first, fall back to legacy headers/footers dicts
    const fromParts = readPart(converter, section);
    if (fromParts != null) return fromParts;
    const { type, sectionId } = parseHeaderFooterSection(section);
    return converter[`${type}s`]?.[sectionId] ?? null;
  },

  validateSection: (_section, value) => {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  },

  applySection: (converter, section, value) => {
    writePart(converter, section, value);
    // Also update legacy headers/footers dict for backward compat
    const { type, sectionId } = parseHeaderFooterSection(section);
    const storage = converter[`${type}s`];
    if (storage) storage[sectionId] = value;
    converter.headerFooterModified = true;
  },

  removeSection: (converter, section) => {
    removePart(converter, section);
    // Also update legacy headers/footers dict for backward compat
    const { type, sectionId } = parseHeaderFooterSection(section);
    const storage = converter[`${type}s`];
    if (storage) delete storage[sectionId];
    converter.headerFooterModified = true;
  },

  afterApply: (editor, changedSections) => {
    // Replace content in live section editors. The engine emits partChanged
    // after afterApply returns — no emit here.
    for (const section of changedSections) {
      const { type, sectionId } = parseHeaderFooterSection(section);
      const content = readPart(editor.converter, section);
      const editors = editor.converter[`${type}Editors`];
      editors?.forEach((item) => {
        if (item.id === sectionId && item.editor && content) {
          item.editor.replaceContent(content);
        }
      });
    }
  },
};

// [Content_Types].xml spec. Uses the standard root model with deterministic
// normalization to avoid no-op churn from equivalent element reordering.
const CONTENT_TYPES_BASE_SPEC = createXmlPartSpec(CONTENT_TYPES_KEY, CONTENT_TYPES_PART_PATH);
export const CONTENT_TYPES_SPEC = {
  ...CONTENT_TYPES_BASE_SPEC,
  validateSection: (_section, value) => {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  },
  readSection: (converter, section) => {
    const rawRoot = CONTENT_TYPES_BASE_SPEC.readSection(converter, section);
    return normalizeContentTypesRoot(rawRoot);
  },
  applySection: (converter, section, value) => {
    const normalizedRoot = normalizeContentTypesRoot(value);
    CONTENT_TYPES_BASE_SPEC.applySection(converter, section, normalizedRoot);
  },
};

// ---------------------------------------------------------------------------
// OOXML part specs (shared channel: ooxmlPartModels)
// ---------------------------------------------------------------------------

export const NUMBERING_SPEC = createXmlPartSpec('numbering', 'word/numbering.xml');
export const SETTINGS_SPEC = createXmlPartSpec('settings', 'word/settings.xml');
export const DOCUMENT_RELS_SPEC = createXmlPartSpec('documentRels', 'word/_rels/document.xml.rels');
export const FOOTNOTES_SPEC = createXmlPartSpec('footnotes', 'word/footnotes.xml');
export const FOOTNOTES_RELS_SPEC = createXmlPartSpec('footnotesRels', 'word/_rels/footnotes.xml.rels');
export const COMMENTS_SPEC = createXmlPartSpec('comments', 'word/comments.xml');
export const COMMENTS_EXTENDED_SPEC = createXmlPartSpec('commentsExtended', 'word/commentsExtended.xml');
export const COMMENTS_IDS_SPEC = createXmlPartSpec('commentsIds', 'word/commentsIds.xml');
export const COMMENTS_EXTENSIBLE_SPEC = createXmlPartSpec('commentsExtensible', 'word/commentsExtensible.xml');
export const PEOPLE_SPEC = createXmlPartSpec('people', 'word/people.xml');
export const CUSTOM_PROPS_SPEC = createXmlPartSpec('customProps', 'docProps/custom.xml');
export const CORE_PROPS_SPEC = createXmlPartSpec('coreProps', 'docProps/core.xml');
export const FONT_TABLE_SPEC = createXmlPartSpec('fontTable', 'word/fontTable.xml');
export const FONT_TABLE_RELS_SPEC = createXmlPartSpec('fontTableRels', 'word/_rels/fontTable.xml.rels');
export const THEME_SPEC = createXmlPartSpec('theme', 'word/theme/theme1.xml');
export const WEB_SETTINGS_SPEC = createXmlPartSpec('webSettings', 'word/webSettings.xml');
export const APP_PROPS_SPEC = createXmlPartSpec('appProps', 'docProps/app.xml');
export const ROOT_RELS_SPEC = createXmlPartSpec('rootRels', '_rels/.rels');

export const HEADER_FOOTER_RELS_SPEC = createDynamicXmlPartSpec(
  'headerFooterRels',
  /^word\/_rels\/(header|footer)\d+\.xml\.rels$/,
);

// ---------------------------------------------------------------------------
// Exclusion guard
// ---------------------------------------------------------------------------

/**
 * Part paths that must never be published through part-sync.
 * word/document.xml is owned by ProseMirror/Y.js fragment sync — publishing
 * it through the part channel would create a conflicting source of truth.
 *
 * @type {Set<string>}
 */
export const EXCLUDED_PART_PATHS = new Set(['word/document.xml']);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * All specs that use the `ooxmlPartModels` channel.
 * The reconcile scheduler iterates these to publish all parts after export.
 */
const OOXML_PART_SPECS = [
  NUMBERING_SPEC,
  SETTINGS_SPEC,
  DOCUMENT_RELS_SPEC,
  FOOTNOTES_SPEC,
  FOOTNOTES_RELS_SPEC,
  COMMENTS_SPEC,
  COMMENTS_EXTENDED_SPEC,
  COMMENTS_IDS_SPEC,
  COMMENTS_EXTENSIBLE_SPEC,
  PEOPLE_SPEC,
  CUSTOM_PROPS_SPEC,
  CORE_PROPS_SPEC,
  FONT_TABLE_SPEC,
  FONT_TABLE_RELS_SPEC,
  THEME_SPEC,
  WEB_SETTINGS_SPEC,
  APP_PROPS_SPEC,
  ROOT_RELS_SPEC,
  CONTENT_TYPES_SPEC,
  HEADER_FOOTER_RELS_SPEC,
];

/**
 * All specs across all channels. Used by the collaboration extension
 * for hydrate/seed on collaborationReady.
 */
const ALL_SPECS = [STYLES_SPEC, HEADER_FOOTER_CONTENT_SPEC, ...OOXML_PART_SPECS];

// ---------------------------------------------------------------------------
// Prefix index for O(1) resolveOoxmlPartKey
// ---------------------------------------------------------------------------

/**
 * Maps `"${specId}/"` → spec for all prefix-based ooxmlPartModels specs.
 * @type {Map<string, PartSpec>}
 */
const prefixIndex = new Map();

/**
 * Specs that use pattern (regex) matching and cannot be indexed by prefix.
 * @type {PartSpec[]}
 */
const patternSpecs = [];

// Build prefix index from static specs
for (const spec of OOXML_PART_SPECS) {
  if (typeof spec.partPath === 'string' && !spec.partPath.startsWith('^')) {
    prefixIndex.set(`${spec.id}/`, spec);
  } else {
    patternSpecs.push(spec);
  }
}

/**
 * Register a spec in the prefix index.
 * Used for dynamically discovered specs.
 * @param {PartSpec} spec
 */
function registerInPrefixIndex(spec) {
  prefixIndex.set(`${spec.id}/`, spec);
}

// ---------------------------------------------------------------------------
// Dynamic generic discovery
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|bmp|tiff|emf|wmf|bin|ole)$/i;

/**
 * Set of literal part paths already covered by static specs.
 * @type {Set<string>}
 */
const STATIC_COVERED_PATHS = new Set();
for (const spec of ALL_SPECS) {
  if (typeof spec.partPath === 'string' && !spec.partPath.startsWith('^')) {
    STATIC_COVERED_PATHS.add(spec.partPath);
  }
}

/**
 * Regex patterns from dynamic/pattern specs (e.g. HEADER_FOOTER_RELS_SPEC).
 * @type {RegExp[]}
 */
const STATIC_COVERED_PATTERNS = patternSpecs
  .map((spec) => {
    try {
      return new RegExp(spec.partPath);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

/**
 * Returns true if the key should be excluded from dynamic discovery.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isExcludedFromDiscovery(key) {
  if (EXCLUDED_PART_PATHS.has(key)) return true;
  if (BINARY_EXTENSIONS.test(key)) return true;
  // Must look like an XML part path (contains `/` or starts with `[`)
  if (!key.includes('/') && !key.startsWith('[')) return true;
  if (STATIC_COVERED_PATHS.has(key)) return true;
  for (const pattern of STATIC_COVERED_PATTERNS) {
    if (pattern.test(key)) return true;
  }
  return false;
}

/** @type {WeakMap<object, PartSpec[]>} */
const discoveredSpecsCache = new WeakMap();

/**
 * Derive a deterministic, collision-free spec ID from a part path.
 *
 * Uses hex-escape encoding: every non-alphanumeric character (including `_`)
 * is replaced with `_XX` where XX is its uppercase hex char code. This is
 * truly bijective — distinct paths always produce distinct IDs regardless of
 * discovery order or runtime state.
 *
 * Examples:
 *   'custom/a-b.xml'  → 'dyn_custom_2Fa_2Db_2Exml'
 *   'custom/a_b.xml'  → 'dyn_custom_2Fa_5Fb_2Exml'
 *   'custom/a/b.xml'  → 'dyn_custom_2Fa_2Fb_2Exml'
 *
 * @param {string} partPath
 * @returns {string}
 */
function deterministicDynamicId(partPath) {
  const encoded = partPath.replace(
    /[^a-zA-Z0-9]/g,
    (ch) => `_${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
  return `dyn_${encoded}`;
}

/**
 * Scan a converter for XML parts not covered by static specs and create
 * generic PartSpecs for them. Results are cached per converter.
 *
 * @param {object} converter
 * @returns {PartSpec[]}
 */
export function discoverGenericSpecs(converter) {
  if (!converter) return [];

  const cached = discoveredSpecsCache.get(converter);
  if (cached) return cached;

  const store = converter.parts ?? converter.convertedXml ?? {};
  const specs = [];

  for (const key of Object.keys(store)) {
    if (isExcludedFromDiscovery(key)) continue;

    const id = deterministicDynamicId(key);
    const spec = createXmlPartSpec(id, key);
    specs.push(spec);
    registerInPrefixIndex(spec);
  }

  discoveredSpecsCache.set(converter, specs);
  return specs;
}

/**
 * Clear the discovered-specs cache for a converter.
 * Call when parts are added/removed and discovery should re-run.
 *
 * @param {object} converter
 */
export function invalidateDiscoveredSpecs(converter) {
  if (!converter) return;
  const stale = discoveredSpecsCache.get(converter);
  if (stale) {
    for (const spec of stale) {
      prefixIndex.delete(`${spec.id}/`);
    }
    discoveredSpecsCache.delete(converter);
  }
}

// ---------------------------------------------------------------------------
// Registry accessors
// ---------------------------------------------------------------------------

/**
 * @param {object} [converter] — If provided, includes dynamically discovered specs.
 * @returns {PartSpec[]}
 */
export function getOoxmlPartSpecs(converter) {
  const dynamic = converter ? discoverGenericSpecs(converter) : [];
  return dynamic.length > 0 ? [...OOXML_PART_SPECS, ...dynamic] : OOXML_PART_SPECS;
}

/**
 * @param {object} [converter] — If provided, includes dynamically discovered specs.
 * @returns {PartSpec[]}
 */
export function getAllSpecs(converter) {
  const dynamic = converter ? discoverGenericSpecs(converter) : [];
  return dynamic.length > 0 ? [...ALL_SPECS, ...dynamic] : ALL_SPECS;
}

/**
 * Find a spec by ID.
 * @param {string} id
 * @param {object} [converter] — If provided, also searches discovered specs.
 * @returns {PartSpec | undefined}
 */
export function getSpecById(id, converter) {
  const found = ALL_SPECS.find((s) => s.id === id);
  if (found) return found;
  if (converter) {
    const dynamic = discoverGenericSpecs(converter);
    return dynamic.find((s) => s.id === id);
  }
  return undefined;
}

/**
 * Parse a Y.Map key from the ooxmlPartModels channel and return the
 * matching spec + section. Uses O(1) prefix index with regex fallback.
 *
 * @param {string} key
 * @param {object} [converter] — If provided, ensures dynamic specs are discovered.
 * @returns {{ spec: PartSpec, section: string } | null}
 */
export function resolveOoxmlPartKey(key, converter) {
  // Ensure dynamic specs are registered before lookup
  if (converter) discoverGenericSpecs(converter);

  // O(1) prefix lookup: extract prefix up to first '/'
  const slashIdx = key.indexOf('/');
  if (slashIdx !== -1) {
    const prefix = key.slice(0, slashIdx + 1);
    const spec = prefixIndex.get(prefix);
    if (spec) {
      const section = spec.parseKey(key);
      if (section != null) return { spec, section };
    }
  }

  // Fallback: linear scan of pattern-based specs
  for (const spec of patternSpecs) {
    const section = spec.parseKey(key);
    if (section != null) return { spec, section };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Unified part-changed routing
// ---------------------------------------------------------------------------

/**
 * Resolve a partChanged event payload to a spec + section hints for publishing.
 *
 * Centralizes the routing logic that maps editor partChanged events to the
 * correct PartSpec and optional section hints for publishPartSections.
 *
 * @param {string} partId — The partId from the partChanged event
 * @param {string[]} [changedPaths] — Optional changed paths from the event
 * @param {object} [converter] — Converter for dynamic spec discovery
 * @returns {{ spec: PartSpec, sectionHints: string[] | undefined } | null}
 */
export function resolvePartChangedSpec(partId, changedPaths, converter) {
  if (partId === 'styles') {
    return {
      spec: STYLES_SPEC,
      sectionHints: changedPaths?.map((p) => p.split('.')[0]),
    };
  }

  if (partId.startsWith('header:') || partId.startsWith('footer:')) {
    return {
      spec: HEADER_FOOTER_CONTENT_SPEC,
      sectionHints: [partId],
    };
  }

  const spec = getSpecById(partId, converter);
  if (spec) {
    return { spec, sectionHints: undefined };
  }

  return null;
}
