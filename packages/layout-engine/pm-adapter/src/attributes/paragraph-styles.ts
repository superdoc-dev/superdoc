import type { ParagraphAttrs, ParagraphIndent, ParagraphSpacing } from '@superdoc/contracts';
import { createOoxmlResolver, resolveDocxFontFamily, type OoxmlTranslator } from '@superdoc/style-engine/ooxml';
import { SuperConverter } from '@superdoc/super-editor/converter/internal/SuperConverter.js';
import { translator as w_pPrTranslator } from '@superdoc/super-editor/converter/internal/v3/handlers/w/pPr/index.js';
import { translator as w_rPrTranslator } from '@superdoc/super-editor/converter/internal/v3/handlers/w/rpr/index.js';
import type { PMNode } from '../types.js';
import type { ConverterContext, ConverterNumberingContext } from '../converter-context.js';
import { hasParagraphStyleContext } from '../converter-context.js';
import type { ResolvedParagraphProperties } from '@superdoc/word-layout';
import { normalizeAlignment } from './spacing-indent.js';

/**
 * Empty numbering context used as a fallback when documents don't have lists.
 * This allows paragraph style resolution to proceed even without numbering data.
 */
const EMPTY_NUMBERING_CONTEXT: ConverterNumberingContext = {
  definitions: {},
  abstracts: {},
};

const toOoxmlTranslator = (translator: { xmlName: string; encode: (params: any) => unknown }): OoxmlTranslator => ({
  xmlName: translator.xmlName,
  encode: (params) => translator.encode(params) as Record<string, unknown> | null | undefined,
});

const ooxmlResolver = createOoxmlResolver({
  pPr: toOoxmlTranslator(w_pPrTranslator),
  rPr: toOoxmlTranslator(w_rPrTranslator),
});

/**
 * Result of hydrating paragraph attributes from style resolution.
 *
 * Contains paragraph-level formatting properties resolved from the style cascade,
 * including document defaults and paragraph style definitions.
 *
 * @property resolved - Complete resolved paragraph properties from style engine
 * @property spacing - Paragraph spacing (before, after, line) in OOXML units
 * @property indent - Paragraph indentation (left, right, firstLine, hanging) in OOXML units
 * @property borders - Paragraph border definitions (top, right, bottom, left)
 * @property shading - Paragraph background shading and fill color
 * @property alignment - Paragraph text alignment (left, right, center, justify)
 * @property tabStops - Custom tab stop definitions
 * @property keepLines - Keep all lines of paragraph together (prevent pagination splits)
 * @property keepNext - Keep paragraph with next paragraph (prevent page break between)
 * @property numberingProperties - Numbering/list properties (numId, ilvl, etc.)
 * @property contextualSpacing - Contextual spacing flag from OOXML w:contextualSpacing.
 *
 * ## contextualSpacing Property
 *
 * Implements MS Word's "Don't add space between paragraphs of the same style" setting
 * (OOXML w:contextualSpacing element). When true, spacing before/after is suppressed
 * between consecutive paragraphs that share the same paragraph style.
 *
 * **Common Usage:**
 * - ListBullet and ListNumber styles typically define contextualSpacing=true
 * - Prevents excessive spacing between consecutive list items
 * - Maintains spacing between list items and non-list paragraphs
 *
 * **OOXML Structure:**
 * In OOXML, w:contextualSpacing is a sibling to w:spacing, not nested within it:
 * ```xml
 * <w:pPr>
 *   <w:spacing w:before="200" w:after="200"/>
 *   <w:contextualSpacing/>  <!-- boolean on/off element -->
 * </w:pPr>
 * ```
 *
 * **Fallback Priority in computeParagraphAttrs:**
 * 1. normalizedSpacing.contextualSpacing - From spacing XML element
 * 2. paragraphProps.contextualSpacing - Direct pPr property
 * 3. attrs.contextualSpacing - ProseMirror node attributes
 * 4. hydrated.contextualSpacing - From style resolution (this property)
 *
 * @example
 * ```typescript
 * // Style resolution for ListBullet with contextualSpacing
 * const hydrated: ParagraphStyleHydration = {
 *   spacing: { before: 0, after: 0 },
 *   indent: { left: 720, hanging: 360 },
 *   contextualSpacing: true, // Suppress spacing between same-style paragraphs
 * };
 * ```
 */
