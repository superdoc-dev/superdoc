/**
 * Unit tests for `NoteEditorRegistry`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteEditorRegistry } from './NoteEditorRegistry.js';
import type { Editor } from '../../Editor.js';
import type { FootnoteStoryLocator, EndnoteStoryLocator } from '@superdoc/document-api';

type FakeEditor = Pick<Editor, 'destroy'>;

const buildFakeEditor = (): FakeEditor => ({ destroy: vi.fn() });

const fnLocator = (noteId: string): FootnoteStoryLocator => ({
  kind: 'story',
  storyType: 'footnote',
  noteId,
});

const enLocator = (noteId: string): EndnoteStoryLocator => ({
  kind: 'story',
  storyType: 'endnote',
  noteId,
});

describe('NoteEditorRegistry', () => {
  let now: number;
  let pending: Array<{ callback: () => void; interval: number }>;

  beforeEach(() => {
    now = 1_000_000;
    pending = [];
  });

  const buildRegistry = (opts: Partial<ConstructorParameters<typeof NoteEditorRegistry>[0]> = {}): NoteEditorRegistry =>
    new NoteEditorRegistry({
      now: () => now,
      scheduleSweep: (callback, interval) => {
        pending.push({ callback, interval });
        return () => {
          pending = pending.filter((entry) => entry.callback !== callback);
        };
      },
      ...opts,
    });

  afterEach(() => {
    pending = [];
  });

  describe('registration and lookup', () => {
    it('does not schedule idle sweeping until an unpinned entry exists', () => {
      const registry = buildRegistry();
      expect(pending).toHaveLength(0);

      const editor = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });

      expect(pending).toHaveLength(1);
      registry.destroy();
      expect(pending).toHaveLength(0);
    });

    it('returns null for unknown keys and the tracked editor for known keys', () => {
      const registry = buildRegistry();
      const editor = buildFakeEditor();
      expect(registry.get('fn:1')).toBeNull();

      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });

      expect(registry.get('fn:1')).toBe(editor);
      registry.destroy();
    });

    it('emits editorCreated with the storyKey, editor, and locator', () => {
      const registry = buildRegistry();
      const listener = vi.fn();
      registry.on('editorCreated', listener);

      const editor = buildFakeEditor();
      const locator = fnLocator('7');
      registry.register({ storyKey: 'fn:7', locator, editor: editor as Editor });

      expect(listener).toHaveBeenCalledWith({ storyKey: 'fn:7', editor, locator });
      registry.destroy();
    });

    it('replaces an existing entry in place without re-emitting editorCreated', () => {
      const registry = buildRegistry();
      const listener = vi.fn();
      registry.on('editorCreated', listener);

      const first = buildFakeEditor();
      const second = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: first as Editor });
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: second as Editor });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(registry.get('fn:1')).toBe(second);
      registry.destroy();
    });
  });

  describe('commit hook', () => {
    it('returns the commit hook captured at registration', () => {
      const registry = buildRegistry();
      const editor = buildFakeEditor();
      const commit = vi.fn();
      registry.register({
        storyKey: 'fn:1',
        locator: fnLocator('1'),
        editor: editor as Editor,
        commit,
      });
      expect(registry.getCommitHook('fn:1')).toBe(commit);
      registry.destroy();
    });

    it('setCommitHook updates the commit reference', () => {
      const registry = buildRegistry();
      const editor = buildFakeEditor();
      const initial = vi.fn();
      const replacement = vi.fn();
      registry.register({
        storyKey: 'fn:1',
        locator: fnLocator('1'),
        editor: editor as Editor,
        commit: initial,
      });
      registry.setCommitHook('fn:1', replacement);
      expect(registry.getCommitHook('fn:1')).toBe(replacement);
      registry.destroy();
    });
  });

  describe('pinning', () => {
    it('toggles pinned state and returns it via isPinned', () => {
      const registry = buildRegistry();
      const editor = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });

      expect(registry.isPinned('fn:1')).toBe(false);
      registry.pin('fn:1');
      expect(registry.isPinned('fn:1')).toBe(true);
      registry.unpin('fn:1');
      expect(registry.isPinned('fn:1')).toBe(false);
      registry.destroy();
    });

    it('re-applies the capacity cap when an entry is unpinned', () => {
      const registry = buildRegistry({ capacity: 1 });
      const first = buildFakeEditor();
      const second = buildFakeEditor();

      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: first as Editor });
      registry.pin('fn:1');
      registry.register({ storyKey: 'fn:2', locator: fnLocator('2'), editor: second as Editor });

      expect(registry.get('fn:1')).toBe(first);
      expect(registry.get('fn:2')).toBe(second);

      registry.unpin('fn:1');

      expect(registry.get('fn:1')).toBeNull();
      expect(first.destroy).toHaveBeenCalled();
      expect(registry.get('fn:2')).toBe(second);
      registry.destroy();
    });
  });

  describe('idle disposal', () => {
    it('disposes unpinned editors whose lastAccess passes the TTL', () => {
      const registry = buildRegistry({ idleTtlMs: 1000 });
      const editor = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });

      now += 2000;
      registry.runIdleSweep();

      expect(registry.get('fn:1')).toBeNull();
      expect(editor.destroy).toHaveBeenCalled();
      registry.destroy();
    });

    it('keeps pinned editors alive across sweeps', () => {
      const registry = buildRegistry({ idleTtlMs: 1000 });
      const editor = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });
      registry.pin('fn:1');

      now += 5000;
      registry.runIdleSweep();

      expect(registry.get('fn:1')).toBe(editor);
      expect(editor.destroy).not.toHaveBeenCalled();
      registry.destroy();
    });

    it('calls onBeforeAutoDispose when the sweep evicts an entry', () => {
      const onBeforeAutoDispose = vi.fn();
      const registry = buildRegistry({ idleTtlMs: 1000, onBeforeAutoDispose });
      const editor = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: editor as Editor });

      now += 2000;
      registry.runIdleSweep();

      expect(onBeforeAutoDispose).toHaveBeenCalledWith('fn:1');
      registry.destroy();
    });
  });

  describe('capacity', () => {
    it('evicts the oldest unpinned entry when the cap is exceeded', () => {
      const registry = buildRegistry({ capacity: 2 });

      const first = buildFakeEditor();
      const second = buildFakeEditor();
      const third = buildFakeEditor();

      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: first as Editor });
      now += 1;
      registry.register({ storyKey: 'fn:2', locator: fnLocator('2'), editor: second as Editor });
      now += 1;
      registry.register({ storyKey: 'fn:3', locator: fnLocator('3'), editor: third as Editor });

      expect(registry.get('fn:1')).toBeNull();
      expect(first.destroy).toHaveBeenCalled();
      expect(registry.get('fn:2')).toBe(second);
      expect(registry.get('fn:3')).toBe(third);
      registry.destroy();
    });

    it('never evicts pinned entries even when the cap is exceeded', () => {
      const registry = buildRegistry({ capacity: 1 });
      const first = buildFakeEditor();
      const second = buildFakeEditor();

      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: first as Editor });
      registry.pin('fn:1');
      now += 5;
      registry.register({ storyKey: 'fn:2', locator: fnLocator('2'), editor: second as Editor });

      expect(registry.get('fn:1')).toBe(first);
      expect(registry.get('fn:2')).toBe(second);
      registry.destroy();
    });
  });

  describe('purge', () => {
    it('disposes the editor and emits editorDisposed with the purge reason', () => {
      const registry = buildRegistry();
      const editor = buildFakeEditor();
      const listener = vi.fn();
      registry.on('editorDisposed', listener);

      registry.register({ storyKey: 'en:9', locator: enLocator('9'), editor: editor as Editor });
      registry.purge('en:9');

      expect(editor.destroy).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith({ storyKey: 'en:9', reason: 'purge' });
      expect(registry.get('en:9')).toBeNull();
      registry.destroy();
    });
  });

  describe('destroy', () => {
    it('disposes every tracked editor and clears subscribers', () => {
      const registry = buildRegistry();
      const a = buildFakeEditor();
      const b = buildFakeEditor();
      registry.register({ storyKey: 'fn:1', locator: fnLocator('1'), editor: a as Editor });
      registry.register({ storyKey: 'en:2', locator: enLocator('2'), editor: b as Editor });

      registry.destroy();

      expect(a.destroy).toHaveBeenCalled();
      expect(b.destroy).toHaveBeenCalled();
    });
  });
});
