/**
 * Pure transforms for numbering model mutations.
 *
 * These functions take a `NumberingModel` (same shape as `converter.numbering`)
 * and mutate it in place. They never access `editor`, never emit events, and
 * never touch the XML tree directly.
 *
 * Callers must:
 *   1. Run the transform inside a `mutatePart` callback
 *   2. Call `syncNumberingToXmlTree()` after the transform
 *   3. Let `afterCommit` handle event emission and cache rebuild
 */

import { baseBulletList, baseOrderedListDef } from '../../helpers/baseListDefinitions.js';
import type { OrderedListStyle } from '../../../extensions/types/paragraph-commands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * SD-3240: OOXML element subtree as held inside `NumberingModel`
 * records. Recursive; each element has an optional name, attributes
 * map, and nested children.
 */
export interface NumberingElement {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: NumberingElement[];
  [key: string]: unknown;
}

/**
 * SD-3240: minimal shape internal callers read from numbering
 * abstract / definition records. The OOXML element tree lives at
 * `.elements`; specific tag-level fields are accessed via deeper
 * indexing that callers narrow locally.
 */
export interface NumberingRecord {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: NumberingElement[];
  [key: string]: unknown;
}

export interface NumberingModel {
  // SD-3240: changed from `Record<number, any>` to a structural type
  // with `.elements`. Internal callers read `.elements` to walk the
  // OOXML tree; deeper field access goes through local casts. The
  // change drains the audit findings reachable through
  // `editor.converter.numbering.abstracts` / `.definitions`.
  abstracts: Record<number, NumberingRecord>;
  definitions: Record<number, NumberingRecord>;
}

interface GenerateOptions {
  numId: number;
  listType: string;
  level?: number | null;
  start?: string | null;
  text?: string | null;
  fmt?: string | null;
  markerFontFamily?: string | null;
  bulletStyle?: 'disc' | 'circle' | 'square' | null;
  /**
   * Level (`w:ilvl`) at which to apply `bulletStyle`. Defaults to 0 (top-level).
   * Used when the user changes the bullet style for a nested list item — the
   * override needs to land on the paragraph's actual level.
   */
  bulletStyleLevel?: number | null;
  orderedStyle?: OrderedListStyle | null;
  /**
   * Level (`w:ilvl`) at which to apply `orderedStyle`. Defaults to 0 (top-level).
   * Used when the user changes the ordered style for a nested list item — the
   * override needs to land on the paragraph's actual level, and the lvlText
   * counter index (`%N`) needs to match that level.
   */
  orderedStyleLevel?: number | null;
}

const BULLET_STYLE_CHARS: Record<string, string> = {
  disc: '•',
  circle: '◦',
  square: '▪',
};

const ORDERED_LIST_STYLES: Record<string, { fmt: string; text: string }> = {
  decimal: { fmt: 'decimal', text: '%1.' },
  'decimal-paren': { fmt: 'decimal', text: '%1)' },
  'upper-roman': { fmt: 'upperRoman', text: '%1.' },
  'lower-roman': { fmt: 'lowerRoman', text: '%1.' },
  'upper-alpha': { fmt: 'upperLetter', text: '%1.' },
  'upper-alpha-paren': { fmt: 'upperLetter', text: '%1)' },
  'lower-alpha': { fmt: 'lowerLetter', text: '%1.' },
  'lower-alpha-paren': { fmt: 'lowerLetter', text: '%1)' },
};

/**
 * Default `w:lvlJc` per ordered numFmt, matching Word's own multilevel-list
 * defaults (sampled from a real-world numbering.xml):
 *   decimal / *Letter → left  — single-character or narrow markers stay flush left
 *   *Roman           → right — markers grow with count ("I." → "VIII."), so right-
 *                              justification keeps content aligned at one X.
 */
const DEFAULT_LVL_JC_BY_FMT: Record<string, 'left' | 'right'> = {
  decimal: 'left',
  upperRoman: 'right',
  lowerRoman: 'right',
  upperLetter: 'left',
  lowerLetter: 'left',
};

