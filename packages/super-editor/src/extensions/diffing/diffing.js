// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { computeDiff } from './computeDiff.ts';
import { replayDiffs } from './replayDiffs.ts';
import { captureHeaderFooterState } from './algorithm/header-footer-diffing.ts';
import { capturePartsState } from './algorithm/parts-diffing.ts';

export const Diffing = Extension.create({
  name: 'documentDiffing',

  addCommands() {
    return {
      /**
       * Compares the current document against `targetEditor` and returns the diffs required to
       * transform the former into the latter.
       *
       * These diffs are intended to be replayed on-top of the old document, so apply the
       * returned list in reverse (last entry first) to keep insertions that share the same
       * `pos` anchor in the correct order.
       *
       * @param {{ state: { doc: import('prosemirror-model').Node; schema: import('prosemirror-model').Schema }; converter?: unknown }} targetEditor
       * @returns {import('./computeDiff.ts').DiffResult}
       */
      compareDocuments:
        (targetEditor) =>
        ({ state, tr }) => {
          tr.setMeta('preventDispatch', true);
          const updatedDocument = targetEditor.state.doc;
          const currentComments = this.editor.converter?.comments ?? [];
          const nextComments = targetEditor.converter?.comments ?? currentComments;
          const currentStyles = this.editor.converter?.translatedLinkedStyles ?? null;
          const nextStyles = targetEditor.converter?.translatedLinkedStyles ?? currentStyles;
          const currentNumbering = this.editor.converter?.translatedNumbering ?? null;
          const nextNumbering = targetEditor.converter?.translatedNumbering ?? currentNumbering;
          const currentHeaderFooters = captureHeaderFooterState(this.editor);
          const currentPartsState = capturePartsState(this.editor, currentHeaderFooters);
          const nextHeaderFooters = captureHeaderFooterState(targetEditor);
          const nextPartsState = capturePartsState(targetEditor, nextHeaderFooters);
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
            currentHeaderFooters,
            nextHeaderFooters,
            currentPartsState,
            nextPartsState,
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
          if (canApplyTrackedChanges) {
            // Diff replay can add pagination and section metadata to the transaction.
            // Marking it as programmatic keeps tracked replay enabled for body steps.
            tr.setMeta('inputType', 'programmatic');
          }

          const replayResult = replayDiffs({
            tr,
            diff,
            schema: state.schema,
            comments,
            editor: this.editor,
            trackedChangesRequested: canApplyTrackedChanges,
          });
          if (canApplyTrackedChanges) {
            tr.setMeta('forceTrackChanges', true);
          } else {
            tr.setMeta('skipTrackChanges', true);
          }

          if (dispatch && (tr.docChanged || replayResult.appliedDiffs > 0)) {
            dispatch(tr);
          }

          this.editor.emit('commentsUpdate', { type: 'replayCompleted' });
          return true;
        },
    };
  },
});
