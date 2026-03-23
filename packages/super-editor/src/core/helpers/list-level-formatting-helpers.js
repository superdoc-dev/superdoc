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
 * @returns {{ level: number, numFmt?: string, lvlText?: string, start?: number, alignment?: string, indents?: { left?: number, hanging?: number, firstLine?: number }, trailingCharacter?: string, markerFont?: string, pictureBulletId?: number, tabStopAt?: number }}
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

  // Read tab stop from w:pPr/w:tabs/w:tab within w:lvl
  const tabStopVal = readLevelTabStop(pPr);
  if (tabStopVal != null) props.tabStopAt = tabStopVal;

  const rPr = lvlEl.elements?.find((el) => el.name === 'w:rPr');
  const rFonts = rPr?.elements?.find((el) => el.name === 'w:rFonts');
  if (rFonts?.attributes?.['w:ascii']) {
    props.markerFont = rFonts.attributes['w:ascii'];
  }

  return props;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab Stop Read/Write Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read the first tab stop position from a `w:pPr` element.
 * List-level tab stops are stored in `w:pPr/w:tabs/w:tab` within the `w:lvl`.
 * @param {Object | undefined} pPr
 * @returns {number | undefined}
 */
function readLevelTabStop(pPr) {
  if (!pPr?.elements) return undefined;
  const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
  if (!tabs?.elements) return undefined;
  const tab = tabs.elements.find((el) => el.name === 'w:tab');
  if (!tab?.attributes?.['w:pos']) return undefined;
  return Number(tab.attributes['w:pos']);
}

/**
 * Set or remove the list-level tab stop.
 * @param {Object} lvlEl - The `w:lvl` element.
 * @param {number | null} value - Position in twips, or null to remove.
 * @returns {boolean} True if anything changed.
 */
function mutateLevelTabStop(lvlEl, value) {
  const pPr = findOrCreateChild(lvlEl, 'w:pPr');

  if (value === null) {
    // Remove the tab stop
    const tabsIdx = pPr.elements.findIndex((el) => el.name === 'w:tabs');
    if (tabsIdx === -1) return false;
    pPr.elements.splice(tabsIdx, 1);
    return true;
  }

  const tabs = findOrCreateChild(pPr, 'w:tabs');
  const existing = tabs.elements.find((el) => el.name === 'w:tab');
  const posStr = String(value);

  if (existing) {
    if (existing.attributes?.['w:pos'] === posStr && existing.attributes?.['w:val'] === 'num') return false;
    existing.attributes = { ...existing.attributes, 'w:val': 'num', 'w:pos': posStr };
    return true;
  }

  tabs.elements.push({
    type: 'element',
    name: 'w:tab',
    attributes: { 'w:val': 'num', 'w:pos': posStr },
  });
  return true;
}

/**
 * Composite setter: resolve abstract + level, then mutate tab stop.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {number | null} value
 * @returns {boolean}
 */
function setLevelTabStop(editor, abstractNumId, ilvl, value) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelTabStop(resolved.lvlEl, value);
}

// ──────────────────────────────────────────────────────────────────────────────
// Marker-Mode Normalization Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Clear the `w:lvlPicBulletId` element from a level if it exists.
 * Used for marker-mode normalization when switching away from picture bullets.
 * @param {Object} lvlEl
 * @returns {boolean} True if an element was removed.
 */
function clearPictureBulletId(lvlEl) {
  if (!lvlEl.elements) return false;
  const idx = lvlEl.elements.findIndex((el) => el.name === 'w:lvlPicBulletId');
  if (idx === -1) return false;
  lvlEl.elements.splice(idx, 1);
  return true;
}

/**
 * Set numFmt only (for setLevelNumberStyle). Rejects 'bullet'.
 * Clears lvlPicBulletId if present (marker-mode normalization).
 * @param {Object} lvlEl
 * @param {string} numFmt
 * @returns {boolean}
 */