/**
 * Default `w:ind w:hanging` per ordered numFmt, paired with the lvlJc above.
 * Word ships left-justified levels with a wider hanging (so the marker fits
 * inside it without overflow) and right-justified levels with a narrower one
 * (because the marker right-anchors at indent.left and extends leftward
 * regardless of the hanging value). Sourced from the same reference doc.
 *
 * Values are in twips. Refreshing this together with `lvlJc` is essential —
 * leaving e.g. `hanging=180` (the right-just default) on a level we just
 * switched to a left-just numFmt causes content drift, because narrow markers
 * land within the hanging zone but wider ones overflow it (sending the
 * overflow path's per-marker fallback into action).
 */
const DEFAULT_HANGING_BY_FMT: Record<string, number> = {
  decimal: 360,
  upperRoman: 180,
  lowerRoman: 180,
  upperLetter: 360,
  lowerLetter: 360,
};

interface GenerateResult {
  numId: number;
  abstractId: number;
  abstractDef: any;
  numDef: any;
}

// ---------------------------------------------------------------------------
// ID Allocation
// ---------------------------------------------------------------------------

function getNextId(group: Record<number, unknown>): number {
  const intKeys = Object.keys(group)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n));
  return intKeys.length ? Math.max(...intKeys) + 1 : 1;
}

// ---------------------------------------------------------------------------
// Basic building block
// ---------------------------------------------------------------------------

function buildNumDef(numId: number, abstractId: number): any {
  return {
    type: 'element',
    name: 'w:num',
    attributes: { 'w:numId': String(numId) },
    elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractId) } }],
  };
}

/**
 * Generate an 8-hex-digit identifier suitable for `w:nsid` / `w:tmpl`.
 *
 * Word uses `w:nsid` as the logical identity of an abstract numbering definition.
 * Two abstracts with the same `w:nsid` are treated as the same list, so any new
 * abstract we synthesize at runtime must carry a fresh value — otherwise styles
 * applied to a second list collapse onto the first when the doc is opened in Word.
 */
function generateAbstractIdentityHex(): string {
  let hex = '';
  for (let i = 0; i < 8; i += 1) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex.toUpperCase();
}

/**
 * Replace the `w:nsid` and `w:tmpl` values inside a cloned abstract with fresh
 * hex identifiers so the new abstract has its own logical identity.
 */
function refreshAbstractIdentity(abstractDef: any): void {
  if (!abstractDef?.elements?.length) return;
  for (const el of abstractDef.elements) {
    if (el?.name === 'w:nsid' && el.attributes) {
      el.attributes['w:val'] = generateAbstractIdentityHex();
    } else if (el?.name === 'w:tmpl' && el.attributes) {
      el.attributes['w:val'] = generateAbstractIdentityHex();
    }
  }
}

// ---------------------------------------------------------------------------
// Pure transforms
// ---------------------------------------------------------------------------

/**
 * Generate a new abstract + num definition and add them to the model.
 */
