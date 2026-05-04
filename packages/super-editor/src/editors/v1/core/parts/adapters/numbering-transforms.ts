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
  /**
   * Level (`w:ilvl`) at which to apply `bulletStyle`. Defaults to 0 (top-level).
   * Used when the user changes the bullet style for a nested list item — the
   * override needs to land on the paragraph's actual level, otherwise the
   * paragraph keeps showing whatever marker the base template assigned to that
   * level.
   */
  bulletStyleLevel?: number | null;
}

const BULLET_STYLE_CHARS: Record<string, string> = {
  disc: '•',
  circle: '◦',
  square: '▪',
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
  const { numId, level, start, text, fmt, markerFontFamily, bulletStyle, bulletStyleLevel } = options;
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
