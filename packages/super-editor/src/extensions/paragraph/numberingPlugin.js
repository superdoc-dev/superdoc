import { Plugin, PluginKey } from 'prosemirror-state';
import { createNumberingManager } from './NumberingManager.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { generateOrderedListIndex } from '@helpers/orderedListUtils.js';
import { docxNumberingHelpers } from '@core/super-converter/v2/importer/listImporter.js';
import { calculateResolvedParagraphProperties } from './resolvedPropertiesCache.js';

/**
 * Create a ProseMirror plugin that keeps `listRendering` data in sync with the
 * underlying Word numbering definitions.
 *
 * @param {import('../../core/Editor').Editor} editor The active editor instance.
 * @returns {import('prosemirror-state').Plugin}
 */
export function createNumberingPlugin(editor) {
  const numberingManager = createNumberingManager();

  // Helpers to initialize and refresh start settings from definitions
  const applyStartSettingsFromDefinitions = (definitionsMap) => {
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
  };

  // Callback to refresh start settings when definitions change
  const refreshStartSettings = () => {
    const definitions = ListHelpers.getAllListDefinitions(editor);
    applyStartSettingsFromDefinitions(definitions);
  };

  // Initial setup
  refreshStartSettings();

  // Listen for definition changes
  if (typeof editor?.on === 'function') {
    editor.on('list-definitions-change', refreshStartSettings);
    if (typeof editor?.off === 'function') {
      const cleanupListDefinitionListener = () => {
        editor.off('list-definitions-change', refreshStartSettings);
        editor.off?.('destroy', cleanupListDefinitionListener);
      };
      editor.on('destroy', cleanupListDefinitionListener);
    }
  }

  return new Plugin({
    name: 'numberingPlugin',
    key: new PluginKey('numberingPlugin'),
    /**
     * Scan document changes and collect fresh numbering metadata for list
     * paragraphs. The incoming transactions are marked to avoid reprocessing.
     *
     * @param {import('prosemirror-state').Transaction[]} transactions
     * @param {import('prosemirror-state').EditorState} oldState
     * @param {import('prosemirror-state').EditorState} newState
     * @returns {import('prosemirror-state').Transaction | null}
     */
    appendTransaction(transactions, oldState, newState) {
      const isFromPlugin = transactions.some((tr) => tr.getMeta('orderedListSync'));
      const forcePluginPass = transactions.some((tr) => tr.getMeta('forcePluginPass'));
      if (isFromPlugin || (!forcePluginPass && !transactions.some((tr) => tr.docChanged))) {
        return null;
      }

      // Mark the transaction to avoid re-processing
      const tr = newState.tr;
      tr.setMeta('orderedListSync', true);

      // Generate new list properties
      numberingManager.enableCache();
      newState.doc.descendants((node, pos) => {
        let resolvedProps = calculateResolvedParagraphProperties(editor, node, newState.doc.resolve(pos));
        if (node.type.name !== 'paragraph' || !resolvedProps.numberingProperties) {
          return;
        }

        // Retrieving numbering definition from docx
        const { numId, ilvl: level = 0 } = resolvedProps.numberingProperties;
        const definitionDetails = ListHelpers.getListDefinitionDetails({ numId, level, editor });

        if (!definitionDetails || Object.keys(definitionDetails).length === 0) {
          // Treat as normal paragraph if definition is missing
          tr.setNodeAttribute(pos, 'listRendering', null);
          return;
        }

        let { lvlText, customFormat, listNumberingType, suffix, justification, abstractId } = definitionDetails;
        // Defining the list marker
        let markerText = '';
        listNumberingType = listNumberingType || 'decimal';
        const count = numberingManager.calculateCounter(numId, level, pos, abstractId);
        numberingManager.setCounter(numId, level, pos, count, abstractId);
        const path = numberingManager.calculatePath(numId, level, pos);
        if (listNumberingType !== 'bullet') {
          markerText = generateOrderedListIndex({
            listLevel: path,
            lvlText: lvlText,
            listNumberingType,
            customFormat,
          });
        } else {
          markerText = docxNumberingHelpers.normalizeLvlTextChar(lvlText);
        }

        const newListRendering = {
          markerText,
          suffix,
          justification,
          path,
          numberingType: listNumberingType,
        };

        if (JSON.stringify(node.attrs.listRendering) !== JSON.stringify(newListRendering)) {
          // Updating rendering attrs for node view usage
          tr.setNodeAttribute(pos, 'listRendering', newListRendering);
        }

        return false; // no need to descend into a paragraph
      });
      numberingManager.disableCache();
      return tr.docChanged ? tr : null;
    },
  });
}
