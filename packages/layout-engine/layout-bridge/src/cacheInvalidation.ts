/**
 * Cache Invalidation Module
 *
 * Manages cache invalidation logic for header/footer and body content caches.
 * Ensures caches are properly invalidated when content, constraints, or metadata changes.
 *
 * Invalidation triggers:
 * 1. Header/footer content changes (block hash differs)
 * 2. Section metadata or numbering format/restart changes
 * 3. Constraints (width/height/margins) change
 * 4. Body measure cache for affected block IDs after token resolution
 */

import type { FlowBlock, SectionMetadata } from '@superdoc/contracts';
import type { HeaderFooterConstraints } from '@superdoc/layout-engine';
import type { MeasureCache } from './cache';
import type { HeaderFooterLayoutCache } from './layoutHeaderFooter';
import { HeaderFooterCacheLogger } from './instrumentation';

/**
 * Computes a hash for header/footer block content.
 * Used to detect when header/footer content has changed.
 *
 * @param blocks - Header/footer blocks
 * @returns Content hash string
 */
export function computeHeaderFooterContentHash(blocks: FlowBlock[]): string {
  if (!blocks || blocks.length === 0) {
    return '';
  }

  // Simple hash based on block IDs and paragraph run content
  const parts: string[] = [];

  for (const block of blocks) {
    parts.push(block.id);

    if (block.kind === 'paragraph') {
      for (const run of block.runs) {
        // Only TextRun and TabRun have text property; ImageRun, LineBreakRun, BreakRun, and FieldAnnotationRun do not
        if (!('src' in run) && run.kind !== 'lineBreak' && run.kind !== 'break' && run.kind !== 'fieldAnnotation') {
          parts.push(run.text ?? '');
        }
        if ('bold' in run && run.bold) parts.push('b');
        if ('italic' in run && run.italic) parts.push('i');
        if ('token' in run && run.token) parts.push(`token:${run.token}`);
      }
    }
  }

  return parts.join('|');
}

/**
 * Computes a hash for section metadata.
 * Used to detect when section numbering or properties have changed.
 *
 * @param sections - Section metadata array
 * @returns Metadata hash string
 */
export function computeSectionMetadataHash(sections: SectionMetadata[]): string {
  if (!sections || sections.length === 0) {
    return '';
  }

  const parts: string[] = [];

  for (const section of sections) {
    parts.push(`section:${section.sectionIndex}`);

    // Include numbering properties that affect display
    if (section.numbering) {
      const num = section.numbering;
      parts.push(`num:${num.format ?? 'decimal'}:${num.start ?? 1}`);
    }

    // Include header/footer refs that affect which variants are used
    if (section.headerRefs) {
      const refs = section.headerRefs;
      if (refs.default) parts.push(`hdr-def:${refs.default}`);
      if (refs.first) parts.push(`hdr-first:${refs.first}`);
      if (refs.even) parts.push(`hdr-even:${refs.even}`);
      if (refs.odd) parts.push(`hdr-odd:${refs.odd}`);
    }
    if (section.footerRefs) {
      const refs = section.footerRefs;
      if (refs.default) parts.push(`ftr-def:${refs.default}`);
      if (refs.first) parts.push(`ftr-first:${refs.first}`);
      if (refs.even) parts.push(`ftr-even:${refs.even}`);
      if (refs.odd) parts.push(`ftr-odd:${refs.odd}`);
    }
  }

  return parts.join('|');
}

/**
 * Computes a hash for header/footer constraints.
 * Used to detect when layout constraints have changed.
 *
 * @param constraints - Header/footer constraints
 * @returns Constraints hash string
 */
export function computeConstraintsHash(constraints: HeaderFooterConstraints): string {
  const { width, height, pageWidth, margins, overflowBaseHeight } = constraints;

  const parts = [`w:${width}`, `h:${height}`];

  if (pageWidth !== undefined) {
    parts.push(`pw:${pageWidth}`);
  }

  if (overflowBaseHeight !== undefined) {
    parts.push(`obh:${overflowBaseHeight}`);
  }

  if (margins) {
    parts.push(`ml:${margins.left}`, `mr:${margins.right}`);
  }

  return parts.join('|');
}

/**
 * Cache state tracker for header/footer layouts.
 * Stores hashes of content, constraints, and metadata to detect changes.
 */
export class HeaderFooterCacheState {
  private contentHashes = new Map<string, string>(); // variantKey -> contentHash
  private constraintsHash: string = '';
  private sectionMetadataHash: string = '';

  /**
   * Checks if header/footer content has changed for a variant.
   *
   * @param variantKey - Unique key for the variant (e.g., 'header-default')
   * @param blocks - Current blocks for the variant
   * @returns True if content has changed
   */
  hasContentChanged(variantKey: string, blocks: FlowBlock[]): boolean {
    const currentHash = computeHeaderFooterContentHash(blocks);
    const previousHash = this.contentHashes.get(variantKey);

    if (previousHash === undefined) {
      // First time seeing this variant
      this.contentHashes.set(variantKey, currentHash);
      return false;
    }

    const changed = currentHash !== previousHash;
    if (changed) {
      this.contentHashes.set(variantKey, currentHash);
    }

    return changed;
  }

  /**
   * Checks if constraints have changed.
   *
   * @param constraints - Current constraints
   * @returns True if constraints have changed
   */
  hasConstraintsChanged(constraints: HeaderFooterConstraints): boolean {
    const currentHash = computeConstraintsHash(constraints);

    if (this.constraintsHash === '') {
      // First time
      this.constraintsHash = currentHash;
      return false;
    }

    const changed = currentHash !== this.constraintsHash;
    if (changed) {
      this.constraintsHash = currentHash;
    }

    return changed;
  }

