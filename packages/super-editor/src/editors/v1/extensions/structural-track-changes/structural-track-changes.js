import { Extension } from '@core/Extension.js';
import { applyHunks } from './structuralTrackChangesHelpers/applyHunks.js';
import { computeStructuralDiff } from './structuralTrackChangesHelpers/computeStructuralDiff.js';

/**
 * StructuralTrackChanges — table-level diff replay built on the existing
 * structural-row tracked-changes pipeline.
 *
 * Pattern: consumer (e.g. al-pmo's AI review flow) computes
 * `StructuralHunk[]` between a base doc and a proposal doc via
 * `computeStructuralDiff`, then dispatches the result with
 * `editor.commands.setStructuralDiff(hunks)`. The extension threads the user
 * + a timestamp into `applyHunks`, which delegates to upstream's
 * `stampTableRows` so each tracked row carries the same
 * `tableRow.attrs.trackChange` shape the OOXML importer/exporter, the
 * row-change enumerator, the review graph, and the decision engine already
 * use. Accept/reject is then handled by the existing inline pipeline —
 * `acceptTrackedChangeById` / `acceptAllTrackedChanges` (and their reject
 * twins) route structural changes through `dispatchReviewDecision` →
 * review-graph → decision-engine.
 *
 * Registered in `getStarterExtensions()` so every editor instance carries the
 * `setStructuralDiff` command; consumers that don't compute hunks just won't
 * call it.
 */
export const StructuralTrackChanges = Extension.create({
  name: 'structuralTrackChanges',

  addCommands() {
    return {
      setStructuralDiff:
        (hunks) =>
        ({ state, dispatch, editor }) => {
          if (!Array.isArray(hunks) || hunks.length === 0) return true;
          const tr = state.tr;
          tr.setMeta('addToHistory', false);
          const user = editor?.options?.user ?? {};
          const date = new Date().toISOString();
          const { applied } = applyHunks({ tr, state, user, date, hunks });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

export { computeStructuralDiff };
