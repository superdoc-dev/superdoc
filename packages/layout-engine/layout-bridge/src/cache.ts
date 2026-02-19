import type {
  FlowBlock,
  ImageRun,
  TableBlock,
  ParagraphBlock,
  ParagraphAttrs,
  ParagraphFrame,
  TableAttrs,
  TableCellAttrs,
  Run,
} from '@superdoc/contracts';
import { fieldAnnotationKey } from './field-annotation-key.js';
import { hasTrackedChange, resolveTrackedChangesEnabled } from './tracked-changes-utils.js';
import { hashParagraphBorders, hashTableBorders, hashCellBorders } from './paragraph-hash-utils.js';

/**
 * Comment annotation structure attached to runs.
 */
type CommentAnnotation = {
  commentId?: string;
  internal?: boolean;
};

/**
 * Run type with validated comment annotations.
 */
type RunWithComments = Run & {
  comments: CommentAnnotation[];
};

/**
 * Type guard to check if a run has valid comment annotations.
 * Ensures the comments property exists, is an array, and is non-empty
 * before attempting to access comment metadata.
 *
 * @param run - The run to check for comments
 * @returns True if run has valid comments array, false otherwise
 */
function hasComments(run: Run): run is RunWithComments {
  return (
    'comments' in run &&
    Array.isArray((run as Partial<RunWithComments>).comments) &&
    (run as Partial<RunWithComments>).comments!.length > 0
  );
}

/**
 * Maximum cache size (number of entries)
 * Based on profiling: 500-page doc uses ~3,000 entries
 * 10K provides 3× safety margin while preventing unbounded growth
 */
const MAX_CACHE_SIZE = 10_000;

/**
 * Estimated memory per cache entry (bytes)
 * Used for memory usage reporting (rough estimate)
 */
const BYTES_PER_ENTRY_ESTIMATE = 5_000; // ~5KB per entry

/**
 * Creates a deterministic hash string for a paragraph frame.
 * Ensures consistent property ordering for reliable cache keys.
 *
 * @param frame - The paragraph frame to hash
 * @returns A deterministic hash string
 */
const hashParagraphFrame = (frame: ParagraphFrame): string => {
  const parts: string[] = [];
  if (frame.wrap !== undefined) parts.push(`w:${frame.wrap}`);
  if (frame.x !== undefined) parts.push(`x:${frame.x}`);
  if (frame.y !== undefined) parts.push(`y:${frame.y}`);
  if (frame.xAlign !== undefined) parts.push(`xa:${frame.xAlign}`);
  if (frame.yAlign !== undefined) parts.push(`ya:${frame.yAlign}`);
  if (frame.hAnchor !== undefined) parts.push(`ha:${frame.hAnchor}`);
  if (frame.vAnchor !== undefined) parts.push(`va:${frame.vAnchor}`);
  return parts.join(',');
};

/**
 * Generates a cache key hash from a block's runs, incorporating content and formatting.
 *
 * Text content is preserved verbatim without whitespace normalization. Different
 * whitespace (multiple spaces, tabs, leading/trailing spaces) produces different
 * text measurements and must generate distinct cache keys to prevent incorrect
 * cache hits. See PR #1551 for context on the whitespace normalization bug.
 *
 * For image runs, includes the image source (first 50 chars) and dimensions to ensure
 * cache invalidation when image properties change. This is critical for converted
 * metafiles (WMF/EMF) where placeholder images may have different dimensions than
 * the original, preventing stale cached measurements from being served.
 *
 * @param block - The flow block to generate a hash for
 * @returns A string hash representing the block's run content and formatting
 */
