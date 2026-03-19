/**
 * Bounded LRU cache for story runtimes.
 *
 * Manages a fixed-capacity pool of {@link StoryRuntime} instances keyed by
 * their canonical story key. When the cache exceeds capacity, the least
 * recently used (LRU) entry is evicted and its `dispose` callback is
 * invoked to release resources.
 *
 * ## Eviction safety
 *
 * The **body runtime is never evicted** — it is the host editor and must
 * remain alive for the full document session. Eviction candidates are
 * selected from non-body entries only.
 */

import type { StoryRuntime } from './story-types.js';
import { BODY_STORY_KEY } from './story-key.js';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/** Default maximum number of cached runtimes (including the body). */
const DEFAULT_CAPACITY = 10;

// ---------------------------------------------------------------------------
// LRU node — doubly linked list entry
// ---------------------------------------------------------------------------

interface LruNode {
  key: string;
  runtime: StoryRuntime;
  prev: LruNode | null;
  next: LruNode | null;
}

// ---------------------------------------------------------------------------
// StoryRuntimeCache
// ---------------------------------------------------------------------------

/**
 * A bounded LRU cache for {@link StoryRuntime} instances.
 *
 * Entries are keyed by canonical story key (produced by {@link buildStoryKey}).
 * The cache maintains insertion/access order via a doubly linked list so that
 * eviction targets the least recently used non-body entry.
 *
 * @example
 * ```ts
 * const cache = new StoryRuntimeCache(10);
 * cache.set('fn:12', footnoteRuntime);
 * const rt = cache.get('fn:12'); // promotes to most-recently-used
 * ```
 */
export class StoryRuntimeCache {
  private readonly capacity: number;
  private readonly map = new Map<string, LruNode>();

  /** Sentinel head (most recently used). */
  private readonly head: LruNode;
  /** Sentinel tail (least recently used). */
  private readonly tail: LruNode;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = Math.max(1, capacity);

    // Sentinel nodes simplify linked-list operations — they are never
    // evicted and hold no real data.
    this.head = { key: '', runtime: null!, prev: null, next: null };
    this.tail = { key: '', runtime: null!, prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Retrieves a cached runtime by story key.
   *
   * Accessing an entry promotes it to the most-recently-used position.
   *
   * @param storyKey - Canonical story key.
   * @returns The cached runtime, or `undefined` if not present.
   */
  get(storyKey: string): StoryRuntime | undefined {
    const node = this.map.get(storyKey);
    if (!node) return undefined;

    // Promote to head (most recently used).
    this.detach(node);
    this.attachAfterHead(node);

    return node.runtime;
  }

  /**
   * Inserts or updates a runtime in the cache.
   *
   * If the cache is at capacity, the least recently used non-body entry
   * is evicted first.
   *
   * @param storyKey - Canonical story key.
   * @param runtime  - The runtime to cache.
   */
  set(storyKey: string, runtime: StoryRuntime): void {
    const existing = this.map.get(storyKey);

    if (existing) {
      // Update in place and promote.
      existing.runtime = runtime;
      this.detach(existing);
      this.attachAfterHead(existing);
      return;
    }

    // Evict if at capacity.
    if (this.map.size >= this.capacity) {
      this.evictLru();
    }

    const node: LruNode = { key: storyKey, runtime, prev: null, next: null };
    this.map.set(storyKey, node);
    this.attachAfterHead(node);
  }

  /**
   * Removes a runtime from the cache.
   *
   * The runtime's `dispose` callback is **not** called — this is an
   * explicit removal, not an eviction.
   *
   * @param storyKey - Canonical story key.
   * @returns `true` if the entry existed and was removed.
   */
  delete(storyKey: string): boolean {
    const node = this.map.get(storyKey);
    if (!node) return false;

    this.detach(node);
    this.map.delete(storyKey);
    return true;
  }

  /**
   * Removes all entries from the cache.
   *
   * Calls `dispose` on every cached runtime that has one.
   */
  clear(): void {
    for (const node of this.map.values()) {
      node.runtime.dispose?.();
    }
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Returns `true` if the cache contains an entry for the given story key.
   *
   * Does NOT promote the entry — use {@link get} if you intend to read it.
   *
   * @param storyKey - Canonical story key.
   */
  has(storyKey: string): boolean {
    return this.map.has(storyKey);
  }

  /** The number of entries currently in the cache. */
  get size(): number {
    return this.map.size;
  }

  // -------------------------------------------------------------------------
  // Linked-list operations
  // -------------------------------------------------------------------------

  /** Detaches a node from its current position in the list. */
  private detach(node: LruNode): void {
    const prev = node.prev;
    const next = node.next;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    node.prev = null;
    node.next = null;
  }

  /** Inserts a node immediately after the head sentinel (most recent). */
  private attachAfterHead(node: LruNode): void {
    const afterHead = this.head.next!;
    node.prev = this.head;
    node.next = afterHead;
    this.head.next = node;
    afterHead.prev = node;
  }

  /**
   * Evicts the least recently used non-body entry.
   *
   * Scans backward from the tail sentinel to find the first eviction
   * candidate (any entry whose key is not the body story key).
   */
  private evictLru(): void {
    let candidate = this.tail.prev;

    while (candidate && candidate !== this.head) {
      if (candidate.key !== BODY_STORY_KEY) {
        // Found an evictable entry.
        this.detach(candidate);
        this.map.delete(candidate.key);
        candidate.runtime.dispose?.();
        return;
      }
      candidate = candidate.prev;
    }

    // All entries are body — nothing to evict. This should not happen
    // in practice since there is only one body runtime.
  }
}
