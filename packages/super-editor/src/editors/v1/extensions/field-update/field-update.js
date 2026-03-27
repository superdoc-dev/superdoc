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
       * Update all field values intersecting the current selection.
       *
       * Mirrors Word's F9 semantics:
       * - Collapsed selection: updates the single field at the cursor
       * - Range selection: updates all fields intersecting the range
       * - Select-all then F9: updates every field in the document
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
          const fields = findFieldsInRange(state.doc, from, to);

          const updatable = fields.filter((f) => UPDATABLE_FIELD_TYPES.has(f.fieldType));
          if (updatable.length === 0) return false;

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

          if (!changed) return false;
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