const hashRuns = (block: FlowBlock): string => {
  // FIX: For table blocks and paragraphs, include content AND formatting properties in hash.
  // Formatting properties that affect measurement: fontSize, fontFamily, bold, italic, color.
  // This ensures cache invalidation when text OR formatting changes.
  // Previously tables only included text content, causing stale measurements when changing formatting.
  if (block.kind === 'table') {
    const tableBlock = block as TableBlock;
    const cellHashes: string[] = [];

    // Safety: Check that rows array exists before iterating
    if (!tableBlock.rows) {
      return `${block.id}:table:`;
    }

    for (const row of tableBlock.rows) {
      // Safety: Check that cells array exists before iterating
      if (!row.cells) {
        continue;
      }

      for (const cell of row.cells) {
        // Include cell-level attributes that affect rendering (borders, padding, etc.)
        // This ensures cache invalidation when cell formatting changes (e.g., remove borders).
        if (cell.attrs) {
          const cellAttrs = cell.attrs as TableCellAttrs;
          const cellAttrParts: string[] = [];
          if (cellAttrs.borders) {
            cellAttrParts.push(`cb:${hashCellBorders(cellAttrs.borders)}`);
          }
          if (cellAttrs.padding) {
            const p = cellAttrs.padding;
            cellAttrParts.push(`cp:${p.top ?? 0}:${p.right ?? 0}:${p.bottom ?? 0}:${p.left ?? 0}`);
          }
          if (cellAttrs.verticalAlign) {
            cellAttrParts.push(`va:${cellAttrs.verticalAlign}`);
          }
          if (cellAttrs.background) {
            cellAttrParts.push(`bg:${cellAttrs.background}`);
          }
          if (cellAttrParts.length > 0) {
            cellHashes.push(`ca:${cellAttrParts.join(':')}`);
          }
        }

        // Support both new multi-block cells and legacy single paragraph cells
        const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);

        for (const cellBlock of cellBlocks) {
          const paragraphBlock = cellBlock as ParagraphBlock;

          // Safety: Check that runs array exists before iterating
          if (!paragraphBlock.runs) {
            continue;
          }

          for (const run of paragraphBlock.runs) {
            // Text is used verbatim without normalization - whitespace affects measurements
            // (Fix for PR #1551: previously /\s+/g normalization caused cache collisions)
            const text = 'text' in run && typeof run.text === 'string' ? run.text : '';

            // Include formatting marks that affect measurement (mirroring paragraph approach)
            const bold = 'bold' in run ? run.bold : false;
            const italic = 'italic' in run ? run.italic : false;
            const color = 'color' in run ? run.color : undefined;
            const fontSize = 'fontSize' in run ? run.fontSize : undefined;
            const fontFamily = 'fontFamily' in run ? run.fontFamily : undefined;
            const highlight = 'highlight' in run ? run.highlight : undefined;

            // Build marks string including all formatting properties
            const marks = [
              bold ? 'b' : '',
              italic ? 'i' : '',
              color ?? '',
              fontSize !== undefined ? `fs:${fontSize}` : '',
              fontFamily ? `ff:${fontFamily}` : '',
              highlight ? `hl:${highlight}` : '',
            ].join('');

            // Use type guard to safely access comment metadata
            const commentHash = hasComments(run)
              ? run.comments.map((c) => `${c.commentId ?? ''}:${c.internal ? '1' : '0'}`).join('|')
              : '';

            // Include tracked change metadata in hash
            let trackedKey = '';
            if (hasTrackedChange(run)) {
              const tc = run.trackedChange;
              const beforeHash = tc.before ? JSON.stringify(tc.before) : '';
              const afterHash = tc.after ? JSON.stringify(tc.after) : '';
              trackedKey = `|tc:${tc.kind ?? ''}:${tc.id ?? ''}:${tc.author ?? ''}:${tc.date ?? ''}:${beforeHash}:${afterHash}`;
            }

            const commentKey = commentHash ? `|cm:${commentHash}` : '';
            cellHashes.push(`${text}:${marks}${trackedKey}${commentKey}`);
          }

          // Include paragraph-level attributes that affect layout/rendering in hash.
          // This ensures cache invalidation when paragraph formatting changes
          // (alignment, spacing, line height, indent, etc.) without text changes.
          // Fixes toolbar commands not updating for text inside tables.
          if (paragraphBlock.attrs) {
            const attrs = paragraphBlock.attrs as ParagraphAttrs;
            const parts: string[] = [];

            // Alignment
            if (attrs.alignment) parts.push(`al:${attrs.alignment}`);

            // Spacing (includes line height)
            if (attrs.spacing) {
              const s = attrs.spacing;
              if (s.before !== undefined) parts.push(`sb:${s.before}`);
              if (s.after !== undefined) parts.push(`sa:${s.after}`);
              if (s.line !== undefined) parts.push(`sl:${s.line}`);
              if (s.lineRule) parts.push(`sr:${s.lineRule}`);
            }

            // Indentation
            if (attrs.indent) {
              const ind = attrs.indent;
              if (ind.left !== undefined) parts.push(`il:${ind.left}`);
              if (ind.right !== undefined) parts.push(`ir:${ind.right}`);
              if (ind.firstLine !== undefined) parts.push(`if:${ind.firstLine}`);
              if (ind.hanging !== undefined) parts.push(`ih:${ind.hanging}`);
            }

            // Borders
            if (attrs.borders) {
              parts.push(`br:${hashParagraphBorders(attrs.borders)}`);
            }

            // Shading
            if (attrs.shading) {
              const sh = attrs.shading;
              if (sh.fill) parts.push(`shf:${sh.fill}`);
              if (sh.color) parts.push(`shc:${sh.color}`);
            }

            // Direction and RTL
            if (attrs.direction) parts.push(`dir:${attrs.direction}`);
            if (attrs.rtl) parts.push('rtl');

            if (parts.length > 0) {
              cellHashes.push(`pa:${parts.join(':')}`);
            }
          }
        }
      }
    }
    // Include table-level attributes that affect rendering (borders, etc.)
    // This ensures cache invalidation when table formatting changes (e.g., remove borders).
    let tableAttrsKey = '';
    if (tableBlock.attrs) {
      const tblAttrs = tableBlock.attrs as TableAttrs;
      const tableAttrParts: string[] = [];
      if (tblAttrs.borders) {
        tableAttrParts.push(`tb:${hashTableBorders(tblAttrs.borders)}`);
      }
      if (tblAttrs.borderCollapse) {
        tableAttrParts.push(`bc:${tblAttrs.borderCollapse}`);
      }
      if (tblAttrs.cellSpacing !== undefined) {
        tableAttrParts.push(`cs:${tblAttrs.cellSpacing}`);
      }
      if (tableAttrParts.length > 0) {
        tableAttrsKey = `|ta:${tableAttrParts.join(':')}`;
      }
    }

    const contentHash = cellHashes.join('|');
    return `${block.id}:table:${contentHash}${tableAttrsKey}`;
  }

  if (block.kind !== 'paragraph') return block.id;
  const trackedMode =
    (block.attrs && 'trackedChangesMode' in block.attrs && block.attrs.trackedChangesMode) || 'review';
  const trackedEnabled = resolveTrackedChangesEnabled(block.attrs, true);
  const runsHash = block.runs
    .map((run) => {
      // For image runs, include src hash and dimensions in the cache key.
      // This ensures cache invalidation when image source or size changes.
      if (run.kind === 'image') {
        const imgRun = run as ImageRun;
        // Hash the src (first 50 chars to keep key manageable) + dimensions
        const srcHash = imgRun.src.slice(0, 50);
        return `img:${srcHash}:${imgRun.width}x${imgRun.height}`;
      }

      if (run.kind === 'fieldAnnotation') {
        return `fa:${fieldAnnotationKey(run)}`;
      }

      // Text is used verbatim without normalization - whitespace affects measurements
      // (Fix for PR #1551: previously /\s+/g normalization caused cache collisions)
      const text = 'src' in run || run.kind === 'lineBreak' || run.kind === 'break' ? '' : (run.text ?? '');
      const bold = 'bold' in run ? run.bold : false;
      const italic = 'italic' in run ? run.italic : false;
      const color = 'color' in run ? run.color : undefined;
      const fontSize = 'fontSize' in run ? run.fontSize : undefined;
      const fontFamily = 'fontFamily' in run ? run.fontFamily : undefined;
      const highlight = 'highlight' in run ? run.highlight : undefined;
      const marks = [
        bold ? 'b' : '',
        italic ? 'i' : '',
        color ?? '',
        fontSize !== undefined ? `fs:${fontSize}` : '',
        fontFamily ? `ff:${fontFamily}` : '',
        highlight ? `hl:${highlight}` : '',
      ].join('');

      // Include tracked change metadata in hash
      let trackedKey = '';
      if (hasTrackedChange(run)) {
        const tc = run.trackedChange;
        const beforeHash = tc.before ? JSON.stringify(tc.before) : '';
        const afterHash = tc.after ? JSON.stringify(tc.after) : '';
        trackedKey = `|tc:${tc.kind ?? ''}:${tc.id ?? ''}:${tc.author ?? ''}:${tc.date ?? ''}:${beforeHash}:${afterHash}`;
      }

      return `${text}:${marks}${trackedKey}`;
    })
    .join('|');

  // Include list/numbering properties in hash to invalidate cache when list status changes
  let numberingKey = '';
  if (block.attrs) {
    const attrs = block.attrs as {
      numberingProperties?: { numId?: number | string; ilvl?: number };
      wordLayout?: { marker?: { markerText?: string } };
    };
    if (attrs.numberingProperties) {
      const np = attrs.numberingProperties;
      // Use distinct sentinel values to avoid hash collision:
      // - "<NULL>" for missing marker (wordLayout.marker not present)
      // - "<EMPTY>" for empty marker text (marker exists but markerText is empty string)
      // - actual marker text otherwise
      let markerTextKey: string;
      if (!attrs.wordLayout?.marker) {
        markerTextKey = '<NULL>';
      } else {
        const markerText = attrs.wordLayout.marker.markerText;
        markerTextKey = markerText === '' ? '<EMPTY>' : (markerText ?? '<NULL>');
      }
      numberingKey = `|num:${np.numId ?? ''}:${np.ilvl ?? 0}:${markerTextKey}`;
    }
  }

  // Include paragraph-level attributes that affect layout/rendering in hash.
  // This ensures cache invalidation when paragraph formatting changes (alignment, spacing, etc.)
  // without text changes. Previously only runs were hashed, causing stale measurements
  // when toolbar commands like "align center" were used.
  let paragraphAttrsKey = '';
  if (block.attrs) {
    const attrs = block.attrs as ParagraphAttrs;

    // Build a deterministic hash of visual paragraph attributes
    const parts: string[] = [];

    // Alignment (most common change via toolbar)
    if (attrs.alignment) parts.push(`al:${attrs.alignment}`);

    // Spacing
    if (attrs.spacing) {
      const s = attrs.spacing;
      if (s.before !== undefined) parts.push(`sb:${s.before}`);
      if (s.after !== undefined) parts.push(`sa:${s.after}`);
      if (s.line !== undefined) parts.push(`sl:${s.line}`);
      if (s.lineRule) parts.push(`sr:${s.lineRule}`);
    }

    // Indentation
    if (attrs.indent) {
      const ind = attrs.indent;
      if (ind.left !== undefined) parts.push(`il:${ind.left}`);
      if (ind.right !== undefined) parts.push(`ir:${ind.right}`);
      if (ind.firstLine !== undefined) parts.push(`if:${ind.firstLine}`);
      if (ind.hanging !== undefined) parts.push(`ih:${ind.hanging}`);
    }

    // Borders (use deterministic hash for consistent cache keys)
    if (attrs.borders) {
      parts.push(`br:${hashParagraphBorders(attrs.borders)}`);
    }

    // Shading
    if (attrs.shading) {
      const sh = attrs.shading;
      if (sh.fill) parts.push(`shf:${sh.fill}`);
      if (sh.color) parts.push(`shc:${sh.color}`);
    }

    // Tabs
    if (attrs.tabs && attrs.tabs.length > 0) {
      const tabsHash = attrs.tabs.map((t) => `${t.val ?? ''}:${t.pos ?? ''}:${t.leader ?? ''}`).join(',');
      parts.push(`tb:${tabsHash}`);
    }

    // Direction and RTL
    if (attrs.direction) parts.push(`dir:${attrs.direction}`);
    if (attrs.rtl) parts.push('rtl');

    // Pagination properties
    if (attrs.keepNext) parts.push('kn');
    if (attrs.keepLines) parts.push('kl');

    // Float alignment
    if (attrs.floatAlignment) parts.push(`fa:${attrs.floatAlignment}`);

    // Contextual spacing
    if (attrs.contextualSpacing) parts.push('cs');

    // Suppress first line indent
    if (attrs.suppressFirstLineIndent) parts.push('sfi');

    // Drop cap
    if (attrs.dropCap) parts.push(`dc:${attrs.dropCap}`);
    if (attrs.dropCapDescriptor) {
      const dcd = attrs.dropCapDescriptor;
      parts.push(`dcd:${dcd.mode ?? ''}:${dcd.lines ?? ''}`);
    }

    // Frame (use deterministic hash for consistent cache keys)
    if (attrs.frame) {
      parts.push(`fr:${hashParagraphFrame(attrs.frame)}`);
    }

    // Tab settings
    if (attrs.tabIntervalTwips !== undefined) parts.push(`ti:${attrs.tabIntervalTwips}`);
    if (attrs.decimalSeparator) parts.push(`ds:${attrs.decimalSeparator}`);

    if (parts.length > 0) {
      paragraphAttrsKey = `|pa:${parts.join(':')}`;
    }
  }

  return `${trackedMode}:${trackedEnabled ? 'on' : 'off'}|${runsHash}${numberingKey}${paragraphAttrsKey}`;
};

