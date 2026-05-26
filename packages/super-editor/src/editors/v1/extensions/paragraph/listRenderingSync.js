import { createNumberingManager } from './NumberingManager.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { generateOrderedListIndex } from '@helpers/orderedListUtils.js';
import { docxNumberingHelpers } from '@core/super-converter/v2/importer/listImporter.js';

function getNodeTypeName(node) {
  return typeof node?.type === 'string' ? node.type : node?.type?.name;
}

function getNodeAttrs(node) {
  return node?.attrs ?? {};
}

function getNumberingProperties(node, resolvedProperties) {
  const attrs = getNodeAttrs(node);
  return (
    resolvedProperties?.numberingProperties ??
    attrs.paragraphProperties?.numberingProperties ??
    attrs.numberingProperties ??
    null
  );
}

function defaultResolveParagraphProperties(node) {
  return getNodeAttrs(node).paragraphProperties || {};
}

function hasNumberingDefinitions(editor) {
  return Boolean(editor?.converter?.numbering);
}

export function applyStartSettingsFromDefinitions(numberingManager, definitionsMap) {
  Object.entries(definitionsMap || {}).forEach(([numId, levels]) => {
    Object.entries(levels || {}).forEach(([level, def]) => {
      const start = parseInt(def?.start) || 1;
      let restart = def?.restart;
      if (restart != null) {
        restart = parseInt(restart);
      }
      numberingManager.setStartSettings(numId, parseInt(level), start, restart, def.startOverridden);
    });
  });
}

export function createListRenderingSync(editor, options = {}) {
  const numberingManager = options.numberingManager ?? createNumberingManager();

  const refreshStartSettings = () => {
    const definitions = ListHelpers.getAllListDefinitions(editor);
    applyStartSettingsFromDefinitions(numberingManager, definitions);
    return definitions;
  };

  refreshStartSettings();

  const calculateListRendering = ({ node, pos, resolvedProperties }) => {
    const numberingProperties = getNumberingProperties(node, resolvedProperties);
    if (!numberingProperties || !hasNumberingDefinitions(editor)) {
      return null;
    }

    const { numId, ilvl: level = 0 } = numberingProperties;
    const definitionDetails = ListHelpers.getListDefinitionDetails({ numId, level, editor });

    if (!definitionDetails || Object.keys(definitionDetails).length === 0) {
      return null;
    }

    let { lvlText, customFormat, listNumberingType, suffix, justification, abstractId } = definitionDetails;
    listNumberingType = listNumberingType || 'decimal';
    const count = numberingManager.calculateCounter(numId, level, pos, abstractId);
    numberingManager.setCounter(numId, level, pos, count, abstractId);
    const path = numberingManager.calculatePath(numId, level, pos);
    const markerText =
      listNumberingType !== 'bullet'
        ? (generateOrderedListIndex({
            listLevel: path,
            lvlText,
            listNumberingType,
            customFormat,
          }) ?? '')
        : (docxNumberingHelpers.normalizeLvlTextChar(lvlText) ?? '');

    return {
      markerText,
      suffix,
      justification,
      path,
      numberingType: listNumberingType,
      ...(customFormat ? { customFormat } : {}),
    };
  };

  const syncListRendering = ({
    visitNodes,
    resolveParagraphProperties = defaultResolveParagraphProperties,
    shouldPreserveParagraph = () => false,
    updateListRendering,
  }) => {
    numberingManager.enableCache();
    try {
      visitNodes((node, pos, context) => {
        if (getNodeTypeName(node) !== 'paragraph') {
          return;
        }

        const resolvedProperties = resolveParagraphProperties(node, pos, context);
        if (!getNumberingProperties(node, resolvedProperties)) {
          return;
        }

        if (shouldPreserveParagraph(node, pos, context)) {
          return false;
        }

        updateListRendering(node, pos, calculateListRendering({ node, pos, resolvedProperties }), context);
        return false;
      });
    } finally {
      numberingManager.disableCache();
    }
  };

  return {
    numberingManager,
    refreshStartSettings,
    calculateListRendering,
    syncListRendering,
  };
}