export function generateNewListDefinition(numbering: NumberingModel, options: GenerateOptions): GenerateResult {
  let { listType } = options;
  const {
    numId,
    level,
    start,
    text,
    fmt,
    markerFontFamily,
    bulletStyle,
    bulletStyleLevel,
    orderedStyle,
    orderedStyleLevel,
  } = options;
  if (typeof listType !== 'string') listType = (listType as any).name;

  const definition = listType === 'orderedList' ? baseOrderedListDef : baseBulletList;
  let skipAddingNewAbstract = false;

  let newAbstractId = getNextId(numbering.abstracts);
  let newAbstractDef = JSON.parse(
    JSON.stringify({
      ...definition,
      attributes: { ...definition.attributes, 'w:abstractNumId': String(newAbstractId) },
    }),
  );
  // The base templates carry fixed `w:nsid` / `w:tmpl` values. Word treats those
  // as the logical identity of an abstract — two abstracts sharing an `nsid` are
  // collapsed when the document is opened. Freshen them per clone so each new
  // list has its own identity (e.g. style swaps on later list items remain
  // visually distinct in Word).
  refreshAbstractIdentity(newAbstractDef);

  // Override the bullet style for the new list if a bullet style is provided.
  // The override lands at `bulletStyleLevel` (default level 0). Targeting a
  // specific level keeps nested-item style swaps coherent with the paragraph's
  // existing nesting depth.
  const shouldOverrideBulletStyle = bulletStyle && listType !== 'orderedList';
  if (shouldOverrideBulletStyle) {
    const char = BULLET_STYLE_CHARS[bulletStyle];
    const targetLevel = String(
      Math.max(0, Number.isFinite(bulletStyleLevel as number) ? (bulletStyleLevel as number) : 0),
    );

    if (char) {
      const lvl = newAbstractDef.elements.find(
        (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === targetLevel,
      );

      if (lvl) {
        const lvlText = lvl.elements.find((el: any) => el.name === 'w:lvlText');
        if (lvlText) lvlText.attributes['w:val'] = char;

        // Remove any inherited font so the Unicode char renders in the document's default font
        const rPr = lvl.elements.find((el: any) => el.name === 'w:rPr');
        if (rPr) rPr.elements = rPr.elements.filter((el: any) => el.name !== 'w:rFonts');
      }
    }
  }

  // Override the ordered list style for the new list if an ordered style is provided.
  // The override lands at `orderedStyleLevel` (default level 0). Targeting a specific
  // level keeps nested-item style swaps coherent with the paragraph's existing nesting
  // depth — without this, applying e.g. upper-roman to a level-1 item would only modify
  // level 0 of the new abstract and the rendered marker would not change.
  const shouldOverrideOrderedStyle = orderedStyle && listType === 'orderedList';
  if (shouldOverrideOrderedStyle) {
    const styleConfig = ORDERED_LIST_STYLES[orderedStyle];

    if (styleConfig) {
      const targetLevel = Math.max(0, Number.isFinite(orderedStyleLevel as number) ? (orderedStyleLevel as number) : 0);
      const targetLevelStr = String(targetLevel);
      const lvl = newAbstractDef.elements.find(
        (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === targetLevelStr,
      );

      if (lvl) {
        const numFmt = lvl.elements.find((el: any) => el.name === 'w:numFmt');
        if (numFmt) numFmt.attributes['w:val'] = styleConfig.fmt;

        const lvlText = lvl.elements.find((el: any) => el.name === 'w:lvlText');
        if (lvlText) {
          // OOXML `%N` references counter level N-1, so at ilvl=N the lvlText needs `%(N+1)`.
          // Preserve the style's suffix (e.g. ".", ")") so paren styles stay paren.
          lvlText.attributes['w:val'] = `%${targetLevel + 1}${styleConfig.text.replace(/^%\d+/, '')}`;
        }

        // Refresh lvlJc + hanging in lockstep with the new numFmt (Word's
        // multilevel defaults: decimal/letter → left/360, roman → right/180).
        // Setting only one of them leaves a level that can drift (e.g. left-
        // just numFmt with hanging=180 overflows for wider markers).
        const defaultLvlJc = DEFAULT_LVL_JC_BY_FMT[styleConfig.fmt];
        if (defaultLvlJc) {
          const lvlJc = lvl.elements.find((el: any) => el.name === 'w:lvlJc');
          if (lvlJc) {
            lvlJc.attributes['w:val'] = defaultLvlJc;
          } else {
            lvl.elements.push({ type: 'element', name: 'w:lvlJc', attributes: { 'w:val': defaultLvlJc } });
          }
        }

        const defaultHanging = DEFAULT_HANGING_BY_FMT[styleConfig.fmt];
        if (defaultHanging != null) {
          let pPr = lvl.elements.find((el: any) => el.name === 'w:pPr');
          if (!pPr) {
            pPr = { type: 'element', name: 'w:pPr', elements: [] };
            lvl.elements.push(pPr);
          }
          if (!pPr.elements) pPr.elements = [];
          let ind = pPr.elements.find((el: any) => el.name === 'w:ind');
          if (!ind) {
            ind = { type: 'element', name: 'w:ind', attributes: { 'w:hanging': String(defaultHanging) } };
            pPr.elements.push(ind);
          } else {
            ind.attributes = { ...(ind.attributes || {}), 'w:hanging': String(defaultHanging) };
          }
        }
      }
    }
  }

  if (level != null && start != null && text != null && fmt != null) {
    if (numbering.definitions[numId]) {
      // SD-3240: attribute values are typed as `unknown` (OOXML attrs
      // can be any primitive). Cast to number for indexing into the
      // typed `abstracts` map.
      const abstractId = numbering.definitions[numId]?.elements?.[0]?.attributes?.['w:val'] as number;
      newAbstractId = abstractId;
      const abstract = numbering.abstracts[abstractId];
      newAbstractDef = { ...abstract };
      skipAddingNewAbstract = true;
    }

    const levelDefIndex = newAbstractDef.elements.findIndex(
      (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === level,
    );
    const levelProps = newAbstractDef.elements[levelDefIndex];
    const elToFilter = ['w:numFmt', 'w:lvlText', 'w:start'];
    const oldElements = levelProps.elements.filter((el: any) => !elToFilter.includes(el.name));
    levelProps.elements = [
      ...oldElements,
      { type: 'element', name: 'w:start', attributes: { 'w:val': start } },
      { type: 'element', name: 'w:numFmt', attributes: { 'w:val': fmt } },
      { type: 'element', name: 'w:lvlText', attributes: { 'w:val': text } },
    ];
    if (markerFontFamily) {
      const rPrIndex = levelProps.elements.findIndex((el: any) => el.name === 'w:rPr');
      let rPr = levelProps.elements[rPrIndex];
      if (!rPr) {
        rPr = { type: 'element', name: 'w:rPr', elements: [] };
        levelProps.elements.push(rPr);
      }
      rPr.elements = rPr.elements.filter((el: any) => el.name !== 'w:rFonts');
      rPr.elements.push({
        type: 'element',
        name: 'w:rFonts',
        attributes: {
          'w:ascii': markerFontFamily,
          'w:hAnsi': markerFontFamily,
          'w:eastAsia': markerFontFamily,
          'w:cs': markerFontFamily,
        },
      });
    }
  }

  if (!skipAddingNewAbstract) numbering.abstracts[newAbstractId] = newAbstractDef;

  const newNumDef = buildNumDef(numId, newAbstractId);
  numbering.definitions[numId] = newNumDef;

  return { numId, abstractId: newAbstractId, abstractDef: newAbstractDef, numDef: newNumDef };
}

/**
 * Clone an abstract and create a new num definition pointing to the clone.
 * Falls back to `generateNewListDefinition` if the source abstract is missing.
 */
export function changeNumIdSameAbstract(
  numbering: NumberingModel,
  numId: number,
  level: number,
  listType: string,
): { newNumId: number; generated: boolean } {
  const newId = getNextId(numbering.definitions);

  const def = numbering.definitions[numId];
  const abstractId = def?.elements?.find((el: NumberingElement) => el.name === 'w:abstractNumId')?.attributes?.[
    'w:val'
  ] as number | undefined;
  const abstract = abstractId != null ? numbering.abstracts[abstractId] : undefined;

  if (!abstract) {
    generateNewListDefinition(numbering, { numId: newId, listType });
    return { newNumId: newId, generated: true };
  }

  const newAbstractId = getNextId(numbering.abstracts);
  const newAbstractDef = JSON.parse(
    JSON.stringify({
      ...abstract,
      attributes: { ...(abstract.attributes || {}), 'w:abstractNumId': String(newAbstractId) },
    }),
  );
  // See `generateNewListDefinition` — duplicate `w:nsid` collapses lists in Word.
  refreshAbstractIdentity(newAbstractDef);
  numbering.abstracts[newAbstractId] = newAbstractDef;

  const newNumDef = buildNumDef(newId, newAbstractId);
  numbering.definitions[newId] = newNumDef;

  return { newNumId: newId, generated: false };
}

/**
 * Remove a list definition (num + its abstract) from the model.
 */
export function removeListDefinitions(numbering: NumberingModel, listId: number): void {
  const def = numbering.definitions[listId];
  if (!def) return;

  const abstractId = def.elements?.[0]?.attributes?.['w:val'] as number | undefined;
  delete numbering.definitions[listId];
  if (abstractId != null) delete numbering.abstracts[abstractId];
}

/**
 * Set or update a lvlOverride entry on a num definition.
 */
export function setLvlOverride(
  numbering: NumberingModel,
  numId: number,
  ilvl: number,
  overrides: { startOverride?: number; lvlRestart?: number | null },
): boolean {
  const numDef = numbering.definitions[numId];
  if (!numDef) return false;

  const ilvlStr = String(ilvl);
  if (!numDef.elements) numDef.elements = [];

  let overrideEl = numDef.elements.find(
    (el: any) => el.name === 'w:lvlOverride' && el.attributes?.['w:ilvl'] === ilvlStr,
  );
  if (!overrideEl) {
    overrideEl = { type: 'element', name: 'w:lvlOverride', attributes: { 'w:ilvl': ilvlStr }, elements: [] };
    numDef.elements.push(overrideEl);
  }
  if (!overrideEl.elements) overrideEl.elements = [];

  if (overrides.startOverride != null) {
    const startEl = overrideEl.elements.find((el: any) => el.name === 'w:startOverride');
    if (startEl) {
      startEl.attributes['w:val'] = String(overrides.startOverride);
    } else {
      overrideEl.elements.push({
        type: 'element',
        name: 'w:startOverride',
        attributes: { 'w:val': String(overrides.startOverride) },
      });
    }
  }

  if ('lvlRestart' in overrides) {
    let lvlEl = overrideEl.elements.find((el: any) => el.name === 'w:lvl');
    if (!lvlEl) {
      lvlEl = { type: 'element', name: 'w:lvl', attributes: { 'w:ilvl': ilvlStr }, elements: [] };
      overrideEl.elements.push(lvlEl);
    }
    if (!lvlEl.elements) lvlEl.elements = [];

    if (overrides.lvlRestart === null) {
      lvlEl.elements = lvlEl.elements.filter((el: any) => el.name !== 'w:lvlRestart');
    } else {
      const restartEl = lvlEl.elements.find((el: any) => el.name === 'w:lvlRestart');
      if (restartEl) {
        restartEl.attributes['w:val'] = String(overrides.lvlRestart);
      } else {
        lvlEl.elements.push({
          type: 'element',
          name: 'w:lvlRestart',
          attributes: { 'w:val': String(overrides.lvlRestart) },
        });
      }
    }
  }

  return true;
}

/**
 * Remove a lvlOverride entry from a num definition.
 */
export function removeLvlOverride(numbering: NumberingModel, numId: number, ilvl: number): boolean {
  const numDef = numbering.definitions[numId];
  if (!numDef?.elements) return false;

  const ilvlStr = String(ilvl);
  const idx = numDef.elements.findIndex(
    (el: any) => el.name === 'w:lvlOverride' && el.attributes?.['w:ilvl'] === ilvlStr,
  );
  if (idx === -1) return false;

  numDef.elements.splice(idx, 1);
  return true;
}

/**
 * Create a new num definition pointing to an existing abstract.
 * Optionally copies lvlOverride entries from a source numId.
 */
export function createNumDefinition(
  numbering: NumberingModel,
  abstractNumId: number,
  options: { copyOverridesFrom?: number } = {},
): { numId: number; numDef: any } {
  const numId = getNextId(numbering.definitions);
  const numDef = buildNumDef(numId, abstractNumId);

  if (options.copyOverridesFrom != null) {
    const sourceNumDef = numbering.definitions[options.copyOverridesFrom];
    if (sourceNumDef?.elements) {
      const overrideEls = sourceNumDef.elements.filter((el: any) => el.name === 'w:lvlOverride');
      if (overrideEls.length > 0) {
        numDef.elements = [...numDef.elements, ...JSON.parse(JSON.stringify(overrideEls))];
      }
    }
  }

  numbering.definitions[numId] = numDef;
  return { numId, numDef };
}

/**
 * Set or remove w:lvlRestart on an abstract definition level.
 */
export function setLvlRestartOnAbstract(
  numbering: NumberingModel,
  abstractNumId: number,
  ilvl: number,
  restartAfterLevel: number | null,
): boolean {
  const abstract = numbering.abstracts[abstractNumId];
  if (!abstract?.elements) return false;

  const ilvlStr = String(ilvl);
  const lvlEl = abstract.elements.find((el: any) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === ilvlStr);
  if (!lvlEl) return false;
  if (!lvlEl.elements) lvlEl.elements = [];

  if (restartAfterLevel === null) {
    const before = lvlEl.elements.length;
    lvlEl.elements = lvlEl.elements.filter((el: any) => el.name !== 'w:lvlRestart');
    return lvlEl.elements.length !== before;
  }

  const restartEl = lvlEl.elements.find((el: any) => el.name === 'w:lvlRestart');
  if (restartEl) {
    if (restartEl.attributes['w:val'] === String(restartAfterLevel)) return false;
    restartEl.attributes['w:val'] = String(restartAfterLevel);
  } else {
    lvlEl.elements.push({
      type: 'element',
      name: 'w:lvlRestart',
      attributes: { 'w:val': String(restartAfterLevel) },
    });
  }
  return true;
}

/**
 * Update the bullet/ordered style on a single level of an abstract definition.
 *
 * Returns `true` only when the abstract was actually changed — callers can use that
 * to skip downstream invalidation when the requested style already matches.
 */
export function setLvlStyleOnAbstract(
  numbering: NumberingModel,
  abstractNumId: number,
  ilvl: number,
  options: { bulletStyle?: 'disc' | 'circle' | 'square' | null; orderedStyle?: OrderedListStyle | null },
): boolean {
  const abstract = numbering.abstracts[abstractNumId];
  if (!abstract?.elements) return false;

  const ilvlStr = String(ilvl);
  const lvlEl = abstract.elements.find((el: any) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === ilvlStr);
  if (!lvlEl) return false;
  if (!lvlEl.elements) lvlEl.elements = [];

  const setOrAddChild = (name: string, value: string): boolean => {
    const existing = lvlEl.elements.find((el: any) => el.name === name);
    if (existing) {
      if (existing.attributes?.['w:val'] === value) return false;
      existing.attributes = { ...(existing.attributes || {}), 'w:val': value };
      return true;
    }
    lvlEl.elements.push({ type: 'element', name, attributes: { 'w:val': value } });
    return true;
  };

  // Strip any inherited `w:rFonts` so the marker renders in the document's default font.
  // Required when switching kinds (bullet ↔ ordered) — Symbol/Wingdings on a bullet level
  // would carry over to a numeric marker and warp it into glyphs.
  const stripMarkerFont = (): boolean => {
    const rPr = lvlEl.elements.find((el: any) => el.name === 'w:rPr');
    if (!rPr?.elements?.some((el: any) => el.name === 'w:rFonts')) return false;
    rPr.elements = rPr.elements.filter((el: any) => el.name !== 'w:rFonts');
    return true;
  };

  let numFmtValue: string | null = null;
  let lvlTextValue: string | null = null;
  let lvlJcValue: string | null = null;
  let hangingValue: number | null = null;

  if (options.bulletStyle) {
    const char = BULLET_STYLE_CHARS[options.bulletStyle];
    if (!char) return false;
    numFmtValue = 'bullet';
    lvlTextValue = char;
    // Bullet markers are single-character; the source's lvlJc/hanging carry
    // no meaningful drift. Leave them untouched to avoid clobbering imports.
  } else if (options.orderedStyle) {
    const config = ORDERED_LIST_STYLES[options.orderedStyle];
    if (!config) return false;
    // OOXML `%N` references counter level N-1 (1-indexed from the top), so at ilvl=N we
    // need `%(N+1)`. Preserve the style's suffix (e.g. ".", ")") so paren styles stay paren.
    numFmtValue = config.fmt;
    lvlTextValue = `%${ilvl + 1}${config.text.replace(/^%\d+/, '')}`;
    // Match Word's per-numFmt defaults (decimal/letter → left, roman → right).
    // The source's lvlJc was tied to the PREVIOUS numFmt and is often wrong
    // for the new one. Refresh hanging in lockstep — leaving e.g. hanging=180
    // (the right-just default) on a level switched to a left-just numFmt
    // means narrow markers fit but wider ones overflow → drift.
    lvlJcValue = DEFAULT_LVL_JC_BY_FMT[config.fmt] ?? null;
    hangingValue = DEFAULT_HANGING_BY_FMT[config.fmt] ?? null;
  } else {
    return false;
  }

  // Refresh `w:ind w:hanging` on the level's pPr without touching `w:left`
  // (that's the user's chosen indentation, not part of the marker geometry).
  const setHangingOnLevel = (hanging: number): boolean => {
    let pPr = lvlEl.elements.find((el: any) => el.name === 'w:pPr');
    if (!pPr) {
      pPr = { type: 'element', name: 'w:pPr', elements: [] };
      lvlEl.elements.push(pPr);
    }
    if (!pPr.elements) pPr.elements = [];
    let ind = pPr.elements.find((el: any) => el.name === 'w:ind');
    if (!ind) {
      ind = { type: 'element', name: 'w:ind', attributes: { 'w:hanging': String(hanging) } };
      pPr.elements.push(ind);
      return true;
    }
    if (ind.attributes?.['w:hanging'] === String(hanging)) return false;
    ind.attributes = { ...(ind.attributes || {}), 'w:hanging': String(hanging) };
    return true;
  };

  let changed = false;
  if (setOrAddChild('w:numFmt', numFmtValue)) changed = true;
  if (setOrAddChild('w:lvlText', lvlTextValue)) changed = true;
  if (lvlJcValue != null && setOrAddChild('w:lvlJc', lvlJcValue)) changed = true;
  if (hangingValue != null && setHangingOnLevel(hangingValue)) changed = true;
  if (stripMarkerFont()) changed = true;
  return changed;
}

/**
 * Deep-clone the abstract a `sourceNumId` points to, apply a style override at the given
 * level, and register both the cloned abstract and a fresh num definition that points to
 * it. Returns the new num/abstract IDs (or `null` if the source is missing).
 *
 * Used by toggle-list paths that need PM-tracked undo: callers migrate paragraphs from
 * the source num to the new num via `setNodeMarkup`, so reversing the markup steps
 * naturally reverts the style change — the source abstract is never touched.
 */
export function cloneListDefinitionWithLevelStyle(
  numbering: NumberingModel,
  sourceNumId: number,
  ilvl: number,
  options: { bulletStyle?: 'disc' | 'circle' | 'square' | null; orderedStyle?: OrderedListStyle | null },
): { newNumId: number; newAbstractId: number } | null {
  const sourceNumDef = numbering.definitions[sourceNumId];
  const sourceAbstractIdRaw = sourceNumDef?.elements?.find((el: any) => el.name === 'w:abstractNumId')?.attributes?.[
    'w:val'
  ];
  const sourceAbstractId = sourceAbstractIdRaw != null ? Number(sourceAbstractIdRaw) : NaN;
  const sourceAbstract = Number.isFinite(sourceAbstractId) ? numbering.abstracts[sourceAbstractId] : undefined;
  if (!sourceAbstract) return null;

  const newAbstractId = getNextId(numbering.abstracts);
  const newAbstractDef = JSON.parse(JSON.stringify(sourceAbstract));
  newAbstractDef.attributes = {
    ...(newAbstractDef.attributes || {}),
    'w:abstractNumId': String(newAbstractId),
  };
  // Refresh `w:nsid` / `w:tmpl` so the cloned abstract has its own logical
  // identity. Without this, Word treats matching `w:nsid` values as the same
  // logical list and can collapse the restyled clone back onto the source list
  // when the document is re-opened (i.e. style changes silently revert).
  refreshAbstractIdentity(newAbstractDef);
  numbering.abstracts[newAbstractId] = newAbstractDef;

  setLvlStyleOnAbstract(numbering, newAbstractId, ilvl, options);

  const newNumId = getNextId(numbering.definitions);
  numbering.definitions[newNumId] = buildNumDef(newNumId, newAbstractId);

  return { newNumId, newAbstractId };
}

// Re-export ID allocation for external callers that need just IDs
export { getNextId as getNextNumberingId };