  /**
   * Checks if section metadata has changed.
   *
   * @param sections - Current section metadata
   * @returns True if metadata has changed
   */
  hasSectionMetadataChanged(sections: SectionMetadata[]): boolean {
    const currentHash = computeSectionMetadataHash(sections);

    if (this.sectionMetadataHash === '') {
      // First time
      this.sectionMetadataHash = currentHash;
      return false;
    }

    const changed = currentHash !== this.sectionMetadataHash;
    if (changed) {
      this.sectionMetadataHash = currentHash;
    }

    return changed;
  }

  /**
   * Resets all cached state.
   * Called when performing a full cache clear.
   */
  reset(): void {
    this.contentHashes.clear();
    this.constraintsHash = '';
    this.sectionMetadataHash = '';
  }
}

/**
 * Invalidates header/footer cache based on change detection.
 *
 * This function checks what has changed (content, constraints, metadata) and
 * invalidates the appropriate cache entries. It uses the cache state tracker
 * to detect changes between layout runs.
 *
 * @param cache - Header/footer layout cache
 * @param cacheState - Cache state tracker
 * @param headerBlocks - Current header blocks (optional)
 * @param footerBlocks - Current footer blocks (optional)
 * @param constraints - Current constraints
 * @param sections - Current section metadata
 *
 * @example
 * ```typescript
 * invalidateHeaderFooterCache(
 *   cache,
 *   cacheState,
 *   headerBlocks,
 *   footerBlocks,
 *   constraints,
 *   sections
 * );
 * ```
 */
export function invalidateHeaderFooterCache(
  cache: HeaderFooterLayoutCache,
  cacheState: HeaderFooterCacheState,
  headerBlocks?: { default?: FlowBlock[]; first?: FlowBlock[]; even?: FlowBlock[]; odd?: FlowBlock[] },
  footerBlocks?: { default?: FlowBlock[]; first?: FlowBlock[]; even?: FlowBlock[]; odd?: FlowBlock[] },
  constraints?: HeaderFooterConstraints,
  sections?: SectionMetadata[],
): void {
  const invalidationReasons: string[] = [];
  const affectedBlockIds: string[] = [];

  // Check if constraints changed
  if (constraints && cacheState.hasConstraintsChanged(constraints)) {
    invalidationReasons.push('constraints changed');

    // Invalidate entire cache when constraints change (affects all layouts)
    if (headerBlocks) {
      Object.values(headerBlocks).forEach((blocks) => {
        if (blocks) affectedBlockIds.push(...blocks.map((b) => b.id));
      });
    }
    if (footerBlocks) {
      Object.values(footerBlocks).forEach((blocks) => {
        if (blocks) affectedBlockIds.push(...blocks.map((b) => b.id));
      });
    }
  }

  // Check if section metadata changed
  if (sections && cacheState.hasSectionMetadataChanged(sections)) {
    invalidationReasons.push('section metadata changed');

    // Invalidate entire cache when metadata changes (affects numbering)
    if (headerBlocks) {
      Object.values(headerBlocks).forEach((blocks) => {
        if (blocks) affectedBlockIds.push(...blocks.map((b) => b.id));
      });
    }
    if (footerBlocks) {
      Object.values(footerBlocks).forEach((blocks) => {
        if (blocks) affectedBlockIds.push(...blocks.map((b) => b.id));
      });
    }
  }

  // Check if header/footer content changed for each variant
  if (headerBlocks) {
    for (const [variant, blocks] of Object.entries(headerBlocks)) {
      if (!blocks) continue;

      const variantKey = `header-${variant}`;
      if (cacheState.hasContentChanged(variantKey, blocks)) {
        invalidationReasons.push(`header ${variant} content changed`);
        affectedBlockIds.push(...blocks.map((b) => b.id));
      }
    }
  }

  if (footerBlocks) {
    for (const [variant, blocks] of Object.entries(footerBlocks)) {
      if (!blocks) continue;

      const variantKey = `footer-${variant}`;
      if (cacheState.hasContentChanged(variantKey, blocks)) {
        invalidationReasons.push(`footer ${variant} content changed`);
        affectedBlockIds.push(...blocks.map((b) => b.id));
      }
    }
  }

  // Perform invalidation if any changes detected
  if (affectedBlockIds.length > 0) {
    // Remove duplicates
    const uniqueBlockIds = Array.from(new Set(affectedBlockIds));

    // Invalidate cache
    cache.invalidate(uniqueBlockIds);

    // Log invalidation
    HeaderFooterCacheLogger.logInvalidation(invalidationReasons.join(', '), uniqueBlockIds);
  }
}

/**
 * Invalidates body measure cache for blocks affected by token resolution.
 *
 * This should be called after page token resolution to ensure re-measurement
 * of blocks with resolved tokens.
 *
 * @param cache - Body measure cache
 * @param affectedBlockIds - Set of block IDs affected by token resolution
 *
 * @example
 * ```typescript
 * const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);
 * invalidateBodyMeasureCache(measureCache, result.affectedBlockIds);
 * ```
 */
export function invalidateBodyMeasureCache<T>(cache: MeasureCache<T>, affectedBlockIds: Set<string>): void {
  if (affectedBlockIds.size === 0) {
    return;
  }

  const blockIdsArray = Array.from(affectedBlockIds);
  cache.invalidate(blockIdsArray);

  // Note: Logging is handled in incrementalLayout.ts where this is called
}
