import { Extension } from '@core/Extension.js';
import { findFieldsInRange } from '../../document-api-adapters/helpers/field-resolver.js';
import {
  getWordStatistics,
  resolveDocumentStatFieldValue,
  resolveMainBodyEditor,
} from '../../document-api-adapters/helpers/word-statistics.js';

/** Field types eligible for value updates via F9. */
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
       * Refresh document fields. Two phases run in order:
       *
       * 1. Every `tableOfContents` node in the document is rebuilt via
       *    `editor.doc.toc.update({ mode: 'all' })`. The wrapper handles
       *    materialization, page-map resolution, leader/style preservation,
       *    and bookmark sync.
       * 2. Updatable stat fields (NUMWORDS, NUMCHARS, NUMPAGES) intersecting
       *    the current selection are refreshed in-place.
       *
       * Bound to F9. Returns `true` if any TOC or stat field changed.
       *
       * @category Command
       * @returns {Function} ProseMirror command function
       * @example
       * editor.commands.updateFieldsInSelection()
       */
      updateFieldsInSelection:
        () =>
        ({ editor, state, dispatch }) => {
          const { from, to } = state.selection;

          // F9 first refreshes every TOC in the document via the document-api.
          // We dispatch through `editor.doc.toc.update` so each rebuild flows
          // through the standard wrapper (page-map resolution, leader/style
          // preservation, bookmark sync). NO_OP results are ignored.
          let tocUpdated = false;
          if (editor?.doc?.toc?.update) {
            if (!dispatch) {
              // can()-style probe: report yes if any TOC exists.
              let hasToc = false;
              state.doc.descendants((node) => {
                if (hasToc) return false;
                if (node.type.name === 'tableOfContents') {
                  hasToc = true;
                  return false;
                }
                return true;
              });
              if (hasToc) return true;
            } else {
              const tocTargets = [];
              state.doc.descendants((node) => {
                if (node.type.name === 'tableOfContents') {
                  const sdBlockId = node.attrs?.sdBlockId;
                  if (typeof sdBlockId === 'string' && sdBlockId) {
                    tocTargets.push(sdBlockId);
                  }
                  return false; // don't descend into TOC children
                }
                return true;
              });

              for (const sdBlockId of tocTargets) {
                try {
                  const result = editor.doc.toc.update({
                    target: { kind: 'block', nodeType: 'tableOfContents', nodeId: sdBlockId },
                    mode: 'all',
                  });
                  if (result?.success) tocUpdated = true;
                } catch (error) {
                  console.warn('[FieldUpdate] toc.update failed for', sdBlockId, error);
                }
              }
            }
          }

          // After TOC updates the doc snapshot may have shifted positions, so
          // re-read state from the editor only in that case. When nothing was
          // updated above, use the original `state` snapshot to keep the
          // pre-existing stat-field path byte-for-byte equivalent.
          const currentState = tocUpdated ? (editor?.state ?? state) : state;
          const fields = findFieldsInRange(currentState.doc, from, to);

          const updatable = fields.filter((f) => UPDATABLE_FIELD_TYPES.has(f.fieldType));
          if (updatable.length === 0) return tocUpdated;

          const mainEditor = resolveMainBodyEditor(editor);
          const stats = getWordStatistics(mainEditor);

          const tr = currentState.tr;
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
              const textChild = freshValue ? currentState.schema.text(freshValue) : null;
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

          if (!changed) return tocUpdated;
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
