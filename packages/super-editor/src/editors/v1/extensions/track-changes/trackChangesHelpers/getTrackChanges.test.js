import { describe, test, expect } from 'vitest';
import { getTrackChanges } from './getTrackChanges.js';

// SD-2641: The helper must not throw when called before the editor's PM state
// is initialized. During DOCX comment-import bootstrap, the orchestrator schedules
// the call via setTimeout(0) which only defers to the next tick — it does not wait
// for editor.state to be attached. The helper is reused from 4 call sites in
// comments-store.js, so we harden it once at the source rather than guarding each
// caller.
describe('getTrackChanges — null-safe input handling', () => {
  test('returns [] when state is undefined', () => {
    expect(getTrackChanges(undefined)).toEqual([]);
  });

  test('returns [] when state is null', () => {
    expect(getTrackChanges(null)).toEqual([]);
  });

  test('returns [] when state has no doc property', () => {
    expect(getTrackChanges({})).toEqual([]);
  });

  test('returns [] when state.doc is undefined', () => {
    expect(getTrackChanges({ doc: undefined })).toEqual([]);
  });
});
