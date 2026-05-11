import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import {
  TrackDeleteMarkName,
  TrackFormatMarkName,
  TrackInsertMarkName,
} from '../../extensions/track-changes/constants.js';
import { getTrackChanges } from '../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import {
  buildTrackedChangeCanonicalIdMap,
  deriveTrackedChangeId,
  groupTrackedChanges,
  resolveTrackedChange,
  resolveTrackedChangeInStory,
  resolveTrackedChangeType,
  toCanonicalTrackedChangeId,
} from './tracked-change-resolver.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';

vi.mock('../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: vi.fn(),
}));

vi.mock('../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: vi.fn(),
}));

function makeEditor(): Editor {
  return {
    state: {
      doc: {
        content: { size: 100 },
        textBetween: vi.fn((_from: number, _to: number) => 'excerpt'),
      },
    },
  } as unknown as Editor;
}

function makeTrackMark(typeName: string, id: string, attrs: Record<string, unknown> = {}) {
  return {
    mark: {
      type: { name: typeName },
      attrs: { id, ...attrs },
    },
  };
}

describe('resolveTrackedChangeType', () => {
  it('returns insert when hasInsert is true', () => {
    expect(resolveTrackedChangeType({ hasInsert: true, hasDelete: false, hasFormat: false })).toBe('insert');
  });

  it('returns delete when only hasDelete is true', () => {
    expect(resolveTrackedChangeType({ hasInsert: false, hasDelete: true, hasFormat: false })).toBe('delete');
  });

  it('returns format when hasFormat is true', () => {
    expect(resolveTrackedChangeType({ hasInsert: false, hasDelete: false, hasFormat: true })).toBe('format');
  });

  it('returns format over insert/delete when hasFormat is true', () => {
    expect(resolveTrackedChangeType({ hasInsert: true, hasDelete: true, hasFormat: true })).toBe('format');
  });

  it('returns insert when both hasInsert and hasDelete are true (no format)', () => {
    expect(resolveTrackedChangeType({ hasInsert: true, hasDelete: true, hasFormat: false })).toBe('insert');
  });
});

describe('groupTrackedChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups marks by raw id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1', { sourceId: '11' }), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1', { sourceId: '10' }), from: 5, to: 10 },
    ] as never);

    const editor = makeEditor();
    const grouped = groupTrackedChanges(editor);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.rawId).toBe('tc-1');
    expect(grouped[0]?.from).toBe(1);
    expect(grouped[0]?.to).toBe(10);
    expect(grouped[0]?.hasInsert).toBe(true);
    expect(grouped[0]?.hasDelete).toBe(true);
    expect(grouped[0]?.wordRevisionIds).toEqual({ insert: '11', delete: '10' });
  });

  it('keeps separate entries for different raw ids', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-2'), from: 6, to: 10 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    expect(grouped).toHaveLength(2);
  });

  it('generates deterministic stable ids', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1', { author: 'Ada' }), from: 2, to: 5 },
    ] as never);

    const editor = makeEditor();
    const first = groupTrackedChanges(editor);
    // Force cache invalidation by changing doc reference
    (editor.state as { doc: unknown }).doc = {
      ...editor.state.doc,
      textBetween: vi.fn(() => 'excerpt'),
    };
    const second = groupTrackedChanges(editor);

    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('caches results by document reference', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const first = groupTrackedChanges(editor);
    const second = groupTrackedChanges(editor);

    expect(first).toBe(second);
    expect(vi.mocked(getTrackChanges)).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no tracked marks exist', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(groupTrackedChanges(makeEditor())).toEqual([]);
  });

  it('skips marks without an id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { mark: { type: { name: TrackInsertMarkName }, attrs: {} }, from: 1, to: 5 },
    ] as never);

    expect(groupTrackedChanges(makeEditor())).toEqual([]);
  });

  it('detects format marks', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackFormatMarkName, 'tc-1', { sourceId: '22' }), from: 1, to: 5 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    expect(grouped[0]?.hasFormat).toBe(true);
    expect(grouped[0]?.hasInsert).toBe(false);
    expect(grouped[0]?.hasDelete).toBe(false);
    expect(grouped[0]?.wordRevisionIds).toEqual({ format: '22' });
  });

  it('sorts results by from position', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-2'), from: 10, to: 15 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    expect(grouped[0]?.from).toBeLessThan(grouped[1]?.from ?? 0);
  });
});

describe('resolveTrackedChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a grouped change by derived id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const grouped = groupTrackedChanges(editor);
    const id = grouped[0]?.id;
    expect(id).toBeDefined();

    const resolved = resolveTrackedChange(editor, id!);
    expect(resolved?.rawId).toBe('tc-1');
  });

  it('returns null for unknown ids', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(resolveTrackedChange(makeEditor(), 'unknown')).toBeNull();
  });
});

describe('toCanonicalTrackedChangeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the stable raw id as the canonical id (SD-3084)', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const canonical = toCanonicalTrackedChangeId(editor, 'tc-1');
    // Canonical id is the stable raw mark id, matching `comment.commentId`
    // from `onCommentsUpdate` and the value passed to `trackChanges.decide`.
    expect(canonical).toBe('tc-1');
  });

  it('returns null for unknown raw ids', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(toCanonicalTrackedChangeId(makeEditor(), 'missing')).toBeNull();
  });
});

describe('buildTrackedChangeCanonicalIdMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps both raw id and canonical id to canonical id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const map = buildTrackedChangeCanonicalIdMap(editor);
    const grouped = groupTrackedChanges(editor);
    const canonicalId = grouped[0]?.id;

    expect(map.get('tc-1')).toBe(canonicalId);
    expect(map.get(canonicalId!)).toBe(canonicalId);
  });

  it('returns empty map when no tracked changes exist', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(buildTrackedChangeCanonicalIdMap(makeEditor()).size).toBe(0);
  });
});

describe('stable id contract (SD-3084)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the same id when positions shift after an edit', () => {
    // Same rawId, same author/date; only positions move. Under the old
    // positional-hash contract the id changed across snapshots; under the
    // stable contract it must remain equal to the rawId.
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'rev-7', { author: 'Ada' }), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const before = groupTrackedChanges(editor)[0]?.id;

    // Simulate a position-shifting edit by swapping the doc reference and
    // moving the mark's `from`/`to`.
    (editor.state as { doc: unknown }).doc = {
      ...editor.state.doc,
      textBetween: vi.fn(() => 'excerpt'),
    };
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'rev-7', { author: 'Ada' }), from: 42, to: 47 },
    ] as never);

    const after = groupTrackedChanges(editor)[0]?.id;

    expect(before).toBe('rev-7');
    expect(after).toBe('rev-7');
  });

  it('exposes id === rawId so consumers can correlate with onCommentsUpdate.commentId', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'rev-stable'), from: 1, to: 5 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());

    expect(grouped[0]?.id).toBe('rev-stable');
    expect(grouped[0]?.id).toBe(grouped[0]?.rawId);
  });

  it('resolves an old ephemeral derived id within the same snapshot (soft fallback)', () => {
    // A consumer that cached the previously-published derived id from an
    // earlier release should still be able to call into the resolver in the
    // same snapshot. Compute the old hash, then verify the resolver returns
    // the matching change when looked up by it.
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'rev-9', { author: 'Ada', date: '2026-05-11' }), from: 3, to: 9 },
    ] as never);

    const editor = makeEditor();
    const grouped = groupTrackedChanges(editor);
    const change = grouped[0];
    expect(change).toBeDefined();
    expect(change?.rawId).toBe('rev-9');

    const legacyId = deriveTrackedChangeId(editor, change!);
    expect(legacyId).not.toBe('rev-9');

    // Primary path: stable raw id resolves.
    expect(toCanonicalTrackedChangeId(editor, 'rev-9')).toBe('rev-9');
    // Compat fallback: legacy derived id resolves to the same change.
    const resolvedByLegacy = resolveTrackedChange(editor, legacyId);
    expect(resolvedByLegacy?.rawId).toBe('rev-9');
    // Bogus ids still return null.
    expect(toCanonicalTrackedChangeId(editor, 'not-a-real-id')).toBeNull();
  });

  it('disambiguates same rawId across body and footnote via target.story (SD-3084)', () => {
    // Body editor: a change with rawId='shared'.
    const hostEditor = makeEditor();
    vi.mocked(getTrackChanges).mockImplementation((state: unknown) => {
      // Distinguish by reference: each editor has its own state.doc reference.
      if (state === hostEditor.state) {
        return [{ ...makeTrackMark(TrackInsertMarkName, 'shared', { author: 'Body' }), from: 1, to: 5 }] as never;
      }
      // Footnote editor uses the runtime's state.
      return [{ ...makeTrackMark(TrackInsertMarkName, 'shared', { author: 'Footnote' }), from: 7, to: 12 }] as never;
    });

    // Footnote runtime: a different editor with its own state, but the same rawId.
    const footnoteEditor = {
      state: {
        doc: {
          content: { size: 50 },
          textBetween: vi.fn(() => 'fn excerpt'),
        },
      },
    } as unknown as Editor;
    vi.mocked(resolveStoryRuntime).mockReturnValue({
      editor: footnoteEditor,
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      storyKey: 'fn:1',
      commit: vi.fn(),
    } as never);

    // Body-scoped lookup (no story) finds the body change.
    const body = resolveTrackedChangeInStory(hostEditor, {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'shared',
    });
    expect(body?.editor).toBe(hostEditor);
    expect(body?.change.attrs.author).toBe('Body');

    // Footnote-scoped lookup with the same id finds the footnote change.
    const footnote = resolveTrackedChangeInStory(hostEditor, {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'shared',
      story: { kind: 'story', storyType: 'footnote', noteId: '1' },
    });
    expect(footnote?.editor).toBe(footnoteEditor);
    expect(footnote?.change.attrs.author).toBe('Footnote');
  });
});
