// @ts-check
/**
 * Per-level formatting mutators and template capture/apply logic for list definitions.
 *
 * This module handles abstract-definition-scope mutations only.
 * All functions are **pure in-place mutations** on `editor.converter.numbering`.
 * They do NOT open `mutatePart` transactions — callers are responsible for
 * wrapping mutations in `mutatePart` (or `mutateNumbering`) to get:
 *   1. XML tree sync via `syncNumberingToXmlTree`
 *   2. Cache rebuild via `afterCommit` on the numbering descriptor
 *   3. Event emission (`list-definitions-change`) via `afterCommit`
 *
 * Instance-scope overrides (w:lvlOverride) are handled by `list-numbering-helpers.js`.
 */
import { removeLvlOverride as pureRemoveLvlOverride } from '@core/parts/adapters/numbering-transforms';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Standard per-level left indent increment in twips (720 twips = 0.5 inch). */
const INDENT_PER_LEVEL_TWIPS = 720;

/** Standard hanging indent in twips (360 twips = 0.25 inch). */
const HANGING_INDENT_TWIPS = 360;

// ──────────────────────────────────────────────────────────────────────────────
// Raw XML Utilities
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Find the `w:lvl` element for a given level index within an abstract definition.
 * @param {Object} abstract - The raw `w:abstractNum` XML node.
 * @param {number} ilvl - Level index (0–8).
 * @returns {Object | undefined} The `w:lvl` element, or undefined if not found.
 */
function findLevelElement(abstract, ilvl) {
  const ilvlStr = String(ilvl);
  return abstract.elements?.find((el) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === ilvlStr);
}

/**
 * Read the `w:val` attribute of a named child element.
 * @param {Object} parent
 * @param {string} elementName
 * @returns {string | undefined}
 */
function readChildAttr(parent, elementName) {
  return parent.elements?.find((el) => el.name === elementName)?.attributes?.['w:val'];
}

/**
 * Set the `w:val` attribute on a named child element. Creates the element if missing.
 * @param {Object} parent
 * @param {string} elementName
 * @param {string} value
 * @returns {boolean} True if the value changed.
 */
function setChildAttr(parent, elementName, value) {
  if (!parent.elements) parent.elements = [];
  const existing = parent.elements.find((el) => el.name === elementName);

  if (existing) {
    if (existing.attributes?.['w:val'] === value) return false;
    if (!existing.attributes) existing.attributes = {};
    existing.attributes['w:val'] = value;
    return true;
  }

  parent.elements.push({ type: 'element', name: elementName, attributes: { 'w:val': value } });
  return true;
}

/**
 * Find or create a container child element (e.g. `w:pPr`, `w:rPr`).
 * @param {Object} parent
 * @param {string} elementName
 * @returns {Object}
 */
function findOrCreateChild(parent, elementName) {
  if (!parent.elements) parent.elements = [];
  let child = parent.elements.find((el) => el.name === elementName);
  if (!child) {
    child = { type: 'element', name: elementName, elements: [] };
    parent.elements.push(child);
  }
  if (!child.elements) child.elements = [];
  return child;
}

// ──────────────────────────────────────────────────────────────────────────────
// Abstract + Level Resolution
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the abstract definition and level element from an editor.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @returns {{ abstract: Object, lvlEl: Object } | null}
 */
function resolveAbstractLevel(editor, abstractNumId, ilvl) {
  const abstract = editor.converter.numbering?.abstracts?.[abstractNumId];
  if (!abstract) return null;
  const lvlEl = findLevelElement(abstract, ilvl);
  if (!lvlEl) return null;
  return { abstract, lvlEl };
}

/**
 * Check whether a level element exists in an abstract definition.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @returns {boolean}
 */