/**
 * Cache statistics with LRU eviction tracking
 */
export type MeasureCacheStats = {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  clears: number;
  /**
   * Number of entries evicted due to LRU policy
   */
  evictions: number;
  /**
   * Current cache size (number of entries)
   */
  size: number;
  /**
   * Estimated memory usage (bytes)
   */
  memorySizeEstimate: number;
};

const createStats = (): MeasureCacheStats => ({
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  clears: 0,
  evictions: 0,
  size: 0,
  memorySizeEstimate: 0,
});

/**
 * Maximum allowed dimension for cache keys.
 * Prevents memory exhaustion from pathological inputs.
 */
const MAX_DIMENSION = 1_000_000;

/**
 * LRU-enhanced MeasureCache
 *
 * Key improvements:
 * 1. Bounded size: max 10,000 entries
 * 2. LRU eviction: Evicts least recently used when full
 * 3. O(1) access and eviction using Map insertion order
 * 4. Memory usage estimation
 * 5. Eviction statistics
 *
 * Performance characteristics:
 * - get(): O(1) - Map lookup + delete + re-insert for LRU tracking
 * - set(): O(1) - eviction (delete first key) + insert
 * - invalidate(): O(n) - where n = number of keys matching blockId prefix
 * - Memory: Bounded at 10K entries ~= 50-100MB
 */
