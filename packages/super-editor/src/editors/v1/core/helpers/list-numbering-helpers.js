// @ts-check
import { getStyleTagFromStyleId } from '@core/super-converter/v2/importer/listImporter.js';
import { translator as wAbstractNumTranslator } from '@core/super-converter/v3/handlers/w/abstractNum';
import { translator as wNumTranslator } from '@core/super-converter/v3/handlers/w/num';
import { baseBulletList, baseOrderedListDef } from './baseListDefinitions';
import { updateNumberingProperties } from '@core/commands/changeListLevel';
import { findParentNode } from './findParentNode.js';
import {
  generateNewListDefinition as pureGenerateNewListDefinition,
  changeNumIdSameAbstract as pureChangeNumIdSameAbstract,
  removeListDefinitions as pureRemoveListDefinitions,
  setLvlOverride as pureSetLvlOverride,
  removeLvlOverride as pureRemoveLvlOverride,
  createNumDefinition as pureCreateNumDefinition,
  setLvlRestartOnAbstract as pureSetLvlRestartOnAbstract,
  setLvlStyleOnAbstract as pureSetLvlStyleOnAbstract,
  cloneListDefinitionWithLevelStyle as pureCloneListDefinitionWithLevelStyle,
  getNextNumberingId,
} from '@core/parts/adapters/numbering-transforms';
import { mutateNumbering, mutateNumberingBatch } from '@core/parts/adapters/numbering-mutation';

// ---------------------------------------------------------------------------
// Side-effectful shims (thin wrappers around pure transforms)
//
// These exist for backward compatibility during migration. Callers that
// haven't migrated to `mutateNumbering` yet call these shims. Each shim
// runs the pure transform inside a `mutateNumbering` transaction, which
// handles XML sync, cache rebuild, and event emission via afterCommit.
//
// Shims will be removed as callers migrate in Phases 1b–1d.
// ---------------------------------------------------------------------------

/**
 * Maps a bullet marker character (from `listRendering.markerText`) to its named bullet style.
 * Returns null for unrecognized markers.
 * @param {string|null|undefined} markerText
 * @returns {'disc'|'circle'|'square'|null}
 */
export function markerTextToBulletStyle(markerText) {
  const map = { '•': 'disc', '◦': 'circle', '▪': 'square' };
  return map[markerText] ?? null;
}

/**
 * Map a `(numFmt, markerText)` pair from `listRendering` to a named ordered style.
 * The last char of `markerText` disambiguates suffix variants (e.g. "1." vs "1)").
 * Returns null for combinations not exposed in the toolbar.
 * @param {string|null|undefined} numFmt OOXML numFmt value, e.g. 'decimal', 'upperRoman'.
 * @param {string|null|undefined} markerText
 * @returns {import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null}
 */
export function numberingInfoToOrderedStyle(numFmt, markerText) {
  const suffix = markerText?.slice(-1);
  /** @type {Record<string, Record<string, import('../../extensions/types/paragraph-commands.js').OrderedListStyle>>} */
  const map = {
    decimal: { '.': 'decimal', ')': 'decimal-paren' },
    upperRoman: { '.': 'upper-roman' },
    lowerRoman: { '.': 'lower-roman' },
    upperLetter: { '.': 'upper-alpha', ')': 'upper-alpha-paren' },
    lowerLetter: { '.': 'lower-alpha', ')': 'lower-alpha-paren' },
  };
  return map[numFmt]?.[suffix] ?? null;
}

/**
 * Generate a new list definition for the given list type.
 * @param {Object} param0
 * @param {number} param0.numId
 * @param {Object} param0.listType
 * @param {number} [param0.level]
 * @param {string} [param0.start]
 * @param {string} [param0.text]
 * @param {string} [param0.fmt]
 * @param {string} [param0.markerFontFamily]
 * @param {'disc'|'circle'|'square'|null} [param0.bulletStyle]
 * @param {number} [param0.bulletStyleLevel]
 * @param {import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null} [param0.orderedStyle]
 * @param {number} [param0.orderedStyleLevel]
 * @param {import('../Editor').Editor} param0.editor
 * @returns {Object} The new abstract and num definitions.
 */
