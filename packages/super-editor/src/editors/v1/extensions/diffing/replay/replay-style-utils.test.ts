import { describe, expect, it } from 'vitest';
import { applyAttributesDiff } from './replay-style-utils';

describe('applyAttributesDiff', () => {
  it('applies added/modified/deleted dotted-path changes and prunes empty parents', () => {
    const target = {
      section: {
        removeA: 1,
        removeB: 2,
      },
      keep: 1,
    };

    const changed = applyAttributesDiff(target, {
      added: {
        'added.branch.value': 'ok',
      },
      deleted: {
        'section.removeA': 1,
        'section.removeB': 2,
      },
      modified: {
        keep: {
          from: 1,
          to: 2,
        },
        'nested.path': {
          from: undefined,
          to: true,
        },
      },
    });

    expect(changed).toBe(true);
    expect(target).toEqual({
      keep: 2,
      nested: {
        path: true,
      },
      added: {
        branch: {
          value: 'ok',
        },
      },
    });
  });

  it('returns false when diff is null', () => {
    const target = { value: 1 };
    expect(applyAttributesDiff(target, null)).toBe(false);
    expect(target).toEqual({ value: 1 });
  });
});