function hasLevel(editor, abstractNumId, ilvl) {
  return resolveAbstractLevel(editor, abstractNumId, ilvl) != null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Read Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read all formatting properties from a raw `w:lvl` element.
 * @param {Object} lvlEl
 * @param {number} ilvl
 * @returns {{ level: number, numFmt?: string, lvlText?: string, start?: number, alignment?: string, indents?: { left?: number, hanging?: number, firstLine?: number }, trailingCharacter?: string, markerFont?: string, pictureBulletId?: number }}
 */
function readLevelProperties(lvlEl, ilvl) {
  /** @type {any} */
  const props = { level: ilvl };

  const numFmt = readChildAttr(lvlEl, 'w:numFmt');
  if (numFmt != null) props.numFmt = numFmt;

  const lvlText = readChildAttr(lvlEl, 'w:lvlText');
  if (lvlText != null) props.lvlText = lvlText;

  const startVal = readChildAttr(lvlEl, 'w:start');
  if (startVal != null) props.start = Number(startVal);

  const alignment = readChildAttr(lvlEl, 'w:lvlJc');
  if (alignment != null) props.alignment = alignment;

  const suff = readChildAttr(lvlEl, 'w:suff');
  if (suff != null) props.trailingCharacter = suff;

  const picBulletId = readChildAttr(lvlEl, 'w:lvlPicBulletId');
  if (picBulletId != null) props.pictureBulletId = Number(picBulletId);

  const pPr = lvlEl.elements?.find((el) => el.name === 'w:pPr');
  const ind = pPr?.elements?.find((el) => el.name === 'w:ind');
  if (ind?.attributes) {
    const indents = {};
    if (ind.attributes['w:left'] != null) indents.left = Number(ind.attributes['w:left']);
    if (ind.attributes['w:hanging'] != null) indents.hanging = Number(ind.attributes['w:hanging']);
    if (ind.attributes['w:firstLine'] != null) indents.firstLine = Number(ind.attributes['w:firstLine']);
    if (Object.keys(indents).length > 0) props.indents = indents;
  }

  const rPr = lvlEl.elements?.find((el) => el.name === 'w:rPr');
  const rFonts = rPr?.elements?.find((el) => el.name === 'w:rFonts');
  if (rFonts?.attributes?.['w:ascii']) {
    props.markerFont = rFonts.attributes['w:ascii'];
  }

  return props;
}

// ──────────────────────────────────────────────────────────────────────────────
// Raw XML Mutators (no sync, no emit)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} lvlEl
 * @param {{ numFmt: string, lvlText: string, start?: number }} params
 * @returns {boolean}
 */
function mutateLevelNumberingFormat(lvlEl, { numFmt, lvlText, start }) {
  let changed = false;
  changed = setChildAttr(lvlEl, 'w:numFmt', numFmt) || changed;
  changed = setChildAttr(lvlEl, 'w:lvlText', lvlText) || changed;
  if (start != null) {
    changed = setChildAttr(lvlEl, 'w:start', String(start)) || changed;
  }
  return changed;
}

/**
 * @param {Object} lvlEl
 * @param {string} markerText
 * @returns {boolean}
 */
function mutateLevelBulletMarker(lvlEl, markerText) {
  let changed = false;
  changed = setChildAttr(lvlEl, 'w:numFmt', 'bullet') || changed;
  changed = setChildAttr(lvlEl, 'w:lvlText', markerText) || changed;
  return changed;
}

/**
 * @param {Object} lvlEl
 * @param {number} pictureBulletId
 * @returns {boolean}
 */
function mutateLevelPictureBulletId(lvlEl, pictureBulletId) {
  return setChildAttr(lvlEl, 'w:lvlPicBulletId', String(pictureBulletId));
}

/**
 * @param {Object} lvlEl
 * @param {string} alignment
 * @returns {boolean}
 */
function mutateLevelAlignment(lvlEl, alignment) {
  return setChildAttr(lvlEl, 'w:lvlJc', alignment);
}

/**
 * @param {Object} lvlEl
 * @param {{ left?: number, hanging?: number, firstLine?: number }} indents
 * @returns {boolean}
 */
function mutateLevelIndents(lvlEl, indents) {
  const pPr = findOrCreateChild(lvlEl, 'w:pPr');
  const ind = findOrCreateChild(pPr, 'w:ind');
  if (!ind.attributes) ind.attributes = {};

  let changed = false;

  if (indents.left != null) {
    const newVal = String(indents.left);
    if (ind.attributes['w:left'] !== newVal) {
      ind.attributes['w:left'] = newVal;
      changed = true;
    }
  }

  if (indents.hanging != null) {
    const newVal = String(indents.hanging);
    if (ind.attributes['w:hanging'] !== newVal) {
      ind.attributes['w:hanging'] = newVal;
      changed = true;
    }
    if (ind.attributes['w:firstLine'] != null) {
      delete ind.attributes['w:firstLine'];
      changed = true;
    }
  }

  if (indents.firstLine != null) {
    const newVal = String(indents.firstLine);
    if (ind.attributes['w:firstLine'] !== newVal) {
      ind.attributes['w:firstLine'] = newVal;
      changed = true;
    }
    if (ind.attributes['w:hanging'] != null) {
      delete ind.attributes['w:hanging'];
      changed = true;
    }
  }

  return changed;
}

/**
 * @param {Object} lvlEl
 * @param {string} trailingCharacter
 * @returns {boolean}
 */
function mutateLevelTrailingCharacter(lvlEl, trailingCharacter) {
  return setChildAttr(lvlEl, 'w:suff', trailingCharacter);
}

/**
 * @param {Object} lvlEl
 * @param {string} fontFamily
 * @returns {boolean}
 */
function mutateLevelMarkerFont(lvlEl, fontFamily) {
  const rPr = findOrCreateChild(lvlEl, 'w:rPr');
  const rFonts = rPr.elements.find((el) => el.name === 'w:rFonts');

  if (rFonts) {
    const attrs = rFonts.attributes || {};
    if (
      attrs['w:ascii'] === fontFamily &&
      attrs['w:hAnsi'] === fontFamily &&
      attrs['w:eastAsia'] === fontFamily &&
      attrs['w:cs'] === fontFamily
    )
      return false;
    rFonts.attributes = {
      ...rFonts.attributes,
      'w:ascii': fontFamily,
      'w:hAnsi': fontFamily,
      'w:eastAsia': fontFamily,
      'w:cs': fontFamily,
    };
    return true;
  }

  rPr.elements.push({
    type: 'element',
    name: 'w:rFonts',
    attributes: { 'w:ascii': fontFamily, 'w:hAnsi': fontFamily, 'w:eastAsia': fontFamily, 'w:cs': fontFamily },
  });
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Composite Setters (resolve + raw mutate, no transaction)
//
// Each function resolves the abstract + level and calls a raw mutator.
// Callers must wrap these in `mutatePart` / `mutateNumbering` for
// XML sync, cache rebuild, and event emission.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {{ numFmt: string, lvlText: string, start?: number }} params
 * @returns {boolean}
 */
function setLevelNumberingFormat(editor, abstractNumId, ilvl, params) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelNumberingFormat(resolved.lvlEl, params);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} markerText
 * @returns {boolean}
 */
function setLevelBulletMarker(editor, abstractNumId, ilvl, markerText) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelBulletMarker(resolved.lvlEl, markerText);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {number} pictureBulletId
 * @returns {boolean}
 */
function setLevelPictureBulletId(editor, abstractNumId, ilvl, pictureBulletId) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelPictureBulletId(resolved.lvlEl, pictureBulletId);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} alignment
 * @returns {boolean}
 */
