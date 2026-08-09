/**
 * Paragraph Line Cache
 *
 * Caches line break information for paragraphs to avoid expensive recalculation.
 * Tracks dirty state to know when recalculation is needed after edits.
 *
 * @module paragraph-line-cache
 */

/**
 * Information about a single line within a paragraph.
 */
export interface LineInfo {
  /** Character offset within paragraph where line starts */
  localStart: number;
  /** Character offset within paragraph where line ends (exclusive) */
  localEnd: number;
  /** Width of the line in pixels */
  width: number;
  /** Height of the line in pixels */
  height: number;
}

/**
 * Cached line break information for a paragraph.
 */
export interface ParagraphLines {
  /** PM document version when these lines were calculated */
  version: number;
  /** Array of lines in this paragraph */
  lines: LineInfo[];
  /** Total height of all lines */
  totalHeight: number;
  /** Whether this cache entry needs recalculation */
  dirty: boolean;
}

/**
 * ParagraphLineCache stores line break information for paragraphs.
 *
 * This cache is essential for performance when calculating cursor positions
 * within multi-line paragraphs, as it avoids re-measuring line breaks.
 */
export class ParagraphLineCache {
  private cache: Map<number, ParagraphLines> = new Map();

  /**
   * Gets cached lines for a paragraph.
   *
   * @param paragraphIndex - Index of the paragraph
   * @returns Cached lines if available, undefined otherwise
   */
  getLines(paragraphIndex: number): ParagraphLines | undefined {
    return this.cache.get(paragraphIndex);
  }

  /**
   * Sets lines for a paragraph.
   *
   * @param paragraphIndex - Index of the paragraph
   * @param lines - Line information to cache
   */
  setLines(paragraphIndex: number, lines: ParagraphLines): void {
    this.cache.set(paragraphIndex, { ...lines, dirty: false });
  }

  /**
   * Marks a paragraph as dirty (needs recalculation).
   *
   * @param paragraphIndex - Index of the paragraph to mark dirty
   */
  markDirty(paragraphIndex: number): void {
    const entry = this.cache.get(paragraphIndex);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * Marks all paragraphs starting from a specific index as dirty.
   *
   * This is useful when a change affects multiple paragraphs.
   *
   * @param startIndex - First paragraph index to mark dirty
   */
  markDirtyFrom(startIndex: number): void {
    for (const [index, entry] of this.cache.entries()) {
      if (index >= startIndex) {
        entry.dirty = true;
      }
    }
  }

  /**
   * Marks all paragraphs in a range as dirty.
   *
   * @param startIndex - First paragraph index to mark dirty (inclusive)
   * @param endIndex - Last paragraph index to mark dirty (exclusive)
   */
  markDirtyRange(startIndex: number, endIndex: number): void {
    for (const [index, entry] of this.cache.entries()) {
      if (index >= startIndex && index < endIndex) {
        entry.dirty = true;
      }
    }
  }

  /**
   * Checks if a paragraph needs recalculation.
   *
   * @param paragraphIndex - Index of the paragraph to check
   * @returns True if the paragraph is dirty or not cached
   */
  isDirty(paragraphIndex: number): boolean {
    const entry = this.cache.get(paragraphIndex);
    return entry ? entry.dirty : true;
  }

  /**
   * Finds the line containing a local character offset within a paragraph.
   *
   * @param paragraphIndex - Index of the paragraph
   * @param localOffset - Character offset within the paragraph
   * @returns Line info if found, null otherwise
   */
  findLineContaining(paragraphIndex: number, localOffset: number): LineInfo | null {
    const entry = this.cache.get(paragraphIndex);
    if (!entry || entry.dirty) {
      return null;
    }

    // Linear search through lines
    // Could be optimized with binary search if needed
    for (const line of entry.lines) {
      if (localOffset >= line.localStart && localOffset < line.localEnd) {
        return line;
      }
    }

    // If offset is beyond all lines, return last line
    if (entry.lines.length > 0 && localOffset >= entry.lines[entry.lines.length - 1].localEnd) {
      return entry.lines[entry.lines.length - 1];
    }

    return null;
  }

  /**
   * Gets the line index containing a local character offset.
   *
   * @param paragraphIndex - Index of the paragraph
   * @param localOffset - Character offset within the paragraph
   * @returns Line index if found, -1 otherwise
   */
  findLineIndex(paragraphIndex: number, localOffset: number): number {
    const entry = this.cache.get(paragraphIndex);
    if (!entry || entry.dirty) {
      return -1;
    }

    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i];
      if (localOffset >= line.localStart && localOffset < line.localEnd) {
        return i;
      }
    }

    // If offset is beyond all lines, return last line index
    if (entry.lines.length > 0 && localOffset >= entry.lines[entry.lines.length - 1].localEnd) {
      return entry.lines.length - 1;
    }

    return -1;
  }

  /**
   * Removes a paragraph from the cache.
   *
   * @param paragraphIndex - Index of the paragraph to remove
   */
  remove(paragraphIndex: number): void {
    this.cache.delete(paragraphIndex);
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the number of cached paragraphs.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Checks if a paragraph is cached.
   *
   * @param paragraphIndex - Index of the paragraph to check
   * @returns True if the paragraph has cached lines
   */
  has(paragraphIndex: number): boolean {
    return this.cache.has(paragraphIndex);
  }

  /**
   * Gets all cached paragraph indices.
   *
   * @returns Array of paragraph indices that are cached
   */
  getCachedIndices(): number[] {
    return Array.from(this.cache.keys()).sort((a, b) => a - b);
  }

  /**
   * Gets cache statistics for debugging.
   *
   * @returns Statistics about the cache
   */
  getStats(): {
    total: number;
    dirty: number;
    clean: number;
  } {
    let dirty = 0;
    let clean = 0;

    for (const entry of this.cache.values()) {
      if (entry.dirty) {
        dirty++;
      } else {
        clean++;
      }
    }

    return {
      total: this.cache.size,
      dirty,
      clean,
    };
  }

  /**
   * Validates cache entries for a specific version.
   * Marks entries with mismatched versions as dirty.
   *
   * @param currentVersion - Current PM document version
   * @returns Number of entries marked dirty
   */
  validateVersion(currentVersion: number): number {
    let markedDirty = 0;

    for (const entry of this.cache.values()) {
      if (entry.version !== currentVersion && !entry.dirty) {
        entry.dirty = true;
        markedDirty++;
      }
    }

    return markedDirty;
  }

  /**
   * Prunes dirty entries from the cache to free memory.
   *
   * @returns Number of entries removed
   */
  pruneDirty(): number {
    let removed = 0;

    for (const [index, entry] of this.cache.entries()) {
      if (entry.dirty) {
        this.cache.delete(index);
        removed++;
      }
    }

    return removed;
  }
}
