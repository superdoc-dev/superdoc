import { describe, it, expect } from 'bun:test';
import { Doc as YDoc } from 'yjs';
import { buildAttachEditor } from '../session-manager.js';

/**
 * Tracked-change authoring over a collab attach requires a configured user.
 * Without one, `forceTrackChanges` rejects the edit ("forceTrackChanges requires
 * a user to be configured on the editor instance") because the gate reads
 * `editor.options.user`, which is null on a bare attach.
 *
 * `buildAttachEditor` accepts an optional user and wires it into the headless
 * Editor config so suggested edits can be attributed to a reviewer.
 */
describe('collab attach user identity (tracked-change user wiring)', () => {
  // Scope: this asserts buildAttachEditor wires `user` into the Editor config —
  // the input the forceTrackChanges gate reads. The gate's own behavior (rejecting
  // tracked edits when no user is set) belongs to super-editor and is tested there.
  it('configures the tracked-change user on the attach editor when supplied', async () => {
    const ydoc = new YDoc({ gc: false });
    const user = { id: 'reviewer-1', name: 'Reviewer', email: 'reviewer@example.com' };

    const editor = await buildAttachEditor(ydoc, 'test-room', user);

    // This is the exact value the forceTrackChanges gate reads.
    expect(editor.options.user).toEqual(user);

    editor.destroy();
  });

  it('leaves the user unset when none is supplied (default preserved)', async () => {
    const ydoc = new YDoc({ gc: false });

    const editor = await buildAttachEditor(ydoc, 'test-room');

    // Editor default for `user` is null; the no-arg attach path must not invent one.
    expect(editor.options.user ?? null).toBeNull();

    editor.destroy();
  });

  it('disables telemetry for headless room attach editors', async () => {
    const ydoc = new YDoc({ gc: false });

    const editor = await buildAttachEditor(ydoc, 'test-room');

    expect(editor.options.telemetry).toEqual({ enabled: false });

    editor.destroy();
  });
});
