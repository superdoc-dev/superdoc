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

export interface NumberingModel {
  abstracts: Record<number, any>;
  definitions: Record<number, any>;
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
  orderedStyle?: OrderedListStyle | null;
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
  'lower-alpha': { fmt: 'lowerLetter', text: '%1.' },
  'lower-alpha-paren': { fmt: 'lowerLetter', text: '%1)' },
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

// ---------------------------------------------------------------------------
// Pure transforms
// ---------------------------------------------------------------------------

/**
 * Generate a new abstract + num definition and add them to the model.
 */
export function generateNewListDefinition(numbering: NumberingModel, options: GenerateOptions): GenerateResult {
  let { listType } = options;
  const { numId, level, start, text, fmt, markerFontFamily, bulletStyle, orderedStyle } = options;
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

  // Override the bullet style for the new list if a bullet style is provided
  const shouldOverrideBulletStyle = bulletStyle && listType !== 'orderedList';
  if (shouldOverrideBulletStyle) {
    const char = BULLET_STYLE_CHARS[bulletStyle];

    if (char) {
      const lvl0 = newAbstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '0');

      if (lvl0) {
        const lvlText = lvl0.elements.find((el: any) => el.name === 'w:lvlText');
        if (lvlText) lvlText.attributes['w:val'] = char;

        // Remove any inherited font so the Unicode char renders in the document's default font
        const rPr = lvl0.elements.find((el: any) => el.name === 'w:rPr');
        if (rPr) rPr.elements = rPr.elements.filter((el: any) => el.name !== 'w:rFonts');
      }
    }
  }

  // Override the ordered list style for the new list if an ordered style is provided
  const shouldOverrideOrderedStyle = orderedStyle && listType === 'orderedList';
  if (shouldOverrideOrderedStyle) {
    const styleConfig = ORDERED_LIST_STYLES[orderedStyle];

    if (styleConfig) {
      const lvl0 = newAbstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '0');

      if (lvl0) {
        const numFmt = lvl0.elements.find((el: any) => el.name === 'w:numFmt');
        if (numFmt) numFmt.attributes['w:val'] = styleConfig.fmt;

        const lvlText = lvl0.elements.find((el: any) => el.name === 'w:lvlText');
        if (lvlText) lvlText.attributes['w:val'] = styleConfig.text;
      }
    }
  }

  if (level != null && start != null && text != null && fmt != null) {
    if (numbering.definitions[numId]) {
      const abstractId = numbering.definitions[numId]?.elements[0]?.attributes['w:val'];
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
  const abstractId = def?.elements?.find((el: any) => el.name === 'w:abstractNumId')?.attributes?.['w:val'];
  const abstract = abstractId != null ? numbering.abstracts[abstractId] : undefined;

  if (!abstract) {
    generateNewListDefinition(numbering, { numId: newId, listType });
    return { newNumId: newId, generated: true };
  }

  const newAbstractId = getNextId(numbering.abstracts);
  const newAbstractDef = {
    ...abstract,
    attributes: { ...(abstract.attributes || {}), 'w:abstractNumId': String(newAbstractId) },
  };
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

  const abstractId = def.elements?.[0]?.attributes?.['w:val'];
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

// Re-export ID allocation for external callers that need just IDs
export { getNextId as getNextNumberingId };
