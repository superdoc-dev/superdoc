// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { computeDiff } from './computeDiff.js';

export const Diffing = Extension.create({
  name: 'documentDiffing',

  addCommands() {
    return {
      compareDocuments:
        (updatedDocument) =>
        ({ state }) => {
          const diffs = computeDiff(state.doc, updatedDocument);
          return diffs;
        },
    };
  },
});