export class MeasureCache<T> {
  private cache = new Map<string, T>();
  private stats: MeasureCacheStats = createStats();

  /**
   * Retrieve a cached measure for the given block and dimensions.
   * Returns undefined if the block is null/undefined, lacks an ID, or if no cached value exists.
   *
   * @param block - The flow block to look up (may be null/undefined)
   * @param width - The width dimension for cache key
   * @param height - The height dimension for cache key
   * @returns The cached value or undefined
   */
  public get(block: FlowBlock | null | undefined, width: number, height: number): T | undefined {
    // Safety: Validate block exists and has required properties before accessing
    // This prevents invalid cache keys from null/undefined blocks
    if (!block || !block.id) {
      return undefined;
    }

    const key = this.composeKey(block, width, height);
    const value = this.cache.get(key);

    if (value !== undefined) {
      this.stats.hits += 1;

      // Move to end (most recently used)
      // JavaScript Map maintains insertion order, so delete + re-insert moves to end
      this.cache.delete(key);
      this.cache.set(key, value);

      return value;
    } else {
      this.stats.misses += 1;
      return undefined;
    }
  }

  /**
   * Store a measure in the cache for the given block and dimensions.
   * Silently returns if the block is null/undefined or lacks an ID.
   *
   * @param block - The flow block to cache (may be null/undefined)
   * @param width - The width dimension for cache key
   * @param height - The height dimension for cache key
   * @param value - The value to cache
   */
  public set(block: FlowBlock | null | undefined, width: number, height: number, value: T): void {
    // Safety: Validate block exists and has required properties before caching
    // This prevents invalid cache keys and silent failures
    if (!block || !block.id) {
      return;
    }

    const key = this.composeKey(block, width, height);

    // If key already exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Check if cache is full (before adding new entry)
    if (this.cache.size >= MAX_CACHE_SIZE) {
      // Evict oldest entry (first in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.stats.evictions += 1;
      }
    }

