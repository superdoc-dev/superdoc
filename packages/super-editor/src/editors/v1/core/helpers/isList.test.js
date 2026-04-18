import { describe, it, expect } from 'vitest';
import { isList } from './isList.js';

const createExtension = ({ name, group }) => ({
  type: 'node',
  name,
  options: {},
  storage: {},
  config: {
    group() {
      return group;
    },
  },
});

describe('isList', () => {
  it('returns true when extension group includes list', () => {
    const extensions = [
      createExtension({ name: 'paragraph', group: 'block' }),
      createExtension({ name: 'bulletList', group: 'block list' }),
    ];

    expect(isList('bulletList', extensions)).toBe(true);
  });

  it('returns false when extension is missing or group is not a string', () => {
    const extensions = [
      createExtension({ name: 'paragraph', group: 'block' }),
      {
        type: 'node',
        name: 'orderedList',
        options: {},
        storage: {},
        config: { group: () => ({}) },
      },
    ];

    expect(isList('heading', extensions)).toBe(false);
    expect(isList('orderedList', extensions)).toBe(false);
  });
});
