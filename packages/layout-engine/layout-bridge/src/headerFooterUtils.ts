import type { HeaderFooterType, Layout, SectionMetadata, Page } from '@superdoc/contracts';

export type HeaderFooterIdentifier = {
  headerIds: Record<'default' | 'first' | 'even' | 'odd', string | null>;
  footerIds: Record<'default' | 'first' | 'even' | 'odd', string | null>;
  titlePg: boolean;
  alternateHeaders: boolean;
};

export const defaultHeaderFooterIdentifier = (): HeaderFooterIdentifier => ({
  headerIds: { default: null, first: null, even: null, odd: null },
  footerIds: { default: null, first: null, even: null, odd: null },
  titlePg: false,
  alternateHeaders: false,
});

export type ConverterLike = {
  headerIds?: {
    default?: string | null;
    first?: string | null;
    even?: string | null;
    odd?: string | null;
    titlePg?: boolean;
  };
  footerIds?: {
    default?: string | null;
    first?: string | null;
    even?: string | null;
    odd?: string | null;
    titlePg?: boolean;
  };
  pageStyles?: {
    alternateHeaders?: boolean;
  };
};

export const extractIdentifierFromConverter = (converter?: ConverterLike | null): HeaderFooterIdentifier => {
  const identifier = defaultHeaderFooterIdentifier();
  if (!converter) return identifier;

  const headerIds = converter.headerIds ?? {};
  const footerIds = converter.footerIds ?? {};

  identifier.headerIds = {
    default: headerIds.default ?? null,
    first: headerIds.first ?? null,
    even: headerIds.even ?? null,
    odd: headerIds.odd ?? null,
  };

  identifier.footerIds = {
    default: footerIds.default ?? null,
    first: footerIds.first ?? null,
    even: footerIds.even ?? null,
    odd: footerIds.odd ?? null,
  };

  identifier.titlePg = Boolean(headerIds.titlePg ?? footerIds.titlePg ?? false);
  identifier.alternateHeaders = Boolean(converter.pageStyles?.alternateHeaders ?? false);

  return identifier;
};

export const getHeaderFooterType = (
  pageNumber: number,
  identifier: HeaderFooterIdentifier,
  options?: { kind?: 'header' | 'footer' },
): HeaderFooterType | null => {
  if (pageNumber <= 0) return null;

  const kind = options?.kind ?? 'header';
  const ids = kind === 'header' ? identifier.headerIds : identifier.footerIds;

  const hasFirst = Boolean(ids.first);
  const hasEven = Boolean(ids.even);
  const hasOdd = Boolean(ids.odd);
  const hasDefault = Boolean(ids.default);

  const titlePgEnabled = identifier.titlePg && hasFirst;
  const isFirstPage = pageNumber === 1;
  if (isFirstPage && titlePgEnabled) {
    return 'first';
  }

  if (identifier.alternateHeaders) {
    if (pageNumber % 2 === 0 && (hasEven || hasDefault)) {
      return hasEven ? 'even' : 'default';
    }
    if (pageNumber % 2 === 1 && (hasOdd || hasDefault)) {
      return hasOdd ? 'odd' : 'default';
    }
  }

  if (hasDefault) {
    return 'default';
  }

  return null;
};

export const resolveHeaderFooterForPage = (
  layout: Layout,
  pageIndex: number,
  identifier: HeaderFooterIdentifier,
  options?: { kind?: 'header' | 'footer' },
) => {
  const pageNumber = layout.pages[pageIndex]?.number ?? pageIndex + 1;
  const type = getHeaderFooterType(pageNumber, identifier, options);
  if (!type) {
    return null;
  }
  const slot = layout.headerFooter?.[type];
  if (!slot) {
    return null;
  }
  const page = slot.pages.find((entry) => entry.number === pageNumber) ?? slot.pages[0];
  if (!page) {
    return null;
  }

  return {
    type,
    layout: slot,
    page,
  };
};

// ============================================================================
// Multi-Section Header/Footer Support
// ============================================================================