function setLevelAlignment(editor, abstractNumId, ilvl, alignment) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelAlignment(resolved.lvlEl, alignment);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {{ left?: number, hanging?: number, firstLine?: number }} indents
 * @returns {boolean}
 */
function setLevelIndents(editor, abstractNumId, ilvl, indents) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelIndents(resolved.lvlEl, indents);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} trailingCharacter
 * @returns {boolean}
 */
function setLevelTrailingCharacter(editor, abstractNumId, ilvl, trailingCharacter) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelTrailingCharacter(resolved.lvlEl, trailingCharacter);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} fontFamily
 * @returns {boolean}
 */
function setLevelMarkerFont(editor, abstractNumId, ilvl, fontFamily) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelMarkerFont(resolved.lvlEl, fontFamily);
}

// ──────────────────────────────────────────────────────────────────────────────
// Override Clearing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} numId
 * @param {number} ilvl
 * @returns {boolean}
 */
function hasLevelOverride(editor, numId, ilvl) {
  const numDef = editor.converter.numbering?.definitions?.[numId];
  if (!numDef?.elements) return false;
  const ilvlStr = String(ilvl);
  return numDef.elements.some((el) => el.name === 'w:lvlOverride' && el.attributes?.['w:ilvl'] === ilvlStr);
}

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} numId
 * @param {number} ilvl
 * @returns {boolean}
 */
