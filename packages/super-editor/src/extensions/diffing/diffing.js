// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { computeDiff } from './computeDiff.ts';
import { replayDiffs } from './replayDiffs.ts';

export const Diffing = Extension.create({
  name: 'documentDiffing',

  addCommands() {
    return {
      /**
       * Compares the current document against `updatedDocument` and returns the diffs required to
       * transform the former into the latter.
       *
       * These diffs are intended to be replayed on-top of the old document, so apply the
       * returned list in reverse (last entry first) to keep insertions that share the same
       * `pos` anchor in the correct order.
       *
       * @param {import('prosemirror-model').Node} updatedDocument
       * @param {import('./algorithm/comment-diffing.ts').CommentInput[]} [updatedComments]
       * @param {import('@superdoc/style-engine/ooxml').StylesDocumentProperties | null} [updatedStyles]
       * @param {import('@superdoc/style-engine/ooxml').NumberingProperties | null} [updatedNumbering]
       * @returns {import('./computeDiff.ts').DiffResult}
       */
      compareDocuments:
        (updatedDocument, updatedComments, updatedStyles, updatedNumbering) =>
        ({ state, tr }) => {
          tr.setMeta('preventDispatch', true);
          const currentComments = this.editor.converter?.comments ?? [];
          const nextComments = updatedComments === undefined ? currentComments : updatedComments;
          const currentStyles = this.editor.converter?.translatedLinkedStyles ?? null;
          const nextStyles = updatedStyles === undefined ? currentStyles : updatedStyles;
          const currentNumbering = this.editor.converter?.translatedNumbering ?? null;
          const nextNumbering = updatedNumbering === undefined ? currentNumbering : updatedNumbering;
          const diffs = computeDiff(
            state.doc,
            updatedDocument,
            state.schema,
            currentComments,
            nextComments,
            currentStyles,
            nextStyles,
            currentNumbering,
            nextNumbering,
          );
          return diffs;
        },

      /**
       * Replays a diff result onto the current document as tracked changes.
       *
       * @param {import('./computeDiff.ts').DiffResult} diff
       * @param {{ applyTrackedChanges?: boolean }} [options]
       * @returns {import('prosemirror-state').Transaction}
       */
      replayDifferences:
        (diff, { applyTrackedChanges = true } = {}) =>
        ({ state, dispatch }) => {
          if (!dispatch) {
            return true;
          }

          const comments = this.editor.converter
            ? Array.isArray(this.editor.converter.comments)
              ? this.editor.converter.comments
              : (this.editor.converter.comments = [])
            : [];
          const tr = state.tr;

          const canApplyTrackedChanges = applyTrackedChanges && Boolean(this.editor.options.user);

          replayDiffs({
            tr,
            diff,
            schema: state.schema,
            comments,
            editor: this.editor,
          });
          if (canApplyTrackedChanges) {
            tr.setMeta('forceTrackChanges', true);
          } else {
            tr.setMeta('skipTrackChanges', true);
          }

          if (dispatch && tr.docChanged) {
            dispatch(tr);
          }

          this.editor.emit('commentsUpdate', { type: 'replayCompleted' });
          return true;
        },
    };
  },
});
