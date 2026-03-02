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
       * @returns {import('./computeDiff.ts').DiffResult}
       */
      compareDocuments:
        (updatedDocument, updatedComments = []) =>
        ({ state }) => {
          const diffs = computeDiff(
            state.doc,
            updatedDocument,
            state.schema,
            this.editor.converter?.comments ?? [],
            updatedComments,
          );
          return diffs;
        },

      /**
       * Replays a diff result onto the current document as tracked changes.
       *
       * @param {import('./computeDiff.ts').DiffResult} diff
       * @param {{ applyTrackedChanges?: boolean }} options
       * @returns {import('prosemirror-state').Transaction}
       */
      replayDifferences:
        (diff, { applyTrackedChanges = true }) =>
        ({ state, dispatch }) => {
          const comments = this.editor.converter
            ? Array.isArray(this.editor.converter.comments)
              ? this.editor.converter.comments
              : (this.editor.converter.comments = [])
            : [];

          const canApplyTrackedChanges = applyTrackedChanges && Boolean(this.editor.options.user);

          replayDiffs({
            tr: state.tr,
            diff,
            schema: state.schema,
            comments,
            editor: this.editor,
          });
          if (canApplyTrackedChanges) {
            state.tr.setMeta('forceTrackChanges', true);
          }

          if (dispatch && state.tr.docChanged) {
            dispatch(state.tr);
          }

          this.editor.emit('commentsUpdate', { type: 'replayCompleted' });
          return true;
        },
    };
  },
});