function clearLevelOverride(editor, numId, ilvl) {
  if (!hasLevelOverride(editor, numId, ilvl)) return false;
  pureRemoveLvlOverride(editor.converter.numbering, numId, ilvl);
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Template Capture
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number[] | undefined} levels
 * @returns {{ version: 1, levels: Array<Object> } | null}
 */
function captureTemplate(editor, abstractNumId, levels) {
  const abstract = editor.converter.numbering?.abstracts?.[abstractNumId];
  if (!abstract?.elements) return null;

  const lvlElements = abstract.elements.filter((el) => el.name === 'w:lvl');

  const captured = [];
  for (const lvlEl of lvlElements) {
    const ilvl = Number(lvlEl.attributes?.['w:ilvl']);
    if (levels && !levels.includes(ilvl)) continue;
    captured.push(readLevelProperties(lvlEl, ilvl));
  }

  captured.sort((a, b) => a.level - b.level);
  return { version: 1, levels: captured };
}

// ──────────────────────────────────────────────────────────────────────────────
// Template Application
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {{ version: number, levels: Array<Object> }} template
 * @param {number[] | undefined} levels
 * @returns {{ changed: boolean, error?: string }}
 */
function applyTemplateToAbstract(editor, abstractNumId, template, levels) {
  const abstract = editor.converter.numbering?.abstracts?.[abstractNumId];
  if (!abstract?.elements) return { changed: false, error: 'ABSTRACT_NOT_FOUND' };

  const templateByLevel = new Map();
  for (const entry of template.levels) {
    templateByLevel.set(entry.level, entry);
  }

  const targetLevels = levels ?? template.levels.map((l) => l.level);

  for (const ilvl of targetLevels) {
    if (!templateByLevel.has(ilvl)) return { changed: false, error: 'LEVEL_NOT_IN_TEMPLATE' };
  }
  for (const ilvl of targetLevels) {
    if (!findLevelElement(abstract, ilvl)) return { changed: false, error: 'LEVEL_NOT_IN_ABSTRACT' };
  }

  let anyChanged = false;

  for (const ilvl of targetLevels) {
    const entry = templateByLevel.get(ilvl);
    const lvlEl = findLevelElement(abstract, ilvl);

    if (entry.numFmt != null || entry.lvlText != null) {
      const fmtParams = {};
      if (entry.numFmt != null) fmtParams.numFmt = entry.numFmt;
      if (entry.lvlText != null) fmtParams.lvlText = entry.lvlText;
      if (entry.start != null) fmtParams.start = entry.start;

      if (fmtParams.numFmt != null && fmtParams.lvlText != null) {
        anyChanged = mutateLevelNumberingFormat(lvlEl, fmtParams) || anyChanged;
      } else {
        if (fmtParams.numFmt != null) anyChanged = setChildAttr(lvlEl, 'w:numFmt', fmtParams.numFmt) || anyChanged;
        if (fmtParams.lvlText != null) anyChanged = setChildAttr(lvlEl, 'w:lvlText', fmtParams.lvlText) || anyChanged;
        if (fmtParams.start != null) anyChanged = setChildAttr(lvlEl, 'w:start', String(fmtParams.start)) || anyChanged;
      }
    } else if (entry.start != null) {
      anyChanged = setChildAttr(lvlEl, 'w:start', String(entry.start)) || anyChanged;
    }

    if (entry.alignment != null) anyChanged = mutateLevelAlignment(lvlEl, entry.alignment) || anyChanged;
    if (entry.indents != null) anyChanged = mutateLevelIndents(lvlEl, entry.indents) || anyChanged;
    if (entry.trailingCharacter != null)
      anyChanged = mutateLevelTrailingCharacter(lvlEl, entry.trailingCharacter) || anyChanged;
    if (entry.markerFont != null) anyChanged = mutateLevelMarkerFont(lvlEl, entry.markerFont) || anyChanged;
    if (entry.pictureBulletId != null)
      anyChanged = mutateLevelPictureBulletId(lvlEl, entry.pictureBulletId) || anyChanged;
  }

  return { changed: anyChanged };
}

