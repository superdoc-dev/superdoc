import { Extension } from '@core/Extension.js';
import { findFieldsInRange } from '../../document-api-adapters/helpers/field-resolver.js';
import { findAllTocNodes } from '../../document-api-adapters/helpers/toc-resolver.js';
import {
  getWordStatistics,
  resolveDocumentStatFieldValue,
  resolveMainBodyEditor,
} from '../../document-api-adapters/helpers/word-statistics.js';

/** Stat-field types refreshed by F9 when the doc has no TOCs. */
const UPDATABLE_FIELD_TYPES = new Set(['NUMWORDS', 'NUMCHARS', 'NUMPAGES']);

/**
 * @module FieldUpdate
 * @sidebarTitle Field Update
 * @shortcut F9 | updateFieldsInSelection | Update fields in selection
 */
export const FieldUpdate = Extension.create({
  name: 'fieldUpdate',

  addCommands() {
    return {
      /**
       * Refresh document fields.
       *
       * - When the doc contains any TOCs, rebuilds **all** of them via
       *   `editor.doc.toc.update({ mode: 'all' })` and stops.
       * - Otherwise, refreshes stat fields (NUMWORDS, NUMCHARS, NUMPAGES) that
       *   intersect the current selection.
       *
       * Bound to F9. Returns `true` if anything was updated.
       *
       * @category Command
       * @returns {Function} ProseMirror command function
       * @example
       * editor.commands.updateFieldsInSelection()
       */
      updateFieldsInSelection:
        () =>
        ({ editor, state, tr: outerTr, dispatch }) => {
          const { from, to } = state.selection;
          let tocPathRan = false;

          // toc.update dispatches its own transaction per TOC; CommandService
          // would then auto-apply its captured (now-stale) `tr` to the new
          // state. Set preventDispatch so it skips that.
          if (editor?.doc?.toc?.update) {
            const tocTargets = findAllTocNodes(state.doc)
              .map((toc) => toc.commandNodeId)
              .filter((id) => typeof id === 'string' && id);

            if (tocTargets.length > 0) {
              if (!dispatch) return true; // can()-style probe

              // Each toc.update swaps editor.state.doc, which makes
              // tocStorage.pageMapDoc stale and forces subsequent TOCs to
              // rebuild with '0' placeholders. Re-stamp pageMapDoc to the
              // current doc each iteration — the layout has not been
              // recomputed, so the page numbers from the original layout
              // are still authoritative for this update cycle.
              const tocStorage = editor.storage?.tableOfContents;
              const cachedPageMap = tocStorage?.pageMap ?? null;

              for (const sdBlockId of tocTargets) {
                if (tocStorage && cachedPageMap) {
                  tocStorage.pageMap = cachedPageMap;
                  tocStorage.pageMapDoc = editor.state.doc;
                }
                try {
                  editor.doc.toc.update({
                    target: { kind: 'block', nodeType: 'tableOfContents', nodeId: sdBlockId },
                    mode: 'all',
                  });
                } catch (error) {
                  console.warn('[FieldUpdate] toc.update failed for', sdBlockId, error);
                }
              }

              outerTr?.setMeta?.('preventDispatch', true);
              tocPathRan = true;
              // Fall through to the stat-field path so a doc that contains
              // both a TOC and stat fields (NUMWORDS / NUMCHARS / NUMPAGES)
              // refreshes both on F9.
            }
          }

          const fields = findFieldsInRange(state.doc, from, to);
          const updatable = fields.filter((f) => UPDATABLE_FIELD_TYPES.has(f.fieldType));
          if (updatable.length === 0) return tocPathRan;

          const mainEditor = resolveMainBodyEditor(editor);
          const stats = getWordStatistics(mainEditor);

          const tr = state.tr;
          let changed = false;

          // Process in reverse position order so earlier positions stay valid
          // as we apply setNodeMarkup (which replaces nodes in-place).
          const sorted = [...updatable].sort((a, b) => b.pos - a.pos);

          for (const field of sorted) {
            const freshValue = resolveDocumentStatFieldValue(field.fieldType, stats);
            if (freshValue == null) continue;

            const node = tr.doc.nodeAt(field.pos);
            if (!node) continue;

            if (node.type.name === 'total-page-number') {
              // total-page-number stores its display value as a text child,
              // not just an attr. Replace the entire node so both the text
              // content and resolvedText stay in sync.
              const textChild = freshValue ? state.schema.text(freshValue) : null;
              const newNode = node.type.create({ ...node.attrs, resolvedText: freshValue }, textChild);
              tr.replaceWith(field.pos, field.pos + node.nodeSize, newNode);
              changed = true;
            } else {
              const currentValue = (node.attrs?.resolvedText ?? '').toString();
              if (currentValue === freshValue) continue;

              tr.setNodeMarkup(field.pos, undefined, {
                ...node.attrs,
                resolvedText: freshValue,
              });
              changed = true;
            }
          }

          if (!changed) return tocPathRan;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addShortcuts() {
    return {
      F9: () => this.editor.commands.updateFieldsInSelection(),
    };
  },
});
