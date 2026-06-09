import { describe, expect, test } from 'bun:test';
import { POST_INVOKE_HOOKS, PRE_INVOKE_HOOKS } from '../../lib/special-handlers';

const rawTrackChangesList = {
  evaluatedRevision: '0',
  total: 2,
  items: [
    {
      id: 'raw-parent',
      handle: { ref: 'tc::body::raw-parent', refStability: 'stable', targetKind: 'trackedChange' },
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'raw-parent' },
      type: 'insert',
      author: 'Missy Fox',
      date: '2026-05-20T14:08:00Z',
      excerpt: 'ABCXYZ',
      overlap: {
        visualLayers: [
          { id: 'raw-parent', type: 'insert', relationship: 'parent' },
          { id: 'raw-child', type: 'delete', relationship: 'child' },
        ],
        preferredContextTargetId: 'raw-child',
        preferredContextTarget: { id: 'raw-child', type: 'delete', relationship: 'child' },
      },
    },
    {
      id: 'raw-child',
      handle: { ref: 'tc::body::raw-child', refStability: 'stable', targetKind: 'trackedChange' },
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'raw-child' },
      type: 'delete',
      author: 'Vivienne Salisbury',
      date: '2026-05-20T14:08:00Z',
      excerpt: 'HELLO',
    },
  ],
};

type Overlap = {
  visualLayers: Array<{ id: string }>;
  preferredContextTargetId: string;
  preferredContextTarget: { id: string };
};

type TrackChangeItem = {
  id: string;
  overlap?: Overlap;
};

describe('special track-changes handlers', () => {
  test('normalizes overlap IDs to the same stable IDs as trackChanges.list items', () => {
    const hook = POST_INVOKE_HOOKS['trackChanges.list'];
    if (!hook) throw new Error('trackChanges.list post hook must be registered');

    const result = hook(rawTrackChangesList, { editor: {} as never }) as { items: TrackChangeItem[] };
    const parent = result.items[0] as TrackChangeItem & { overlap: Overlap };
    const child = result.items[1] as TrackChangeItem;

    expect(parent.id).toBe('raw-parent');
    expect(child.id).toBe('raw-child');
    expect(parent.overlap.visualLayers[0].id).toBe(parent.id);
    expect(parent.overlap.visualLayers[1].id).toBe(child.id);
    expect(parent.overlap.preferredContextTargetId).toBe(child.id);
    expect(parent.overlap.preferredContextTarget.id).toBe(child.id);
  });

  test('normalizes overlap IDs on trackChanges.get output', () => {
    const hook = POST_INVOKE_HOOKS['trackChanges.get'];
    const listHook = POST_INVOKE_HOOKS['trackChanges.list'];
    if (!hook) throw new Error('trackChanges.get post hook must be registered');
    if (!listHook) throw new Error('trackChanges.list post hook must be registered');

    const context = {
      editor: {
        doc: {
          invoke: () => rawTrackChangesList,
        },
      },
    };
    const result = hook(rawTrackChangesList.items[0], context as never) as TrackChangeItem & { overlap: Overlap };
    const normalizedList = listHook(rawTrackChangesList, { editor: {} as never }) as { items: TrackChangeItem[] };
    const parentId = normalizedList.items[0]?.id;
    const childId = normalizedList.items[1]?.id;
    if (!parentId || !childId) throw new Error('expected normalized list to contain parent and child ids');

    expect(result.id).toBe(parentId);
    expect(result.overlap.visualLayers[1].id).toBe(childId);
    expect(result.overlap.preferredContextTargetId).toBe(childId);
    expect(result.overlap.preferredContextTarget.id).toBe(childId);
  });

  test('flattens formatRange receipts for CLI response validation', () => {
    const hook = POST_INVOKE_HOOKS.formatRange;
    if (!hook) throw new Error('formatRange post hook must be registered');

    const result = hook(
      {
        resolution: {
          target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } },
          range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 1, end: 4 } }] },
        },
        applied: true,
      },
      { editor: {} as never },
    ) as {
      target: unknown;
      resolvedRange: unknown;
      receipt: { applied: boolean };
    };

    expect(result.target).toEqual({ kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } });
    expect(result.resolvedRange).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p1', range: { start: 1, end: 4 } }],
    });
    expect(result.receipt.applied).toBe(true);
  });

  test('translates stable trackedChangeId comment targets back to raw ids before invoke', () => {
    const hook = PRE_INVOKE_HOOKS['comments.create'];
    if (!hook) throw new Error('comments.create pre hook must be registered');

    const normalizedList = POST_INVOKE_HOOKS['trackChanges.list']?.(rawTrackChangesList, {
      editor: {} as never,
    }) as { items: TrackChangeItem[] };
    const stableId = normalizedList.items[0]?.id;
    if (!stableId) throw new Error('expected normalized list to contain a stable id');

    const result = hook(
      {
        target: { trackedChangeId: stableId },
        text: 'comment',
      },
      {
        editor: {
          doc: {
            invoke: () => rawTrackChangesList,
          },
        },
      } as never,
    ) as { target: { trackedChangeId: string }; text: string };

    expect(result.target.trackedChangeId).toBe('raw-parent');
    expect(result.text).toBe('comment');
  });
});
