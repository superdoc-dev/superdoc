import { describe, it, expect, vi } from 'vitest';
import { StoryRuntimeCache } from './runtime-cache.js';
import type { StoryRuntime } from './story-types.js';
import { BODY_STORY_KEY } from './story-key.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal StoryRuntime stub with an optional dispose spy. */
function makeRuntime(storyKey: string, opts: { dispose?: () => void } = {}): StoryRuntime {
  return {
    locator: { kind: 'story', storyType: 'body' } as StoryRuntime['locator'],
    storyKey,
    editor: {} as StoryRuntime['editor'],
    kind: 'body',
    dispose: opts.dispose,
  };
}

// ---------------------------------------------------------------------------
// Basic get / set
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — basic operations', () => {
  it('returns undefined for a missing key', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a runtime', () => {
    const cache = new StoryRuntimeCache();
    const rt = makeRuntime('fn:1');
    cache.set('fn:1', rt);
    expect(cache.get('fn:1')).toBe(rt);
  });

  it('overwrites an existing entry with set', () => {
    const cache = new StoryRuntimeCache();
    const rt1 = makeRuntime('fn:1');
    const rt2 = makeRuntime('fn:1');
    cache.set('fn:1', rt1);
    cache.set('fn:1', rt2);
    expect(cache.get('fn:1')).toBe(rt2);
  });

  it('reports the correct size', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.size).toBe(0);
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(cache.size).toBe(1);
    cache.set('fn:2', makeRuntime('fn:2'));
    expect(cache.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// has
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — has', () => {
  it('returns true for an existing key', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(cache.has('fn:1')).toBe(true);
  });

  it('returns false for a missing key', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.has('fn:1')).toBe(false);
  });

  it('returns false after deletion', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    cache.delete('fn:1');
    expect(cache.has('fn:1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — delete', () => {
  it('removes an existing entry and returns true', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(cache.delete('fn:1')).toBe(true);
    expect(cache.get('fn:1')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('returns false for a missing key', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.delete('fn:1')).toBe(false);
  });

  it('does not call dispose on explicit delete', () => {
    const dispose = vi.fn();
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1', { dispose }));
    cache.delete('fn:1');
    expect(dispose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — clear', () => {
  it('empties the cache', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    cache.set('fn:2', makeRuntime('fn:2'));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('fn:1')).toBeUndefined();
    expect(cache.get('fn:2')).toBeUndefined();
  });

  it('calls dispose on every entry', () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1', { dispose: dispose1 }));
    cache.set('fn:2', makeRuntime('fn:2', { dispose: dispose2 }));
    cache.clear();
    expect(dispose1).toHaveBeenCalledOnce();
    expect(dispose2).toHaveBeenCalledOnce();
  });

  it('does not throw when entries have no dispose', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(() => cache.clear()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — LRU eviction', () => {
  it('evicts the least recently used entry at capacity', () => {
    const cache = new StoryRuntimeCache(3);

    cache.set('a', makeRuntime('a'));
    cache.set('b', makeRuntime('b'));
    cache.set('c', makeRuntime('c'));

    // Cache is full. Adding 'd' should evict 'a' (LRU).
    cache.set('d', makeRuntime('d'));

    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    expect(cache.size).toBe(3);
  });

  it('calls dispose on the evicted runtime', () => {
    const dispose = vi.fn();
    const cache = new StoryRuntimeCache(2);

    cache.set('a', makeRuntime('a', { dispose }));
    cache.set('b', makeRuntime('b'));

    // Adding 'c' should evict 'a'.
    cache.set('c', makeRuntime('c'));

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('promotes accessed entries so they are not evicted next', () => {
    const cache = new StoryRuntimeCache(3);

    cache.set('a', makeRuntime('a'));
    cache.set('b', makeRuntime('b'));
    cache.set('c', makeRuntime('c'));

    // Access 'a' to promote it.
    cache.get('a');

    // Adding 'd' should evict 'b' (now the LRU), not 'a'.
    cache.set('d', makeRuntime('d'));

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Body runtime is never evicted
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — body protection', () => {
  it('never evicts the body runtime', () => {
    const bodyDispose = vi.fn();
    const cache = new StoryRuntimeCache(3);

    cache.set(BODY_STORY_KEY, makeRuntime(BODY_STORY_KEY, { dispose: bodyDispose }));
    cache.set('fn:1', makeRuntime('fn:1'));
    cache.set('fn:2', makeRuntime('fn:2'));

    // Cache is full (3). Adding another should evict fn:1, NOT body.
    cache.set('fn:3', makeRuntime('fn:3'));

    expect(cache.has(BODY_STORY_KEY)).toBe(true);
    expect(bodyDispose).not.toHaveBeenCalled();
    expect(cache.size).toBe(3);
  });

  it('skips body when it is the LRU candidate', () => {
    const cache = new StoryRuntimeCache(2);

    // Body inserted first — would normally be LRU.
    cache.set(BODY_STORY_KEY, makeRuntime(BODY_STORY_KEY));
    cache.set('fn:1', makeRuntime('fn:1'));

    // Adding fn:2 should evict fn:1 (skipping body).
    cache.set('fn:2', makeRuntime('fn:2'));

    expect(cache.has(BODY_STORY_KEY)).toBe(true);
    expect(cache.has('fn:1')).toBe(false);
    expect(cache.has('fn:2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// invalidate
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — invalidate', () => {
  it('removes and disposes an existing entry', () => {
    const dispose = vi.fn();
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1', { dispose }));

    expect(cache.invalidate('fn:1')).toBe(true);
    expect(cache.get('fn:1')).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('returns false for a missing key', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.invalidate('fn:1')).toBe(false);
  });

  it('does not throw when runtime has no dispose', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(() => cache.invalidate('fn:1')).not.toThrow();
    expect(cache.has('fn:1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// invalidateByPrefix
// ---------------------------------------------------------------------------

describe('StoryRuntimeCache — invalidateByPrefix', () => {
  it('invalidates all entries matching the prefix', () => {
    const disposeFn1 = vi.fn();
    const disposeFn2 = vi.fn();
    const disposeEn1 = vi.fn();
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1', { dispose: disposeFn1 }));
    cache.set('fn:2', makeRuntime('fn:2', { dispose: disposeFn2 }));
    cache.set('en:1', makeRuntime('en:1', { dispose: disposeEn1 }));

    const count = cache.invalidateByPrefix('fn:');

    expect(count).toBe(2);
    expect(cache.has('fn:1')).toBe(false);
    expect(cache.has('fn:2')).toBe(false);
    expect(cache.has('en:1')).toBe(true);
    expect(disposeFn1).toHaveBeenCalledOnce();
    expect(disposeFn2).toHaveBeenCalledOnce();
    expect(disposeEn1).not.toHaveBeenCalled();
  });

  it('returns 0 when no entries match the prefix', () => {
    const cache = new StoryRuntimeCache();
    cache.set('fn:1', makeRuntime('fn:1'));
    expect(cache.invalidateByPrefix('hf:')).toBe(0);
  });

  it('handles empty cache without error', () => {
    const cache = new StoryRuntimeCache();
    expect(cache.invalidateByPrefix('fn:')).toBe(0);
  });
});
