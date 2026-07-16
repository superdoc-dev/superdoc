import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { CliError } from '../../lib/errors';
import { POST_INVOKE_HOOKS, PRE_INVOKE_HOOKS } from '../../lib/special-handlers';

function stableTrackChangeId(change: {
  id?: string;
  type: string;
  author: string;
  authorEmail?: string;
  date: string;
  excerpt: string;
}): string {
  const stableKey =
    typeof change.id === 'string' && change.id.length > 0
      ? change.id
      : `${change.type}|${change.author}|${change.authorEmail ?? ''}|${change.date}|${change.excerpt}`;
  if (stableKey.length <= 64 && !/[|/\\]/.test(stableKey)) return stableKey;
  return createHash('sha1').update(stableKey).digest('hex').slice(0, 24);
}

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

describe('track changes special handlers', () => {
  test('preserves compact logical ids while normalizing overlap references', () => {
    const hook = POST_INVOKE_HOOKS['trackChanges.list'];
    if (!hook) throw new Error('Missing trackChanges.list post-invoke hook.');

    const result = hook(rawTrackChangesList, { editor: {} }) as {
      items: Array<{
        id: string;
        overlap?: {
          visualLayers: Array<{ id: string }>;
          preferredContextTargetId: string;
          preferredContextTarget: { id: string };
        };
      }>;
    };
    const parent = result.items[0]!;
    const child = result.items[1]!;

    expect(parent.id).toBe('raw-parent');
    expect(child.id).toBe('raw-child');
    expect(parent.overlap?.visualLayers[0]?.id).toBe(parent.id);
    expect(parent.overlap?.visualLayers[1]?.id).toBe(child.id);
    expect(parent.overlap?.preferredContextTargetId).toBe(child.id);
    expect(parent.overlap?.preferredContextTarget.id).toBe(child.id);
  });

  test('flattens formatRange receipts for CLI response validation', () => {
    const hook = POST_INVOKE_HOOKS.formatRange;
    if (!hook) throw new Error('Missing formatRange post-invoke hook.');

    const result = hook(
      {
        resolution: {
          target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 4 } },
          range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 1, end: 4 } }] },
        },
        applied: true,
      },
      { editor: {} },
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

  test('translates compact trackedChangeId comment targets back to raw ids before invoke', () => {
    const hook = PRE_INVOKE_HOOKS['comments.create'];
    if (!hook) throw new Error('Missing comments.create pre-invoke hook.');

    const normalizedList = POST_INVOKE_HOOKS['trackChanges.list']?.(rawTrackChangesList, {
      editor: {},
    }) as { items: Array<{ id: string }> };
    const stableId = normalizedList.items[0]?.id;
    if (!stableId) throw new Error('Expected normalized list to contain a stable id.');

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
      },
    ) as { target: { trackedChangeId: string }; text: string };

    expect(result.target.trackedChangeId).toBe('raw-parent');
    expect(result.text).toBe('comment');
  });

  test('translates stable ids in decide targets, including logical range anchors', () => {
    const rawId = 'tc|main:/word/document.xml|ins|Alice|2026-05-20T16:00:00Z|1';
    const listedChange = {
      id: rawId,
      type: 'insertion',
      author: 'Alice',
      authorEmail: '',
      date: '2026-05-20T16:00:00Z',
      excerpt: 'lazy ',
    };
    const stableId = stableTrackChangeId(listedChange);
    const hook = PRE_INVOKE_HOOKS['trackChanges.decide'];
    if (!hook) throw new Error('Missing trackChanges.decide pre-invoke hook.');

    let listInvocations = 0;
    const result = hook(
      {
        decision: 'accept',
        target: {
          id: stableId,
          anchor: stableId,
          kind: 'range',
          range: {
            anchor: stableId,
            relativeStart: 1,
            relativeEnd: 4,
          },
        },
      },
      {
        invoke: (request) => {
          listInvocations += 1;
          expect(request).toEqual({ operationId: 'trackChanges.list', input: {} });
          return { items: [listedChange] };
        },
      },
    );

    expect(listInvocations).toBe(1);
    expect(result).toEqual({
      decision: 'accept',
      target: {
        id: rawId,
        anchor: rawId,
        kind: 'range',
        range: {
          anchor: rawId,
          relativeStart: 1,
          relativeEnd: 4,
        },
      },
    });
  });

  test('normalizes nested overlap ids in list and get results', () => {
    const parentRawId = 'tc|main:/word/document.xml|ins|Missy|2026-05-20T14:08:00Z|0';
    const childRawId = 'tc|main:/word/document.xml|del|Vivienne|2026-05-20T14:08:00Z|1';
    const parent = {
      id: parentRawId,
      type: 'insertion',
      author: 'Missy',
      date: '2026-05-20T14:08:00Z',
      excerpt: 'ABCXYZ',
      address: { kind: 'entity', entityType: 'trackedChange', entityId: parentRawId },
      target: { kind: 'text', address: { kind: 'entity', entityType: 'trackedChange', entityId: parentRawId } },
      overlap: {
        relationship: 'parent',
        visualLayers: [
          { id: parentRawId, type: 'insertion', relationship: 'parent' },
          { id: childRawId, type: 'deletion', relationship: 'child' },
        ],
        preferredContextTargetId: childRawId,
        preferredContextTarget: { id: childRawId, type: 'deletion', relationship: 'child' },
      },
    };
    const child = {
      id: childRawId,
      type: 'deletion',
      author: 'Vivienne',
      date: '2026-05-20T14:08:00Z',
      excerpt: 'HELLO',
      address: { kind: 'entity', entityType: 'trackedChange', entityId: childRawId },
      overlap: {
        relationship: 'child',
        parentId: parentRawId,
      },
    };
    const expectedParentId = stableTrackChangeId(parent);
    const expectedChildId = stableTrackChangeId(child);

    const listHook = POST_INVOKE_HOOKS['trackChanges.list'];
    if (!listHook) throw new Error('Missing trackChanges.list post-invoke hook.');
    const list = listHook({ items: [parent, child] }, { invoke: () => ({ items: [parent, child] }) }) as {
      items: Array<Record<string, unknown>>;
    };

    expect(list.items[0]?.id).toBe(expectedParentId);
    expect((list.items[0]?.target as { address: { entityId: string } }).address.entityId).toBe(expectedParentId);
    expect((list.items[0]?.overlap as { visualLayers: Array<{ id: string }> }).visualLayers[1]?.id).toBe(
      expectedChildId,
    );
    expect((list.items[0]?.overlap as { preferredContextTargetId: string }).preferredContextTargetId).toBe(
      expectedChildId,
    );
    expect((list.items[1]?.overlap as { parentId: string }).parentId).toBe(expectedParentId);

    const getHook = POST_INVOKE_HOOKS['trackChanges.get'];
    if (!getHook) throw new Error('Missing trackChanges.get post-invoke hook.');
    const get = getHook(parent, { invoke: () => ({ items: [parent, child] }) }) as Record<string, unknown>;
    expect(get.id).toBe(expectedParentId);
    expect((get.overlap as { preferredContextTarget: { id: string } }).preferredContextTarget.id).toBe(expectedChildId);
  });

  test('keeps the public stable id when the same raw tracked change is refined in place', () => {
    const rawId = 'tc|main:/word/document.xml|ins|Alice|2026-05-20T16:00:00Z|1';
    const before = {
      id: rawId,
      type: 'insertion',
      author: 'Alice Reviewer',
      authorEmail: '',
      date: '2026-05-20T16:00:00Z',
      excerpt: 'lazy ',
    };
    const after = {
      ...before,
      excerpt: 'laMIDzy ',
    };
    const listHook = POST_INVOKE_HOOKS['trackChanges.list'];
    if (!listHook) throw new Error('Missing trackChanges.list post-invoke hook.');

    const beforeList = listHook({ items: [before] }, { invoke: () => ({ items: [before] }) }) as {
      items: Array<Record<string, unknown>>;
    };
    const afterList = listHook({ items: [after] }, { invoke: () => ({ items: [after] }) }) as {
      items: Array<Record<string, unknown>>;
    };

    expect(beforeList.items[0]?.id).toBe(stableTrackChangeId(before));
    expect(afterList.items[0]?.id).toBe(beforeList.items[0]?.id);
  });

  test('reports already-resolved decide target as NO_OP after successful decide', () => {
    const rawId = 'tc|main:/word/document.xml|ins|ResolvedTester|2026-05-20T16:30:00Z|99';
    const listedChange = {
      id: rawId,
      type: 'insertion',
      author: 'ResolvedTester',
      authorEmail: '',
      date: '2026-05-20T16:30:00Z',
      excerpt: 'resolved once',
    };
    const stableId = stableTrackChangeId(listedChange);
    const preHook = PRE_INVOKE_HOOKS['trackChanges.decide'];
    const postHook = POST_INVOKE_HOOKS['trackChanges.decide'];
    if (!preHook) throw new Error('Missing trackChanges.decide pre-invoke hook.');
    if (!postHook) throw new Error('Missing trackChanges.decide post-invoke hook.');
    let listItems = { items: [listedChange] };
    const invoke = (request: unknown) => {
      expect(request).toEqual({ operationId: 'trackChanges.list', input: {} });
      return listItems;
    };
    const context = { invoke };

    const translated = preHook(
      {
        decision: 'accept',
        target: { kind: 'id', id: stableId },
      },
      context,
    );

    expect(translated).toEqual({
      decision: 'accept',
      target: { kind: 'id', id: rawId },
    });

    listItems = { items: [] };
    postHook(
      {
        success: true,
        removed: [{ entityType: 'trackedChange', entityId: rawId }],
        invalidatedRefs: [],
      },
      { ...context, apiInput: translated },
    );

    expect(() =>
      preHook(
        {
          decision: 'accept',
          target: { kind: 'id', id: stableId },
        },
        context,
      ),
    ).toThrow(CliError);

    try {
      preHook(
        {
          decision: 'accept',
          target: { kind: 'id', id: stableId },
        },
        context,
      );
      throw new Error('Expected already-resolved target to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('NO_OP');
    }
  });

  test('keeps resolved tracked-change ids scoped to the current document context', () => {
    const listedChange = {
      id: '1',
      type: 'insertion',
      author: 'DocA',
      authorEmail: '',
      date: '2026-05-20T16:30:00Z',
      excerpt: 'first doc',
    };
    const preHook = PRE_INVOKE_HOOKS['trackChanges.decide'];
    const postHook = POST_INVOKE_HOOKS['trackChanges.decide'];
    if (!preHook) throw new Error('Missing trackChanges.decide pre-invoke hook.');
    if (!postHook) throw new Error('Missing trackChanges.decide post-invoke hook.');

    const docAInvoke = () => ({ items: [listedChange] });
    const translated = preHook(
      {
        decision: 'accept',
        target: { kind: 'id', id: '1' },
      },
      { invoke: docAInvoke },
    );

    postHook(
      {
        success: true,
        removed: [{ entityType: 'trackedChange', entityId: '1' }],
        invalidatedRefs: [],
      },
      { invoke: docAInvoke, apiInput: translated },
    );

    expect(() =>
      preHook(
        {
          decision: 'accept',
          target: { kind: 'id', id: '1' },
        },
        {
          invoke: () => ({
            items: [
              {
                id: '1',
                type: 'deletion',
                author: 'DocB',
                authorEmail: '',
                date: '2026-05-20T16:31:00Z',
                excerpt: 'second doc',
              },
            ],
          }),
        },
      ),
    ).not.toThrow();
  });
});
