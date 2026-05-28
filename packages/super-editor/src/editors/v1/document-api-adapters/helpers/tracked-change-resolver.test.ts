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

function makeEditor(options: Record<string, unknown> = { trackedChanges: {} }): Editor {
  return {
    options,
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

  it('returns replacement when both hasInsert and hasDelete are true (no format)', () => {
    expect(resolveTrackedChangeType({ hasInsert: true, hasDelete: true, hasFormat: false })).toBe('replacement');
  });
});

describe('groupTrackedChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups imported Word marks by source wrapper', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1', { sourceId: '11' }), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1', { sourceId: '10' }), from: 5, to: 10 },
    ] as never);

    const editor = makeEditor();
    const grouped = groupTrackedChanges(editor);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.rawId).toBe(`word:${TrackInsertMarkName}:11`);
    expect(grouped[0]?.id).toBe(`word:${TrackInsertMarkName}:11`);
    expect(grouped[0]?.commandRawId).toBe('tc-1');
    expect(grouped[0]?.hasInsert).toBe(true);
    expect(grouped[0]?.hasDelete).toBe(false);
    expect(grouped[0]?.wordRevisionIds).toEqual({ insert: '11' });
    expect(grouped[1]?.rawId).toBe(`word:${TrackDeleteMarkName}:10`);
    expect(grouped[1]?.id).toBe(`word:${TrackDeleteMarkName}:10`);
    expect(grouped[1]?.commandRawId).toBe('tc-1');
    expect(grouped[1]?.hasInsert).toBe(false);
    expect(grouped[1]?.hasDelete).toBe(true);
    expect(grouped[1]?.wordRevisionIds).toEqual({ delete: '10' });
  });

  it('groups native marks by raw id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1'), from: 5, to: 10 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.rawId).toBe('tc-1');
    expect(grouped[0]?.id).toBe('tc-1');
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

  it('keeps stable ids tied to the logical grouped raw id', () => {
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

    expect(first[0]?.id).toBe('tc-1');
    expect(second[0]?.id).toBe('tc-1');
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

  it('preserves empty parent Word wrappers when the only text belongs to a child deletion', () => {
    const parent = makeTrackMark(TrackInsertMarkName, 'parent', { sourceId: '2', author: 'Missy Fox' });
    const child = makeTrackMark(TrackDeleteMarkName, 'child', {
      sourceId: '3',
      author: 'Vivienne Salisbury',
      overlapParentId: 'parent',
    });
    const node = { text: 'XYZ', marks: [parent.mark, child.mark] };
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...parent, node, from: 1, to: 4 },
      { ...child, node, from: 1, to: 4 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    const parentChange = grouped.find((change) => change.wordRevisionIds?.insert === '2');
    const childChange = grouped.find((change) => change.wordRevisionIds?.delete === '3');

    expect(parentChange?.excerpt).toBe('');
    expect(childChange?.excerpt).toBe('XYZ');
  });

  it('keeps live parent insertion text when a child deletion overlaps it', () => {
    const parent = makeTrackMark(TrackInsertMarkName, 'parent', { author: 'Live Author' });
    const child = makeTrackMark(TrackDeleteMarkName, 'child', {
      author: 'Second Author',
      overlapParentId: 'parent',
    });
    const node = { text: 'review', marks: [parent.mark, child.mark] };
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...parent, node, from: 1, to: 7 },
      { ...child, node, from: 1, to: 7 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    const parentChange = grouped.find((change) => change.rawId === 'parent');
    const childChange = grouped.find((change) => change.rawId === 'child');

    expect(parentChange?.excerpt).toBe('review');
    expect(childChange?.excerpt).toBe('review');
  });

  it('attaches overlap visual layers to the parent insertion with child deletion as the context target', () => {
    const parent = makeTrackMark(TrackInsertMarkName, 'parent-overlap', { author: 'Insert Author' });
    const child = makeTrackMark(TrackDeleteMarkName, 'child-overlap', {
      author: 'Delete Author',
      overlapParentId: 'parent-overlap',
    });
    const node = { text: 'review', marks: [parent.mark, child.mark] };
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...child, node, from: 1, to: 7 },
      { ...parent, node, from: 1, to: 7 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    const parentChange = grouped.find((change) => change.rawId === 'parent-overlap');
    const childChange = grouped.find((change) => change.rawId === 'child-overlap');

    expect(parentChange).toBeDefined();
    expect(childChange).toBeDefined();
    expect(parentChange!.overlap?.visualLayers).toEqual([
      {
        id: parentChange!.id,
        rawId: 'parent-overlap',
        commandRawId: 'parent-overlap',
        type: 'insert',
        relationship: 'parent',
      },
      {
        id: childChange!.id,
        rawId: 'child-overlap',
        commandRawId: 'child-overlap',
        type: 'delete',
        relationship: 'child',
      },
    ]);
    expect(parentChange!.overlap?.preferredContextTargetId).toBe(childChange!.id);
    expect(parentChange!.overlap?.preferredContextTarget).toEqual({
      id: childChange!.id,
      rawId: 'child-overlap',
      commandRawId: 'child-overlap',
      type: 'delete',
      relationship: 'child',
    });
    expect(childChange!.overlap).toBeUndefined();
  });

  it('preserves significant Word revision whitespace in explicit excerpts', () => {
    const mark = makeTrackMark(TrackDeleteMarkName, 'delete-with-space', { sourceId: '4' });
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...mark, node: { text: 'O ', marks: [mark.mark] }, from: 1, to: 3 },
    ] as never);

    const grouped = groupTrackedChanges(makeEditor());
    expect(grouped[0]?.excerpt).toBe('O ');
  });

  it('does not duplicate excerpt text for overlapping imported format marks', () => {
    const mark = makeTrackMark(TrackFormatMarkName, 'format', { sourceId: '1' });
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...mark, node: { text: 'Format ', marks: [mark.mark] }, from: 2, to: 9 },
      { ...mark, from: 1, to: 10 },
    ] as never);

    const editor = makeEditor();
    vi.mocked(editor.state.doc.textBetween).mockReturnValue('Format ');

    const grouped = groupTrackedChanges(editor);

    expect(grouped[0]?.rawId).toBe(`word:${TrackFormatMarkName}:1`);
    expect(grouped[0]?.excerpt).toBe('Format ');
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

  it('finds a grouped change by canonical id', () => {
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

  it('maps a raw id to its canonical stable id', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1'), from: 1, to: 5 },
    ] as never);

    const editor = makeEditor();
    const canonical = toCanonicalTrackedChangeId(editor, 'tc-1');
    expect(typeof canonical).toBe('string');
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

  it('does not map shared Word command ids as unique span aliases', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1', { sourceId: '11' }), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1', { sourceId: '10' }), from: 5, to: 10 },
    ] as never);

    const editor = makeEditor();
    const map = buildTrackedChangeCanonicalIdMap(editor);
    const grouped = groupTrackedChanges(editor);
    const insertChange = grouped.find((change) => change.rawId === `word:${TrackInsertMarkName}:11`);
    const deleteChange = grouped.find((change) => change.rawId === `word:${TrackDeleteMarkName}:10`);

    expect(insertChange).toBeDefined();
    expect(deleteChange).toBeDefined();
    expect(map.get(`word:${TrackInsertMarkName}:11`)).toBe(insertChange!.id);
    expect(map.get(`word:${TrackDeleteMarkName}:10`)).toBe(insertChange!.id);
    expect(map.get('tc-1')).toBe(insertChange!.id);
  });

  it('keeps split replacement aliases separate in independent mode', () => {
    vi.mocked(getTrackChanges).mockReturnValue([
      { ...makeTrackMark(TrackInsertMarkName, 'tc-1', { sourceId: '11' }), from: 1, to: 5 },
      { ...makeTrackMark(TrackDeleteMarkName, 'tc-1', { sourceId: '10' }), from: 5, to: 10 },
    ] as never);

    const editor = makeEditor({ trackedChanges: { replacements: 'independent' } });
    const map = buildTrackedChangeCanonicalIdMap(editor);
    const grouped = groupTrackedChanges(editor);
    const insertChange = grouped.find((change) => change.rawId === `word:${TrackInsertMarkName}:11`);
    const deleteChange = grouped.find((change) => change.rawId === `word:${TrackDeleteMarkName}:10`);

    expect(insertChange).toBeDefined();
    expect(deleteChange).toBeDefined();
    expect(map.get(`word:${TrackInsertMarkName}:11`)).toBe(insertChange!.id);
    expect(map.get(`word:${TrackDeleteMarkName}:10`)).toBe(deleteChange!.id);
    expect(map.get('tc-1')).toBe(deleteChange!.id);
  });

  it('returns empty map when no tracked changes exist', () => {
    vi.mocked(getTrackChanges).mockReturnValue([] as never);
    expect(buildTrackedChangeCanonicalIdMap(makeEditor()).size).toBe(0);
  });
});