export type ParagraphStyleHydration = {
  resolved?: ResolvedParagraphProperties;
  spacing?: ParagraphSpacing;
  indent?: ParagraphIndent;
  borders?: ParagraphAttrs['borders'];
  shading?: ParagraphAttrs['shading'];
  alignment?: ParagraphAttrs['alignment'];
  tabStops?: unknown;
  keepLines?: boolean;
  keepNext?: boolean;
  numberingProperties?: Record<string, unknown>;
  contextualSpacing?: boolean;
};

/**
 * Hydrates paragraph-level attributes from a linked style when converter context is available.
 *
 * This function works even when styleId is null or undefined, as it will apply docDefaults
 * from the document's styles.xml through the resolveParagraphProperties function. This ensures
 * that all paragraphs receive at minimum the document's default spacing and formatting.
 *
 * The helper never mutates the ProseMirror node; callers should merge the returned
 * attributes with existing attrs, preserving explicit overrides on the node.
 *
 * Normal style semantics (doc defaults, w:default flags) are delegated to
 * resolveParagraphProperties which already mirrors Word's cascade rules.
 *
 * @param para - The ProseMirror paragraph node to hydrate
 * @param context - The converter context containing DOCX and optional numbering data
 * @param preResolved - Optional pre-resolved paragraph properties to use instead of resolving
 * @returns Hydrated paragraph attributes or null if context is missing or resolution fails.
 *          Returns null when:
 *          - context is undefined or missing docx data (checked by hasParagraphStyleContext)
 *          - resolveParagraphProperties returns null or undefined
 *
 * @remarks
 * - Provides an empty numbering fallback (EMPTY_NUMBERING_CONTEXT) for documents without lists,
 *   ensuring paragraph style resolution can proceed even when context.numbering is undefined.
 * - Uses null-safe checks (!= null) for numberingProperties, indent, and spacing to handle
 *   both null and undefined consistently.
 */