export const generateNewListDefinition = ({
  numId,
  listType,
  level,
  start,
  text,
  fmt,
  editor,
  markerFontFamily,
  bulletStyle,
  bulletStyleLevel,
  orderedStyle,
  orderedStyleLevel,
}) => {
  /** @type {{ abstractDef: any, numDef: any }} */
  let resultDefs;

  mutateNumbering(editor, 'list-numbering-helpers:generateNewListDefinition', (numbering) => {
    const result = pureGenerateNewListDefinition(numbering, {
      numId,
      listType: typeof listType === 'string' ? listType : listType.name,
      level,
      start,
      text,
      fmt,
      markerFontFamily,
      bulletStyle,
      bulletStyleLevel,
      orderedStyle,
      orderedStyleLevel,
    });
    resultDefs = { abstractDef: result.abstractDef, numDef: result.numDef };
  });

  if (!resultDefs) {
    throw new Error('generateNewListDefinition: failed to allocate list definition.');
  }
  return { abstract: resultDefs.abstractDef, definition: resultDefs.numDef };
};

/**
 * Change the numId of a list definition and clone the abstract definition.
 * @param {number} numId
 * @param {number} level
 * @param {import("prosemirror-model").NodeType} listType
 * @param {import('../Editor').Editor} editor
 * @returns {number} The new numId for the list definition.
 */
export const changeNumIdSameAbstract = (numId, level, listType, editor) => {
  /** @type {number} */
  let newNumId;

  mutateNumbering(editor, 'list-numbering-helpers:changeNumIdSameAbstract', (numbering) => {
    const result = pureChangeNumIdSameAbstract(
      numbering,
      numId,
      level,
      typeof listType === 'string' ? listType : listType.name,
    );
    newNumId = result.newNumId;
  });

  if (newNumId == null) {
    throw new Error('changeNumIdSameAbstract: failed to allocate numId.');
  }
  return newNumId;
};

/**
 * Get the basic numbering ID tag for a list definition.
 * @param {number} numId
 * @param {number} abstractId
 * @returns {Object}
 */
export const getBasicNumIdTag = (numId, abstractId) => {
  return {
    type: 'element',
    name: 'w:num',
    attributes: { 'w:numId': String(numId) },
    elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractId) } }],
  };
};

/**
 * Get a new list ID for the editor without creating a conflict.
 * @param {import('../Editor').Editor} editor
 * @param {string} [grouping]
 * @returns {number}
 */
export const getNewListId = (editor, grouping = 'definitions') => {
  const defs = editor.converter?.numbering?.[grouping] || {};
  return getNextNumberingId(defs);
};

/**
 * Allocator for unique list `numId`s when remapping pasted or HTML-copied lists.
 * Seeds from existing `editor.converter.numbering.definitions` and tracks ids
 * allocated in this batch so two paths (slice paste vs HTML) stay consistent.
 *
 * @param {import('../Editor').Editor} editor
 * @returns {() => number}
 */
export const createListIdAllocator = (editor) => {
  const existingIds = new Set(
    Object.keys(editor?.converter?.numbering?.definitions || {})
      .map((value) => Number(value))
      .filter(Number.isFinite),
  );
  let nextId = Number(getNewListId(editor));

  return () => {
    while (!Number.isFinite(nextId) || existingIds.has(nextId)) {
      nextId = Number.isFinite(nextId) ? nextId + 1 : Number(getNewListId(editor));
    }
    const allocatedId = nextId;
    existingIds.add(allocatedId);
    nextId += 1;
    return allocatedId;
  };
};

/**
 * Get the details of a list definition based on the numId and level.
 * Read-only — no migration needed (section 3.1).
 */
