/**
 * Unit tests for the host-level TrackedChangeIndex service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '../../../core/Editor.js';

const mocks = vi.hoisted(() => ({
  resolveStoryRuntime: vi.fn(),
  groupTrackedChanges: vi.fn(),
  enumerateRevisionCapableStories: vi.fn(),
  isHeaderFooterPartId: vi.fn(() => false),
  resolveRIdFromRelsData: vi.fn(() => null),
}));

vi.mock('../../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: mocks.resolveStoryRuntime,
}));

vi.mock('../../helpers/tracked-change-resolver.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    groupTrackedChanges: mocks.groupTrackedChanges,
  };
});

vi.mock('../enumerate-stories.js', () => ({
  enumerateRevisionCapableStories: mocks.enumerateRevisionCapableStories,
}));

vi.mock('../../../core/parts/adapters/header-footer-part-descriptor.js', () => ({
  isHeaderFooterPartId: mocks.isHeaderFooterPartId,
}));

vi.mock('../../../core/parts/adapters/header-footer-sync.js', () => ({
  resolveRIdFromRelsData: mocks.resolveRIdFromRelsData,
}));

import { getTrackedChangeIndex } from '../tracked-change-index.js';

type EventHandler = (...args: unknown[]) => void;

interface FakeEditor extends Editor {
  _emit: (event: string, payload?: unknown) => void;
}

function makeEditor(): FakeEditor {
  const listeners = new Map<string, EventHandler[]>();
  return {
    state: { doc: { textBetween: () => '' } },
    commands: {},
    on(event: string, handler: EventHandler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)?.push(handler);
    },
    off(event: string, handler: EventHandler) {
      const list = listeners.get(event);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    emit: vi.fn(),
    _emit(event: string, payload?: unknown) {
      for (const handler of listeners.get(event) ?? []) {
        handler(payload);
      }
    },
  } as unknown as FakeEditor;
}

function makeGroupedChange(rawId: string, from = 0, to = 5, overrides: Record<string, unknown> = {}) {
  return {
    rawId,
    id: `canon-${rawId}`,
    from,
    to,
    hasInsert: true,
    hasDelete: false,
    hasFormat: false,
    attrs: { author: 'Ada', date: '2026-01-01', ...overrides },
    wordRevisionIds: undefined,
  };
}

function makeStoryRuntime(editor: Editor, locator: { storyType: string; [k: string]: unknown }, storyKey: string) {
  return {
    locator: { kind: 'story', ...locator } as any,
    storyKey,
    editor,
    kind:
      locator.storyType === 'body' ? 'body' : locator.storyType.startsWith('headerFooter') ? 'headerFooter' : 'note',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enumerateRevisionCapableStories.mockReturnValue([{ kind: 'story', storyType: 'body' }]);
  mocks.groupTrackedChanges.mockReturnValue([]);
  mocks.resolveStoryRuntime.mockImplementation((host: Editor, locator: any) => {
    if (!locator || locator.storyType === 'body') {
      return makeStoryRuntime(host, { storyType: 'body' }, 'body');
    }
    if (locator.storyType === 'footnote') {
      return makeStoryRuntime(makeEditor(), locator, `fn:${locator.noteId}`);
    }
    if (locator.storyType === 'endnote') {
      return makeStoryRuntime(makeEditor(), locator, `en:${locator.noteId}`);
    }
    if (locator.storyType === 'headerFooterPart') {
      return makeStoryRuntime(makeEditor(), locator, `hf:part:${locator.refId}`);
    }
    throw new Error(`Unexpected locator: ${JSON.stringify(locator)}`);
  });
});

describe('TrackedChangeIndex — per-story cache', () => {
  it('returns body-only snapshots when no non-body stories exist', () => {
    const editor = makeEditor();
    mocks.groupTrackedChanges.mockReturnValueOnce([makeGroupedChange('rev-1')]);

    const index = getTrackedChangeIndex(editor);
    const snapshots = index.get({ kind: 'story', storyType: 'body' });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.anchorKey).toBe('tc::body::rev-1');
    expect(snapshots[0]?.storyKind).toBe('body');
    expect(snapshots[0]?.address).toEqual({
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'canon-rev-1',
    });
  });

  it('returns story-scoped anchor keys for footnote stories', () => {
    const editor = makeEditor();
    mocks.enumerateRevisionCapableStories.mockReturnValue([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '5' },
    ]);
    mocks.groupTrackedChanges.mockReturnValueOnce([]).mockReturnValueOnce([makeGroupedChange('rev-7')]);

    const index = getTrackedChangeIndex(editor);
    const all = index.getAll();

    expect(all).toHaveLength(1);
    expect(all[0]?.anchorKey).toBe('tc::fn:5::rev-7');
    expect(all[0]?.storyLabel).toBe('Footnote 5');
    expect(all[0]?.address).toEqual({
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'canon-rev-7',
      story: { kind: 'story', storyType: 'footnote', noteId: '5' },
    });
  });

  it('produces distinct snapshots when body and non-body share a rawId', () => {
    const editor = makeEditor();
    mocks.enumerateRevisionCapableStories.mockReturnValue([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '1' },
    ]);
    mocks.groupTrackedChanges
      .mockReturnValueOnce([makeGroupedChange('shared')])
      .mockReturnValueOnce([makeGroupedChange('shared')]);

    const index = getTrackedChangeIndex(editor);
    const all = index.getAll();

    expect(all).toHaveLength(2);
    const keys = all.map((snapshot) => snapshot.anchorKey);
    expect(keys).toContain('tc::body::shared');
    expect(keys).toContain('tc::fn:1::shared');
  });
});

describe('TrackedChangeIndex — invalidation', () => {
  it('body edits only dirty the body cache', () => {
    const editor = makeEditor();
    mocks.enumerateRevisionCapableStories.mockReturnValue([
      { kind: 'story', storyType: 'body' },
      { kind: 'story', storyType: 'footnote', noteId: '1' },
    ]);
    mocks.groupTrackedChanges.mockReturnValueOnce([]).mockReturnValueOnce([makeGroupedChange('fn-1')]);

    const index = getTrackedChangeIndex(editor);
    index.getAll();
    expect(mocks.groupTrackedChanges).toHaveBeenCalledTimes(2);

    editor._emit('transaction', { transaction: { docChanged: true } });

    mocks.groupTrackedChanges
      .mockReturnValueOnce([makeGroupedChange('body-1')])
      .mockReturnValue([makeGroupedChange('fn-1')]);

    index.getAll();
    expect(mocks.groupTrackedChanges).toHaveBeenCalledTimes(3);
  });

  it('invalidateAll wipes every cache', () => {
    const editor = makeEditor();
    mocks.enumerateRevisionCapableStories.mockReturnValue([{ kind: 'story', storyType: 'body' }]);
    mocks.groupTrackedChanges.mockReturnValue([makeGroupedChange('x')]);

    const index = getTrackedChangeIndex(editor);
    index.getAll();
    index.invalidateAll();
    index.getAll();

    expect(mocks.groupTrackedChanges).toHaveBeenCalledTimes(2);
  });
});

describe('TrackedChangeIndex — broadcast', () => {
  it('emits a coalesced tracked-changes-changed event after invalidation', async () => {
    const editor = makeEditor();
    const index = getTrackedChangeIndex(editor);

    index.invalidate({ kind: 'story', storyType: 'body' });
    index.invalidate({ kind: 'story', storyType: 'body' });
    index.invalidate({ kind: 'story', storyType: 'body' });

    await Promise.resolve();

    expect(editor.emit).toHaveBeenCalledTimes(1);
    expect(editor.emit).toHaveBeenCalledWith(
      'tracked-changes-changed',
      expect.objectContaining({ editor, source: 'invalidate' }),
    );
  });

  it('unions different stories invalidated in the same tick', async () => {
    const editor = makeEditor();
    const index = getTrackedChangeIndex(editor);
    const bodyStory = { kind: 'story', storyType: 'body' } as const;
    const footnoteStory = { kind: 'story', storyType: 'footnote', noteId: '7' } as const;

    index.invalidate(bodyStory);
    index.invalidate(footnoteStory);

    await Promise.resolve();

    expect(editor.emit).toHaveBeenCalledTimes(1);
    expect(editor.emit).toHaveBeenCalledWith(
      'tracked-changes-changed',
      expect.objectContaining({
        editor,
        source: 'invalidate',
        stories: expect.arrayContaining([bodyStory, footnoteStory]),
      }),
    );
  });

  it('drops the coalesced source when the same tick mixes body and non-body invalidations', async () => {
    const editor = makeEditor();
    const index = getTrackedChangeIndex(editor);
    const footnoteStory = { kind: 'story', storyType: 'footnote', noteId: '7' } as const;

    editor._emit('transaction', { transaction: { docChanged: true } });
    index.invalidate(footnoteStory);

    await Promise.resolve();

    expect(editor.emit).toHaveBeenCalledTimes(1);
    expect(editor.emit).toHaveBeenCalledWith(
      'tracked-changes-changed',
      expect.objectContaining({
        editor,
        source: undefined,
        stories: expect.arrayContaining([{ kind: 'story', storyType: 'body' }, footnoteStory]),
      }),
    );
  });

  it('notifies subscribers with the aggregated snapshot list', async () => {
    const editor = makeEditor();
    mocks.groupTrackedChanges.mockReturnValue([makeGroupedChange('r1')]);

    const index = getTrackedChangeIndex(editor);
    const listener = vi.fn();
    const unsubscribe = index.subscribe(listener);

    index.invalidate({ kind: 'story', storyType: 'body' });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = listener.mock.calls[0][0];
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].anchorKey).toBe('tc::body::r1');

    unsubscribe();
    index.invalidate({ kind: 'story', storyType: 'body' });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
