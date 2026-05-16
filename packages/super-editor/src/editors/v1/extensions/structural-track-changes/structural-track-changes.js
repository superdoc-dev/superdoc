import { Extension } from '@core/Extension.js';
import { applyHunks } from './structuralTrackChangesHelpers/applyHunks.js';
import { computeStructuralDiff } from './structuralTrackChangesHelpers/computeStructuralDiff.js';
import { getBlockTrackedChanges } from '../track-changes/trackChangesHelpers/getBlockTrackedChanges.js';
import { applyRowTrackedChangeResolution } from '../track-changes/trackChangesHelpers/acceptRejectRowTrackedChange.js';

/**
 * StructuralTrackChanges — block-level (table) tracked-change extension.
 *
 * Pattern: consumer computes `StructuralHunk[]` (e.g. via `computeStructuralDiff`)
 * and dispatches via `editor.commands.setStructuralDiff(hunks)`. The extension
 * stamps a `trackChange` PM attribute on each affected `tableRow`. Rendering is
 * handled by the painter (reads `data-track-change` data attrs from row.trackedChange).
 * The review bubble appears via the comments-plugin's block-level walk.
 *
 * Accept/reject is identity-agnostic — operates on PM attrs, not an in-memory
 * hunk store. The same `acceptTrackedChangeById` entry point inline tracked
 * changes use is extended in `track-changes.js` to also handle row-attr ids.
 *
 * Not registered in `getStarterExtensions()`; consumers opt in via
 * `editorExtensions: [StructuralTrackChanges]`.
 */
export const StructuralTrackChanges = Extension.create({
  name: 'structuralTrackChanges',

  addCommands() {
    return {
      setStructuralDiff:
        (hunks) =>
        ({ state, dispatch }) => {
          if (!Array.isArray(hunks) || hunks.length === 0) return true;
          const tr = state.tr;
          tr.setMeta('addToHistory', false);
          const { applied } = applyHunks({ tr, state, hunks });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      acceptStructuralChange:
        (id) =>
        ({ state, dispatch }) => {
          if (!id) return false;
          const entries = getBlockTrackedChanges(state);
          const ids = entries.filter((e) => e.id === id || e.operationId === id).map((e) => e.id);
          if (ids.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({ tr, state, ids, decision: 'accept' });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      rejectStructuralChange:
        (id) =>
        ({ state, dispatch }) => {
          if (!id) return false;
          const entries = getBlockTrackedChanges(state);
          const ids = entries.filter((e) => e.id === id || e.operationId === id).map((e) => e.id);
          if (ids.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({ tr, state, ids, decision: 'reject' });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      acceptAllStructuralChanges:
        () =>
        ({ state, dispatch }) => {
          const entries = getBlockTrackedChanges(state);
          if (entries.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({
            tr,
            state,
            ids: entries.map((e) => e.id),
            decision: 'accept',
          });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      rejectAllStructuralChanges:
        () =>
        ({ state, dispatch }) => {
          const entries = getBlockTrackedChanges(state);
          if (entries.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({
            tr,
            state,
            ids: entries.map((e) => e.id),
            decision: 'reject',
          });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      acceptTrackedChangeOperation:
        (operationId) =>
        ({ state, dispatch }) => {
          if (!operationId) return false;
          const entries = getBlockTrackedChanges(state).filter((e) => e.operationId === operationId);
          if (entries.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({
            tr,
            state,
            ids: entries.map((e) => e.id),
            decision: 'accept',
          });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      rejectTrackedChangeOperation:
        (operationId) =>
        ({ state, dispatch }) => {
          if (!operationId) return false;
          const entries = getBlockTrackedChanges(state).filter((e) => e.operationId === operationId);
          if (entries.length === 0) return false;
          const tr = state.tr;
          tr.setMeta('inputType', 'acceptReject');
          const { applied } = applyRowTrackedChangeResolution({
            tr,
            state,
            ids: entries.map((e) => e.id),
            decision: 'reject',
          });
          if (applied === 0) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

export { computeStructuralDiff };