export const getListDefinitionDetails = ({ numId, level, listType = undefined, editor, tries = 0 }) => {
  const { definitions, abstracts } = editor.converter.numbering;
  if (!numId) return {};

  const numDef = definitions[numId];

  // Generate new definition if needed
  if (!numDef && listType) {
    ListHelpers.generateNewListDefinition({ numId, listType, editor });
  }

  const abstractId = definitions[numId]?.elements?.find((item) => item.name === 'w:abstractNumId')?.attributes?.[
    'w:val'
  ];

  const abstract = abstracts[abstractId];
  if (!abstract) return null;

  // Handle style link recursion (max 1 retry)
  const numStyleLink = abstract.elements?.find((item) => item.name === 'w:numStyleLink');
  const styleId = numStyleLink?.attributes?.['w:val'];

  if (styleId && tries < 1) {
    const styleDefinition = getStyleTagFromStyleId(styleId, editor.converter.convertedXml);
    const linkedNumId = styleDefinition?.elements
      ?.find((el) => el.name === 'w:pPr')
      ?.elements?.find((el) => el.name === 'w:numPr')
      ?.elements?.find((el) => el.name === 'w:numId')?.attributes?.['w:val'];

    if (linkedNumId) {
      return getListDefinitionDetails({ numId: Number(linkedNumId), level, listType, editor, tries: tries + 1 });
    }
  }

  const listDefinition = abstract.elements?.find(
    (item) => item.name === 'w:lvl' && item.attributes?.['w:ilvl'] == level,
  );

  if (!listDefinition) return null;

  const findElement = (name) => listDefinition.elements?.find((item) => item.name === name);

  const startElement = findElement('w:start');
  let numFmtElement = findElement('w:numFmt');
  if (!numFmtElement) {
    const mcAlternate = listDefinition.elements?.find((item) => item.name === 'mc:AlternateContent');
    const choice = mcAlternate?.elements?.find((el) => el.name === 'mc:Choice');
    numFmtElement = choice?.elements?.find((item) => item.name === 'w:numFmt');
  }
  const lvlTextElement = findElement('w:lvlText');
  const suffixElement = findElement('w:suff');
  const lvlJcElement = findElement('w:lvlJc');

  const startVal = startElement?.attributes?.['w:val'];
  const numFmt = numFmtElement?.attributes?.['w:val'];
  const lvlText = lvlTextElement?.attributes?.['w:val'];
  const suffix = suffixElement?.attributes?.['w:val'];
  const justification = lvlJcElement?.attributes?.['w:val'];
  const listNumberingType = numFmt;
  const customFormat = numFmt === 'custom' ? numFmtElement?.attributes?.['w:format'] : undefined;

  return {
    start: startVal,
    numFmt,
    lvlText,
    suffix,
    justification,
    listNumberingType,
    customFormat,
    abstract,
    abstractId,
  };
};

export const hasListDefinition = (editor, numId, ilvl) => {
  const numbering = editor?.converter?.numbering;
  // No numbering part (e.g. a blank/programmatic editor) means no definition
  // exists. Return false instead of throwing on a null destructure so callers
  // surface a typed error rather than a raw TypeError.
  if (!numbering) return false;
  const { definitions, abstracts } = numbering;
  const numDef = definitions[numId];
  if (!numDef) return false;

  const abstractId = numDef.elements?.find((item) => item.name === 'w:abstractNumId')?.attributes?.['w:val'];
  const abstract = abstracts[abstractId];
  if (!abstract) return false;

  return !!abstract.elements?.find((item) => item.name === 'w:lvl' && item.attributes?.['w:ilvl'] == ilvl);
};

/**
 * Get all list definitions grouped by numId and level.
 * Read-only — no migration needed.
 */
export const getAllListDefinitions = (editor) => {
  const numbering = editor?.converter?.translatedNumbering;
  if (!numbering) return {};

  const { definitions = {}, abstracts = {} } = numbering;

  return Object.entries(definitions).reduce((acc, [numId, definition]) => {
    if (!definition) return acc;

    const abstractId = definition['abstractNumId'];
    const abstract = abstractId != null ? abstracts?.[abstractId] : undefined;
    const levelDefinitions = abstract?.levels || {};

    if (!acc[numId]) acc[numId] = {};

    Object.values(levelDefinitions).forEach((levelDef) => {
      const ilvl = levelDef.ilvl;
      const customFormat = levelDef.numFmt?.val === 'custom' ? levelDef.numFmt.format : null;
      const start = definition.lvlOverrides?.[ilvl]?.startOverride ?? levelDef.start;

      acc[numId][ilvl] = {
        start,
        startOverridden: definition.lvlOverrides?.[ilvl]?.startOverride != null,
        restart: levelDef.lvlRestart,
        numFmt: levelDef.numFmt?.val,
        lvlText: levelDef.lvlText,
        suffix: levelDef.suff,
        listNumberingType: levelDef.numFmt?.val,
        customFormat,
        abstract: abstract ?? null,
        abstractId,
      };
    });

    return acc;
  }, {});
};

/**
 * Remove list definitions from the editor's numbering.
 * @param {string} listId
 * @param {import('../Editor').Editor} editor
 */
export const removeListDefinitions = (listId, editor) => {
  mutateNumbering(editor, 'list-numbering-helpers:removeListDefinitions', (numbering) => {
    pureRemoveListDefinitions(numbering, Number(listId));
  });
};

export const createListItemNodeJSON = ({ level, numId, contentNode }) => {
  if (!Array.isArray(contentNode)) contentNode = [contentNode];

  const numberingProperties = { numId: Number(numId), ilvl: Number(level) };
  const attrs = { paragraphProperties: { numberingProperties }, numberingProperties };

  return { type: 'paragraph', attrs, content: [...(contentNode || [])] };
};