    // Add new entry (goes to end of Map)
    this.cache.set(key, value);
    this.stats.sets += 1;

    // Update size stats
    this.updateSizeStats();
  }

  /**
   * Invalidates cached measurements for specific block IDs.
   * Removes all cache entries whose keys start with any of the provided block IDs.
   *
   * @param blockIds - Array of block IDs to invalidate from the cache
   *
   * @example
   * ```typescript
   * cache.invalidate(['block-123', 'block-456']);
   * ```
   */
  public invalidate(blockIds: string[]): void {
    let removed = 0;
    blockIds.forEach((id) => {
      for (const key of this.cache.keys()) {
        if (key.startsWith(id + '@')) {
          this.cache.delete(key);
          removed += 1;
        }
      }
    });
    this.stats.invalidations += removed;
    this.updateSizeStats();
  }

  /**
   * Clears all cached measurements and resets statistics.
   * Use when performing a full document re-layout.
   */
  public clear(): void {
    this.cache.clear();
    this.stats.clears += 1;
    this.updateSizeStats();
  }

  /**
   * Resets cache statistics (hits, misses, sets) to zero.
   * Does not clear cached values.
   */
  public resetStats(): void {
    const currentSize = this.cache.size;
    const currentMemory = currentSize * BYTES_PER_ENTRY_ESTIMATE;
    this.stats = createStats();
    this.stats.size = currentSize;
    this.stats.memorySizeEstimate = currentMemory;
  }

  /**
   * Returns current cache performance statistics.
   * Useful for monitoring cache effectiveness.
   *
   * @returns Object containing hits, misses, sets, and hit rate
   */
  public getStats(): MeasureCacheStats {
    return { ...this.stats };
  }

  /**
   * Get current cache size (number of entries)
   */
  public getSize(): number {
    return this.cache.size;
  }

  /**
   * Get maximum cache size
   */
  public getMaxSize(): number {
    return MAX_CACHE_SIZE;
  }

  /**
   * Check if cache is near capacity
   */
  public isNearCapacity(threshold = 0.9): boolean {
    return this.cache.size >= MAX_CACHE_SIZE * threshold;
  }

  /**
   * Update size statistics
   */
  private updateSizeStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memorySizeEstimate = this.cache.size * BYTES_PER_ENTRY_ESTIMATE;
  }

  /**
   * Composes a cache key from block properties and dimensions.
   * Validates and clamps dimensions to prevent memory exhaustion.
   *
   * @param block - The flow block to create a key for
   * @param width - Width dimension (will be clamped to [0, MAX_DIMENSION])
   * @param height - Height dimension (will be clamped to [0, MAX_DIMENSION])
   * @returns Cache key string
   */
  private composeKey(block: FlowBlock, width: number, height: number): string {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.min(Math.floor(width), MAX_DIMENSION)) : 0;
    const safeHeight = Number.isFinite(height) ? Math.max(0, Math.min(Math.floor(height), MAX_DIMENSION)) : 0;
    const hash = hashRuns(block);
    return `${block.id}@${safeWidth}x${safeHeight}:${hash}`;
  }
}