export const hydrateParagraphStyleAttrs = (
  para: PMNode,
  context?: ConverterContext,
  preResolved?: ResolvedParagraphProperties,
): ParagraphStyleHydration | null => {
  if (!hasParagraphStyleContext(context)) {
    return null;
  }
  const attrs = para.attrs ?? {};
  const paragraphProps =
    typeof attrs.paragraphProperties === 'object' && attrs.paragraphProperties !== null
      ? (attrs.paragraphProperties as Record<string, unknown>)
      : {};
  const styleIdSource = attrs.styleId ?? paragraphProps.styleId;
  const styleId = typeof styleIdSource === 'string' && styleIdSource.trim() ? styleIdSource : null;

  const inlineProps: Record<string, unknown> = { styleId };

  const numberingProperties = cloneIfObject(attrs.numberingProperties ?? paragraphProps.numberingProperties);
  if (numberingProperties != null) {
    inlineProps.numberingProperties = numberingProperties;
  }

  const indent = cloneIfObject(attrs.indent ?? paragraphProps.indent);
  if (indent != null) {
    inlineProps.indent = indent;
  }

  const spacing = cloneIfObject(attrs.spacing ?? paragraphProps.spacing);
  if (spacing != null) {
    inlineProps.spacing = spacing;
  }

  const resolverParams = {
    docx: context.docx,
    // Provide empty numbering context if not present - documents without lists
    // should still get docDefaults spacing from style resolution
    numbering: context.numbering ?? EMPTY_NUMBERING_CONTEXT,
  };

  // Cast to bypass JSDoc type mismatch - the JS function actually accepts { docx, numbering }
  const resolved = preResolved ?? ooxmlResolver.resolveParagraphProperties(resolverParams as never, inlineProps);
  if (!resolved) {
    return null;
  }

  // TypeScript: resolved could be ResolvedParagraphProperties (from preResolved)
  // or the extended type from resolveParagraphProperties.
  // We safely access properties using optional chaining and type assertions.
  type ExtendedResolvedProps = ResolvedParagraphProperties & {
    borders?: unknown;
    shading?: unknown;
    justification?: unknown;
    tabStops?: unknown;
    keepLines?: boolean;
    keepNext?: boolean;
    outlineLvl?: number;
    /**
     * Contextual spacing from style resolution.
     * In OOXML, w:contextualSpacing is a sibling to w:spacing, not nested within it.
     * When true, spacing is suppressed between paragraphs of the same style.
     */
    contextualSpacing?: boolean;
  };
  const resolvedExtended = resolved as ExtendedResolvedProps;
  const resolvedAsRecord = resolved as Record<string, unknown>;
  let resolvedIndent = cloneIfObject(resolvedAsRecord.indent) as ParagraphIndent | undefined;

  // Word built-in heading styles do NOT inherit Normal's first-line indent.
  // If the resolved paragraph is a heading (outline level present or styleId starts with headingX)
  // and no explicit indent was defined on the style/para, normalize indent to zero.
  const styleIdLower = typeof styleId === 'string' ? styleId.toLowerCase() : '';
  const isHeadingStyle =
    typeof resolvedExtended.outlineLvl === 'number' ||
    styleIdLower.startsWith('heading ') ||
    styleIdLower.startsWith('heading');
  const onlyFirstLineIndent =
    resolvedIndent &&
    resolvedIndent.firstLine != null &&
    resolvedIndent.hanging == null &&
    resolvedIndent.left == null &&
    resolvedIndent.right == null;
  if (isHeadingStyle && (!resolvedIndent || Object.keys(resolvedIndent).length === 0 || onlyFirstLineIndent)) {
    // Clear inherited firstLine/hanging from Normal
    resolvedIndent = { firstLine: 0, hanging: 0, left: resolvedIndent?.left, right: resolvedIndent?.right };
  }

  // Get resolved spacing from style cascade (docDefaults -> paragraph style)
  let resolvedSpacing = cloneIfObject(resolvedAsRecord.spacing) as ParagraphSpacing | undefined;

  // Apply table style paragraph properties if present
  // Per OOXML spec, table style pPr applies between docDefaults and paragraph style
  // But since we can't easily inject into the style resolver, we apply table style
  // spacing as a base that can be overridden by explicit paragraph properties
  const tableStyleParagraphProps = context.tableStyleParagraphProps;
  if (tableStyleParagraphProps?.spacing) {
    const tableSpacing = tableStyleParagraphProps.spacing;

    // Only apply table style spacing for properties NOT explicitly set on the paragraph
    // This maintains the cascade: table style wins over docDefaults, but paragraph wins over table style
    const paragraphHasExplicitSpacing = Boolean(spacing);

    if (!paragraphHasExplicitSpacing) {
      // No explicit paragraph spacing - use table style spacing as base, merged with resolved
      resolvedSpacing = {
        ...resolvedSpacing,
        ...tableSpacing,
      };
    } else {
      // Paragraph has explicit spacing - it should win, but fill in missing values from table style
      // This ensures partial paragraph spacing (e.g., only 'line') still gets 'before'/'after' from table style
      resolvedSpacing = {
        ...tableSpacing,
        ...resolvedSpacing,
      };
    }
  }

  const normalizedAlign = normalizeAlignment(resolvedExtended.justification);

  const hydrated: ParagraphStyleHydration = {
    resolved,
    spacing: resolvedSpacing,
    indent: resolvedIndent,
    borders: cloneIfObject(resolvedExtended.borders) as ParagraphAttrs['borders'],
    shading: cloneIfObject(resolvedExtended.shading) as ParagraphAttrs['shading'],
    alignment: normalizedAlign,
    tabStops: cloneIfObject(resolvedExtended.tabStops),
    keepLines: resolvedExtended.keepLines,
    keepNext: resolvedExtended.keepNext,
    numberingProperties: cloneIfObject(resolvedAsRecord.numberingProperties) as Record<string, unknown> | undefined,
    // Extract contextualSpacing from style resolution - this is a sibling to spacing in OOXML,
    // not nested within it. When true, suppresses spacing between paragraphs of the same style.
    contextualSpacing: resolvedExtended.contextualSpacing,
  };
  return hydrated;
};

