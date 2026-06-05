/**
 * Section Extraction Module
 *
 * Extracts section data (margins, type, page size, orientation, columns) from paragraph nodes.
 */

import type { PMNode } from '../types.js';
import type { ParagraphProperties, SectionVerticalAlign } from './types.js';
import type { ColumnLayout, PageNumberChapterSeparator } from '@superdoc/contracts';

const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;
const DEFAULT_COLUMN_GAP_INCHES = 0.5; // 720 twips = 0.5 inches

/**
 * Convert twips (twentiethsOfAPoint) to pixels.
 * 1440 twips = 1 inch = 96 pixels
 */
function twipsToPixels(twips: unknown): number | undefined {
  const n = Number(twips);
  return Number.isFinite(n) ? (n / TWIPS_PER_INCH) * PX_PER_INCH : undefined;
}

/**
 * Parse and validate column count from w:cols w:num attribute.
 * @param rawValue - Raw value from w:num attribute
 * @returns Column count (defaults to 1 if missing or invalid per Word semantics)
 */
export function parseColumnCount(rawValue: string | number | undefined): number {
  if (rawValue == null) return 1; // Word default: single column when w:num is absent
  const count = Number(rawValue);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

/**
 * Parse column gap from w:cols w:space attribute (in twips) and convert to inches.
 * @param gapTwips - Gap in twips from w:space attribute
 * @returns Gap in inches (defaults to 0.5" = 720 twips if missing or invalid)
 */
export function parseColumnGap(gapTwips: string | number | undefined): number {
  if (gapTwips == null) return DEFAULT_COLUMN_GAP_INCHES;
  const gap = Number(gapTwips);
  return Number.isFinite(gap) ? gap / TWIPS_PER_INCH : DEFAULT_COLUMN_GAP_INCHES;
}

/**
 * Parse presence of column separator from w:sep attribute (can be '1', 'true' or 'on').
 * @param rawValue - Raw value from w:sep attribute
 * @returns Presence of column separator
 */
export function parseColumnSeparator(rawValue: string | number | undefined): boolean {
  return rawValue === '1' || rawValue === 'true' || rawValue === 'on' || rawValue === 1;
}

function parsePositiveInteger(rawValue: unknown): number | undefined {
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isKnownChapterSeparator(value: unknown): value is PageNumberChapterSeparator {
  return typeof value === 'string' && (CHAPTER_SEPARATOR_VALUES as readonly string[]).includes(value);
}

type SectionType = 'continuous' | 'nextPage' | 'evenPage' | 'oddPage';
type Orientation = 'portrait' | 'landscape';
type HeaderRefType = Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
type NumberingFormat = 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
const CHAPTER_SEPARATOR_VALUES: readonly PageNumberChapterSeparator[] = [
  'hyphen',
  'period',
  'colon',
  'emDash',
  'enDash',
] as const;

interface SectionElement {
  name: string;
  attributes?: Record<string, unknown>;
  elements?: SectionElement[];
}

/**
 * Extract normalized margins from sectionMargins attribute (inches -> pixels).
 */
function extractNormalizedMargins(attrs: Record<string, unknown>): {
  headerPx: number | undefined;
  footerPx: number | undefined;
} {
  const sectionMargins = attrs.sectionMargins as { header?: number | null; footer?: number | null } | undefined;
  return {
    headerPx: typeof sectionMargins?.header === 'number' ? sectionMargins.header * 96 : undefined,
    footerPx: typeof sectionMargins?.footer === 'number' ? sectionMargins.footer * 96 : undefined,
  };
}

/**
 * Extract section type from <w:type> element.
 * Defaults to 'nextPage' per OOXML spec when absent. This preserves the
 * historical body-sectPr type behavior — any change to that ripples
 * through page-break placement, header/footer inheritance, and section
 * flow across the entire layout pipeline. Callers that need to know
 * whether `<w:type>` was actually present should consult
 * `extractSectionTypeWithSource` below; the existing `type` value stays
 * `nextPage` regardless.
 */
function extractSectionType(elements: SectionElement[]): SectionType {
  const typeEl = elements.find((el) => el?.name === 'w:type');
  const val = typeEl?.attributes?.['w:val'];
  if (val === 'continuous' || val === 'nextPage' || val === 'evenPage' || val === 'oddPage') {
    return val;
  }
  return 'nextPage';
}

/**
 * True iff `<w:type>` is present in the source XML.
 *
 * The column-balancing gate (ECMA-376 §17.18.77) needs to distinguish a
 * body sectPr whose `<w:type>` defaulted to `nextPage` because it was
 * omitted (sd-1655-col-sep-3-equal-columns: Word fills col-by-col, no
 * balance) from one with explicit `<w:type w:val="continuous"/>`
 * (sd-1480-two-col-tab-positions: Word balances 6 entries 3+3 on a
 * single page). The type field alone can't carry this — both produce
 * `'nextPage'` in the resolved type — so we surface it as a separate
 * flag without touching the established type defaulting.
 */
function extractSectionTypeIsExplicit(elements: SectionElement[]): boolean {
  return elements.some((el) => el?.name === 'w:type');
}

/**
 * Extract page size and orientation from <w:pgSz> element.
 * Infers orientation from dimensions if not explicitly set.
 */
function extractPageSizeAndOrientation(elements: SectionElement[]): {
  pageSizePx: { w: number; h: number } | undefined;
  orientation: Orientation | undefined;
} {
  const pgSz = elements.find((el) => el?.name === 'w:pgSz');
  if (!pgSz?.attributes) {
    return { pageSizePx: undefined, orientation: undefined };
  }

  const a = pgSz.attributes;
  const widthPx = a['w:w'] != null ? twipsToPixels(a['w:w']) : undefined;
  const heightPx = a['w:h'] != null ? twipsToPixels(a['w:h']) : undefined;

  let pageSizePx: { w: number; h: number } | undefined;
  if (widthPx != null && heightPx != null) {
    pageSizePx = { w: widthPx, h: heightPx };
  }

  let orientation: Orientation | undefined;
  const orient = a['w:orient'];
  if (orient === 'portrait' || orient === 'landscape') {
    orientation = orient;
  } else if (widthPx != null && heightPx != null) {
    // Infer from dimensions
    orientation = heightPx > widthPx ? 'portrait' : 'landscape';
  }

  return { pageSizePx, orientation };
}

/**
 * Extract fallback margins from <w:pgMar> element (for non-normalized values).
 * Includes both header/footer margins and page margins (top/right/bottom/left).
 */
function extractFallbackMargins(
  elements: SectionElement[],
  currentHeader: number | undefined,
  currentFooter: number | undefined,
): {
  headerPx: number | undefined;
  footerPx: number | undefined;
  topPx: number | undefined;
  rightPx: number | undefined;
  bottomPx: number | undefined;
  leftPx: number | undefined;
} {
  const pgMar = elements.find((el) => el?.name === 'w:pgMar');
  const a = pgMar?.attributes || {};

  return {
    headerPx: currentHeader ?? (a['w:header'] != null ? twipsToPixels(a['w:header']) : undefined),
    footerPx: currentFooter ?? (a['w:footer'] != null ? twipsToPixels(a['w:footer']) : undefined),
    topPx: a['w:top'] != null ? twipsToPixels(a['w:top']) : undefined,
    rightPx: a['w:right'] != null ? twipsToPixels(a['w:right']) : undefined,
    bottomPx: a['w:bottom'] != null ? twipsToPixels(a['w:bottom']) : undefined,
    leftPx: a['w:left'] != null ? twipsToPixels(a['w:left']) : undefined,
  };
}

/**
 * Extract header/footer references by type (default, first, even, odd).
 */
function extractHeaderFooterRefs(
  elements: SectionElement[],
  refName: 'w:headerReference' | 'w:footerReference',
): HeaderRefType | undefined {
  const refs = elements.filter((el) => el?.name === refName);
  if (!refs.length) return undefined;

  const out: HeaderRefType = {};
  refs.forEach((ref) => {
    const refType = ref?.attributes?.['w:type'] as string | undefined;
    const typeKey =
      refType === 'first' || refType === 'even' || refType === 'odd' || refType === 'default' ? refType : 'default';
    const id = ref?.attributes?.['r:id'];
    if (typeof id === 'string' || typeof id === 'number') {
      out[typeKey] = String(id);
    }
  });

  return Object.keys(out).length ? out : undefined;
}

/**
 * Extract page numbering format and start number from <w:pgNumType>.
 *
 * Per OOXML spec, when w:fmt is absent the format defaults to 'decimal'.
 * When w:start is present, it restarts page numbering from that value.
 * If neither attribute is present, the element has no effect on numbering.
 */
function extractPageNumbering(elements: SectionElement[]):
  | {
      format?: NumberingFormat;
      start?: number;
      chapterStyle?: number;
      chapterSeparator?: PageNumberChapterSeparator;
    }
  | undefined {
  const pgNumType = elements.find((el) => el?.name === 'w:pgNumType');
  if (!pgNumType?.attributes) return undefined;

  const fmtRaw = pgNumType.attributes['w:fmt'] as string | undefined;
  const validFormats: NumberingFormat[] = [
    'decimal',
    'lowerLetter',
    'upperLetter',
    'lowerRoman',
    'upperRoman',
    'numberInDash',
  ];
  const fmt = (validFormats.includes(fmtRaw as NumberingFormat) ? fmtRaw : undefined) as NumberingFormat | undefined;

  const startRaw = pgNumType.attributes['w:start'];
  const startNum = startRaw != null ? Number(startRaw) : undefined;
  const hasStart = Number.isFinite(startNum);
  const chapterStyle = parsePositiveInteger(pgNumType.attributes['w:chapStyle']);
  const chapterSeparatorRaw = pgNumType.attributes['w:chapSep'];
  const chapterSeparator = isKnownChapterSeparator(chapterSeparatorRaw) ? chapterSeparatorRaw : undefined;

  // Per OOXML spec, when w:start restarts numbering without w:fmt, default to decimal (Arabic numerals)
  const effectiveFormat = fmt ?? (hasStart ? 'decimal' : undefined);

  if (effectiveFormat === undefined && !hasStart && chapterStyle === undefined && chapterSeparator === undefined) {
    return undefined;
  }

  return {
    format: effectiveFormat,
    ...(hasStart ? { start: Number(startNum) } : {}),
    ...(chapterStyle !== undefined ? { chapterStyle } : {}),
    ...(chapterSeparator !== undefined ? { chapterSeparator } : {}),
  };
}

/**
 * Extract columns from <w:cols> element.
 */
function extractColumns(elements: SectionElement[]): ColumnLayout | undefined {
  const cols = elements.find((el) => el?.name === 'w:cols');
  if (!cols?.attributes) return undefined;

  let count = parseColumnCount(cols.attributes['w:num'] as string | number | undefined);
  const withSeparator = parseColumnSeparator(cols.attributes['w:sep'] as string | number | undefined);
  const equalWidthRaw = cols.attributes['w:equalWidth'];
  const equalWidth =
    equalWidthRaw === '0' || equalWidthRaw === 0 || equalWidthRaw === false
      ? false
      : equalWidthRaw === '1' || equalWidthRaw === 1 || equalWidthRaw === true
        ? true
        : undefined;
  const columnChildren = Array.isArray(cols.elements) ? cols.elements.filter((child) => child?.name === 'w:col') : [];
  // ECMA-376 §17.6.4 column mode, validated against Word (MS Word 16 oracle):
  //   Explicit mode (`w:equalWidth="0"`): widths and inter-column spacing come from the child
  //   `<w:col>` elements (`w:w` + `w:space`, default 0); the section `w:cols/@w:space` is
  //   ignored. (Per-column distinct spacing is SD-2629; today the first child's space is
  //   projected as the single gap.)
  //   Equal mode (`w:equalWidth="1"` or omitted): Word ignores all child `<w:col>` data. The
  //   gap comes from `w:cols/@w:space` (default 720); a child `w:space` is NOT consulted, and
  //   child widths are dropped so the columns divide evenly. Count comes from `w:num`
  //   (default 1) in equal mode, and is capped to the valid child-width count in explicit
  //   mode (Word renders min(num, count of <w:col> with a usable w:w)). (SD-2324)
  const isExplicit = equalWidth === false;
  const firstChildSpace = columnChildren.find((child) => child?.attributes?.['w:space'] != null)?.attributes?.[
    'w:space'
  ];
  const gapTwips = isExplicit ? (firstChildSpace ?? 0) : cols.attributes['w:space'];
  const gapInches = parseColumnGap(gapTwips as string | number | undefined);
  const widths = columnChildren
    .map((child) => Number(child.attributes?.['w:w']))
    .filter((widthTwips) => Number.isFinite(widthTwips) && widthTwips > 0)
    .map((widthTwips) => (widthTwips / 1440) * PX_PER_INCH);

  // Explicit mode: w:num is capped to the valid child-width count (widths.length), i.e. the
  // number of <w:col> that supplied a usable w:w. Word renders min(num, that count) (e.g.
  // w:num="4" with two <w:col> => 2 columns, verified vs Word). This is the authoritative
  // count both the fill loop and width math read; the matching clamp in normalizeColumnLayout
  // is a defensive net for any other producer. (SD-2324 F8)
  if (isExplicit && widths.length > 0) {
    count = Math.min(count, widths.length);
  }

  const result: ColumnLayout = {
    count,
    gap: gapInches * PX_PER_INCH,
    withSeparator,
    // Only explicit columns carry per-column widths; equal mode divides evenly (Word ignores
    // child `w:w` when equalWidth is "1" or omitted).
    ...(isExplicit && widths.length > 0 ? { widths } : {}),
    ...(equalWidth !== undefined ? { equalWidth } : {}),
  };

  return result;
}

/**
 * Extract vertical alignment from <w:vAlign> element.
 * Controls how content is positioned vertically within the page.
 *
 * OOXML values:
 * - 'top': Content aligned to top of text area (default)
 * - 'center': Content vertically centered in text area
 * - 'bottom': Content aligned to bottom of text area
 * - 'both': Content justified vertically (distributed)
 *
 * @param elements - Array of section property elements from w:sectPr
 * @returns The vertical alignment value if valid w:vAlign element found, undefined otherwise
 *
 * @example
 * ```typescript
 * const elements = [
 *   { name: 'w:vAlign', attributes: { 'w:val': 'center' } }
 * ];
 * const vAlign = extractVerticalAlign(elements);
 * // Returns: 'center'
 * ```
 *
 * @example
 * ```typescript
 * // Missing vAlign element
 * const elements = [{ name: 'w:pgSz', attributes: { 'w:w': '12240' } }];
 * const vAlign = extractVerticalAlign(elements);
 * // Returns: undefined
 * ```
 *
 * @example
 * ```typescript
 * // Invalid vAlign value
 * const elements = [
 *   { name: 'w:vAlign', attributes: { 'w:val': 'invalid' } }
 * ];
 * const vAlign = extractVerticalAlign(elements);
 * // Returns: undefined
 * ```
 */
function extractVerticalAlign(elements: SectionElement[]): SectionVerticalAlign | undefined {
  const vAlign = elements.find((el) => el?.name === 'w:vAlign');
  if (!vAlign?.attributes) return undefined;

  const val = vAlign.attributes['w:val'];
  if (val === 'top' || val === 'center' || val === 'bottom' || val === 'both') {
    return val;
  }
  return undefined;
}

/**
 * Extract section data (margins, type, page size, orientation, columns, vAlign) from a paragraph node.
 * Prefers normalized attrs.sectionMargins (inches), falls back to raw sectPr parsing (twips).
 */
export function extractSectionData(para: PMNode): {
  headerPx?: number;
  footerPx?: number;
  topPx?: number;
  rightPx?: number;
  bottomPx?: number;
  leftPx?: number;
  type?: SectionType;
  /** True iff `<w:type>` was present in the source XML (vs. type defaulted by the caller). */
  typeIsExplicit?: boolean;
  pageSizePx?: { w: number; h: number };
  orientation?: Orientation;
  columnsPx?: ColumnLayout;
  titlePg?: boolean;
  headerRefs?: HeaderRefType;
  footerRefs?: HeaderRefType;
  numbering?: {
    format?: NumberingFormat;
    start?: number;
    chapterStyle?: number;
    chapterSeparator?: PageNumberChapterSeparator;
  };
  vAlign?: SectionVerticalAlign;
} | null {
  const attrs = (para.attrs ?? {}) as Record<string, unknown>;

  // Prefer normalized margins (already in pixels)
  let { headerPx, footerPx } = extractNormalizedMargins(attrs);

  // Get sectPr elements for additional properties
  const paragraphProperties =
    typeof attrs.paragraphProperties === 'object' && attrs.paragraphProperties !== null
      ? (attrs.paragraphProperties as ParagraphProperties)
      : undefined;
  const sectPrElements =
    paragraphProperties?.sectPr &&
    typeof paragraphProperties.sectPr === 'object' &&
    'elements' in paragraphProperties.sectPr &&
    Array.isArray(paragraphProperties.sectPr.elements)
      ? (paragraphProperties.sectPr.elements as SectionElement[])
      : undefined;

  if (!sectPrElements) {
    // No sectPr elements, return only margins if present
    return headerPx == null && footerPx == null ? null : { headerPx, footerPx };
  }

  // Extract all section properties. type defaults to 'nextPage' per OOXML
  // spec (and this preserves the historical pipeline behavior across page
  // breaks, header/footer flow, etc). `typeIsExplicit` lets the
  // column-balancing gate know whether `<w:type>` was actually written.
  const type = extractSectionType(sectPrElements);
  const typeIsExplicit = extractSectionTypeIsExplicit(sectPrElements);
  const { pageSizePx, orientation } = extractPageSizeAndOrientation(sectPrElements);
  const titlePg = sectPrElements.some((el) => el?.name === 'w:titlePg');
  const fallbackMargins = extractFallbackMargins(sectPrElements, headerPx, footerPx);
  headerPx = fallbackMargins.headerPx;
  footerPx = fallbackMargins.footerPx;
  const { topPx, rightPx, bottomPx, leftPx } = fallbackMargins;
  const headerRefs = extractHeaderFooterRefs(sectPrElements, 'w:headerReference');
  const footerRefs = extractHeaderFooterRefs(sectPrElements, 'w:footerReference');
  const numbering = extractPageNumbering(sectPrElements);
  const columnsPx = extractColumns(sectPrElements);
  const vAlign = extractVerticalAlign(sectPrElements);

  // When sectPrElements exist, always return data (even if minimal). The
  // caller applies the appropriate default for `type` (paragraph default =
  // nextPage, body default = continuous) and sees `typeIsExplicit` for the
  // distinction.
  return {
    headerPx,
    footerPx,
    topPx,
    rightPx,
    bottomPx,
    leftPx,
    type,
    typeIsExplicit,
    pageSizePx,
    orientation,
    columnsPx,
    titlePg,
    headerRefs,
    footerRefs,
    numbering,
    vAlign,
  };
}