/**
 * Type for per-section header/footer ID mappings.
 * Maps variant types (default, first, even, odd) to their content IDs.
 */
export type SectionHeaderFooterIds = Record<'default' | 'first' | 'even' | 'odd', string | null>;

/**
 * Extended identifier that supports per-section header/footer mappings.
 * Backward compatible with single-section documents via legacy fields.
 */
export type MultiSectionHeaderFooterIdentifier = {
  // Legacy fields for backward compatibility (from section 0 / body sectPr)
  headerIds: SectionHeaderFooterIds;
  footerIds: SectionHeaderFooterIds;
  titlePg: boolean;
  alternateHeaders: boolean;

  // Per-section mappings indexed by sectionIndex
  sectionCount: number;
  sectionHeaderIds: Map<number, SectionHeaderFooterIds>;
  sectionFooterIds: Map<number, SectionHeaderFooterIds>;
  // Per-section titlePg flags (Word allows different first page per section)
  sectionTitlePg: Map<number, boolean>;
};

/**
 * Creates an empty multi-section identifier with default values.
 */
export const defaultMultiSectionIdentifier = (): MultiSectionHeaderFooterIdentifier => ({
  headerIds: { default: null, first: null, even: null, odd: null },
  footerIds: { default: null, first: null, even: null, odd: null },
  titlePg: false,
  alternateHeaders: false,
  sectionCount: 0,
  sectionHeaderIds: new Map(),
  sectionFooterIds: new Map(),
  sectionTitlePg: new Map(),
});

/**
 * Builds a multi-section header/footer identifier from section metadata.
 *
 * This function creates mappings from section indices to their header/footer
 * content IDs. It also maintains backward-compatible legacy fields populated
 * from section 0 (or the first available section).
 *
 * @param sectionMetadata - Array of section metadata from layout options
 * @param pageStyles - Optional page styles containing alternateHeaders flag
 * @param converterIds - Optional converter-provided header/footer IDs to use as fallbacks
 *   for dynamically created headers/footers. These IDs are only used when the corresponding
 *   section metadata value is null. Existing section metadata always takes precedence.
 * @returns MultiSectionHeaderFooterIdentifier with per-section mappings
 *
 * @example
 * ```typescript
 * const sections = [
 *   { sectionIndex: 0, headerRefs: { default: 'rId1' }, footerRefs: { default: 'rId2' } },
 *   { sectionIndex: 1, headerRefs: { default: 'rId3' }, footerRefs: { default: 'rId4' } },
 * ];
 * const identifier = buildMultiSectionIdentifier(sections);
 * // identifier.sectionHeaderIds.get(0)?.default === 'rId1'
 * // identifier.sectionFooterIds.get(1)?.default === 'rId4'
 * ```
 *
 * @example
 * ```typescript
 * // With converter IDs as fallbacks
 * const sections = [
 *   { sectionIndex: 0, headerRefs: { default: null }, footerRefs: { default: null } },
 * ];
 * const converterIds = {
 *   headerIds: { default: 'conv-header-1' },
 *   footerIds: { default: 'conv-footer-1' },
 * };
 * const identifier = buildMultiSectionIdentifier(sections, undefined, converterIds);
 * // identifier.headerIds.default === 'conv-header-1' (from converter fallback)
 * ```
 */