const cloneIfObject = <T>(value: T): T | undefined => {
  if (!value || typeof value !== 'object') return value as T | undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'object' ? { ...entry } : entry)) as unknown as T;
  }
  return { ...(value as Record<string, unknown>) } as T;
};

/**
 * Result of hydrating character/run attributes from style resolution.
 *
 * Contains run-level formatting properties resolved from the OOXML cascade:
 * docDefaults (w:rPrDefault) -> Normal style -> paragraph style rPr -> character style -> inline rPr
 *
 * All font sizes are in OOXML half-points (1pt = 2 half-points).
 * Font family is the resolved CSS font-family string.
 */
export type CharacterStyleHydration = {
  /**
   * Resolved CSS font-family string (e.g., "Calibri, sans-serif").
   * Comes from w:rFonts with theme resolution applied.
   */
  fontFamily?: string;
  /**
   * Font size in OOXML half-points (1pt = 2 half-points).
   * Always valid positive number due to fallback cascade in resolveRunProperties.
   */
  fontSize: number;
  /**
   * Text color as hex string (e.g., "FF0000").
   * Extracted from w:color/@w:val (auto values are ignored).
   */
  color?: string;
  /** Bold formatting. True if w:b is present and not explicitly off. */
  bold?: boolean;
  /** Italic formatting. True if w:i is present and not explicitly off. */
  italic?: boolean;
  /** Strikethrough formatting. True if w:strike is present and not explicitly off. */
  strike?: boolean;
  /**
   * Underline formatting with type and optional color.
   * Extracted from w:u element.
   */
  underline?: {
    type?: string;
    color?: string;
  };
  /** Letter spacing in OOXML twips. Extracted from w:spacing/@w:val. */
  letterSpacing?: number;
};

/**
 * Builds a CharacterStyleHydration object from resolved run properties.
 *
 * This function extracts and normalizes character formatting properties from the
 * OOXML style cascade into a consistent format for rendering. It handles font
 * families with theme resolution, font sizes in half-points, colors, boolean
 * formatting flags, underlines, and letter spacing.
 *
 * @param resolved - The resolved run properties from the OOXML cascade (docDefaults -> styles -> inline)
 * @param docx - Optional DOCX context for font family resolution and theme processing
 * @returns CharacterStyleHydration object with normalized character formatting properties
 *
 * @example
 * ```typescript
 * const resolved = {
 *   fontFamily: { ascii: 'Calibri', hAnsi: 'Calibri' },
 *   fontSize: 22, // 11pt in half-points
 *   bold: true,
 *   color: { val: 'FF0000' },
 * };
 * const hydration = buildCharacterStyleHydration(resolved, docx);
 * // Returns: {
 * //   fontFamily: 'Calibri',
 * //   fontSize: 22,
 * //   bold: true,
 * //   color: 'FF0000',
 * // }
 * ```
 */
const buildCharacterStyleHydration = (
  resolved: Record<string, unknown>,
  docx?: Record<string, unknown>,
): CharacterStyleHydration => {
  const fontFamily = extractFontFamily(resolved.fontFamily, docx);
  const fontSize = typeof resolved.fontSize === 'number' ? resolved.fontSize : 20; // Default 10pt
  const color = extractColorValue(resolved.color);
  const bold = normalizeBooleanProp(resolved.bold);
  const italic = normalizeBooleanProp(resolved.italic);
  const strike = normalizeBooleanProp(resolved.strike);
  const underline = extractUnderline(resolved.underline);
  const letterSpacing = typeof resolved.letterSpacing === 'number' ? resolved.letterSpacing : undefined;

  return {
    fontFamily,
    fontSize,
    color,
    bold,
    italic,
    strike,
    underline,
    letterSpacing,
  };
};