function mutateLevelNumberStyle(lvlEl, numFmt) {
  let changed = setChildAttr(lvlEl, 'w:numFmt', numFmt);
  changed = clearPictureBulletId(lvlEl) || changed;
  return changed;
}

/**
 * Composite setter for setLevelNumberStyle.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} numFmt
 * @returns {boolean}
 */
function setLevelNumberStyle(editor, abstractNumId, ilvl, numFmt) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return mutateLevelNumberStyle(resolved.lvlEl, numFmt);
}

/**
 * Set lvlText only (for setLevelText).
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {string} text
 * @returns {boolean}
 */
function setLevelText(editor, abstractNumId, ilvl, text) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return setChildAttr(resolved.lvlEl, 'w:lvlText', text);
}

/**
 * Set start value only (for setLevelStart).
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {number} start
 * @returns {boolean}
 */
function setLevelStart(editor, abstractNumId, ilvl, start) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return false;
  return setChildAttr(resolved.lvlEl, 'w:start', String(start));
}

/**
 * Apply a partial level-style object to a raw `w:lvl` element.
 * This preserves unspecified properties already present on the level.
 *
 * @param {Object} lvlEl
 * @param {Object} entry
 * @returns {boolean}
 */
function applyLevelPropertiesToElement(lvlEl, entry) {
  let changed = false;

  if (entry.numFmt != null || entry.lvlText != null) {
    const fmtParams = {};
    if (entry.numFmt != null) fmtParams.numFmt = entry.numFmt;
    if (entry.lvlText != null) fmtParams.lvlText = entry.lvlText;
    if (entry.start != null) fmtParams.start = entry.start;

    if (fmtParams.numFmt != null && fmtParams.lvlText != null) {
      changed = mutateLevelNumberingFormat(lvlEl, fmtParams) || changed;
    } else {
      if (fmtParams.numFmt != null) changed = setChildAttr(lvlEl, 'w:numFmt', fmtParams.numFmt) || changed;
      if (fmtParams.lvlText != null) changed = setChildAttr(lvlEl, 'w:lvlText', fmtParams.lvlText) || changed;
      if (fmtParams.start != null) changed = setChildAttr(lvlEl, 'w:start', String(fmtParams.start)) || changed;
    }
  } else if (entry.start != null) {
    changed = setChildAttr(lvlEl, 'w:start', String(entry.start)) || changed;
  }

  if (entry.alignment != null) changed = mutateLevelAlignment(lvlEl, entry.alignment) || changed;
  if (entry.indents != null) changed = mutateLevelIndents(lvlEl, entry.indents) || changed;
  if (entry.trailingCharacter != null)
    changed = mutateLevelTrailingCharacter(lvlEl, entry.trailingCharacter) || changed;
  if (entry.markerFont != null) changed = mutateLevelMarkerFont(lvlEl, entry.markerFont) || changed;
  if (entry.pictureBulletId != null) changed = mutateLevelPictureBulletId(lvlEl, entry.pictureBulletId) || changed;
  if (entry.tabStopAt !== undefined) changed = mutateLevelTabStop(lvlEl, entry.tabStopAt) || changed;

  return changed;
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

/**
 * Fold formatting from `w:lvlOverride/w:lvl` into the target abstract level,
 * then remove only the `w:lvl` child while preserving any `w:startOverride`.
 *
 * This lets sequence-local style edits operate on the effective visible style
 * without dropping restart state stored on the numbering instance.
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} numId
 * @param {number} ilvl
 * @returns {boolean}
 */
function materializeLevelFormattingOverride(editor, abstractNumId, numId, ilvl) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  const numDef = editor.converter.numbering?.definitions?.[numId];
  if (!resolved || !numDef?.elements) return false;

  const ilvlStr = String(ilvl);
  const overrideIndex = numDef.elements.findIndex(
    (el) => el.name === 'w:lvlOverride' && el.attributes?.['w:ilvl'] === ilvlStr,
  );
  if (overrideIndex === -1) return false;

  const overrideEl = numDef.elements[overrideIndex];
  if (!overrideEl?.elements) return false;

  const lvlIndex = overrideEl.elements.findIndex((el) => el.name === 'w:lvl');
  if (lvlIndex === -1) return false;

  const lvlEl = overrideEl.elements[lvlIndex];
  const props = readLevelProperties(lvlEl, ilvl);
  const abstractChanged = applyLevelPropertiesToElement(resolved.lvlEl, props);
  const lvlRestartElements =
    lvlEl.elements?.filter((el) => el.name === 'w:lvlRestart').map((el) => deepCloneElement(el)) ?? [];

  overrideEl.elements.splice(lvlIndex, 1);
  if (lvlRestartElements.length > 0) {
    overrideEl.elements.push({
      type: 'element',
      name: 'w:lvl',
      attributes: { 'w:ilvl': ilvlStr },
      elements: lvlRestartElements,
    });
  }

  let overrideChanged = true;
  if (overrideEl.elements.length === 0) {
    numDef.elements.splice(overrideIndex, 1);
  }

  return abstractChanged || overrideChanged;
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
    anyChanged = applyLevelPropertiesToElement(lvlEl, entry) || anyChanged;
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
// Layout Composite Mutation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apply dialog-shaped layout properties to a level element.
 *
 * Indent mapping:
 *   textIndentAt  → w:ind/@w:left
 *   alignedAt     → derives w:ind/@w:hanging = textIndentAt - alignedAt
 *
 * Partial-update: omitted fields are untouched.
 * Only tabStopAt accepts explicit null (remove).
 *
 * @param {Object} lvlEl
 * @param {{ alignment?: string, alignedAt?: number, textIndentAt?: number, followCharacter?: string, tabStopAt?: number | null }} layout
 * @returns {{ changed: boolean, error?: string }}
 */
function mutateLevelLayout(lvlEl, layout) {
  let changed = false;

  // Alignment
  if (layout.alignment != null) {
    changed = mutateLevelAlignment(lvlEl, layout.alignment) || changed;
  }

  // Trailing character (followCharacter)
  if (layout.followCharacter != null) {
    changed = mutateLevelTrailingCharacter(lvlEl, layout.followCharacter) || changed;
  }

  // Tab stop
  if (layout.tabStopAt !== undefined) {
    changed = mutateLevelTabStop(lvlEl, layout.tabStopAt) || changed;
  }

  // Indents (dialog → OOXML conversion)
  const hasAlignedAt = layout.alignedAt != null;
  const hasTextIndentAt = layout.textIndentAt != null;

  if (hasAlignedAt || hasTextIndentAt) {
    const pPr = lvlEl.elements?.find((el) => el.name === 'w:pPr');
    const ind = pPr?.elements?.find((el) => el.name === 'w:ind');
    const existingLeft = ind?.attributes?.['w:left'] != null ? Number(ind.attributes['w:left']) : undefined;
    const existingHanging = ind?.attributes?.['w:hanging'] != null ? Number(ind.attributes['w:hanging']) : undefined;
    const existingFirstLine =
      ind?.attributes?.['w:firstLine'] != null ? Number(ind.attributes['w:firstLine']) : undefined;

    // Compute existing alignedAt from current indent state
    let existingAlignedAt;
    if (existingLeft != null) {
      if (existingHanging != null) {
        existingAlignedAt = existingLeft - existingHanging;
      } else if (existingFirstLine != null) {
        existingAlignedAt = existingLeft + existingFirstLine;
      } else {
        existingAlignedAt = existingLeft;
      }
    }

    let newLeft, newHanging;

    if (hasAlignedAt && hasTextIndentAt) {
      newLeft = layout.textIndentAt;
      newHanging = layout.textIndentAt - layout.alignedAt;
    } else if (hasTextIndentAt) {
      newLeft = layout.textIndentAt;
      newHanging = existingAlignedAt != null ? layout.textIndentAt - existingAlignedAt : 0;
    } else if (hasAlignedAt) {
      if (existingLeft == null) {
        return { changed, error: 'INVALID_INPUT' };
      }
      newLeft = existingLeft;
      newHanging = existingLeft - layout.alignedAt;
    }

    if (newLeft != null) {
      // Always normalize to hanging (remove firstLine if present)
      const indents = { left: newLeft, hanging: newHanging ?? 0 };
      changed = mutateLevelIndents(lvlEl, indents) || changed;
    }
  }

  return { changed };
}

/**
 * Composite setter for setLevelLayout.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {{ alignment?: string, alignedAt?: number, textIndentAt?: number, followCharacter?: string, tabStopAt?: number | null }} layout
 * @returns {{ changed: boolean, error?: string }}
 */
function setLevelLayout(editor, abstractNumId, ilvl, layout) {
  const resolved = resolveAbstractLevel(editor, abstractNumId, ilvl);
  if (!resolved) return { changed: false };
  return mutateLevelLayout(resolved.lvlEl, layout);
}

// ──────────────────────────────────────────────────────────────────────────────
// Effective Style Capture (abstract + lvlOverride merge)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Capture the effective style of a list: abstract definition properties merged
 * with any instance-level lvlOverride formatting. Excludes startOverride
 * (sequence state, not style).
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} numId
 * @param {number[] | undefined} levels
 * @returns {{ version: 1, levels: Array<Object> } | null}
 */
