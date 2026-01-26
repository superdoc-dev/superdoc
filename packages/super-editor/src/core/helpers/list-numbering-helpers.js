// @ts-check
import { getStyleTagFromStyleId } from '@core/super-converter/v2/importer/listImporter.js';
import { baseBulletList, baseOrderedListDef } from './baseListDefinitions';
import { updateNumberingProperties } from '@core/commands/changeListLevel';
import { findParentNode } from './findParentNode.js';
import { translator as wAbstractNumTranslator } from '@converter/v3/handlers/w/abstractNum';
import { translator as wNumTranslator } from '@converter/v3/handlers/w/num';

/**
 * Generate a new list definition for the given list type.
 * This function creates a new abstractNum and num definition for the list type.
 * It updates the editor's numbering with the new definitions.
 * @param {Object} param0
 * @param {number} param0.numId - The numId to be used for the new list definition.
 * @param {Object} param0.listType - The type of the list (ordered or bullet).
 * @param {number} [param0.level] - The level of the list definition (0-based). Required when generating new definitions with specific level properties.
 * @param {number} [param0.start] - The starting number for the list (1-based). Required for ordered lists.
 * @param {string} [param0.text] - The text to display for the list level. Required for ordered lists.
 * @param {string} [param0.fmt] - The numbering format for the list level. Required for ordered lists.
 * @param {string} [param0.markerFontFamily] - The font family to use for the marker.
 * @param {import('../Editor').Editor} param0.editor - The editor instance where the list definition will be added.
 * @returns {Object} The new abstract and num definitions.
 */