/**
 * Hydrates character/run-level attributes from the OOXML style cascade.
 *
 * This function resolves character formatting by calling `resolveRunProperties` from the shared resolver,
 * which applies the correct OOXML cascade order:
 * 1. Document defaults (w:rPrDefault in w:docDefaults)
 * 2. Normal style run properties
 * 3. Paragraph style run properties (w:rPr inside paragraph style)
 * 4. Numbering level run properties (if applicable)
 *
 * IMPORTANT: This function does NOT include w:pPr/w:rPr (paragraph-level run properties) in the cascade.
 * In OOXML, w:pPr/w:rPr is specifically for:
 * - The paragraph mark glyph
 * - New text typed at the end of the paragraph by the user
 * It is NOT meant to be inherited by existing runs without explicit formatting.
 *
 * @param para - The ProseMirror paragraph node to hydrate
 * @param context - The converter context containing DOCX and optional numbering data
 * @param resolvedPpr - Optional pre-resolved paragraph properties (for style chain)
 * @returns Hydrated character attributes or null if context is missing or resolution fails
 *
 * @example
 * ```typescript
 * const charHydration = hydrateCharacterStyleAttrs(para, converterContext);
 * if (charHydration) {
 *   const fontSizePx = charHydration.fontSize / 2 * (96 / 72); // half-points to px
 *   const fontFamily = charHydration.fontFamily ?? 'Arial';
 * }
 * ```
 */
export const hydrateCharacterStyleAttrs = (
  para: PMNode,
  context?: ConverterContext,
  resolvedPpr?: Record<string, unknown>,
): CharacterStyleHydration | null => {
  if (!hasParagraphStyleContext(context)) {
    return null;
  }

  const attrs = para.attrs ?? {};
  const paragraphProps =
    typeof attrs.paragraphProperties === 'object' && attrs.paragraphProperties !== null
      ? (attrs.paragraphProperties as Record<string, unknown>)
      : {};

  // Get styleId for paragraph style chain
  const styleIdSource = attrs.styleId ?? paragraphProps.styleId;
  const styleId = typeof styleIdSource === 'string' && styleIdSource.trim() ? styleIdSource : null;

  // For paragraph-level character defaults, we do NOT use w:pPr/w:rPr as inline properties.
  // In OOXML, w:pPr/w:rPr is only for NEW text typed at the paragraph end, not for existing runs.
  // Runs without explicit w:rPr should inherit from: docDefaults → Normal → paragraph style rPr.
  const inlineRpr: Record<string, unknown> = {};

  // Build resolved paragraph properties for the style chain
  // This includes styleId and numberingProperties which affect run property resolution
  const pprForChain: Record<string, unknown> = resolvedPpr ?? { styleId };
  const numberingProps = attrs.numberingProperties ?? paragraphProps.numberingProperties;
  if (numberingProps != null) {
    pprForChain.numberingProperties = numberingProps;
  }

  const resolverParams = {
    docx: context.docx,
    numbering: context.numbering ?? EMPTY_NUMBERING_CONTEXT,
  };

  // Call resolveRunProperties to get correctly cascaded character properties
  // Cast to bypass JSDoc type mismatch - the JS function actually accepts { docx, numbering }
  let resolved: Record<string, unknown> | null = null;
  try {
    resolved = ooxmlResolver.resolveRunProperties(
      resolverParams as never,
      inlineRpr,
      pprForChain,
      false, // not list number marker
      false, // not numberingDefinedInline
    ) as Record<string, unknown>;

    // Validate that resolved is a non-null object
    if (!resolved || typeof resolved !== 'object') {
      return null;
    }
  } catch {
    return null;
  }

  return buildCharacterStyleHydration(resolved, context.docx);
};