function captureEffectiveStyle(editor, abstractNumId, numId, levels) {
  const abstract = editor.converter.numbering?.abstracts?.[abstractNumId];
  if (!abstract?.elements) return null;

  const numDef = editor.converter.numbering?.definitions?.[numId];
  const overridesByLevel = buildOverrideMap(numDef);

  const lvlElements = abstract.elements.filter((el) => el.name === 'w:lvl');
  const captured = [];

  for (const lvlEl of lvlElements) {
    const ilvl = Number(lvlEl.attributes?.['w:ilvl']);
    if (levels && !levels.includes(ilvl)) continue;

    const baseProps = readLevelProperties(lvlEl, ilvl);

    // Merge lvlOverride formatting (not startOverride) from the num definition
    const overrideLvl = overridesByLevel.get(ilvl);
    if (overrideLvl) {
      const overrideProps = readLevelProperties(overrideLvl, ilvl);
      mergeOverrideProps(baseProps, overrideProps);
    }

    captured.push(baseProps);
  }

  captured.sort((a, b) => a.level - b.level);
  return { version: 1, levels: captured };
}

/**
 * Build a map of level index → w:lvl element from lvlOverride entries.
 * Only includes overrides that contain a w:lvl child (formatting overrides),
 * not those that only contain w:startOverride.
 * @param {Object | undefined} numDef
 * @returns {Map<number, Object>}
 */
