import { describe, it, expect } from 'vitest';
import { getAttributesDiff } from './attributes-diffing.ts';

describe('getAttributesDiff', () => {
  it('detects nested additions, deletions, and modifications', () => {
    const objectA = {
      id: 1,
      name: 'Alice',
      age: 30,
      config: {
        theme: 'dark',
        notifications: true,
        additional: {
          layout: 'grid',
          itemsPerPage: 10,
        },
      },
    };

    const objectB = {
      id: 1,
      name: 'Alice Smith',
      config: {
        theme: 'light',
        additional: {
          layout: 'list',
          itemsPerPage: 10,
          showSidebar: true,
        },
      },
      isActive: true,
    };

    const diff = getAttributesDiff(objectA, objectB);

    expect(diff).toEqual({
      added: {
        isActive: true,
        'config.additional.showSidebar': true,
      },
      deleted: {
        age: 30,
        'config.notifications': true,
      },
      modified: {
        name: { from: 'Alice', to: 'Alice Smith' },
        'config.theme': { from: 'dark', to: 'light' },
        'config.additional.layout': { from: 'grid', to: 'list' },
      },
    });
  });

  it('returns empty diff when objects are identical', () => {
    const objectA = {
      name: 'Same',
      config: {
        theme: 'dark',
      },
    };

    const diff = getAttributesDiff(objectA, { ...objectA });

    expect(diff).toBeNull();
  });

  it('handles whole-object additions, removals, and non-object replacements', () => {
    const objectA = {
      profile: {
        preferences: {
          email: true,
        },
      },
      options: {
        advanced: {
          mode: 'auto',
        },
      },
    };

    const objectB = {
      profile: {},
      options: {
        advanced: 'manual',
      },
      flags: ['a'],
    };

    const diff = getAttributesDiff(objectA, objectB);

    expect(diff.added).toEqual({
      flags: ['a'],
    });
    expect(diff.deleted).toEqual({
      'profile.preferences.email': true,
    });
    expect(diff.modified).toEqual({
      'options.advanced': { from: { mode: 'auto' }, to: 'manual' },
    });
  });

  it('ignores keys defined in the ignored attribute list', () => {
    const objectA = {
      sdBlockId: '123',
      nested: {
        sdBlockId: '456',
        value: 1,
      },
    };

    const objectB = {
      nested: {
        sdBlockId: '789',
        value: 2,
      },
    };

    const diff = getAttributesDiff(objectA, objectB);

    expect(diff.added).toEqual({});
    expect(diff.deleted).toEqual({});
    expect(diff.modified).toEqual({
      'nested.value': { from: 1, to: 2 },
    });
  });

  it('handles array equality and modifications', () => {
    const objectA = {
      tags: ['alpha', 'beta'],
      nested: {
        metrics: [
          { name: 'views', value: 10 },
          { name: 'likes', value: 5 },
        ],
      },
    };

    const objectB = {
      tags: ['alpha', 'beta'],
      nested: {
        metrics: [
          { name: 'views', value: 12 },
          { name: 'likes', value: 5 },
        ],
      },
    };

    let diff = getAttributesDiff(objectA, objectB);
    expect(diff.added).toEqual({});
    expect(diff.deleted).toEqual({});
    expect(diff.modified).toEqual({
      'nested.metrics': {
        from: [
          { name: 'views', value: 10 },
          { name: 'likes', value: 5 },
        ],
        to: [
          { name: 'views', value: 12 },
          { name: 'likes', value: 5 },
        ],
      },
    });

    diff = getAttributesDiff(objectA, { ...objectA });
    expect(diff).toBeNull();
  });
});