export function buildMultiSectionIdentifier(
  sectionMetadata: SectionMetadata[],
  pageStyles?: { alternateHeaders?: boolean },
  converterIds?: {
    headerIds?: { default?: string | null; first?: string | null; even?: string | null; odd?: string | null };
    footerIds?: { default?: string | null; first?: string | null; even?: string | null; odd?: string | null };
  },
): MultiSectionHeaderFooterIdentifier {
  const identifier = defaultMultiSectionIdentifier();

  identifier.alternateHeaders = Boolean(pageStyles?.alternateHeaders ?? false);
  identifier.sectionCount = sectionMetadata.length;

  // Populate per-section maps
  for (const section of sectionMetadata) {
    const idx = section.sectionIndex;

    // Build header IDs for this section
    if (section.headerRefs) {
      identifier.sectionHeaderIds.set(idx, {
        default: section.headerRefs.default ?? null,
        first: section.headerRefs.first ?? null,
        even: section.headerRefs.even ?? null,
        odd: section.headerRefs.odd ?? null,
      });
    }

    // Build footer IDs for this section
    if (section.footerRefs) {
      identifier.sectionFooterIds.set(idx, {
        default: section.footerRefs.default ?? null,
        first: section.footerRefs.first ?? null,
        even: section.footerRefs.even ?? null,
        odd: section.footerRefs.odd ?? null,
      });
    }

    // Track per-section titlePg from section metadata (w:titlePg element in OOXML)
    // Note: The presence of a 'first' header/footer reference does NOT mean titlePg is enabled.
    // The w:titlePg element must be present in sectPr to use first page headers/footers.
    // Track per-section titlePg from section metadata (w:titlePg element in OOXML)
    // Store explicit false so later sections don't inherit section 0's value.
    identifier.sectionTitlePg.set(idx, section.titlePg === true);
  }

  // Set legacy fields from section 0 for backward compatibility
  const section0Headers = identifier.sectionHeaderIds.get(0);
  const section0Footers = identifier.sectionFooterIds.get(0);
  if (section0Headers) {
    identifier.headerIds = { ...section0Headers };
  }
  if (section0Footers) {
    identifier.footerIds = { ...section0Footers };
  }
  identifier.titlePg = identifier.sectionTitlePg.get(0) ?? false;

  // Merge converter IDs as fallbacks for dynamically created headers/footers
  // Only fill in null values - don't override existing refs from section metadata
  // Also fall back to converter's titlePg if not set from section metadata
  if (converterIds?.headerIds) {
    if (!identifier.titlePg && (converterIds.headerIds as { titlePg?: boolean }).titlePg) {
      identifier.titlePg = true;
    }
    identifier.headerIds.default = identifier.headerIds.default ?? converterIds.headerIds.default ?? null;
    identifier.headerIds.first = identifier.headerIds.first ?? converterIds.headerIds.first ?? null;
    identifier.headerIds.even = identifier.headerIds.even ?? converterIds.headerIds.even ?? null;
    identifier.headerIds.odd = identifier.headerIds.odd ?? converterIds.headerIds.odd ?? null;
  }
  if (converterIds?.footerIds) {
    if (!identifier.titlePg && (converterIds.footerIds as { titlePg?: boolean }).titlePg) {
      identifier.titlePg = true;
    }
    identifier.footerIds.default = identifier.footerIds.default ?? converterIds.footerIds.default ?? null;
    identifier.footerIds.first = identifier.footerIds.first ?? converterIds.footerIds.first ?? null;
    identifier.footerIds.even = identifier.footerIds.even ?? converterIds.footerIds.even ?? null;
    identifier.footerIds.odd = identifier.footerIds.odd ?? converterIds.footerIds.odd ?? null;
  }

  return identifier;
}

/**
 * Gets the header/footer variant type for a specific page within a section.
 *
 * This function determines which header/footer variant (default, first, even, odd)
 * should be used for a given page number within a specific section. It respects:
 * - Per-section titlePg (first page of section uses 'first' variant)
 * - Alternate headers (even/odd pages based on physical page number)
 * - Fallback to default variant
 *
 * **Important**: When `titlePg` is enabled, this function returns 'first' even if the
 * section doesn't explicitly define a 'first' header/footer. This supports Word's
 * inheritance behavior where sections inherit header/footer definitions from previous
 * sections. The rendering layer is responsible for resolving the actual content ID
 * through inheritance fallback logic.
 *
 * @param pageNumber - Physical page number (1-indexed)
 * @param sectionIndex - Index of the section this page belongs to
 * @param identifier - Multi-section identifier with per-section mappings
 * @param options - Optional settings (kind: 'header' | 'footer', sectionPageNumber)
 * @returns HeaderFooterType ('default' | 'first' | 'even' | 'odd') or null if no header/footer content exists
 *
 * @example
 * ```typescript
 * // First page of section 1 with titlePg enabled and 'first' header defined
 * const type = getHeaderFooterTypeForSection(1, 1, identifier, { kind: 'header' });
 * // Returns 'first'
 *
 * // First page of section 2 with titlePg enabled but NO 'first' header defined
 * // (section 2 only has 'default' header)
 * const type = getHeaderFooterTypeForSection(2, 1, identifier, { kind: 'header' });
 * // Returns 'first' - rendering layer will inherit from section 1's 'first' header
 * ```
 */