export const createSchemaOrderedListNode = ({ level, numId, editor, contentNode }) => {
  level = Number(level);
  numId = Number(numId);
  const listNodeJSON = createListItemNodeJSON({ level, numId, contentNode });
  return editor.schema.nodeFromJSON(listNodeJSON);
};

/**
 * Create a new list in the editor.
 * @param {Object} param0
 * @param {string|Object} param0.listType
 * @param {import('../Editor').Editor} param0.editor
 * @param {import("prosemirror-state").Transaction} param0.tr
 * @returns {Boolean}
 */
export const createNewList = ({ listType, tr, editor }) => {
  const numId = ListHelpers.getNewListId(editor);

  ListHelpers.generateNewListDefinition({ numId, listType, editor });

  const paragraphInfo = findParentNode((node) => node?.type?.name === 'paragraph')(tr.selection);
  if (!paragraphInfo) return false;

  const { node: paragraph, pos: paragraphPos = 0 } = paragraphInfo;
  updateNumberingProperties({ numId, ilvl: 0 }, paragraph, paragraphPos, editor, tr);
  return true;
};

export const replaceListWithNode = ({ tr, from, to, newNode }) => {
  tr.replaceWith(from, to, newNode);
};

/**
 * Set or update a lvlOverride entry on an existing w:num definition.
 * @param {import('../Editor').Editor} editor
 * @param {number} numId
 * @param {number} ilvl
 * @param {{ startOverride?: number, lvlRestart?: number | null }} overrides
 */
export const setLvlOverride = (editor, numId, ilvl, overrides) => {
  mutateNumbering(editor, 'list-numbering-helpers:setLvlOverride', (numbering) => {
    pureSetLvlOverride(numbering, numId, ilvl, overrides);
  });
};

/**
 * Remove a lvlOverride entry from an existing w:num definition.
 * @param {import('../Editor').Editor} editor
 * @param {number} numId
 * @param {number} ilvl
 */
export const removeLvlOverride = (editor, numId, ilvl) => {
  mutateNumbering(editor, 'list-numbering-helpers:removeLvlOverride', (numbering) => {
    pureRemoveLvlOverride(numbering, numId, ilvl);
  });
};

/**
 * Rebuild the raw numbering XML model from translated numbering definitions.
 *
 * This keeps `editor.converter.numbering` in sync with `editor.converter.translatedNumbering`,
 * which is required for DOCX export paths that serialize from the raw XML model.
 *
 * @param {import('../Editor').Editor} editor
 * @returns {{ updated: boolean, skipped: number }}
 */
export const rebuildRawNumberingFromTranslated = (editor) => {
  const converter = editor?.converter;
  if (!converter) {
    return { updated: false, skipped: 0 };
  }

  const translated = converter.translatedNumbering || {};
  const translatedAbstracts = translated.abstracts || {};
  const translatedDefinitions = translated.definitions || {};

  /** @type {Record<string, any>} */
  const nextAbstracts = {};
  /** @type {Record<string, any>} */
  const nextDefinitions = {};
  let skipped = 0;

  Object.entries(translatedAbstracts).forEach(([abstractId, abstractDef]) => {
    if (!abstractDef || typeof abstractDef !== 'object') {
      skipped += 1;
      return;
    }

    const decoded = wAbstractNumTranslator.decode({
      node: /** @type {any} */ ({
        attrs: {
          abstractNum: abstractDef,
        },
      }),
    });

    if (!decoded) {
      skipped += 1;
      return;
    }

    nextAbstracts[abstractId] = decoded;
  });

  Object.entries(translatedDefinitions).forEach(([numId, numDef]) => {
    if (!numDef || typeof numDef !== 'object') {
      skipped += 1;
      return;
    }

    const decoded = wNumTranslator.decode({
      node: /** @type {any} */ ({
        attrs: {
          num: numDef,
        },
      }),
    });

    if (!decoded) {
      skipped += 1;
      return;
    }

    nextDefinitions[numId] = decoded;
  });

  converter.numbering = {
    ...(converter.numbering || {}),
    abstracts: nextAbstracts,
    definitions: nextDefinitions,
  };

  return { updated: true, skipped };
};

/**
 * Create a new w:num definition pointing to an existing abstractNumId.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {{ copyOverridesFrom?: number }} [options]
 * @returns {{ numId: number, numDef: Object }}
 */
export const createNumDefinition = (editor, abstractNumId, options = {}) => {
  /** @type {{ numId: number, numDef: any }} */
  let result;

  mutateNumbering(editor, 'list-numbering-helpers:createNumDefinition', (numbering) => {
    result = pureCreateNumDefinition(numbering, abstractNumId, options);
  });

  if (!result) {
    throw new Error('createNumDefinition: failed to create numbering definition.');
  }
  return result;
};