function buildOverrideMap(numDef) {
  const map = new Map();
  if (!numDef?.elements) return map;

  for (const el of numDef.elements) {
    if (el.name !== 'w:lvlOverride') continue;
    const ilvl = Number(el.attributes?.['w:ilvl']);
    const lvlChild = el.elements?.find((c) => c.name === 'w:lvl');
    if (lvlChild) {
      map.set(ilvl, lvlChild);
    }
  }

  return map;
}

/**
 * Merge override properties into base properties. Override values take
 * precedence when present (non-undefined).
 * @param {Object} base - Mutable base properties from abstract.
 * @param {Object} override - Properties from lvlOverride w:lvl.
 */
function mergeOverrideProps(base, override) {
  if (override.numFmt != null) base.numFmt = override.numFmt;
  if (override.lvlText != null) base.lvlText = override.lvlText;
  if (override.start != null) base.start = override.start;
  if (override.alignment != null) base.alignment = override.alignment;
  if (override.indents != null) base.indents = { ...base.indents, ...override.indents };
  if (override.trailingCharacter != null) base.trailingCharacter = override.trailingCharacter;
  if (override.markerFont != null) base.markerFont = override.markerFont;
  if (override.pictureBulletId != null) base.pictureBulletId = override.pictureBulletId;
  if (override.tabStopAt != null) base.tabStopAt = override.tabStopAt;
}