export const generateNewListDefinition = ({ numId, listType, level, start, text, fmt, editor, markerFontFamily }) => {
  // Generate a new numId to add to numbering.xml
  if (typeof listType !== 'string') listType = listType.name;

  const definition = listType === 'orderedList' ? baseOrderedListDef : baseBulletList;
  const numbering = editor.converter.numbering;
  const newNumbering = { ...numbering };
  let skipAddingNewAbstract = false;

  // Generate the new abstractNum definition
  let newAbstractId = getNewListId(editor, 'abstracts');
  let newAbstractDef = JSON.parse(
    JSON.stringify({
      ...definition,
      attributes: {
        ...definition.attributes,
        'w:abstractNumId': String(newAbstractId),
      },
    }),
  );

  // Generate the new abstractNum definition for copy/paste lists
  if (level && start && text && fmt) {
    if (newNumbering.definitions[numId]) {
      const abstractId = newNumbering.definitions[numId]?.elements[0]?.attributes['w:val'];
      newAbstractId = abstractId;
      const abstract = editor.converter.numbering.abstracts[abstractId];
      newAbstractDef = { ...abstract };
      skipAddingNewAbstract = true;
    }

    const levelDefIndex = newAbstractDef.elements.findIndex(
      (el) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === level,
    );
    const levelProps = newAbstractDef.elements[levelDefIndex];
    const elToFilter = ['w:numFmt', 'w:lvlText', 'w:start'];
    const oldElements = levelProps.elements.filter((el) => !elToFilter.includes(el.name));
    levelProps.elements = [
      ...oldElements,
      {
        type: 'element',
        name: 'w:start',
        attributes: {
          'w:val': start,
        },
      },
      {
        type: 'element',
        name: 'w:numFmt',
        attributes: {
          'w:val': fmt,
        },
      },
      {
        type: 'element',
        name: 'w:lvlText',
        attributes: {
          'w:val': text,
        },
      },
    ];
    if (markerFontFamily) {
      // Add font family to level properties
      const rPrIndex = levelProps.elements.findIndex((el) => el.name === 'w:rPr');
      let rPr = levelProps.elements[rPrIndex];
      if (!rPr) {
        rPr = {
          type: 'element',
          name: 'w:rPr',
          elements: [],
        };
        levelProps.elements.push(rPr);
      }
      // Remove existing rFonts if present
      rPr.elements = rPr.elements.filter((el) => el.name !== 'w:rFonts');
      // Add new rFonts element
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

  if (!skipAddingNewAbstract) newNumbering.abstracts[newAbstractId] = newAbstractDef;

  // Generate the new numId definition
  const newNumDef = getBasicNumIdTag(numId, newAbstractId);
  newNumbering.definitions[numId] = newNumDef;

  const newTranslatedNumbering = { ...editor.converter.translatedNumbering };
  if (!newTranslatedNumbering.definitions) newTranslatedNumbering.definitions = {};
  if (!newTranslatedNumbering.abstracts) newTranslatedNumbering.abstracts = {};
  // @ts-expect-error Remaining parameters are not needed for this translator
  newTranslatedNumbering.definitions[numId] = wNumTranslator.encode({
    nodes: [newNumDef],
  });
  // @ts-expect-error Remaining parameters are not needed for this translator
  newTranslatedNumbering.abstracts[newAbstractId] = wAbstractNumTranslator.encode({
    nodes: [newAbstractDef],
  });
  editor.converter.translatedNumbering = newTranslatedNumbering;
  // Update the editor's numbering with the new definition
  editor.converter.numbering = newNumbering;

  // Emit a change to numbering event
  const change = { numDef: newNumDef, abstractDef: newAbstractDef, editor };
  editor.emit('list-definitions-change', { change, numbering: newNumbering, editor });

  return { abstract: newAbstractDef, definition: newNumDef };
};

export const hasListDefinition = (editor, numId, ilvl) => {
  const { definitions, abstracts } = editor.converter.numbering;
  const numDef = definitions[numId];
  if (!numDef) return false;

  const abstractId = numDef.elements?.find((item) => item.name === 'w:abstractNumId')?.attributes?.['w:val'];
  const abstract = abstracts[abstractId];
  if (!abstract) return false;

  const levelDef = abstract.elements?.find((item) => item.name === 'w:lvl' && item.attributes?.['w:ilvl'] == ilvl);

  return !!levelDef;
};

/**
 * Change the numId of a list definition and clone the abstract definition.
 * @param {number} numId - The current numId of the list definition.
 * @param {number} level - The level of the list definition.
 * @param {import("prosemirror-model").NodeType} listType - The type of the list (e.g., 'orderedList', 'bulletList').
 * @param {import('../Editor').Editor} editor - The editor instance where the list definition is stored.
 * @returns {number} The new numId for the list definition.
 */
export const changeNumIdSameAbstract = (numId, level, listType, editor) => {
  const newId = getNewListId(editor, 'definitions');
  const { abstract } = ListHelpers.getListDefinitionDetails({ numId, level, listType, editor });

  const numbering = editor.converter.numbering;
  const newNumbering = { ...numbering };

  // If we don't have an abstract to clone (e.g. legacy/missing numbering),
  // fall back to generating a fresh definition for the target list type.
  if (!abstract) {
    ListHelpers.generateNewListDefinition({ numId: newId, listType, editor });
    return newId;
  }

  const newAbstractId = getNewListId(editor, 'abstracts');
  const newAbstractDef = {
    ...abstract,
    attributes: {
      ...(abstract.attributes || {}),
      'w:abstractNumId': String(newAbstractId),
    },
  };
  newNumbering.abstracts[newAbstractId] = newAbstractDef;

  const newNumDef = getBasicNumIdTag(newId, newAbstractId);
  newNumbering.definitions[newId] = newNumDef;
  // Persist updated numbering so downstream exporters can resolve the ID
  editor.converter.numbering = newNumbering;
  return newId;
};

/**
 * Get the basic numbering ID tag for a list definition.
 * @param {number} numId - The numId of the list definition.
 * @param {number} abstractId - The abstractId of the list definition.
 * @returns {Object} The basic numbering ID tag.
 */
export const getBasicNumIdTag = (numId, abstractId) => {
  return {
    type: 'element',
    name: 'w:num',
    attributes: {
      'w:numId': String(numId),
    },
    elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractId) } }],
  };
};

/**
 * Get a new list ID for the editor without creating a conflict.
 * This function calculates the next available list ID by finding the maximum existing ID
 * and adding 1 to it.
 * @param {import('../Editor').Editor} editor The editor instance where the list ID will be generated.
 * @returns {number} The new list ID.
 */
export const getNewListId = (editor, grouping = 'definitions') => {
  const defs = editor.converter?.numbering?.[grouping] || {};
  const intKeys = Object.keys(defs)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n));
  const max = intKeys.length ? Math.max(...intKeys) : 0;
  return max + 1;
};

/**
 * Get the details of a list definition based on the numId and level.
 * This function retrieves the start value, numbering format, level text, and custom format
 * for a given list definition. It handles style link recursion and generates new definitions when needed.
 *
 * @param {Object} params - The parameters object
 * @param {number} params.numId - The numId of the list definition
 * @param {number} params.level - The level of the list definition (0-based)
 * @param {import("prosemirror-model").NodeType} [params.listType] - The type of the list (e.g., 'orderedList', 'bulletList'). Required when generating new definitions
 * @param {Object} params.editor - The editor instance containing converter and numbering data
 * @param {number} [params.tries=0] - The number of recursion attempts to avoid infinite loops (max 1)
 * @returns {Object} The list definition details
 */