/**
 * Hydrates list marker run properties using the OOXML cascade.
 *
 * This mirrors Word's behavior for numbering markers by resolving:
 * docDefaults -> Normal style -> paragraph style rPr -> character style -> inline rPr -> numbering rPr
 *
 * @param para - The ProseMirror paragraph node to hydrate
 * @param context - The converter context containing DOCX and optional numbering data
 * @param resolvedPpr - Optional pre-resolved paragraph properties (for style chain)
 * @returns Hydrated marker character attributes or null if context is missing or resolution fails
 */
export const hydrateMarkerStyleAttrs = (
  para: PMNode,
  context?: ConverterContext,
  resolvedPpr?: Record<string, unknown>,
): CharacterStyleHydration | null => {
  if (!hasParagraphStyleContext(context)) {
    return null;
  }

  const attrs = para.attrs ?? {};
  const paragraphProps =
    typeof attrs.paragraphProperties === 'object' && attrs.paragraphProperties !== null
      ? (attrs.paragraphProperties as Record<string, unknown>)
      : {};

  const styleIdSource = attrs.styleId ?? paragraphProps.styleId;
  const styleId = typeof styleIdSource === 'string' && styleIdSource.trim() ? styleIdSource : null;

  // For list markers, we do NOT use w:pPr/w:rPr as inline properties.
  // Marker styling comes from numbering definition rPr, not paragraph's default run properties.
  const inlineRpr: Record<string, unknown> = {};

  const numberingProps = attrs.numberingProperties ?? paragraphProps.numberingProperties;
  const numberingDefinedInline = (numberingProps as Record<string, unknown> | undefined)?.numId != null;

  const pprForChain: Record<string, unknown> = resolvedPpr ? { ...resolvedPpr } : { styleId };
  if (styleId && !pprForChain.styleId) {
    pprForChain.styleId = styleId;
  }
  if (numberingProps != null) {
    pprForChain.numberingProperties = numberingProps;
  }

  const resolverParams = {
    docx: context.docx,
    numbering: context.numbering ?? EMPTY_NUMBERING_CONTEXT,
  };

  let resolved: Record<string, unknown> | null = null;
  try {
    resolved = ooxmlResolver.resolveRunProperties(
      resolverParams as never,
      inlineRpr,
      pprForChain,
      true,
      numberingDefinedInline,
    ) as Record<string, unknown>;

    if (!resolved || typeof resolved !== 'object') {
      return null;
    }
  } catch {
    return null;
  }

  return buildCharacterStyleHydration(resolved, context.docx);
};

/**
 * Extracts CSS font-family string from resolved OOXML fontFamily object.
 *
 * OOXML stores fonts as a structured object with multiple font slots.
 * This helper resolves the ascii font (or asciiTheme) and converts it to CSS.
 * Non-ascii slots (hAnsi/eastAsia/cs) are not used here.
 *
 * @param fontFamily - OOXML font family object or undefined
 * @returns CSS font-family string (e.g., "Calibri"), or undefined if no font found
 *
 * @example
 * ```typescript
 * // Standard OOXML font object
 * extractFontFamily({ ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'MS Mincho' })
 * // Returns: 'Calibri'
 *
 * // Invalid input
 * extractFontFamily(null)
 * // Returns: undefined
 * ```
 */
function extractFontFamily(fontFamily: unknown, docx?: Record<string, unknown>): string | undefined {
  if (!fontFamily || typeof fontFamily !== 'object') return undefined;
  // Cast SuperConverter to access toCssFontFamily (JS static method not typed)
  const toCssFontFamily = (
    SuperConverter as { toCssFontFamily?: (fontName: string, docx?: Record<string, unknown>) => string }
  ).toCssFontFamily;
  const resolved = resolveDocxFontFamily(fontFamily as Record<string, unknown>, docx ?? null, toCssFontFamily);
  return resolved ?? undefined;
}

