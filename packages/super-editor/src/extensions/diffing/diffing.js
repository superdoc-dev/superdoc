// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { computeDiff } from './computeDiff.ts';

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
    };
  },
});
