/**
 * @superdoc/style-engine
 *
 * Resolves OOXML styles to normalized ComputedStyle objects that engines can consume.
 * This module owns the cascade rules (defaults -> styles -> numbering -> direct formatting).
 *
 * Tab Stops:
 * - Passes through OOXML TabStop values unchanged (positions in twips, val: start/end/etc.)
 * - No unit conversion happens here - preserves exact OOXML values for round-trip fidelity
 * - Conversion to pixels happens at measurement boundary only
 */

import { toCssFontFamily } from '@superdoc/font-utils';

// Re-export cascade utilities - these are the SINGLE SOURCE OF TRUTH for property merging
export {
  combineProperties,
  combineRunProperties,
  applyInlineOverrides,
  resolveFontSizeWithFallback,
  orderDefaultsAndNormal,
  combineIndentProperties,
  createFirstLineIndentHandler,
  createHangingIndentHandler,
  isValidFontSize,
  INLINE_OVERRIDE_PROPERTIES,
  DEFAULT_FONT_SIZE_HALF_POINTS,
  type PropertyObject,
  type SpecialHandler,
  type CombinePropertiesOptions,
} from './cascade.js';
import type {
  TabStop,
  FieldAnnotationMetadata,
  StructuredContentMetadata,
  DocumentSectionMetadata,
  DocPartMetadata,
  SdtMetadata,
} from '@superdoc/contracts';

export type {
  FieldAnnotationMetadata,
  StructuredContentMetadata,
  DocumentSectionMetadata,
  DocPartMetadata,
  SdtMetadata,
};

export type SdtNodeType =
  | 'fieldAnnotation'
  | 'structuredContent'
  | 'structuredContentBlock'
  | 'documentSection'
  | 'docPartObject';

export interface ResolveSdtMetadataInput {
  nodeType?: SdtNodeType | string | null;
  attrs?: Record<string, unknown> | null;
  /**
   * Optional cache key for reusing normalized metadata between identical SDT nodes.
   * When omitted, the helper derives a key from attrs.hash/id when available.
   */
  cacheKey?: string | null;
}

