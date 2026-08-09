type CacheEntry = {
  width: number;
  text: string;
  font: string;
  letterSpacing: number;
  estimatedBytes: number;
  recent: boolean;
  slot: number;
  textEntries: Map<string, CacheEntry>;
  spacingEntries: Map<number, Map<string, CacheEntry>>;
  fontEntries: Map<string, Map<number, Map<string, CacheEntry>>>;
  spaceEntries?: Map<number, CacheEntry>;
};

export interface TextWidthCacheStats {
  requests: number;
  hits: number;
  misses: number;
  evictions: number;
  intrinsicMeasureCalls: number;
  intrinsicMeasureMs: number;
  lookupMs: number;
  keyCharacters: number;
  residentEntries: number;
  estimatedResidentBytes: number;
}

export interface TextWidthCacheOptions {
  maxEntries?: number;
  maxEstimatedBytes?: number;
}

const DEFAULT_COMPATIBILITY_MAX_ENTRIES = 5_000;
const CACHE_ENTRY_FIXED_BYTES = 160;

const emptyStats = (): TextWidthCacheStats => ({
  requests: 0,
  hits: 0,
  misses: 0,
  evictions: 0,
  intrinsicMeasureCalls: 0,
  intrinsicMeasureMs: 0,
  lookupMs: 0,
  keyCharacters: 0,
  residentEntries: 0,
  estimatedResidentBytes: 0,
});

const now = (): number => globalThis.performance?.now?.() ?? Date.now();

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value == null) return fallback;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function estimateEntryBytes(text: string, font: string): number {
  // Conservative owned-data estimate: UTF-16 key storage plus the entry and
  // hierarchical-map/index overhead. Runtime heap gates remain authoritative
  // for engine-specific Map/string overhead this estimate cannot observe.
  return CACHE_ENTRY_FIXED_BYTES + (text.length + font.length) * 2;
}

/**
 * Exact text-width cache with bounded second-chance eviction.
 *
 * Hits only set a bit. They never delete/reinsert an entry or allocate a
 * composite key, which keeps the common paragraph path constant-time even
 * when a document's working set contains tens of thousands of exact strings.
 */
export class TextWidthMeasurementCache {
  private maxEntries: number;
  private maxEstimatedBytes: number;
  private cacheByContext = new WeakMap<CanvasRenderingContext2D, Map<string, Map<number, Map<string, CacheEntry>>>>();
  private spacesByContext = new WeakMap<CanvasRenderingContext2D, Map<string, Map<number, CacheEntry>>>();
  private clock: Array<CacheEntry | null> = [];
  private freeSlots: number[] = [];
  private clockCursor = 0;
  private stats = emptyStats();
  private disposed = false;

  constructor(options: TextWidthCacheOptions = {}) {
    this.maxEntries = positiveLimit(options.maxEntries, DEFAULT_COMPATIBILITY_MAX_ENTRIES);
    this.maxEstimatedBytes = positiveLimit(options.maxEstimatedBytes, Number.MAX_SAFE_INTEGER);
  }

  setLimits(options: TextWidthCacheOptions): void {
    this.assertLive();
    this.maxEntries = positiveLimit(options.maxEntries, this.maxEntries);
    this.maxEstimatedBytes = positiveLimit(options.maxEstimatedBytes, this.maxEstimatedBytes);
    this.evictIfNeeded();
  }