// ──────────────────────────────────────────────────────────────────────────────
// Preset Catalog
// ──────────────────────────────────────────────────────────────────────────────

const ORDERED_PRESET_CONFIG = {
  decimal: { numFmt: 'decimal', lvlTextSuffix: '.' },
  decimalParenthesis: { numFmt: 'decimal', lvlTextSuffix: ')' },
  lowerLetter: { numFmt: 'lowerLetter', lvlTextSuffix: '.' },
  upperLetter: { numFmt: 'upperLetter', lvlTextSuffix: '.' },
  lowerRoman: { numFmt: 'lowerRoman', lvlTextSuffix: '.' },
  upperRoman: { numFmt: 'upperRoman', lvlTextSuffix: '.' },
};

const BULLET_PRESET_CONFIG = {
  disc: { markerText: '\u2022', fontFamily: 'Symbol' },
  circle: { markerText: 'o', fontFamily: 'Courier New' },
  square: { markerText: '\uF0A7', fontFamily: 'Wingdings' },
  dash: { markerText: '\u2013', fontFamily: 'Calibri' },
};

function buildOrderedPresetTemplate(config) {
  const levels = [];
  for (let ilvl = 0; ilvl <= 8; ilvl++) {
    levels.push({
      level: ilvl,
      numFmt: config.numFmt,
      lvlText: `%${ilvl + 1}${config.lvlTextSuffix}`,
      start: 1,
      alignment: 'left',
      indents: { left: INDENT_PER_LEVEL_TWIPS * (ilvl + 1), hanging: HANGING_INDENT_TWIPS },
    });
  }
  return { version: /** @type {1} */ (1), levels };
}

function buildBulletPresetTemplate(config) {
  const levels = [];
  for (let ilvl = 0; ilvl <= 8; ilvl++) {
    levels.push({
      level: ilvl,
      numFmt: 'bullet',
      lvlText: config.markerText,
      start: 1,
      alignment: 'left',
      markerFont: config.fontFamily,
      indents: { left: INDENT_PER_LEVEL_TWIPS * (ilvl + 1), hanging: HANGING_INDENT_TWIPS },
    });
  }
  return { version: /** @type {1} */ (1), levels };
}

/** @type {Record<string, { version: 1, levels: Array<Object> }>} */
const PRESET_TEMPLATES = {};

for (const [id, config] of Object.entries(ORDERED_PRESET_CONFIG)) {
  PRESET_TEMPLATES[id] = buildOrderedPresetTemplate(config);
}
for (const [id, config] of Object.entries(BULLET_PRESET_CONFIG)) {
  PRESET_TEMPLATES[id] = buildBulletPresetTemplate(config);
}

function getPresetTemplate(presetId) {
  return PRESET_TEMPLATES[presetId];
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

export const LevelFormattingHelpers = {
  // Read
  readLevelProperties,
  findLevelElement,
  hasLevel,

  // Single-level composite setters
  setLevelNumberingFormat,
  setLevelBulletMarker,
  setLevelPictureBulletId,
  setLevelAlignment,
  setLevelIndents,
  setLevelTrailingCharacter,
  setLevelMarkerFont,

  // Override clearing
  hasLevelOverride,
  clearLevelOverride,

  // Template operations
  captureTemplate,
  applyTemplateToAbstract,

  // Preset catalog
  getPresetTemplate,
  PRESET_TEMPLATES,
};