export const getListDefinitionDetails = ({ numId, level, listType, editor, tries = 0 }) => {
  const { definitions, abstracts } = editor.converter.numbering;
  if (!numId) return {};

  const numDef = definitions[numId];

  // Generate new definition if needed
  if (!numDef && listType) {
    ListHelpers.generateNewListDefinition({ numId, listType, editor });
  }

  // Get abstract definition
  const abstractId = definitions[numId]?.elements?.find((item) => item.name === 'w:abstractNumId')?.attributes?.[
    'w:val'
  ];

  const abstract = abstracts[abstractId];
  if (!abstract) {
    return {
      start: null,
      numFmt: null,
      lvlText: null,
      listNumberingType: null,
      suffix: null,
      justification: null,
      customFormat: null,
      abstract: null,
      abstractId,
    };
  }

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
      return getListDefinitionDetails({
        numId: Number(linkedNumId),
        level,
        listType,
        editor,
        tries: tries + 1,
      });
    }
  }

  // Find level definition
  const listDefinition = abstract.elements?.find(
    (item) => item.name === 'w:lvl' && item.attributes?.['w:ilvl'] == level,
  );

  if (!listDefinition) {
    return {
      start: null,
      numFmt: null,
      lvlText: null,
      suffix: null,
      justification: null,
      listNumberingType: null,
      customFormat: null,
      abstract,
      abstractId,
    };
  }

  // Extract level properties safely
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

  const start = startElement?.attributes?.['w:val'];
  const numFmt = numFmtElement?.attributes?.['w:val'];
  const lvlText = lvlTextElement?.attributes?.['w:val'];
  const suffix = suffixElement?.attributes?.['w:val'];
  const justification = lvlJcElement?.attributes?.['w:val'];
  const listNumberingType = numFmt;

  // Handle custom format
  const customFormat = numFmt === 'custom' ? numFmtElement?.attributes?.['w:format'] : undefined;

  return {
    start,
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

/**
 * Get all list definitions grouped by numId and level.
 * @param {import('../Editor').Editor} editor - The editor instance containing numbering information.
 * @returns {Record<string, Record<string, {start: string|null, numFmt: string|null, lvlText: string|null, suffix: string|null, listNumberingType: string|null, customFormat: string|null, abstract: Object|null, abstractId: string|undefined}>>}
 */
export const getAllListDefinitions = (editor) => {
  const numbering = editor?.converter?.numbering;
  if (!numbering) return {};

  const { definitions = {}, abstracts = {} } = numbering;

  return Object.entries(definitions).reduce((acc, [numId, definition]) => {
    if (!definition) return acc;

    const abstractId = definition.elements?.find((item) => item.name === 'w:abstractNumId')?.attributes?.['w:val'];
    const abstract = abstractId != null ? abstracts?.[abstractId] : undefined;
    const levelDefinitions = abstract?.elements?.filter((item) => item.name === 'w:lvl') || [];

    if (!acc[numId]) acc[numId] = {};

    levelDefinitions.forEach((levelDef) => {
      const ilvl = levelDef?.attributes?.['w:ilvl'];
      if (ilvl == null) return;

      const findElement = (name) => levelDef?.elements?.find((item) => item.name === name);

      const startElement = findElement('w:start');
      const lvlRestartElement = findElement('w:lvlRestart');
      const numFmtElement = findElement('w:numFmt');
      const lvlTextElement = findElement('w:lvlText');
      const suffixElement = findElement('w:suff');

      const numFmt = numFmtElement?.attributes?.['w:val'] ?? null;
      const customFormat = numFmt === 'custom' ? (numFmtElement?.attributes?.['w:format'] ?? null) : null;

      acc[numId][ilvl] = {
        start: startElement?.attributes?.['w:val'] ?? null,
        restart: lvlRestartElement?.attributes?.['w:val'] ?? null,
        numFmt,
        lvlText: lvlTextElement?.attributes?.['w:val'] ?? null,
        suffix: suffixElement?.attributes?.['w:val'] ?? null,
        listNumberingType: numFmt,
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
 * This function deletes the definitions and abstracts for a given list ID from the editor's numbering.
 * It is used to clean up list definitions when they are no longer needed.
 * @param {string} listId The ID of the list to be removed.
 * @param {import('../Editor').Editor} editor The editor instance from which the list definitions will be removed.
 * @returns {void}
 */
export const removeListDefinitions = (listId, editor) => {
  const { numbering } = editor.converter;
  if (!numbering) return;

  const { definitions, abstracts } = numbering;

  const abstractId = definitions[listId].elements[0].attributes['w:val'];
  delete definitions[listId];
  delete abstracts[abstractId];
  editor.converter.numbering = {
    definitions,
    abstracts,
  };
};

/**
 * Create a JSON representation of a list item node.
 * This function constructs a list item node in JSON format, including its level, numbering type,
 * starting number, and content node.
 * @param {Object} param0
 * @param {number} param0.level - The level of the list item.
 * @param {number} param0.numId - The ID of the numbering definition for the list item.
 * @param {Object} param0.contentNode - The content node to be included in the list item.
 * @returns {Object} A JSON object representing the list item node.
 */
export const createListItemNodeJSON = ({ level, numId, contentNode }) => {
  if (!Array.isArray(contentNode)) contentNode = [contentNode];

  const numberingProperties = {
    numId: Number(numId),
    ilvl: Number(level),
  };
  const attrs = {
    paragraphProperties: {
      numberingProperties,
    },
    numberingProperties,
  };

  const listItem = {
    type: 'paragraph',
    attrs,
    content: [...(contentNode || [])],
  };
  return listItem;
};

/**
 * Create a schema node for an ordered list.
 * This function constructs an ordered list node in the editor's schema, including its attributes
 * such as list style type, list ID, and order level. It also creates a content node for the list item.
 * @param {Object} param0
 * @param {number} param0.level - The level of the ordered list.
 * @param {number} param0.numId - The ID of the numbering definition for the ordered list.
 * @param {import('../Editor').Editor} param0.editor - The editor instance where the list node will be created.
 * @param {Object} param0.contentNode - The content node to be included in the ordered list.
 * @returns {Object} A ProseMirror node representing the ordered list.
 */
export const createSchemaOrderedListNode = ({ level, numId, editor, contentNode }) => {
  level = Number(level);
  numId = Number(numId);
  const listNodeJSON = createListItemNodeJSON({ level, numId, contentNode });

  return editor.schema.nodeFromJSON(listNodeJSON);
};

/**
 * Create a new list in the editor.
 * @param {Object} param0
 * @param {string|Object} param0.listType - The type of the list to be created (e.g., 'orderedList', 'bulletList').
 * @param {import('../Editor').Editor} param0.editor - The editor instance where the new list will be created.
 * @param {import("prosemirror-state").Transaction} param0.tr - The ProseMirror transaction object.
 * @returns {Boolean} The result of the insertion operation.
 */
export const createNewList = ({ listType, tr, editor }) => {
  const numId = ListHelpers.getNewListId(editor);

  ListHelpers.generateNewListDefinition({ numId, listType, editor });

  const paragraphInfo = findParentNode((node) => node?.type?.name === 'paragraph')(tr.selection);

  // If we're not in a paragraph, bail (nothing to convert)
  if (!paragraphInfo) return false;

  const { node: paragraph, pos: paragraphPos = 0 } = paragraphInfo;
  updateNumberingProperties(
    {
      numId,
      ilvl: 0,
    },
    paragraph,
    paragraphPos,
    editor,
    tr,
  );

  return true;
};

/**
 * Replace a list with a new node in the ProseMirror transaction.
 * @param {Object} param0 - The parameters for the replacement.
 * @param {Object} param0.tr - The ProseMirror transaction object.
 * @param {number} param0.from - The starting position of the list to be replaced.
 * @param {number} param0.to - The ending position of the list to be replaced.
 * @param {Node} param0.newNode - The new node to replace the list with.
 * @returns {void}
 */
export const replaceListWithNode = ({ tr, from, to, newNode }) => {
  tr.replaceWith(from, to, newNode);
};

/**
 * ListHelpers is a collection of utility functions for managing lists in the editor.
 * It includes functions for creating, modifying, and retrieving list items and definitions,
 * as well as handling schema nodes and styles.
 */
export const ListHelpers = {
  replaceListWithNode,

  // DOCX helpers
  getListDefinitionDetails,
  getAllListDefinitions,
  generateNewListDefinition,
  getBasicNumIdTag,
  getNewListId,
  hasListDefinition,
  removeListDefinitions,

  // Schema helpers
  createNewList,
  createSchemaOrderedListNode,
  createListItemNodeJSON,
  changeNumIdSameAbstract,

  // Base list definitions
  baseOrderedListDef,
  baseBulletList,
};