  measure(text: string, font: string, letterSpacing: number, ctx: CanvasRenderingContext2D): number {
    this.assertLive();
    this.stats.requests += 1;

    if (text.length > 32_000) text = text.substring(0, 32_000);
    const normalizedLetterSpacing = letterSpacing || 0;
    const lookupStartedAt = now();
    const fontEntries = this.cacheByContext.get(ctx);
    const hit =
      text === ' '
        ? this.spacesByContext.get(ctx)?.get(font)?.get(normalizedLetterSpacing)
        : fontEntries?.get(font)?.get(normalizedLetterSpacing)?.get(text);
    this.stats.lookupMs += Math.max(0, now() - lookupStartedAt);
    if (hit !== undefined) {
      hit.recent = true;
      this.stats.hits += 1;
      return hit.width;
    }

    this.stats.misses += 1;
    try {
      ctx.font = font;
      const intrinsicStartedAt = now();
      const metrics = ctx.measureText(text);
      this.stats.intrinsicMeasureMs += Math.max(0, now() - intrinsicStartedAt);
      this.stats.intrinsicMeasureCalls += 1;
      const extra = letterSpacing ? Math.max(0, text.length - 1) * letterSpacing : 0;
      const width = metrics.width + extra;

      const contextEntries = fontEntries ?? new Map<string, Map<number, Map<string, CacheEntry>>>();
      if (!fontEntries) this.cacheByContext.set(ctx, contextEntries);
      let spacingEntries = contextEntries.get(font);
      if (!spacingEntries) {
        spacingEntries = new Map();
        contextEntries.set(font, spacingEntries);
      }
      let textEntries = spacingEntries.get(normalizedLetterSpacing);
      if (!textEntries) {
        textEntries = new Map();
        spacingEntries.set(normalizedLetterSpacing, textEntries);
      }

      let spaceEntries: Map<number, CacheEntry> | undefined;
      if (text === ' ') {
        let spacesByFont = this.spacesByContext.get(ctx);
        if (!spacesByFont) {
          spacesByFont = new Map();
          this.spacesByContext.set(ctx, spacesByFont);
        }
        spaceEntries = spacesByFont.get(font);
        if (!spaceEntries) {
          spaceEntries = new Map();
          spacesByFont.set(font, spaceEntries);
        }
      }

      const estimatedBytes = estimateEntryBytes(text, font);
      const slot = this.freeSlots.pop() ?? this.clock.length;
      const entry: CacheEntry = {
        width,
        text,
        font,
        letterSpacing: normalizedLetterSpacing,
        estimatedBytes,
        recent: true,
        slot,
        textEntries,
        spacingEntries,
        fontEntries: contextEntries,
        ...(spaceEntries ? { spaceEntries } : {}),
      };
      textEntries.set(text, entry);
      spaceEntries?.set(normalizedLetterSpacing, entry);
      if (slot === this.clock.length) this.clock.push(entry);
      else this.clock[slot] = entry;
      this.stats.keyCharacters += text.length + font.length;
      this.stats.residentEntries += 1;
      this.stats.estimatedResidentBytes += estimatedBytes;
      this.evictIfNeeded();
      return width;
    } catch {
      return 0;
    }
  }

  snapshotStats(): TextWidthCacheStats {
    return { ...this.stats };
  }

  clear(): void {
    this.assertLive();
    this.cacheByContext = new WeakMap();
    this.spacesByContext = new WeakMap();
    this.clock = [];
    this.freeSlots = [];
    this.clockCursor = 0;
    this.stats = emptyStats();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cacheByContext = new WeakMap();
    this.spacesByContext = new WeakMap();
    this.clock = [];
    this.freeSlots = [];
    this.clockCursor = 0;
    this.stats = emptyStats();
    this.disposed = true;
  }

  private evictIfNeeded(): void {
    while (this.stats.residentEntries > this.maxEntries || this.stats.estimatedResidentBytes > this.maxEstimatedBytes) {
      if (!this.evictOne()) break;
    }
  }

  private evictOne(): boolean {
    if (this.stats.residentEntries === 0 || this.clock.length === 0) return false;
    let probesRemaining = this.clock.length * 2 + 1;
    while (probesRemaining > 0) {
      probesRemaining -= 1;
      if (this.clockCursor >= this.clock.length) this.clockCursor = 0;
      const slot = this.clockCursor;
      this.clockCursor += 1;
      const entry = this.clock[slot];
      if (!entry) continue;
      if (entry.recent) {
        entry.recent = false;
        continue;
      }

      entry.textEntries.delete(entry.text);
      entry.spaceEntries?.delete(entry.letterSpacing);
      if (entry.textEntries.size === 0) {
        entry.spacingEntries.delete(entry.letterSpacing);
        if (entry.spacingEntries.size === 0) entry.fontEntries.delete(entry.font);
      }
      this.clock[slot] = null;
      this.freeSlots.push(slot);
      this.stats.evictions += 1;
      this.stats.residentEntries -= 1;
      this.stats.estimatedResidentBytes -= entry.estimatedBytes;
      return true;
    }
    return false;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('TextWidthMeasurementCache has been disposed');
  }
}

const defaultCache = new TextWidthMeasurementCache();

export function setCacheSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) return;
  defaultCache.setLimits({ maxEntries: size });
}

export function clearMeasurementCache(): void {
  defaultCache.clear();
}

export function getMeasuredTextWidth(
  text: string,
  font: string,
  letterSpacing: number,
  ctx: CanvasRenderingContext2D,
): number {
  return defaultCache.measure(text, font, letterSpacing, ctx);
}