/**
 * Set or remove w:lvlRestart on an abstract definition level.
 * @param {import('../Editor').Editor} editor
 * @param {number} abstractNumId
 * @param {number} ilvl
 * @param {number | null} restartAfterLevel
 */
export const setLvlRestartOnAbstract = (editor, abstractNumId, ilvl, restartAfterLevel) => {
  mutateNumbering(editor, 'list-numbering-helpers:setLvlRestartOnAbstract', (numbering) => {
    pureSetLvlRestartOnAbstract(numbering, abstractNumId, ilvl, restartAfterLevel);
  });
};

/**
 * Apply bullet/ordered style overrides to one or more list levels. Each entry resolves
 * its own abstract via `w:numStyleLink` (style-linked lists land on the real abstract);
 * all updates run in a single `mutateNumberingBatch` so a multi-level selection costs
 * one invalidation cycle.
 *
 * @param {Object} param0
 * @param {import('../Editor').Editor} param0.editor
 * @param {Array<{ numId: number, ilvl: number, bulletStyle?: 'disc'|'circle'|'square'|null, orderedStyle?: import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null }>} param0.levels
 * @returns {boolean} `true` when at least one abstract level was actually changed.
 */
export const setListLevelStyles = ({ editor, levels }) => {
  if (!levels?.length) return false;

  const resolved = [];
  for (const level of levels) {
    const abstractIdRaw = getListDefinitionDetails({ numId: level.numId, level: level.ilvl, editor })?.abstractId;
    const abstractNumId = abstractIdRaw != null ? Number(abstractIdRaw) : NaN;
    if (!Number.isFinite(abstractNumId)) continue;
    resolved.push({
      abstractNumId,
      ilvl: level.ilvl,
      bulletStyle: level.bulletStyle,
      orderedStyle: level.orderedStyle,
    });
  }
  if (!resolved.length) return false;

  let anyChanged = false;
  mutateNumberingBatch(
    editor,
    'list-numbering-helpers:setListLevelStyles',
    resolved.map(({ abstractNumId, ilvl, bulletStyle, orderedStyle }) => (numbering) => {
      if (pureSetLvlStyleOnAbstract(numbering, abstractNumId, ilvl, { bulletStyle, orderedStyle })) {
        anyChanged = true;
      }
    }),
  );
  return anyChanged;
};

/**
 * Clone the abstract behind `sourceNumId`, apply a style override at `ilvl`, and register
 * the cloned abstract + a fresh numId pointing to it. Returns the new IDs (or `null` if
 * the source was missing). Callers migrate paragraphs to the new numId via PM-tracked
 * `setNodeMarkup` so undo can reverse the migration.
 *
 * @param {Object} param0
 * @param {import('../Editor').Editor} param0.editor
 * @param {number} param0.sourceNumId
 * @param {number} param0.ilvl
 * @param {'disc'|'circle'|'square'|null} [param0.bulletStyle]
 * @param {import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null} [param0.orderedStyle]
 * @returns {{ newNumId: number, newAbstractId: number } | null}
 */
export const cloneListDefinitionWithLevelStyle = ({ editor, sourceNumId, ilvl, bulletStyle, orderedStyle }) => {
  let result = null;
  mutateNumbering(editor, 'list-numbering-helpers:cloneListDefinitionWithLevelStyle', (numbering) => {
    result = pureCloneListDefinitionWithLevelStyle(numbering, sourceNumId, ilvl, { bulletStyle, orderedStyle });
  });
  return result;
};

/**
 * ListHelpers is a collection of utility functions for managing lists in the editor.
 */
export const ListHelpers = {
  replaceListWithNode,

  // DOCX helpers
  getListDefinitionDetails,
  getAllListDefinitions,
  generateNewListDefinition,
  getBasicNumIdTag,
  getNewListId,
  createListIdAllocator,
  hasListDefinition,
  removeListDefinitions,

  // lvlOverride helpers
  setLvlOverride,
  removeLvlOverride,

  // Numbering definition helpers
  createNumDefinition,
  setLvlRestartOnAbstract,
  setListLevelStyles,
  cloneListDefinitionWithLevelStyle,
  rebuildRawNumberingFromTranslated,

  // Schema helpers
  createNewList,
  createSchemaOrderedListNode,
  createListItemNodeJSON,
  changeNumIdSameAbstract,

  // Base list definitions
  baseOrderedListDef,
  baseBulletList,
};
