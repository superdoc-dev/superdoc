import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { TrackInsertMarkName } from '@extensions/track-changes/constants.js';
import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/trackChangesBasePlugin.js';

describe('Editor dispatch tracked-change meta', () => {
  let editor;

  afterEach(() => {
    if (editor && !editor.isDestroyed) {
      editor.destroy();
      editor = null;
    }
  });

  it('treats forceTrackChanges programmatic transactions as tracked even when global mode is off', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Hello</p>',
      user: { name: 'Test', email: 'test@example.com' },
      useImmediateSetTimeout: false,
    }));

    const trackInsertMark = editor.schema?.marks?.[TrackInsertMarkName];
    expect(trackInsertMark).toBeDefined();

    const trackState = TrackChangesBasePluginKey.getState(editor.state);
    expect(trackState?.isTrackChangesActive ?? false).toBe(false);
    expect(getTrackChanges(editor.state)).toHaveLength(0);

    const tr = editor.state.tr
      .insertText('X', 1, 1)
      .setMeta('inputType', 'programmatic')
      .setMeta('forceTrackChanges', true);

    editor.dispatch(tr);

    const tracked = getTrackChanges(editor.state);
    expect(tracked.some((entry) => entry.mark.type.name === TrackInsertMarkName)).toBe(true);
  });

  it('skipTrackChanges overrides forceTrackChanges — no tracking applied', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Hello</p>',
      user: { name: 'Test', email: 'test@example.com' },
      useImmediateSetTimeout: false,
    }));

    const trackState = TrackChangesBasePluginKey.getState(editor.state);
    expect(trackState?.isTrackChangesActive ?? false).toBe(false);

    const tr = editor.state.tr
      .insertText('X', 1, 1)
      .setMeta('inputType', 'programmatic')
      .setMeta('forceTrackChanges', true)
      .setMeta('skipTrackChanges', true);

    editor.dispatch(tr);

    const tracked = getTrackChanges(editor.state);
    expect(tracked).toHaveLength(0);
  });

  it('throws a clear error when forceTrackChanges is used without a configured user', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Hello</p>',
      useImmediateSetTimeout: false,
    }));

    const tr = editor.state.tr
      .insertText('X', 1, 1)
      .setMeta('inputType', 'programmatic')
      .setMeta('forceTrackChanges', true);

    expect(() => editor.dispatch(tr)).toThrow(
      'forceTrackChanges requires a user to be configured on the editor instance.',
    );
  });

  it('global track-changes mode still produces tracked entities without forceTrackChanges', () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Hello</p>',
      user: { name: 'Test', email: 'test@example.com' },
      useImmediateSetTimeout: false,
    }));

    const enableTr = editor.state.tr.setMeta(TrackChangesBasePluginKey, {
      type: 'TRACK_CHANGES_ENABLE',
      value: true,
    });
    editor.dispatch(enableTr);

    const trackState = TrackChangesBasePluginKey.getState(editor.state);
    expect(trackState?.isTrackChangesActive).toBe(true);

    const tr = editor.state.tr.insertText('Y', 1, 1).setMeta('inputType', 'programmatic');

    editor.dispatch(tr);

    const tracked = getTrackChanges(editor.state);
    expect(tracked.some((entry) => entry.mark.type.name === TrackInsertMarkName)).toBe(true);
  });
});