// ──────────────────────────────────────────────────────────────────────────────
// Clone-on-Write Helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check whether the given abstractNumId is referenced by any other w:num
 * besides the given numId.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} numId
 * @returns {boolean}
 */
function isAbstractShared(editor, abstractNumId, numId) {
  const definitions = editor.converter.numbering?.definitions;
  if (!definitions) return false;

  for (const [defNumId, numDef] of Object.entries(definitions)) {
    if (Number(defNumId) === numId) continue;
    if (!numDef?.elements) continue;
    const absEl = numDef.elements.find((el) => el.name === 'w:abstractNumId');
    if (absEl && Number(absEl.attributes?.['w:val']) === abstractNumId) {
      return true;
    }
  }
  return false;
}

/**
 * Deep clone an XML element tree (preserves all children, attributes, unknown extensions).
 * @param {Object} element
 * @returns {Object}
 */
function deepCloneElement(element) {
  const clone = { ...element };
  if (element.attributes) {
    clone.attributes = { ...element.attributes };
  }
  if (element.elements) {
    clone.elements = element.elements.map((child) => deepCloneElement(child));
  }
  return clone;
}

/**
 * Clone an abstract definition and return the new abstractNumId.
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} originalAbstractNumId
 * @returns {{ newAbstractNumId: number }}
 */
function cloneAbstractDefinition(editor, originalAbstractNumId) {
  const numbering = editor.converter.numbering;
  const existingAbstractIds = Object.keys(numbering.abstracts).map(Number);
  const newAbstractNumId = existingAbstractIds.length > 0 ? Math.max(...existingAbstractIds) + 1 : 0;

  const original = numbering.abstracts[originalAbstractNumId];
  if (!original) {
    throw new Error(`cloneAbstractDefinition: abstract ${originalAbstractNumId} not found.`);
  }

  const cloned = deepCloneElement(original);
  cloned.attributes = { ...cloned.attributes, 'w:abstractNumId': String(newAbstractNumId) };
  numbering.abstracts[newAbstractNumId] = cloned;

  return { newAbstractNumId };
}

/**
 * Clone an abstract definition and retarget an existing w:num to it.
 * Preserves any lvlOverride/startOverride state on the num definition.
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} originalAbstractNumId
 * @param {number} numId
 * @returns {{ newAbstractNumId: number }}
 */
function cloneAbstractIntoNum(editor, originalAbstractNumId, numId) {
  const numbering = editor.converter.numbering;
  const { newAbstractNumId } = cloneAbstractDefinition(editor, originalAbstractNumId);

  const numDef = numbering.definitions[numId];
  if (!numDef) {
    throw new Error(`cloneAbstractIntoNum: num ${numId} not found.`);
  }
  if (!numDef.elements) numDef.elements = [];

  const abstractNumIdEl = numDef.elements.find((el) => el.name === 'w:abstractNumId');
  if (abstractNumIdEl) {
    abstractNumIdEl.attributes = { ...(abstractNumIdEl.attributes || {}), 'w:val': String(newAbstractNumId) };
  } else {
    numDef.elements.unshift({
      type: 'element',
      name: 'w:abstractNumId',
      attributes: { 'w:val': String(newAbstractNumId) },
    });
  }

  return { newAbstractNumId };
}

/**
 * Copy sequence-state overrides (startOverride and instance lvlRestart) from
 * one num definition to another, intentionally excluding formatting overrides.
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} fromNumId
 * @param {number} toNumId
 * @param {number[] | undefined} levels
 * @returns {boolean}
 */