export function getHeaderFooterTypeForSection(
  pageNumber: number,
  sectionIndex: number,
  identifier: MultiSectionHeaderFooterIdentifier,
  options?: { kind?: 'header' | 'footer'; sectionPageNumber?: number },
): HeaderFooterType | null {
  if (pageNumber <= 0) return null;

  const kind = options?.kind ?? 'header';
  const sectionPageNumber = options?.sectionPageNumber ?? pageNumber;

  // Get section-specific IDs, falling back to legacy IDs for backward compatibility
  const sectionIds =
    kind === 'header' ? identifier.sectionHeaderIds.get(sectionIndex) : identifier.sectionFooterIds.get(sectionIndex);

  // Fallback to legacy fields if section not found (backward compatibility)
  const ids = sectionIds ?? (kind === 'header' ? identifier.headerIds : identifier.footerIds);

  const hasFirst = Boolean(ids.first);
  const hasEven = Boolean(ids.even);
  const hasOdd = Boolean(ids.odd);
  const hasDefault = Boolean(ids.default);

  // Check titlePg for this specific section
  const sectionTitlePg = identifier.sectionTitlePg.has(sectionIndex)
    ? identifier.sectionTitlePg.get(sectionIndex)!
    : identifier.titlePg;
  const titlePgEnabled = sectionTitlePg === true;

  // Use the section-relative page number to determine "first page" variants
  const isFirstPageOfSection = sectionPageNumber === 1;
  if (isFirstPageOfSection && titlePgEnabled) {
    // Return 'first' variant type when titlePg is enabled, regardless of whether this section
    // has a 'first' header defined. Word inherits headers from previous sections when not defined,
    // so we let the rendering layer handle the inheritance/fallback logic.
    // Only return null if there's absolutely no header content anywhere.
    if (hasFirst || hasDefault || hasEven || hasOdd) return 'first';
    return null;
  }

  if (identifier.alternateHeaders) {
    if (pageNumber % 2 === 0 && (hasEven || hasDefault)) {
      return hasEven ? 'even' : 'default';
    }
    if (pageNumber % 2 === 1 && (hasOdd || hasDefault)) {
      return hasOdd ? 'odd' : 'default';
    }
  }

  if (hasDefault) {
    return 'default';
  }

  return null;
}

/**
 * Gets the header/footer content ID for a specific page using its section information.
 *
 * This function reads the page's sectionIndex and sectionRefs to determine
 * the correct content ID for rendering the header or footer. It supports
 * multi-section documents where each section can have different header/footer content.
 *
 * @param page - The Page object containing sectionIndex and sectionRefs
 * @param identifier - Multi-section identifier (can be used for variant resolution)
 * @param options - Optional settings (kind: 'header' | 'footer')
 * @returns The content ID string, or null if not available
 *
 * @example
 * ```typescript
 * // Page in section 2 with footerRefs.default = 'rId8'
 * const footerId = getHeaderFooterIdForPage(page, identifier, { kind: 'footer' });
 * // Returns 'rId8'
 * ```
 */