export interface ResolveStyleOptions {
  sdt?: ResolveSdtMetadataInput | null;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface BorderStyle {
  style?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
  width?: number;
  color?: string;
}

export interface ComputedParagraphStyle {
  alignment?: 'left' | 'center' | 'right' | 'justify';
  spacing?: {
    before?: number;
    after?: number;
    line?: number;
    lineRule?: 'auto' | 'exact' | 'atLeast';
  };
  indent?: {
    left?: number;
    right?: number;
    firstLine?: number;
    hanging?: number;
  };
  borders?: {
    top?: BorderStyle;
    right?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
  };
  shading?: {
    fill?: string;
    pattern?: string;
  };
  tabs?: TabStop[];
}

export interface ComputedCharacterStyle {
  font?: {
    family: string;
    size?: number;
    weight?: number;
    italic?: boolean;
  };
  color?: string;
  underline?: {
    style?: 'single' | 'double' | 'dotted' | 'dashed' | 'wavy';
    color?: string;
  };
  strike?: boolean;
  highlight?: string;
  letterSpacing?: number;
}

export interface NumberingStyle {
  numId: string;
  level: number;
  indent?: {
    left?: number;
    hanging?: number;
  };
  format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'bullet' | 'custom';
  text?: string;
  start?: number;
}

export interface ComputedStyle {
  paragraph: ComputedParagraphStyle;
  character: ComputedCharacterStyle;
  numbering?: NumberingStyle;
  sdt?: SdtMetadata;
}

export interface StyleNode {
  styleId?: string;
  paragraphProps?: Partial<ComputedParagraphStyle>;
  characterProps?: Partial<ComputedCharacterStyle>;
  numbering?: {
    numId: string;
    level: number;
  };
}

export interface ParagraphStyleDefinition {
  id: string;
  basedOn?: string;
  paragraph?: Partial<ComputedParagraphStyle>;
  character?: Partial<ComputedCharacterStyle>;
  numbering?: {
    numId: string;
    level: number;
  };
}

export interface NumberingLevelDefinition {
  level: number;
  format?: NumberingStyle['format'];
  text?: string;
  start?: number;
  indent?: {
    left?: number;
    hanging?: number;
  };
}

export interface NumberingDefinition {
  levels: NumberingLevelDefinition[];
}

export interface StyleContext {
  styles?: Record<string, ParagraphStyleDefinition>;
  numbering?: Record<string, NumberingDefinition>;
  theme?: Record<string, unknown>;
  defaults?: {
    paragraphFont?: string;
    fontSize?: number;
    paragraphFontFallback?: string;
    paragraphFontFamily?: string;
    decimalSeparator?: string;
    defaultTabIntervalTwips?: number;
  };
}

// ---------------------------------------------------------------------------
// Style resolution
// ---------------------------------------------------------------------------

const sdtMetadataCache = new Map<string, SdtMetadata>();

/**
 * Clears the internal SDT metadata cache.
 *
 * This is primarily useful for testing to ensure a clean state between test runs.
 * In production, the cache persists for the lifetime of the module to maximize performance.
 *
 * @example
 * ```typescript
 * import { clearSdtMetadataCache } from '@superdoc/style-engine';
 *
 * // Before each test
 * beforeEach(() => {
 *   clearSdtMetadataCache();
 * });
 * ```
 */
export function clearSdtMetadataCache(): void {
  sdtMetadataCache.clear();
}

/**
 * Resolves a node's fully-computed style by applying OOXML cascade rules.
 *
 * Cascade order:
 * 1. Document defaults
 * 2. Style chain (basedOn hierarchy)
 * 3. Direct paragraph/character formatting
 * 4. Numbering overrides
 * 5. SDT metadata (if provided via options)
 *
 * @param node - The style node containing styleId and direct formatting
 * @param context - Style definitions, numbering, theme, and defaults
 * @param options - Optional SDT metadata to attach to the computed style
 * @returns Fully-resolved ComputedStyle with paragraph, character, numbering, and optional SDT metadata
 *
 * @example
 * ```typescript
 * import { resolveStyle } from '@superdoc/style-engine';
 *
 * const style = resolveStyle(
 *   { styleId: 'Heading1', paragraphProps: { indent: { left: 36 } } },
 *   { styles: {...}, defaults: { paragraphFont: 'Calibri', fontSize: 11 } }
 * );
 *
 * console.log(style.paragraph.indent.left); // 36
 * console.log(style.character.font.family); // 'Calibri, sans-serif'
 * ```
 */
export function resolveStyle(node: StyleNode, context: StyleContext, options: ResolveStyleOptions = {}): ComputedStyle {
  let paragraph = createDefaultParagraph(context);
  let character = createDefaultCharacter(context);
  let numbering: NumberingStyle | undefined;

  const chain = resolveStyleChain(node.styleId, context.styles);

  for (const style of chain) {
    paragraph = mergeParagraph(paragraph, style.paragraph);
    character = mergeCharacter(character, style.character);
    if (!numbering && style.numbering) {
      numbering = resolveNumbering(style.numbering.numId, style.numbering.level, context);
    }
  }

  paragraph = mergeParagraph(paragraph, node.paragraphProps);
  character = mergeCharacter(character, node.characterProps);

  if (node.numbering) {
    numbering = resolveNumbering(node.numbering.numId, node.numbering.level, context);
  }

  const sdt = options?.sdt ? resolveSdtMetadata(options.sdt) : undefined;

  return {
    paragraph,
    character,
    numbering,
    sdt,
  };
}

/**
 * Resolves numbering metadata for a list item at a specific level.
 *
 * Looks up the numbering definition by `numId` and extracts the level-specific
 * formatting (format, text, indent, start value). Returns undefined if the
 * definition or level is not found.
 *
 * @param numId - The numbering definition ID (from w:numPr/w:numId)
 * @param level - The zero-based level index (from w:numPr/w:ilvl)
 * @param context - Style context containing numbering definitions
 * @returns Resolved NumberingStyle or undefined if not found
 *
 * @example
 * ```typescript
 * import { resolveNumbering } from '@superdoc/style-engine';
 *
 * const numbering = resolveNumbering('1', 0, {
 *   numbering: {
 *     '1': {
 *       levels: [{ level: 0, format: 'decimal', text: '%1.', indent: { left: 36, hanging: 18 } }]
 *     }
 *   }
 * });
 *
 * console.log(numbering?.format); // 'decimal'
 * console.log(numbering?.text); // '%1.'
 * ```
 */
export function resolveNumbering(numId: string, level: number, context: StyleContext): NumberingStyle | undefined {
  const def = context.numbering?.[numId];
  if (!def) return undefined;

  const levelDef = def.levels.find((entry) => entry.level === level) ?? def.levels[level];

  if (!levelDef) return undefined;

  return {
    numId,
    level,
    indent: {
      left: levelDef.indent?.left,
      hanging: levelDef.indent?.hanging,
    },
    format: levelDef.format ?? 'decimal',
    text: levelDef.text ?? '%1.',
    start: levelDef.start ?? 1,
  };
}

/**
 * Resolves style for a table cell's content.
 *
 * Note: This is a placeholder implementation that returns document defaults.
 * Full table cascade (tblPr -> trPr -> tcPr -> pPr) will be implemented in a future phase.
 *
 * @param table - Table element (reserved for future use)
 * @param row - Row index (reserved for future use)
 * @param col - Column index (reserved for future use)
 * @param context - Style context containing defaults
 * @returns ComputedStyle with document defaults
 */
export function resolveTableCellStyle(
  _table: unknown,
  _row: number,
  _col: number,
  context: StyleContext,
): ComputedStyle {
  // Placeholder: table cascade arrives with tables phase. For now, reuse resolveStyle defaults.
  return resolveStyle({}, context);
}

/**
 * Normalizes Structured Document Tag (SDT) metadata into a stable contract shape.
 *
 * Supports the following SDT node types:
 * - `fieldAnnotation`: Inline field annotations with display labels, colors, and visibility
 * - `structuredContent` / `structuredContentBlock`: Inline or block-level structured content containers
 * - `documentSection`: Document section metadata with locks and descriptions
 * - `docPartObject`: Document part objects (e.g., TOC, bibliography)
 *
 * Results are cached by hash/id to avoid recomputing metadata for identical SDT instances.
 *
 * @param input - SDT node information including nodeType, attrs, and optional cacheKey
 * @returns Normalized SdtMetadata or undefined if nodeType is unsupported/missing
 *
 * @example
 * ```typescript
 * import { resolveSdtMetadata } from '@superdoc/style-engine';
 *
 * const metadata = resolveSdtMetadata({
 *   nodeType: 'fieldAnnotation',
 *   attrs: {
 *     fieldId: 'CLIENT_NAME',
 *     displayLabel: 'Client Name',
 *     fieldColor: '#980043',
 *     visibility: 'visible'
 *   }
 * });
 *
 * console.log(metadata?.type); // 'fieldAnnotation'
 * console.log(metadata?.fieldColor); // '#980043'
 * ```
 */
export function resolveSdtMetadata(input?: ResolveSdtMetadataInput | null): SdtMetadata | undefined {
  if (!input) return undefined;
  const { nodeType, attrs, cacheKey: explicitKey } = input;
  if (!nodeType) return undefined;
  const normalizedAttrs = isPlainObject(attrs) ? (attrs as Record<string, unknown>) : {};
  const cacheKey = buildSdtCacheKey(nodeType, normalizedAttrs, explicitKey);

  if (cacheKey && sdtMetadataCache.has(cacheKey)) {
    return sdtMetadataCache.get(cacheKey);
  }

  let metadata: SdtMetadata | undefined;

  switch (nodeType) {
    case 'fieldAnnotation':
      metadata = normalizeFieldAnnotationMetadata(normalizedAttrs);
      break;
    case 'structuredContent':
    case 'structuredContentBlock':
      metadata = normalizeStructuredContentMetadata(nodeType, normalizedAttrs);
      break;
    case 'documentSection':
      metadata = normalizeDocumentSectionMetadata(normalizedAttrs);
      break;
    case 'docPartObject':
      metadata = normalizeDocPartMetadata(normalizedAttrs);
      break;
  }

  if (metadata && cacheKey) {
    sdtMetadataCache.set(cacheKey, metadata);
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDefaultParagraph(_context: StyleContext): ComputedParagraphStyle {
  return {
    alignment: 'left',
    spacing: {
      before: 0,
      after: 0,
      line: 12,
      lineRule: 'auto',
    },
    indent: {
      left: 0,
      right: 0,
      firstLine: 0,
      hanging: 0,
    },
    tabs: [],
  };
}

function createDefaultCharacter(context: StyleContext): ComputedCharacterStyle {
  const baseFont = context.defaults?.paragraphFont ?? 'Calibri';
  const fallback = context.defaults?.paragraphFontFallback;
  const wordFamily = context.defaults?.paragraphFontFamily;
  const resolvedFamily = toCssFontFamily(baseFont, { fallback, wordFamily }) ?? baseFont;

  return {
    font: {
      family: resolvedFamily,
      size: context.defaults?.fontSize ?? 11,
      weight: 400,
      italic: false,
    },
    color: '#000000',
  };
}

function resolveStyleChain(
  styleId: string | undefined,
  styles?: Record<string, ParagraphStyleDefinition>,
): ParagraphStyleDefinition[] {
  if (!styleId || !styles) return [];
  const result: ParagraphStyleDefinition[] = [];
  const visited = new Set<string>();
  let current: ParagraphStyleDefinition | undefined = styles[styleId];

  while (current && !visited.has(current.id)) {
    result.unshift(current);
    visited.add(current.id);
    current = current.basedOn ? styles[current.basedOn] : undefined;
  }

  return result;
}

function mergeParagraph(
  base: ComputedParagraphStyle,
  overrides?: Partial<ComputedParagraphStyle>,
): ComputedParagraphStyle {
  if (!overrides) return base;

  return {
    ...base,
    alignment: overrides.alignment ?? base.alignment,
    spacing: overrides.spacing ? { ...base.spacing, ...overrides.spacing } : base.spacing,
    indent: overrides.indent ? { ...base.indent, ...overrides.indent } : base.indent,
    borders: overrides.borders ? { ...base.borders, ...overrides.borders } : base.borders,
    shading: overrides.shading ?? base.shading,
    tabs: overrides.tabs ?? base.tabs,
  };
}

function mergeCharacter(
  base: ComputedCharacterStyle,
  overrides?: Partial<ComputedCharacterStyle>,
): ComputedCharacterStyle {
  if (!overrides) return base;

  return {
    ...base,
    font: overrides.font ? { ...base.font, ...overrides.font } : base.font,
    color: overrides.color ?? base.color,
    underline: overrides.underline ?? base.underline,
    strike: overrides.strike ?? base.strike,
    highlight: overrides.highlight ?? base.highlight,
    letterSpacing: overrides.letterSpacing ?? base.letterSpacing,
  };
}

function normalizeFieldAnnotationMetadata(attrs: Record<string, unknown>): FieldAnnotationMetadata {
  const fieldId = toOptionalString(attrs.fieldId) ?? '';
  const formatting = extractFormatting(attrs);
  const size = normalizeSize(attrs.size);
  const extras = isPlainObject(attrs.extras) ? (attrs.extras as Record<string, unknown>) : null;
  const marks = isPlainObject(attrs.marks) ? (attrs.marks as Record<string, unknown>) : undefined;
  return {
    type: 'fieldAnnotation',
    fieldId,
    variant: normalizeFieldAnnotationVariant(attrs.type),
    fieldType: toOptionalString(attrs.fieldType),
    displayLabel: toOptionalString(attrs.displayLabel),
    defaultDisplayLabel: toOptionalString(attrs.defaultDisplayLabel),
    alias: toOptionalString(attrs.alias),
    fieldColor: normalizeColorValue(attrs.fieldColor),
    borderColor: normalizeColorValue(attrs.borderColor),
    highlighted: toBoolean(attrs.highlighted, true),
    fontFamily: toNullableString(attrs.fontFamily),
    fontSize: normalizeFontSize(attrs.fontSize),
    textColor: normalizeColorValue(attrs.textColor) ?? null,
    textHighlight: normalizeColorValue(attrs.textHighlight) ?? null,
    linkUrl: toNullableString(attrs.linkUrl),
    imageSrc: toNullableString(attrs.imageSrc),
    rawHtml: attrs.rawHtml ?? undefined,
    size: size ?? null,
    extras,
    multipleImage: toBoolean(attrs.multipleImage, false),
    hash: toOptionalString(attrs.hash) ?? null,
    generatorIndex: toNumber(attrs.generatorIndex),
    sdtId: toOptionalString(attrs.sdtId) ?? null,
    hidden: toBoolean(attrs.hidden, false),
    visibility: normalizeVisibility(attrs.visibility),
    isLocked: toBoolean(attrs.isLocked, false),
    formatting,
    marks,
  };
}

function normalizeStructuredContentMetadata(
  nodeType: 'structuredContent' | 'structuredContentBlock',
  attrs: Record<string, unknown>,
): StructuredContentMetadata {
  return {
    type: 'structuredContent',
    scope: nodeType === 'structuredContentBlock' ? 'block' : 'inline',
    id: toNullableString(attrs.id),
    tag: toOptionalString(attrs.tag),
    alias: toOptionalString(attrs.alias),
    sdtPr: attrs.sdtPr,
  };
}

function normalizeDocumentSectionMetadata(attrs: Record<string, unknown>): DocumentSectionMetadata {
  return {
    type: 'documentSection',
    id: toNullableString(attrs.id),
    title: toOptionalString(attrs.title) ?? null,
    description: toOptionalString(attrs.description) ?? null,
    sectionType: toOptionalString(attrs.sectionType) ?? null,
    isLocked: toBoolean(attrs.isLocked, false),
    sdBlockId: toNullableString(attrs.sdBlockId),
  };
}

function normalizeDocPartMetadata(attrs: Record<string, unknown>): DocPartMetadata {
  return {
    type: 'docPartObject',
    gallery: toOptionalString(attrs.docPartGallery ?? attrs.gallery) ?? null,
    // Source uniqueId from attrs.id (PM adapter uses getDocPartObjectId which extracts attrs.id)
    // Fall back to attrs.uniqueId for compatibility
    uniqueId: toOptionalString(attrs.id ?? attrs.uniqueId) ?? null,
    alias: toOptionalString(attrs.alias) ?? null,
    instruction: toOptionalString(attrs.instruction) ?? null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return String(value);
}

function toNullableString(value: unknown): string | null {
  const str = toOptionalString(value);
  return str ?? null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  if (value == null) return fallback;
  return Boolean(value);
}

function normalizeVisibility(value: unknown): 'visible' | 'hidden' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'visible' || normalized === 'hidden') {
    return normalized as 'visible' | 'hidden';
  }
  return undefined;
}

function normalizeColorValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return undefined;
  return trimmed;
}

function normalizeFontSize(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSize(value: unknown): { width?: number; height?: number } | null {
  if (!isPlainObject(value)) return null;
  const obj = value as Record<string, unknown>;
  const width = toNumber(obj.width);
  const height = toNumber(obj.height);
  if (width == null && height == null) return null;
  const result: { width?: number; height?: number } = {};
  if (width != null) result.width = width;
  if (height != null) result.height = height;
  return result;
}

function normalizeFieldAnnotationVariant(value: unknown): FieldAnnotationMetadata['variant'] | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === 'text' ||
    normalized === 'image' ||
    normalized === 'signature' ||
    normalized === 'checkbox' ||
    normalized === 'html' ||
    normalized === 'link'
  ) {
    return normalized as FieldAnnotationMetadata['variant'];
  }
  return undefined;
}

function extractFormatting(attrs: Record<string, unknown>): FieldAnnotationMetadata['formatting'] | undefined {
  const bold = toBoolean(attrs.bold, false);
  const italic = toBoolean(attrs.italic, false);
  const underline = toBoolean(attrs.underline, false);
  const formatting: FieldAnnotationMetadata['formatting'] = {};
  if (bold) formatting.bold = true;
  if (italic) formatting.italic = true;
  if (underline) formatting.underline = true;
  return Object.keys(formatting).length ? formatting : undefined;
}

function buildSdtCacheKey(
  nodeType: string,
  attrs: Record<string, unknown>,
  explicitKey?: string | null,
): string | undefined {
  const provided = toOptionalString(explicitKey);
  if (provided) {
    return `${nodeType}:${provided}`;
  }

  const hash = toOptionalString(attrs.hash);
  if (hash) {
    return `${nodeType}:${hash}`;
  }

  const id = toOptionalString(attrs.id);
  if (id) {
    return `${nodeType}:${id}`;
  }

  return undefined;
}
