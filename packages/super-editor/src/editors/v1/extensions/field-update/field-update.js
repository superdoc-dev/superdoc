import { Extension } from '@core/Extension.js';
import { formatPageNumberFieldValue } from '@superdoc/contracts';
import { findFieldsInRange } from '../../document-api-adapters/helpers/field-resolver.js';
import { findAllTocNodes } from '../../document-api-adapters/helpers/toc-resolver.js';
import {
  getWordStatistics,
  resolveDocumentStatFieldValue,
  resolveMainBodyEditor,
} from '../../document-api-adapters/helpers/word-statistics.js';
import { resolveSectionPageCountFieldValue } from '../../document-api-adapters/helpers/section-page-count.js';
import {
  getSequenceFieldUpdaterConverterContext,
  updateSequenceFieldsInTransaction,
} from '../../document-api-adapters/helpers/sequence-field-updater.js';
import { getPageNumberFieldFormat } from '../../core/layout-adapter/converters/inline-converters/page-number-field-format.js';

/** Stat-field types refreshed by F9 when the doc has no TOCs. */
const UPDATABLE_FIELD_TYPES = new Set(['NUMWORDS', 'NUMCHARS', 'NUMPAGES', 'SECTIONPAGES']);

function resolveTotalPageNumberFieldValue(stats, node) {
  if (stats.pages == null) return null;
  return formatPageNumberFieldValue(stats.pages, getPageNumberFieldFormat(node.attrs));
}

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
          const originalSelectionFields = findFieldsInRange(state.doc, from, to);
          const selectionHadSeq = originalSelectionFields.some((field) => field.fieldType === 'SEQ');
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

          const activeState = tocPathRan && editor?.state?.doc ? editor.state : state;
          const activeDoc = activeState.doc ?? state.doc;
          const activeSchema = activeState.schema ?? state.schema;
          const activeFrom = Math.min(from, activeDoc.content.size);
          const activeTo = to >= state.doc.content.size ? activeDoc.content.size : Math.min(to, activeDoc.content.size);

          const fields = findFieldsInRange(activeDoc, activeFrom, activeTo);
          const updatable = fields.filter((f) => UPDATABLE_FIELD_TYPES.has(f.fieldType));
          const hasSeqSelection = selectionHadSeq || fields.some((field) => field.fieldType === 'SEQ');
          if (updatable.length === 0 && !hasSeqSelection) return tocPathRan;

          const mainEditor = resolveMainBodyEditor(editor);
          const stats = getWordStatistics(mainEditor);

          const tr = activeState.tr;
          let changed = false;

          // Process in reverse position order so earlier positions stay valid
          // as we apply setNodeMarkup (which replaces nodes in-place).
          const sorted = [...updatable].sort((a, b) => b.pos - a.pos);

          for (const field of sorted) {
            const node = tr.doc.nodeAt(field.pos);
            if (!node) continue;

            const freshValue =
              field.fieldType === 'SECTIONPAGES'
                ? resolveSectionPageCountFieldValue(editor, node)
                : field.fieldType === 'NUMPAGES' && node.type.name === 'total-page-number'
                  ? resolveTotalPageNumberFieldValue(stats, node)
                  : resolveDocumentStatFieldValue(field.fieldType, stats);
            if (freshValue == null) continue;

            if (node.type.name === 'total-page-number' || node.type.name === 'section-page-count') {
              // Page-count fields store their display value as a text child,
              // not just an attr. Replace the entire node so both the text
              // content and resolvedText stay in sync.
              const textChild = freshValue ? activeSchema.text(freshValue) : null;
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

          if (hasSeqSelection) {
            const result = updateSequenceFieldsInTransaction({
              tr,
              schema: activeSchema,
              scope: { kind: 'all' },
              converterContext: getSequenceFieldUpdaterConverterContext(editor),
            });
            changed = changed || result.changed;
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