export function getHeaderFooterIdForPage(
  page: Page,
  identifier: MultiSectionHeaderFooterIdentifier,
  options?: { kind?: 'header' | 'footer'; sectionPageNumber?: number },
): string | null {
  const kind = options?.kind ?? 'header';
  const sectionIndex = page.sectionIndex ?? 0;
  const sectionPageNumber = options?.sectionPageNumber ?? page.number;

  // Determine which variant type to use (default, first, even, odd)
  const variantType = getHeaderFooterTypeForSection(page.number, sectionIndex, identifier, {
    kind,
    sectionPageNumber,
  });
  if (!variantType) return null;

  // First try to get from page's sectionRefs (most specific, stamped during layout)
  const pageRefs = kind === 'header' ? page.sectionRefs?.headerRefs : page.sectionRefs?.footerRefs;
  if (pageRefs) {
    const idFromPage = pageRefs[variantType];
    if (idFromPage) return idFromPage;
  }

  // Fall back to identifier's section mappings
  const sectionIds =
    kind === 'header' ? identifier.sectionHeaderIds.get(sectionIndex) : identifier.sectionFooterIds.get(sectionIndex);

  if (sectionIds) {
    const idFromSection = sectionIds[variantType];
    if (idFromSection) return idFromSection;
  }

  // Final fallback to legacy identifier fields
  const legacyIds = kind === 'header' ? identifier.headerIds : identifier.footerIds;
  return legacyIds[variantType] ?? null;
}

/**
 * Resolves header/footer layout information for a page using section-aware logic.
 *
 * This is the main entry point for section-aware header/footer resolution.
 * It combines the page's section information with the multi-section identifier
 * to select the correct header/footer content for rendering.
 *
 * @param layout - The complete Layout object with pages and headerFooter slots
 * @param pageIndex - Index of the page in layout.pages array (0-indexed)
 * @param identifier - Multi-section identifier with per-section mappings
 * @param options - Optional settings (kind: 'header' | 'footer')
 * @returns Resolution result with type, layout slot, page, and section info, or null
 *
 * @example
 * ```typescript
 * const result = resolveHeaderFooterForPageAndSection(layout, 5, identifier, { kind: 'footer' });
 * if (result) {
 *   // result.type: 'default' | 'first' | 'even' | 'odd'
 *   // result.layout: HeaderFooterLayout for this variant
 *   // result.page: HeaderFooterPage with fragments
 *   // result.sectionIndex: Which section this page belongs to
 *   // result.contentId: The rId for the header/footer XML content
 * }
 * ```
 */
export function resolveHeaderFooterForPageAndSection(
  layout: Layout,
  pageIndex: number,
  identifier: MultiSectionHeaderFooterIdentifier,
  options?: { kind?: 'header' | 'footer' },
): {
  type: HeaderFooterType;
  layout: NonNullable<NonNullable<Layout['headerFooter']>[HeaderFooterType]>;
  page: NonNullable<NonNullable<Layout['headerFooter']>[HeaderFooterType]>['pages'][number];
  sectionIndex: number;
  contentId: string | null;
} | null {
  const page = layout.pages[pageIndex];
  if (!page) return null;

  const kind = options?.kind ?? 'header';
  const sectionIndex = page.sectionIndex ?? 0;
  const pageNumber = page.number;
  const sectionFirstPageNumbers = new Map<number, number>();
  for (const layoutPage of layout.pages) {
    const idx = layoutPage.sectionIndex ?? 0;
    if (!sectionFirstPageNumbers.has(idx)) {
      sectionFirstPageNumbers.set(idx, layoutPage.number);
    }
  }
  const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
  const sectionPageNumber = typeof firstPageInSection === 'number' ? pageNumber - firstPageInSection + 1 : pageNumber;

  // Determine variant type for this section
  const type = getHeaderFooterTypeForSection(pageNumber, sectionIndex, identifier, { kind, sectionPageNumber });
  if (!type) return null;

  // Get content ID for this page/section
  const contentId = getHeaderFooterIdForPage(page, identifier, { kind, sectionPageNumber });

  // Look up the header/footer layout slot
  const slot = layout.headerFooter?.[type];
  if (!slot) return null;

  // Find the page entry within the header/footer layout
  const headerFooterPage = slot.pages.find((entry) => entry.number === pageNumber) ?? slot.pages[0];
  if (!headerFooterPage) return null;

  return {
    type,
    layout: slot,
    page: headerFooterPage,
    sectionIndex,
    contentId,
  };
}