function copySequenceStateOverrides(editor, fromNumId, toNumId, levels) {
  if (fromNumId === toNumId) return false;

  const sourceNumDef = editor.converter.numbering?.definitions?.[fromNumId];
  const targetNumDef = editor.converter.numbering?.definitions?.[toNumId];
  if (!sourceNumDef?.elements || !targetNumDef) return false;
  if (!targetNumDef.elements) targetNumDef.elements = [];

  const levelSet = levels ? new Set(levels.map((level) => String(level))) : null;
  let changed = false;

  for (const sourceEl of sourceNumDef.elements) {
    if (sourceEl.name !== 'w:lvlOverride') continue;

    const ilvl = sourceEl.attributes?.['w:ilvl'];
    if (ilvl == null) continue;
    if (levelSet && !levelSet.has(ilvl)) continue;

    const nextElements = [];
    for (const child of sourceEl.elements ?? []) {
      if (child.name === 'w:startOverride') {
        nextElements.push(deepCloneElement(child));
        continue;
      }

      if (child.name === 'w:lvl') {
        const lvlRestartElements =
          child.elements
            ?.filter((lvlChild) => lvlChild.name === 'w:lvlRestart')
            .map((lvlChild) => deepCloneElement(lvlChild)) ?? [];
        if (lvlRestartElements.length > 0) {
          nextElements.push({
            type: 'element',
            name: 'w:lvl',
            attributes: { ...(child.attributes || {}), 'w:ilvl': child.attributes?.['w:ilvl'] ?? ilvl },
            elements: lvlRestartElements,
          });
        }
      }
    }

    if (nextElements.length === 0) continue;

    const targetIndex = targetNumDef.elements.findIndex(
      (el) => el.name === 'w:lvlOverride' && el.attributes?.['w:ilvl'] === ilvl,
    );
    const nextOverride = {
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { ...(sourceEl.attributes || {}), 'w:ilvl': ilvl },
      elements: nextElements,
    };

    if (targetIndex === -1) {
      targetNumDef.elements.push(nextOverride);
    } else {
      targetNumDef.elements[targetIndex] = nextOverride;
    }
    changed = true;
  }

  return changed;
}

/**
 * Clone an abstract definition and create a new w:num pointing to it.
 * Returns the new abstractNumId and numId.
 *
 * @param {import('../Editor').Editor} editor
 * @param {number} originalAbstractNumId
 * @param {number} originalNumId
 * @returns {{ newAbstractNumId: number, newNumId: number }}
 */
function cloneAbstractAndNum(editor, originalAbstractNumId, originalNumId) {
  const numbering = editor.converter.numbering;
  const { newAbstractNumId } = cloneAbstractDefinition(editor, originalAbstractNumId);

  // Find next available numId
  const existingNumIds = Object.keys(numbering.definitions).map(Number);
  const newNumId = existingNumIds.length > 0 ? Math.max(...existingNumIds) + 1 : 1;

  // Create new w:num pointing to cloned abstract, copying lvlOverride entries
  const originalNumDef = numbering.definitions[originalNumId];
  const newElements = [
    {
      type: 'element',
      name: 'w:abstractNumId',
      attributes: { 'w:val': String(newAbstractNumId) },
    },
  ];

  // Copy any lvlOverride entries from the original w:num
  if (originalNumDef?.elements) {
    for (const el of originalNumDef.elements) {
      if (el.name === 'w:lvlOverride') {
        newElements.push(deepCloneElement(el));
      }
    }
  }

  numbering.definitions[newNumId] = {
    type: 'element',
    name: 'w:num',
    attributes: { 'w:numId': String(newNumId) },
    elements: newElements,
  };

  return { newAbstractNumId, newNumId };
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
  setLevelTabStop,

  // SD-2025 decomposed setters
  setLevelNumberStyle,
  setLevelText,
  setLevelStart,
  setLevelLayout,

  // Override clearing
  hasLevelOverride,
  clearLevelOverride,
  materializeLevelFormattingOverride,

  // Template operations
  captureTemplate,
  applyTemplateToAbstract,

  // Effective style (abstract + lvlOverride)
  captureEffectiveStyle,

  // Clone-on-write
  isAbstractShared,
  cloneAbstractIntoNum,
  cloneAbstractAndNum,
  copySequenceStateOverrides,

  // Preset catalog
  getPresetTemplate,
  PRESET_TEMPLATES,
};
