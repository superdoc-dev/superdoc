import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use a lightweight mock of Y.js for unit tests — these helpers only need
// getArray/getMap, transact, and basic CRDT operations.

let MockYMap;
let MockYArray;
let MockYDoc;

vi.mock('yjs', () => {
  MockYMap = class extends Map {
    constructor(entries) {
      super(entries);
    }
    toJSON() {
      return Object.fromEntries(this);
    }
  };

  MockYArray = class {
    constructor() {
      this.items = [];
    }
    get length() {
      return this.items.length;
    }
    push(nodes) {
      this.items.push(...nodes);
    }
    delete(index, count) {
      this.items.splice(index, count);
    }
    toJSON() {
      return this.items.map((item) => (item?.toJSON ? item.toJSON() : item));
    }
  };

  MockYDoc = class {
    constructor() {
      this._arrays = new Map();
      this._maps = new Map();
    }
    getArray(name) {
      if (!this._arrays.has(name)) {
        this._arrays.set(name, new MockYArray());
      }
      return this._arrays.get(name);
    }
    getMap(name) {
      if (!this._maps.has(name)) {
        this._maps.set(name, new MockYMap());
      }
      return this._maps.get(name);
    }
    transact(fn) {
      fn();
    }
  };

  return { Doc: MockYDoc, Map: MockYMap };
});

// Import after mocking
const { overwriteRoomComments, overwriteRoomLockState } = await import('./room-overwrite.js');

describe('overwriteRoomComments', () => {
  let ydoc;
  let commentsArray;

  beforeEach(() => {
    ydoc = new MockYDoc();
    commentsArray = ydoc.getArray('comments');
  });

  it('writes serialized local comments into the room', () => {
    const localComments = [
      { getValues: () => ({ commentId: 'c-1', text: 'Hello' }) },
      { getValues: () => ({ commentId: 'c-2', text: 'World' }) },
    ];

    overwriteRoomComments(ydoc, localComments);

    const json = commentsArray.toJSON();
    expect(json).toHaveLength(2);
    expect(json[0].commentId).toBe('c-1');
    expect(json[1].commentId).toBe('c-2');
  });

  it('clears existing room comments before writing', () => {
    // Pre-populate room with stale comments
    commentsArray.push([new MockYMap(Object.entries({ commentId: 'stale-1' }))]);
    expect(commentsArray.length).toBe(1);

    const localComments = [{ getValues: () => ({ commentId: 'fresh-1' }) }];

    overwriteRoomComments(ydoc, localComments);

    const json = commentsArray.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].commentId).toBe('fresh-1');
  });

  it('handles empty local comments list', () => {
    commentsArray.push([new MockYMap(Object.entries({ commentId: 'stale-1' }))]);

    overwriteRoomComments(ydoc, []);

    expect(commentsArray.length).toBe(0);
  });

  it('handles null/undefined comments list', () => {
    overwriteRoomComments(ydoc, null);
    expect(commentsArray.length).toBe(0);

    overwriteRoomComments(ydoc, undefined);
    expect(commentsArray.length).toBe(0);
  });

  it('falls back to raw object when getValues is not available', () => {
    const rawComments = [{ commentId: 'raw-1', text: 'No getValues' }];

    overwriteRoomComments(ydoc, rawComments);

    const json = commentsArray.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].commentId).toBe('raw-1');
  });
});

describe('overwriteRoomLockState', () => {
  let ydoc;
  let metaMap;

  beforeEach(() => {
    ydoc = new MockYDoc();
    metaMap = ydoc.getMap('meta');
  });

  it('writes locked state when isLocked is true', () => {
    const user = { name: 'Alice', email: 'alice@test.com' };

    overwriteRoomLockState(ydoc, { isLocked: true, lockedBy: user });

    expect(metaMap.get('locked')).toBe(true);
    expect(metaMap.get('lockedBy')).toEqual(user);
  });

  it('clears lock state when isLocked is false', () => {
    // Pre-populate locked state
    metaMap.set('locked', true);
    metaMap.set('lockedBy', { name: 'Bob' });

    overwriteRoomLockState(ydoc, { isLocked: false, lockedBy: null });

    expect(metaMap.has('locked')).toBe(false);
    expect(metaMap.has('lockedBy')).toBe(false);
  });
});
