import { Plugin, PluginKey } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform';
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
  let forceFullRecompute = false;

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
    forceFullRecompute = true;
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
      const getParagraphAnchor = ($pos) => {
        for (let depth = $pos.depth; depth >= 0; depth--) {
          const node = $pos.node(depth);
          if (node.type.name === 'paragraph') {
            return depth === 0 ? 0 : $pos.before(depth);
          }
        }
        return null;
      };

      const isInlineOnlyChange = (tr) => {
        if (!tr.docChanged) return true;
        let inlineOnly = true;
        const baseDoc = tr.before ?? oldState?.doc ?? newState?.doc;

        tr.steps.forEach((step) => {
          if (!inlineOnly) return;
          if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
            return;
          }

          if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
            const { from, to } = step;
            if (from == null || to == null || !baseDoc) {
              inlineOnly = false;
              return;
            }
            if (from < 0 || to < 0 || from > baseDoc.content.size || to > baseDoc.content.size) {
              inlineOnly = false;
              return;
            }
            let $from;
            let $to;
            try {
              $from = baseDoc.resolve(from);
              $to = baseDoc.resolve(to);
            } catch {
              inlineOnly = false;
              return;
            }
            const fromPara = getParagraphAnchor($from);
            const toPara = getParagraphAnchor($to);
            if (fromPara == null || toPara == null || fromPara !== toPara) {
              inlineOnly = false;
              return;
            }
            if (step.slice?.content) {
              let hasBlock = false;
              step.slice.content.descendants((node) => {
                if (node.isBlock) {
                  hasBlock = true;
                  return false;
                }
                return;
              });
              if (hasBlock) {
                inlineOnly = false;
              }
            }
            return;
          }

          inlineOnly = false;
        });

        return inlineOnly;
      };
      const isFromPlugin = transactions.some((tr) => tr.getMeta('orderedListSync'));
      const forcePluginPass = transactions.some((tr) => tr.getMeta('forcePluginPass'));
      const hasDocChanges = transactions.some((tr) => tr.docChanged);
      if (isFromPlugin || (!forcePluginPass && !forceFullRecompute && !hasDocChanges)) {
        return null;
      }
      if (!forcePluginPass && !forceFullRecompute) {
        const inlineOnly = transactions.every((tr) => isInlineOnlyChange(tr));
        if (inlineOnly) {
          return null;
        }
      }

      const hasNumberedParagraphInRange = (doc, from, to) => {
        if (!doc || from == null || to == null) return false;
        const docSize = doc.content.size;
        const rangeStart = Math.max(0, Math.min(from, to));
        const rangeEnd = Math.min(docSize, Math.max(from, to));
        let found = false;
        doc.nodesBetween(rangeStart, rangeEnd, (node, pos) => {
          if (found) return false;
          if (node.type.name !== 'paragraph') return;
          const resolvedProps = calculateResolvedParagraphProperties(editor, node, doc.resolve(pos));
          if (resolvedProps?.numberingProperties) {
            found = true;
            return false;
          }
          return false;
        });
        return found;
      };

      const shouldRecompute = (() => {
        if (forcePluginPass || forceFullRecompute) return true;
        if (!hasDocChanges) return false;
        const diffStart = oldState.doc.content.findDiffStart(newState.doc.content);
        if (diffStart == null) return false;
        const diffEnd = oldState.doc.content.findDiffEnd(newState.doc.content);
        const oldDiffEnd = diffEnd?.a ?? diffStart;
        const newDiffEnd = diffEnd?.b ?? diffStart;
        const oldHasList = hasNumberedParagraphInRange(oldState.doc, diffStart, oldDiffEnd);
        if (oldHasList) return true;
        const newHasList = hasNumberedParagraphInRange(newState.doc, diffStart, newDiffEnd);
        return newHasList;
      })();

      if (!shouldRecompute) {
        return null;
      }
      forceFullRecompute = false;

      // Mark the transaction to avoid re-processing
      const tr = newState.tr;
      tr.setMeta('orderedListSync', true);

      // Increment sdBlockRev to notify the layout engine that the block changed.
      // Handles legacy string values from older document formats.
      const bumpBlockRev = (node, pos) => {
        const current = node?.attrs?.sdBlockRev;
        let nextRev;
        if (typeof current === 'number' && Number.isFinite(current)) {
          nextRev = current + 1;
        } else if (typeof current === 'string' && current.trim() !== '') {
          const parsed = Number.parseInt(current, 10);
          if (Number.isFinite(parsed)) {
            nextRev = parsed + 1;
          }
        }
        if (nextRev != null) {
          tr.setNodeAttribute(pos, 'sdBlockRev', nextRev);
        }
      };

      // Generate new list properties
      numberingManager.enableCache();
      try {
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
            bumpBlockRev(node, pos);
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
            markerText =
              generateOrderedListIndex({
                listLevel: path,
                lvlText: lvlText,
                listNumberingType,
                customFormat,
              }) ?? '';
          } else {
            markerText = docxNumberingHelpers.normalizeLvlTextChar(lvlText) ?? '';
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
            bumpBlockRev(node, pos);
          }

          return false; // no need to descend into a paragraph
        });
      } finally {
        numberingManager.disableCache();
      }
      return tr.docChanged ? tr : null;
    },
  });
}
