import { Plugin, PluginKey } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform';
import { calculateResolvedParagraphProperties } from './resolvedPropertiesCache.js';
import { createListRenderingSync } from './listRenderingSync.js';

function blockRevIsFreshForSlicePaste(rev) {
  return rev === 0 || rev === '0';
}

function shouldPreserveSlicePastedListRendering(node, transactions) {
  if (node.type.name !== 'paragraph' || node.attrs.listRendering == null) return false;
  if (node.attrs.sdBlockId != null) return false;
  if (!blockRevIsFreshForSlicePaste(node.attrs.sdBlockRev)) return false;
  return transactions.some((tr) => tr.getMeta('superdocSlicePaste'));
}

/**
 * Create a ProseMirror plugin that keeps `listRendering` data in sync with the
 * underlying Word numbering definitions.
 *
 * @param {import('../../core/Editor').Editor} editor The active editor instance.
 * @returns {import('prosemirror-state').Plugin}
 */
export function createNumberingPlugin(editor) {
  const listRenderingSync = createListRenderingSync(editor);
  let forceFullRecompute = true;

  const refreshStartSettings = () => {
    listRenderingSync.refreshStartSettings();
    forceFullRecompute = true;
  };

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

      const normalizeListRendering = (listRendering) => listRendering ?? null;

      const serializeListRendering = (listRendering) => JSON.stringify(normalizeListRendering(listRendering));

      const updateListRenderingIfNeeded = (node, pos, nextListRendering) => {
        if (serializeListRendering(node?.attrs?.listRendering) === serializeListRendering(nextListRendering)) {
          return;
        }

        tr.setNodeAttribute(pos, 'listRendering', normalizeListRendering(nextListRendering));
        bumpBlockRev(node, pos);
      };

      listRenderingSync.syncListRendering({
        visitNodes: (visit) =>
          newState.doc.descendants((node, pos) => visit(node, pos, { $pos: newState.doc.resolve(pos) })),
        resolveParagraphProperties: (node, _pos, context) =>
          calculateResolvedParagraphProperties(editor, node, context.$pos),
        shouldPreserveParagraph: (node) => shouldPreserveSlicePastedListRendering(node, transactions),
        updateListRendering: updateListRenderingIfNeeded,
      });
      return tr.docChanged ? tr : null;
    },
  });
}