/**
 * Extracts hex color value from resolved OOXML color object.
 *
 * OOXML colors are stored as objects with a `val` property containing the hex value:
 * `{ val: 'FF0000' }` for red, `{ val: 'auto' }` for automatic color.
 *
 * This function extracts the color hex string without the `#` prefix, matching OOXML format.
 *
 * @param color - OOXML color object or undefined
 * @returns Hex color string (e.g., "FF0000"), or undefined if invalid/auto
 *
 * @example
 * ```typescript
 * // Standard OOXML color
 * extractColorValue({ val: 'FF0000' })
 * // Returns: 'FF0000'
 *
 * // Invalid input
 * extractColorValue(null)
 * // Returns: undefined
 * ```
 */
function extractColorValue(color: unknown): string | undefined {
  if (!color || typeof color !== 'object') return undefined;
  const c = color as Record<string, unknown>;
  const val = c.val;
  if (typeof val !== 'string') return undefined;
  if (!val || val.toLowerCase() === 'auto') return undefined;
  return val;
}

/**
 * Normalizes OOXML boolean toggle properties to JavaScript boolean values.
 *
 * OOXML boolean properties (w:b, w:i, etc.) can be represented in multiple formats:
 * - Boolean: `true` or `false`
 * - Number: `1` (true) or `0` (false)
 * - String: `'1'`, `'true'`, `'on'` (true) or `'0'`, `'false'`, `'off'` (false)
 * - Empty string: `''` (true - OOXML treats absence of value as true for toggle properties)
 *
 * This function normalizes all valid OOXML boolean representations to JavaScript booleans.
 *
 * @param value - OOXML boolean value in any valid format
 * @returns JavaScript boolean (true/false) or undefined if value is null/undefined
 *
 * @example
 * ```typescript
 * normalizeBooleanProp(true)      // Returns: true
 * normalizeBooleanProp(1)         // Returns: true
 * normalizeBooleanProp('1')       // Returns: true
 * normalizeBooleanProp('on')      // Returns: true
 * normalizeBooleanProp('')        // Returns: true (OOXML convention)
 * normalizeBooleanProp(false)     // Returns: false
 * normalizeBooleanProp('0')       // Returns: false
 * normalizeBooleanProp(null)      // Returns: undefined
 * ```
 */
function normalizeBooleanProp(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === '0' || lower === 'false' || lower === 'off') return false;
    if (lower === '1' || lower === 'true' || lower === 'on' || lower === '') return true;
  }
  return Boolean(value);
}

/**
 * Extracts underline properties from resolved OOXML underline object.
 *
 * OOXML underlines are stored as objects with type and optional color:
 * - `w:val` or `type`: Underline style (single, double, thick, dotted, etc.)
 * - `w:color` or `color`: Hex color string (optional)
 *
 * Valid underline types include: single, double, thick, dotted, dash, dotDash, dotDotDash, wave, etc.
 * The special value "none" is treated as no underline (returns undefined).
 *
 * @param underline - OOXML underline object or undefined
 * @returns Underline object with type and optional color, or undefined if no underline
 *
 * @example
 * ```typescript
 * // Standard single underline
 * extractUnderline({ 'w:val': 'single' })
 * // Returns: { type: 'single', color: undefined }
 *
 * // Double underline with color
 * extractUnderline({ type: 'double', color: 'FF0000' })
 * // Returns: { type: 'double', color: 'FF0000' }
 *
 * // No underline
 * extractUnderline({ 'w:val': 'none' })
 * // Returns: undefined
 *
 * // Invalid input
 * extractUnderline(null)
 * // Returns: undefined
 * ```
 */
function extractUnderline(underline: unknown): CharacterStyleHydration['underline'] | undefined {
  if (!underline || typeof underline !== 'object') return undefined;
  const u = underline as Record<string, unknown>;
  const type = u['w:val'] ?? u.type ?? u.val;
  if (typeof type !== 'string' || type === 'none') return undefined;
  const color = u['w:color'] ?? u.color;
  return {
    type,
    color: typeof color === 'string' ? color : undefined,
  };
}
