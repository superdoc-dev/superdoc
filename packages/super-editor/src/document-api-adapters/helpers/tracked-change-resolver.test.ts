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
  groupTrackedChanges,
  resolveTrackedChange,
  resolveTrackedChangeType,
  toCanonicalTrackedChangeId,
} from './tracked-change-resolver.js';

vi.mock('../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: vi.fn(),
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
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1'), from: 5, to: 10 },
    ] as never);

    const editor = makeEditor();
    const grouped = groupTrackedChanges(editor);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.rawId).toBe('tc-1');
    expect(grouped[0]?.from).toBe(1);
    expect(grouped[0]?.to).toBe(10);
    expect(grouped[0]?.hasInsert).toBe(true);
    expect(grouped[0]?.hasDelete).toBe(true);
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
      { ...makeTrackMark(TrackFormatMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    expect(grouped[0]?.hasFormat).toBe(true);
    expect(grouped[0]?.hasInsert).toBe(false);
    expect(grouped[0]?.hasDelete).toBe(false);
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

  it('maps a raw id to its canonical derived id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const canonical = toCanonicalTrackedChangeId(editor, 'tc-1');
    expect(typeof canonical).toBe('string');
    expect(canonical).not.toBe('tc-1');
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
