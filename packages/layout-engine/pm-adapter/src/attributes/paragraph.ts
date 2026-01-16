/**
 * Paragraph Attributes Computation Module
 *
 * Functions for computing, merging, and normalizing paragraph attributes,
 * including style resolution, boolean attributes, and Word layout integration.
 */

import type {
  ParagraphAttrs,
  ParagraphIndent,
  ParagraphSpacing,
  TabStop,
  DropCapDescriptor,
  DropCapRun,
} from '@superdoc/contracts';
import type { PMNode, StyleNode, StyleContext, ListCounterContext, ListRenderingAttrs } from '../types.js';
import { resolveStyle, combineIndentProperties } from '@superdoc/style-engine';
import type {
  WordParagraphLayoutOutput,
  ResolvedParagraphProperties,
  DocDefaults,
  NumberingProperties,
  ResolvedRunProperties,
  ResolvedTabStop,
  NumberingFormat,
  WordListJustification,
  WordListSuffix,
} from '@superdoc/word-layout';
import { computeWordParagraphLayout } from '@superdoc/word-layout';
import { Engines } from '@superdoc/contracts';
import {
  pickNumber,
  twipsToPx,
  isFiniteNumber,
  ptToPx,
  asOoxmlElement,
  findOoxmlChild,
  getOoxmlAttribute,
  parseOoxmlNumber,
  hasOwnProperty,
  type OoxmlElement,
} from '../utilities.js';
import {
  normalizeAlignment,
  normalizeParagraphSpacing,
  normalizeParagraphIndent,
  normalizePxIndent,
  spacingPxToPt,
  indentPxToPt,
  spacingPtToPx,
  indentPtToPx,
} from './spacing-indent.js';
import { normalizeOoxmlTabs } from './tabs.js';
import { normalizeParagraphBorders, normalizeParagraphShading } from './borders.js';
import { mirrorIndentForRtl, ensureBidiIndentPx, DEFAULT_BIDI_INDENT_PX } from './bidi.js';
import { hydrateParagraphStyleAttrs, hydrateMarkerStyleAttrs } from './paragraph-styles.js';
import type { ParagraphStyleHydration } from './paragraph-styles.js';
import type { ConverterContext, ConverterNumberingContext } from '../converter-context.js';

const { resolveSpacingIndent } = Engines;

const DEFAULT_DECIMAL_SEPARATOR = '.';

/**
 * Checks if a numbering ID represents valid numbering properties.
 *
 * Per OOXML spec §17.9.16, `numId="0"` is a special sentinel value that disables
 * numbering inherited from paragraph styles. This function validates that a numId
 * is not null/undefined and not the special zero value (either numeric 0 or string '0').
 *
 * @param numId - The numbering ID to validate (can be number, string, null, or undefined)
 * @returns true if numId represents valid numbering (not null/undefined/0/'0'), false otherwise
 *
 * @example
 * ```typescript
 * isValidNumberingId(1)      // true  - valid numbering
 * isValidNumberingId('5')    // true  - valid numbering (string form)
 * isValidNumberingId(0)      // false - disables numbering (OOXML spec)
 * isValidNumberingId('0')    // false - disables numbering (string form)
 * isValidNumberingId(null)   // false - no numbering
 * isValidNumberingId(undefined) // false - no numbering
 * ```
 */
export const isValidNumberingId = (numId: number | string | null | undefined): boolean => {
  return numId != null && numId !== 0 && numId !== '0';
};

/**
 * Tracks which paragraph spacing properties were explicitly set.
 *
 * Used to distinguish between explicit spacing values and those inherited
 * from docDefaults/styles, which affects empty paragraph rendering behavior.
 */
type SpacingExplicit = {
  /** Whether 'before' spacing was explicitly set */
  before?: boolean;
  /** Whether 'after' spacing was explicitly set */
  after?: boolean;
  /** Whether 'line' spacing was explicitly set */
  line?: boolean;
};

/**
 * Extracts which spacing properties are explicitly set from a plain object.
 *
 * Checks for the presence of spacing-related property keys to determine
 * if spacing values were explicitly specified vs inherited.
 *
 * @param value - The spacing object to analyze
 * @returns Object indicating which spacing properties are explicit
 *
 * @example
 * ```typescript
 * extractSpacingExplicitFromObject({ before: 240 }); // { before: true }
 * extractSpacingExplicitFromObject({ line: 360 }); // { line: true }
 * extractSpacingExplicitFromObject({}); // {}
 * ```
 */
const extractSpacingExplicitFromObject = (value: unknown): SpacingExplicit => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  const explicit: SpacingExplicit = {};
  if (
    hasOwnProperty(obj, 'before') ||
    hasOwnProperty(obj, 'lineSpaceBefore') ||
    hasOwnProperty(obj, 'beforeAutospacing') ||
    hasOwnProperty(obj, 'beforeAutoSpacing')
  ) {
    explicit.before = true;
  }
  if (
    hasOwnProperty(obj, 'after') ||
    hasOwnProperty(obj, 'lineSpaceAfter') ||
    hasOwnProperty(obj, 'afterAutospacing') ||
    hasOwnProperty(obj, 'afterAutoSpacing')
  ) {
    explicit.after = true;
  }
  if (hasOwnProperty(obj, 'line') || hasOwnProperty(obj, 'lineRule')) {
    explicit.line = true;
  }
  return explicit;
};

/**
 * Extracts which spacing properties are explicitly set from OOXML paragraph properties.
 *
 * Parses the OOXML structure to find w:spacing element attributes and determines
 * which spacing values were explicitly specified in the document.
 *
 * @param value - The OOXML paragraph properties element
 * @returns Object indicating which spacing properties are explicit
 *
 * @example
 * ```typescript
 * // For XML: <w:pPr><w:spacing w:before="240"/></w:pPr>
 * extractSpacingExplicitFromOoxml(pPrElement); // { before: true }
 * ```
 */
const extractSpacingExplicitFromOoxml = (value: unknown): SpacingExplicit => {
  const element = asOoxmlElement(value);
  if (!element) return {};
  const pPr = element.name === 'w:pPr' ? element : findOoxmlChild(element, 'w:pPr');
  const spacingEl = findOoxmlChild(pPr, 'w:spacing');
  if (!spacingEl) return {};
  const explicit: SpacingExplicit = {};
  if (
    getOoxmlAttribute(spacingEl, 'w:before') != null ||
    getOoxmlAttribute(spacingEl, 'w:beforeAutospacing') != null ||
    getOoxmlAttribute(spacingEl, 'w:beforeAutoSpacing') != null
  ) {
    explicit.before = true;
  }
  if (
    getOoxmlAttribute(spacingEl, 'w:after') != null ||
    getOoxmlAttribute(spacingEl, 'w:afterAutospacing') != null ||
    getOoxmlAttribute(spacingEl, 'w:afterAutoSpacing') != null
  ) {
    explicit.after = true;
  }
  if (getOoxmlAttribute(spacingEl, 'w:line') != null || getOoxmlAttribute(spacingEl, 'w:lineRule') != null) {
    explicit.line = true;
  }
  return explicit;
};

/**
 * Merges multiple SpacingExplicit objects into one.
 *
 * If any source has a property set to true, the result will have that property as true.
 * This allows tracking explicit settings across multiple sources (paragraphProps, attrs, OOXML).
 *
 * @param sources - The SpacingExplicit objects to merge
 * @returns Merged SpacingExplicit with all explicit flags combined
 *
 * @example
 * ```typescript
 * mergeSpacingExplicit({ before: true }, { after: true });
 * // { before: true, after: true }
 * ```
 */
const mergeSpacingExplicit = (...sources: SpacingExplicit[]): SpacingExplicit => {
  const merged: SpacingExplicit = {};
  for (const source of sources) {
    if (source.before) merged.before = true;
    if (source.after) merged.after = true;
    if (source.line) merged.line = true;
  }
  return merged;
};

/**
 * Merges spacing from multiple sources with increasing priority.
 *
 * In OOXML, a paragraph can have partial spacing overrides (e.g., only `line`)
 * while inheriting other properties (e.g., `before`, `after`) from docDefaults
 * or styles. This function merges all sources so that explicit values override
 * defaults, but missing values fall back to lower-priority sources.
 *
 * Priority (lowest to highest): base (docDefaults/styles) < paragraphProps < attrs
 *
 * @param base - Spacing from hydrated styles (includes docDefaults)
 * @param paragraphProps - Spacing from paragraphProperties
 * @param attrs - Spacing from direct paragraph attrs (highest priority)
 * @returns Merged spacing object, or undefined if all sources are empty
 *
 * @example
 * ```typescript
 * // Partial override: attrs only specifies 'line', inherits 'before' and 'after' from base
 * mergeSpacingSources(
 *   { before: 10, after: 10 },
 *   {},
 *   { line: 1.5 }
 * )
 * // Returns: { before: 10, after: 10, line: 1.5 }
 *
 * // Full override: attrs overrides all properties from base
 * mergeSpacingSources(
 *   { before: 10, after: 10, line: 1.0 },
 *   {},
 *   { before: 20, after: 20, line: 2.0 }
 * )
 * // Returns: { before: 20, after: 20, line: 2.0 }
 *
 * // Empty sources: returns undefined
 * mergeSpacingSources({}, {}, {})
 * // Returns: undefined
 * ```
 */
export const mergeSpacingSources = (
  base: unknown,
  paragraphProps: unknown,
  attrs: unknown,
): Record<string, unknown> | undefined => {
  const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

  const baseObj = isObject(base) ? base : {};
  const propsObj = isObject(paragraphProps) ? paragraphProps : {};
  const attrsObj = isObject(attrs) ? attrs : {};

  // If none of the sources have any data, return undefined
  if (Object.keys(baseObj).length === 0 && Object.keys(propsObj).length === 0 && Object.keys(attrsObj).length === 0) {
    return undefined;
  }

  // Merge with increasing priority: base < paragraphProps < attrs
  return { ...baseObj, ...propsObj, ...attrsObj };
};

const normalizeNumFmt = (value?: unknown): NumberingFormat | undefined => {
  if (typeof value !== 'string') return undefined;
  switch (value) {
    case 'decimal':
      return 'decimal';
    case 'lowerLetter':
      return 'lowerLetter';
    case 'upperLetter':
      return 'upperLetter';
    case 'lowerRoman':
      return 'lowerRoman';
    case 'upperRoman':
      return 'upperRoman';
    case 'bullet':
      return 'bullet';
    default:
      return undefined;
  }
};

const normalizeSuffix = (value?: unknown): WordListSuffix => {
  if (typeof value !== 'string') return undefined;
  if (value === 'tab' || value === 'space' || value === 'nothing') {
    return value;
  }
  return undefined;
};

const normalizeJustification = (value?: unknown): WordListJustification | undefined => {
  if (typeof value !== 'string') return undefined;
  if (value === 'start') return 'left';
  if (value === 'end') return 'right';
  if (value === 'left' || value === 'center' || value === 'right') return value;
  return undefined;
};

const extractIndentFromLevel = (lvl: OoxmlElement | undefined): ParagraphIndent | undefined => {
  const pPr = findOoxmlChild(lvl, 'w:pPr');
  const ind = findOoxmlChild(pPr, 'w:ind');
  if (!ind) return undefined;
  const left = parseOoxmlNumber(getOoxmlAttribute(ind, 'w:left'));
  const right = parseOoxmlNumber(getOoxmlAttribute(ind, 'w:right'));
  const firstLine = parseOoxmlNumber(getOoxmlAttribute(ind, 'w:firstLine'));
  const hanging = parseOoxmlNumber(getOoxmlAttribute(ind, 'w:hanging'));
  const indent: ParagraphIndent = {};
  if (left != null) indent.left = left;
  if (right != null) indent.right = right;
  if (firstLine != null) indent.firstLine = firstLine;
  if (hanging != null) indent.hanging = hanging;
  return Object.keys(indent).length ? indent : undefined;
};

const normalizeColor = (value?: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') return undefined;
  const upper = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return `#${upper.toUpperCase()}`;
};

const extractMarkerRun = (lvl: OoxmlElement | undefined): ResolvedRunProperties | undefined => {
  const rPr = findOoxmlChild(lvl, 'w:rPr');
  if (!rPr) return undefined;

  const run: Partial<ResolvedRunProperties> = {};
  const rFonts = findOoxmlChild(rPr, 'w:rFonts');
  const font =
    getOoxmlAttribute(rFonts, 'w:ascii') ??
    getOoxmlAttribute(rFonts, 'w:hAnsi') ??
    getOoxmlAttribute(rFonts, 'w:eastAsia');
  if (typeof font === 'string' && font.trim()) {
    run.fontFamily = font;
  }

  const sz =
    parseOoxmlNumber(getOoxmlAttribute(findOoxmlChild(rPr, 'w:sz'), 'w:val')) ??
    parseOoxmlNumber(getOoxmlAttribute(findOoxmlChild(rPr, 'w:szCs'), 'w:val'));
  if (sz != null) {
    run.fontSize = sz / 2; // w:sz is in half-points
  }

  const color = normalizeColor(getOoxmlAttribute(findOoxmlChild(rPr, 'w:color'), 'w:val'));
  if (color) run.color = color;

  const boldEl = findOoxmlChild(rPr, 'w:b');
  if (boldEl) {
    const boldVal = getOoxmlAttribute(boldEl, 'w:val');
    if (boldVal == null || isTruthy(boldVal)) run.bold = true;
  }

  const italicEl = findOoxmlChild(rPr, 'w:i');
  if (italicEl) {
    const italicVal = getOoxmlAttribute(italicEl, 'w:val');
    if (italicVal == null || isTruthy(italicVal)) run.italic = true;
  }

  const spacingTwips = parseOoxmlNumber(getOoxmlAttribute(findOoxmlChild(rPr, 'w:spacing'), 'w:val'));
  if (spacingTwips != null && Number.isFinite(spacingTwips)) {
    run.letterSpacing = twipsToPx(spacingTwips);
  }

  return Object.keys(run).length ? (run as ResolvedRunProperties) : undefined;
};

const findNumFmtElement = (lvl: OoxmlElement | undefined): OoxmlElement | undefined => {
  if (!lvl) return undefined;
  const direct = findOoxmlChild(lvl, 'w:numFmt');
  if (direct) return direct;
  const alternate = findOoxmlChild(lvl, 'mc:AlternateContent');
  const choice = findOoxmlChild(alternate, 'mc:Choice');
  if (choice) {
    return findOoxmlChild(choice, 'w:numFmt');
  }
  return undefined;
};

const resolveNumberingFromContext = (
  numId: string | number,
  ilvl: number,
  numbering?: ConverterNumberingContext,
): Partial<AdapterNumberingProps> | undefined => {
  const definitions = numbering?.definitions as Record<string, unknown> | undefined;
  const abstracts = numbering?.abstracts as Record<string, unknown> | undefined;
  if (!definitions || !abstracts) {
    return undefined;
  }

  const numDef = asOoxmlElement(definitions[String(numId)]);
  if (!numDef) {
    return undefined;
  }

  const abstractId = getOoxmlAttribute(findOoxmlChild(numDef, 'w:abstractNumId'), 'w:val');
  if (abstractId == null) {
    return undefined;
  }

  const abstract = asOoxmlElement(abstracts[String(abstractId)]);
  if (!abstract) {
    return undefined;
  }

  let levelDef = abstract.elements?.find(
    (el) => el?.name === 'w:lvl' && parseOoxmlNumber(el.attributes?.['w:ilvl']) === ilvl,
  );

  const override = numDef.elements?.find(
    (el) => el?.name === 'w:lvlOverride' && parseOoxmlNumber(el.attributes?.['w:ilvl']) === ilvl,
  );
  const overrideLvl = findOoxmlChild(override, 'w:lvl');
  if (overrideLvl) {
    levelDef = overrideLvl;
  }
  const startOverride = parseOoxmlNumber(getOoxmlAttribute(findOoxmlChild(override, 'w:startOverride'), 'w:val'));

  if (!levelDef) {
    return undefined;
  }

  const numFmtEl = findNumFmtElement(levelDef);
  const lvlText = getOoxmlAttribute(findOoxmlChild(levelDef, 'w:lvlText'), 'w:val') as string | undefined;
  const start = startOverride ?? parseOoxmlNumber(getOoxmlAttribute(findOoxmlChild(levelDef, 'w:start'), 'w:val'));
  const suffix = normalizeSuffix(getOoxmlAttribute(findOoxmlChild(levelDef, 'w:suff'), 'w:val'));
  const lvlJc = normalizeJustification(getOoxmlAttribute(findOoxmlChild(levelDef, 'w:lvlJc'), 'w:val'));
  const indent = extractIndentFromLevel(levelDef);
  const markerRun = extractMarkerRun(levelDef);

  const numFmt = normalizeNumFmt(getOoxmlAttribute(numFmtEl, 'w:val'));

  return {
    format: numFmt,
    lvlText,
    start,
    suffix,
    lvlJc,
    resolvedLevelIndent: indent,
    resolvedMarkerRpr: markerRun,
  };
};

/**
 * Check if a value represents a truthy boolean.
 */
const isTruthy = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true;
    }
  }
  return false;
};

/**
 * Safely extracts a property from an unknown object.
 * Used to replace unsafe type assertions with proper type guards.
 *
 * @param obj - The object to extract from
 * @param key - The property key to extract
 * @returns The property value, or undefined if not accessible
 */
const safeGetProperty = (obj: unknown, key: string): unknown => {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const record = obj as Record<string, unknown>;
  return record[key];
};

/**
 * Check if a value represents an explicit false boolean.
 */
const isExplicitFalse = (value: unknown): boolean => {
  if (value === false || value === 0) return true;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'false' || normalized === '0' || normalized === 'off';
  }
  return false;
};

/**
 * Infer boolean value from OOXML paragraph elements.
 */
const inferBooleanFromParagraphElements = (
  paragraphProps: Record<string, unknown>,
  elementNames: string | string[],
): boolean | undefined => {
  const elements = (paragraphProps as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return undefined;

  const normalizedTargets = new Set(
    (Array.isArray(elementNames) ? elementNames : [elementNames]).flatMap((name) =>
      name.startsWith('w:') ? [name, name.slice(2)] : [name, `w:${name}`],
    ),
  );

  const match = elements.find((el): el is { name: string; attributes?: Record<string, unknown> } => {
    if (!el || typeof el !== 'object') return false;
    const name = (el as { name?: unknown }).name;
    return typeof name === 'string' && normalizedTargets.has(name);
  });

  if (!match) return undefined;

  const rawVal = match.attributes?.['w:val'] ?? match.attributes?.val;

  if (rawVal == null) return true;
  if (isExplicitFalse(rawVal)) return false;
  if (isTruthy(rawVal)) return true;
  return undefined;
};

/**
 * Resolve a boolean attribute from paragraph node, checking both direct attrs and paragraphProperties.
 */
export const resolveParagraphBooleanAttr = (para: PMNode, key: string, elementName: string): boolean | undefined => {
  const attrs = (para.attrs ?? {}) as Record<string, unknown>;
  if (key in attrs) {
    const direct = attrs[key];
    if (isTruthy(direct)) return true;
    if (isExplicitFalse(direct)) return false;
  }
  const paragraphProps = attrs.paragraphProperties as Record<string, unknown> | undefined;
  if (!paragraphProps) return undefined;
  if (key in paragraphProps) {
    const nested = (paragraphProps as Record<string, unknown>)[key];
    if (isTruthy(nested)) return true;
    if (isExplicitFalse(nested)) return false;
  }
  return inferBooleanFromParagraphElements(paragraphProps, elementName);
};

/**
 * Check if paragraph has page break before it.
 */
export const hasPageBreakBefore = (para: PMNode): boolean => {
  const attrs = (para.attrs ?? {}) as Record<string, unknown>;
  if (isTruthy(attrs.pageBreakBefore)) {
    return true;
  }
  const paragraphProps = attrs.paragraphProperties as Record<string, unknown> | undefined;
  if (paragraphProps && isTruthy(paragraphProps.pageBreakBefore)) {
    return true;
  }
  if (paragraphProps) {
    const inferred = inferBooleanFromParagraphElements(paragraphProps, 'w:pageBreakBefore');
    if (typeof inferred === 'boolean') {
      return inferred;
    }
  }
  return false;
};

/**
 * Clone paragraph attributes deeply.
 */
export const cloneParagraphAttrs = (attrs?: ParagraphAttrs): ParagraphAttrs | undefined => {
  if (!attrs) return undefined;
  const clone: ParagraphAttrs = { ...attrs };
  if (attrs.spacing) clone.spacing = { ...attrs.spacing };
  if (attrs.spacingExplicit) clone.spacingExplicit = { ...attrs.spacingExplicit };
  if (attrs.indent) clone.indent = { ...attrs.indent };
  if (attrs.borders) {
    const borderClone: ParagraphAttrs['borders'] = {};
    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      const border = attrs.borders?.[side];
      if (border) {
        borderClone[side] = { ...border };
      }
    });
    clone.borders = Object.keys(borderClone).length ? borderClone : undefined;
  }
  if (attrs.shading) clone.shading = { ...attrs.shading };
  if (attrs.tabs) clone.tabs = attrs.tabs.map((tab) => ({ ...tab }));
  // Clone drop cap descriptor deeply
  if (attrs.dropCapDescriptor) {
    clone.dropCapDescriptor = {
      ...attrs.dropCapDescriptor,
      run: { ...attrs.dropCapDescriptor.run },
    };
  }
  return clone;
};

/**
 * Build a style node from paragraph node attributes.
 * Used for style resolution with the style engine.
 */
export const buildStyleNodeFromAttrs = (
  attrs: Record<string, unknown> | undefined,
  spacing?: ParagraphSpacing,
  indent?: ParagraphIndent,
): StyleNode => {
  if (!attrs) return {};

  const paragraphProps: StyleNode['paragraphProps'] = {};

  const alignment = normalizeAlignment(attrs.alignment ?? attrs.textAlign);
  if (alignment) {
    paragraphProps.alignment = alignment;
  }

  if (spacing) {
    paragraphProps.spacing = spacingPxToPt(spacing);
  }

  if (indent) {
    paragraphProps.indent = indentPxToPt(indent);
  }

  const rawTabs = (attrs.tabs ?? attrs.tabStops) as unknown;
  const tabs = normalizeOoxmlTabs(rawTabs);
  if (tabs) {
    paragraphProps.tabs = tabs;
  }

  const styleNode: StyleNode = {};
  if (paragraphProps && Object.keys(paragraphProps).length > 0) {
    styleNode.paragraphProps = paragraphProps;
  }

  return styleNode;
};

/**
 * Normalize list rendering attributes from raw attributes.
 */
export const normalizeListRenderingAttrs = (value: unknown): ListRenderingAttrs | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;

  const markerText = typeof source.markerText === 'string' ? source.markerText : undefined;
  const justification =
    source.justification === 'left' || source.justification === 'right' || source.justification === 'center'
      ? source.justification
      : undefined;
  const numberingType = typeof source.numberingType === 'string' ? source.numberingType : undefined;
  const suffix =
    source.suffix === 'tab' || source.suffix === 'space' || source.suffix === 'nothing' ? source.suffix : undefined;

  const path =
    Array.isArray(source.path) && source.path.length
      ? (source.path
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry)) as number[])
      : undefined;

  return {
    markerText,
    justification,
    numberingType,
    suffix,
    path: path && path.length ? path : undefined,
  };
};

/**
 * Build numbering path for multi-level lists (e.g., "1.2.3").
 */
export const buildNumberingPath = (
  numId: number | undefined,
  ilvl: number,
  counterValue: number,
  listCounterContext?: ListCounterContext,
): number[] => {
  const targetLevel = Number.isFinite(ilvl) && ilvl > 0 ? Math.floor(ilvl) : 0;
  if (!listCounterContext || typeof numId !== 'number') {
    return Array.from({ length: targetLevel + 1 }, (_, level) => (level === targetLevel ? counterValue : 1));
  }

  const path: number[] = [];
  for (let level = 0; level < targetLevel; level += 1) {
    const parentValue = listCounterContext.getListCounter(numId, level);
    path.push(parentValue > 0 ? parentValue : 1);
  }
  path.push(counterValue);
  return path;
};

/**
 * Convert indent from twips to pixels.
 */
const convertIndentTwipsToPx = (indent?: ParagraphIndent | null): ParagraphIndent | undefined => {
  if (!indent) return undefined;
  const result: ParagraphIndent = {};
  const toNum = (v: unknown): number | undefined => {
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    if (isFiniteNumber(v)) return Number(v);
    return undefined;
  };

  const left = toNum(indent.left);
  const right = toNum(indent.right);
  const firstLine = toNum(indent.firstLine);
  const hanging = toNum(indent.hanging);

  if (left != null) result.left = twipsToPx(left);
  if (right != null) result.right = twipsToPx(right);
  if (firstLine != null) result.firstLine = twipsToPx(firstLine);
  if (hanging != null) result.hanging = twipsToPx(hanging);
  return Object.keys(result).length > 0 ? result : undefined;
};

type AdapterNumberingProps = (NumberingProperties & {
  path?: number[];
  counterValue?: number;
  resolvedLevelIndent?: ParagraphIndent;
  resolvedMarkerRpr?: ResolvedRunProperties;
}) &
  Record<string, unknown>;

const toAdapterNumberingProps = (value: unknown): AdapterNumberingProps | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const rawNumId = candidate.numId;
  if (typeof rawNumId !== 'number' && typeof rawNumId !== 'string') {
    return undefined;
  }
  const rawIlvl = candidate.ilvl;
  const normalizedIlvl = Number.isFinite(rawIlvl) ? Math.floor(Number(rawIlvl)) : 0;
  return {
    ...(candidate as Record<string, unknown>),
    numId: rawNumId,
    ilvl: normalizedIlvl,
  } as AdapterNumberingProps;
};

const toResolvedTabStops = (tabs?: TabStop[] | null): ResolvedTabStop[] | undefined => {
  if (!Array.isArray(tabs) || tabs.length === 0) return undefined;
  const resolved: ResolvedTabStop[] = [];

  for (const stop of tabs) {
    if (!stop || typeof stop.pos !== 'number') continue;
    const alignment = normalizeResolvedTabAlignment(stop.val);
    if (!alignment) continue;
    const position = twipsToPx(stop.pos);
    if (!Number.isFinite(position)) continue;

    const resolvedStop: ResolvedTabStop = {
      position,
      alignment,
    };
    if (stop.leader && stop.leader !== 'none') {
      resolvedStop.leader = stop.leader as ResolvedTabStop['leader'];
    }
    resolved.push(resolvedStop);
  }

  return resolved.length > 0 ? resolved : undefined;
};

const normalizeResolvedTabAlignment = (value: TabStop['val']): ResolvedTabStop['alignment'] | undefined => {
  switch (value) {
    case 'start':
    case 'center':
    case 'end':
    case 'decimal':
    case 'bar':
      return value;
    default:
      return undefined;
  }
};

/**
 * Default drop cap font size in pixels.
 * Corresponds to roughly 48pt which is a common drop cap size.
 */
const DEFAULT_DROP_CAP_FONT_SIZE_PX = 64;

/**
 * Default font family for drop cap when none is specified.
 */
const DEFAULT_DROP_CAP_FONT_FAMILY = 'Times New Roman';

/**
 * Extract drop cap run information from a paragraph node.
 *
 * Drop cap paragraphs in DOCX typically contain just the drop cap letter(s)
 * with specific font styling (large font size, vertical position offset, etc.).
 * This function extracts the text and run properties from the first text node.
 *
 * @param para - The paragraph PM node to extract drop cap info from
 * @returns DropCapRun with text and styling, or null if extraction fails
 */
const extractDropCapRunFromParagraph = (para: PMNode): DropCapRun | null => {
  const content = para.content;
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  // Find the first text content in the paragraph
  let text = '';
  let runProperties: Record<string, unknown> = {};
  let textStyleMarks: Record<string, unknown> = {};

  /**
   * Maximum recursion depth for extractTextAndStyle to prevent stack overflow.
   * A depth of 50 should be sufficient for any reasonable document structure.
   */
  const MAX_RECURSION_DEPTH = 50;

  const extractTextAndStyle = (nodes: PMNode[], depth = 0): boolean => {
    // Guard against excessive recursion depth
    if (depth > MAX_RECURSION_DEPTH) {
      console.warn(`extractTextAndStyle exceeded max recursion depth (${MAX_RECURSION_DEPTH})`);
      return false;
    }

    for (const node of nodes) {
      if (!node) continue;

      // Check for text node
      if (node.type === 'text' && typeof node.text === 'string' && node.text.length > 0) {
        text = node.text;
        // Extract styling from marks
        if (Array.isArray(node.marks)) {
          for (const mark of node.marks) {
            if (mark?.type === 'textStyle' && mark.attrs) {
              textStyleMarks = { ...textStyleMarks, ...(mark.attrs as Record<string, unknown>) };
            }
          }
        }
        return true;
      }

      // Check for run node that may contain text
      if (node.type === 'run') {
        // Extract run properties
        if (node.attrs?.runProperties && typeof node.attrs.runProperties === 'object') {
          runProperties = { ...runProperties, ...(node.attrs.runProperties as Record<string, unknown>) };
        }
        // Also check for marks on the run node
        if (Array.isArray(node.marks)) {
          for (const mark of node.marks) {
            if (mark?.type === 'textStyle' && mark.attrs) {
              textStyleMarks = { ...textStyleMarks, ...(mark.attrs as Record<string, unknown>) };
            }
          }
        }
        // Look for text in run's children with incremented depth
        if (Array.isArray(node.content) && extractTextAndStyle(node.content, depth + 1)) {
          return true;
        }
      }

      // Look for text in other container nodes with incremented depth
      if (Array.isArray(node.content) && extractTextAndStyle(node.content, depth + 1)) {
        return true;
      }
    }
    return false;
  };

  extractTextAndStyle(content);

  // If no text found, cannot create a drop cap run
  if (!text) {
    return null;
  }

  // Merge run properties and text style marks to get final styling
  const mergedStyle = { ...runProperties, ...textStyleMarks };

  // Parse font size - can be in various formats: '117pt', '48px', number, etc.
  let fontSizePx = DEFAULT_DROP_CAP_FONT_SIZE_PX;
  const rawFontSize = mergedStyle.fontSize ?? mergedStyle['w:sz'] ?? mergedStyle.sz;
  if (rawFontSize != null) {
    if (typeof rawFontSize === 'number') {
      // If number > 100, assume it's half-points (Word uses half-points for sz)
      // Half-points: w:sz=234 means 117pt
      const converted = rawFontSize > 100 ? ptToPx(rawFontSize / 2) : rawFontSize;
      fontSizePx = converted ?? DEFAULT_DROP_CAP_FONT_SIZE_PX;
    } else if (typeof rawFontSize === 'string') {
      const numericPart = parseFloat(rawFontSize);
      if (Number.isFinite(numericPart)) {
        if (rawFontSize.endsWith('pt')) {
          const converted = ptToPx(numericPart);
          fontSizePx = converted ?? DEFAULT_DROP_CAP_FONT_SIZE_PX;
        } else if (rawFontSize.endsWith('px')) {
          // px values are already in pixels
          fontSizePx = numericPart;
        } else {
          // Plain number string - assume half-points if large
          const converted = numericPart > 100 ? ptToPx(numericPart / 2) : numericPart;
          fontSizePx = converted ?? DEFAULT_DROP_CAP_FONT_SIZE_PX;
        }
      }
    }
  }

  // Parse font family
  let fontFamily = DEFAULT_DROP_CAP_FONT_FAMILY;
  const rawFontFamily = mergedStyle.fontFamily ?? mergedStyle['w:rFonts'] ?? mergedStyle.rFonts;
  if (typeof rawFontFamily === 'string') {
    fontFamily = rawFontFamily;
  } else if (rawFontFamily && typeof rawFontFamily === 'object') {
    // rFonts can be an object with ascii, hAnsi, etc.
    const rFonts = rawFontFamily as Record<string, unknown>;
    const ascii = rFonts['w:ascii'] ?? rFonts.ascii;
    if (typeof ascii === 'string') {
      fontFamily = ascii;
    }
  }

  // Build the drop cap run
  const dropCapRun: DropCapRun = {
    text,
    fontFamily,
    fontSize: fontSizePx,
  };

  // Parse optional properties
  const bold = mergedStyle.bold ?? mergedStyle['w:b'] ?? mergedStyle.b;
  if (isTruthy(bold)) {
    dropCapRun.bold = true;
  }

  const italic = mergedStyle.italic ?? mergedStyle['w:i'] ?? mergedStyle.i;
  if (isTruthy(italic)) {
    dropCapRun.italic = true;
  }

  const color = mergedStyle.color ?? mergedStyle['w:color'] ?? mergedStyle.val;
  if (typeof color === 'string' && color.length > 0 && color.toLowerCase() !== 'auto') {
    // Ensure color has # prefix if it's a hex color
    dropCapRun.color = color.startsWith('#') ? color : `#${color}`;
  }

  // Parse vertical position offset (from w:position, in half-points, can be negative)
  const position = mergedStyle.position ?? mergedStyle['w:position'];
  if (position != null) {
    const posNum = pickNumber(position);
    if (posNum != null) {
      // Convert half-points to pixels
      dropCapRun.position = ptToPx(posNum / 2);
    }
  }

  return dropCapRun;
};

/**
 * Compute Word paragraph layout for numbered paragraphs.
 *
 * Integrates with @superdoc/word-layout to compute accurate list marker positioning,
 * indent calculation, and marker text rendering. Merges paragraph indent with
 * level-specific indent from numbering definitions.
 *
 * @param paragraphAttrs - Resolved paragraph attributes including spacing, indent, and tabs
 * @param numberingProps - Numbering properties with numId, ilvl, and optional resolved marker RPr
 * @param styleContext - Style context for resolving character styles and doc defaults
 * @param paragraphNode - Optional paragraph node used to hydrate marker run properties via OOXML cascade
 * @returns WordParagraphLayoutOutput with marker and gutter information, or null if computation fails
 *
 * @remarks
 * - Returns null early if numberingProps is explicitly null (vs undefined)
 * - Uses marker hydration when converterContext is available, then falls back to resolvedMarkerRpr and style-engine defaults
 * - Converts indent from twips to pixels for rendering
 * - Gracefully handles computation errors by returning null
 */
export const computeWordLayoutForParagraph = (
  paragraphAttrs: ParagraphAttrs,
  numberingProps: AdapterNumberingProps | undefined,
  styleContext: StyleContext,
  paragraphNode?: PMNode,
  converterContext?: ConverterContext,
  resolvedPpr?: Record<string, unknown>,
): WordParagraphLayoutOutput | null => {
  if (numberingProps === null) {
    return null;
  }

  try {
    // Merge paragraph indent with level-specific indent from numbering definition.
    // Numbering level provides base indent, but paragraph/style can override specific properties.
    // For example, a style may set firstLine=0 to remove numbering's firstLine indent.
    let effectiveIndent = paragraphAttrs.indent;

    if (numberingProps?.resolvedLevelIndent) {
      const resolvedIndentPx = convertIndentTwipsToPx(numberingProps.resolvedLevelIndent as ParagraphIndent);
      const numberingIndent = resolvedIndentPx ?? (numberingProps.resolvedLevelIndent as ParagraphIndent);

      // Numbering indent is the base, paragraph/style indent overrides
      effectiveIndent = {
        ...numberingIndent,
        ...paragraphAttrs.indent,
      };
    }

    const resolvedTabs = toResolvedTabStops(paragraphAttrs.tabs);

    // Build resolved paragraph properties
    const resolvedParagraph: ResolvedParagraphProperties = {
      indent: effectiveIndent,
      spacing: paragraphAttrs.spacing,
      tabs: resolvedTabs,
      tabIntervalTwips: paragraphAttrs.tabIntervalTwips,
      alignment: paragraphAttrs.alignment as 'left' | 'center' | 'right' | 'justify' | undefined,
      decimalSeparator: paragraphAttrs.decimalSeparator,
      numberingProperties: numberingProps,
    };

    // Build doc defaults from style context
    const defaultFontFamily =
      styleContext.defaults?.paragraphFont ?? styleContext.defaults?.paragraphFontFamily ?? 'Times New Roman';
    const defaultFontSize = styleContext.defaults?.fontSize ?? 12;

    const docDefaults: DocDefaults = {
      defaultTabIntervalTwips: styleContext.defaults?.defaultTabIntervalTwips ?? 720,
      decimalSeparator: styleContext.defaults?.decimalSeparator ?? '.',
      run: {
        fontFamily: defaultFontFamily,
        fontSize: defaultFontSize,
      },
      paragraph: {
        indent: {},
        spacing: {},
      },
    };

    let markerRun: ResolvedRunProperties | undefined;

    const markerHydration =
      paragraphNode && converterContext ? hydrateMarkerStyleAttrs(paragraphNode, converterContext, resolvedPpr) : null;

    if (markerHydration) {
      const resolvedColor = markerHydration.color ? `#${markerHydration.color.replace('#', '')}` : undefined;
      markerRun = {
        fontFamily: markerHydration.fontFamily ?? 'Times New Roman',
        fontSize: markerHydration.fontSize / 2, // half-points to points
        bold: markerHydration.bold,
        italic: markerHydration.italic,
        color: resolvedColor,
        letterSpacing: markerHydration.letterSpacing != null ? twipsToPx(markerHydration.letterSpacing) : undefined,
      };
    }

    if (!markerRun) {
      markerRun = numberingProps?.resolvedMarkerRpr;
    }

    if (!markerRun) {
      // Fallback to style-engine when converterContext is not available
      // This path uses hardcoded defaults but maintains backwards compatibility
      const { character: characterStyle } = resolveStyle({ styleId: paragraphAttrs.styleId }, styleContext);
      if (characterStyle) {
        markerRun = {
          fontFamily: characterStyle.font?.family ?? 'Times New Roman',
          fontSize: characterStyle.font?.size ?? 12,
          bold: characterStyle.font?.weight != null && characterStyle.font.weight > 400,
          italic: characterStyle.font?.italic,
          color: characterStyle.color,
          letterSpacing: characterStyle.letterSpacing,
        };
      }
    }

    // Final fallback if neither hydration nor style-engine returned anything
    if (!markerRun) {
      markerRun = {
        fontFamily: 'Times New Roman',
        fontSize: 12,
        color: '#000000',
      };
    }

    // Convert marker fontSize from points to pixels
    // Style-engine and document defaults use points, but buildFontCss expects pixels
    if (markerRun.fontSize != null) {
      const fontSizePx = ptToPx(markerRun.fontSize);
      if (fontSizePx != null) {
        markerRun = { ...markerRun, fontSize: fontSizePx };
      }
    }

    // Compute Word paragraph layout
    const layout = computeWordParagraphLayout({
      paragraph: resolvedParagraph,
      numbering: numberingProps,
      markerRun,
      docDefaults,
    });

    return layout;
  } catch {
    // Graceful fallback if wordLayout computation fails
    return null;
  }
};

const normalizeWordLayoutForIndent = (
  wordLayout: WordParagraphLayoutOutput,
  paragraphIndent: ParagraphIndent | undefined,
): WordParagraphLayoutOutput => {
  const resolvedIndent = wordLayout.resolvedIndent ?? paragraphIndent ?? {};
  const indentLeft = isFiniteNumber(resolvedIndent.left) ? resolvedIndent.left : 0;
  const firstLine = isFiniteNumber(resolvedIndent.firstLine) ? resolvedIndent.firstLine : 0;
  const hanging = isFiniteNumber(resolvedIndent.hanging) ? resolvedIndent.hanging : 0;
  const shouldFirstLineIndentMode = firstLine > 0 && !hanging;

  if (wordLayout.firstLineIndentMode === true && !shouldFirstLineIndentMode) {
    wordLayout.firstLineIndentMode = false;
  }

  if (wordLayout.firstLineIndentMode === true) {
    if (isFiniteNumber(wordLayout.textStartPx)) {
      if (
        wordLayout.marker &&
        (!isFiniteNumber(wordLayout.marker.textStartX) || wordLayout.marker.textStartX !== wordLayout.textStartPx)
      ) {
        wordLayout.marker.textStartX = wordLayout.textStartPx;
      }
    } else if (wordLayout.marker && isFiniteNumber(wordLayout.marker.textStartX)) {
      wordLayout.textStartPx = wordLayout.marker.textStartX;
    }
  } else {
    wordLayout.textStartPx = indentLeft;
    if (wordLayout.marker) {
      wordLayout.marker.textStartX = indentLeft;
    }
  }

  return wordLayout;
};

/**
 * Compute paragraph attributes from PM node, resolving styles and handling BiDi text.
 * This is the main function for converting PM paragraph attributes to layout engine format.
 */
export const computeParagraphAttrs = (
  para: PMNode,
  styleContext: StyleContext,
  listCounterContext?: ListCounterContext,
  converterContext?: ConverterContext,
  hydrationOverride?: ParagraphStyleHydration | null,
): ParagraphAttrs | undefined => {
  const attrs = para.attrs ?? {};
  const paragraphProps =
    typeof attrs.paragraphProperties === 'object' && attrs.paragraphProperties !== null
      ? (attrs.paragraphProperties as Record<string, unknown>)
      : {};
  const hydrated = hydrationOverride ?? hydrateParagraphStyleAttrs(para, converterContext);
  // Merge spacing from all sources: hydrated (docDefaults/styles) < paragraphProps < attrs
  // This ensures that a partial spacing override (e.g., only line) doesn't discard
  // defaults for unspecified fields (e.g., before/after from docDefaults).
  const mergedSpacing = mergeSpacingSources(hydrated?.spacing, paragraphProps.spacing, attrs.spacing);
  const normalizedSpacing = normalizeParagraphSpacing(mergedSpacing);
  const spacingExplicit = mergeSpacingExplicit(
    extractSpacingExplicitFromObject(paragraphProps.spacing),
    extractSpacingExplicitFromObject(attrs.spacing),
    extractSpacingExplicitFromOoxml(paragraphProps),
  );
  const normalizeIndentObject = (value: unknown): ParagraphIndent | undefined => {
    if (!value || typeof value !== 'object') return;
    return normalizePxIndent(value) ?? convertIndentTwipsToPx(value);
  };
  /**
   * Build indent chain with increasing priority order (lowest to highest):
   * 1. hydratedIndentPx - from styles (docDefaults, paragraph styles)
   * 2. paragraphIndentPx - from paragraphProperties.indent (inline paragraph properties)
   * 3. textIndentPx - from attrs.textIndent (legacy/alternative format)
   * 4. attrsIndentPx - from attrs.indent (direct paragraph attributes - highest priority)
   *
   * This follows the standard OOXML cascade: styles < inline properties < direct attributes.
   * The `combineIndentProperties` function merges these in order, where later entries
   * override earlier ones for the same property.
   */
  const hydratedIndentPx = convertIndentTwipsToPx(hydrated?.indent as ParagraphIndent);
  const paragraphIndentPx = convertIndentTwipsToPx(paragraphProps.indent as ParagraphIndent);
  const textIndentPx = normalizeParagraphIndent(attrs.textIndent);
  const attrsIndentPx = normalizeIndentObject(attrs.indent);

  const indentChain: Array<Record<string, unknown>> = [];
  if (hydratedIndentPx) indentChain.push({ indent: hydratedIndentPx });
  if (paragraphIndentPx) indentChain.push({ indent: paragraphIndentPx });
  if (textIndentPx) indentChain.push({ indent: textIndentPx });
  if (attrsIndentPx) indentChain.push({ indent: attrsIndentPx });

  const normalizedIndent = indentChain.length
    ? (combineIndentProperties(indentChain).indent as ParagraphIndent | undefined)
    : undefined;

  /**
   * Unwraps and normalizes tab stop data structures from various formats.
   *
   * Handles two primary formats:
   * 1. Nested format: `{ tab: { tabType: 'start', pos: 720 } }` (OOXML-style)
   * 2. Direct format: `{ val: 'start', pos: 720 }` (normalized)
   *
   * Performs runtime validation to ensure:
   * - Input is an array
   * - Each entry is an object with valid structure
   * - Required properties (val/tabType and pos) are present and correctly typed
   * - Optional properties (leader, originalPos) are validated if present
   *
   * @param tabStops - Unknown input that may contain tab stop data
   * @returns Array of normalized tab stop objects, or undefined if invalid/empty
   *
   * @example
   * ```typescript
   * // Nested format
   * unwrapTabStops([{ tab: { tabType: 'start', pos: 720 } }])
   * // Returns: [{ val: 'start', pos: 720 }]
   *
   * // Direct format
   * unwrapTabStops([{ val: 'center', pos: 1440, leader: 'dot' }])
   * // Returns: [{ val: 'center', pos: 1440, leader: 'dot' }]
   *
   * // Invalid input
   * unwrapTabStops("not an array")
   * // Returns: undefined
   * ```
   */
  const unwrapTabStops = (tabStops: unknown): Array<Record<string, unknown>> | undefined => {
    // Runtime type guard: validate input is an array
    if (!Array.isArray(tabStops)) {
      return undefined;
    }

    const unwrapped: Array<Record<string, unknown>> = [];

    for (const entry of tabStops) {
      // Runtime type guard: validate entry is a non-null object
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      // Type guard: check for nested format { tab: {...} }
      if ('tab' in entry) {
        const entryRecord = entry as Record<string, unknown>;
        const tab = entryRecord.tab;

        // Validate tab property is a non-null object
        if (!tab || typeof tab !== 'object') {
          continue;
        }

        const tabObj = tab as Record<string, unknown>;

        // Validate and extract val (alignment type)
        const val =
          typeof tabObj.tabType === 'string' ? tabObj.tabType : typeof tabObj.val === 'string' ? tabObj.val : undefined;

        // Validate and extract pos (position in twips)
        // Priority: originalPos > pos. If originalPos is absent, preserve pos as both pos and originalPos
        // so downstream normalization (which doesn't know about nesting) keeps twips and skips px heuristics.
        const originalPos = pickNumber(tabObj.originalPos);
        const pos = originalPos ?? pickNumber(tabObj.pos);

        // Skip entry if required fields are missing or invalid
        if (!val || pos == null) {
          continue;
        }

        // Build normalized tab stop object with validated properties
        const normalized: Record<string, unknown> = { val, pos };

        // Set originalPos when available; if absent, mirror pos to preserve twips through later flattening
        if (originalPos != null && Number.isFinite(originalPos)) {
          normalized.originalPos = originalPos;
        } else {
          normalized.originalPos = pos;
        }

        // Validate and add optional leader property
        const leader = tabObj.leader;
        if (typeof leader === 'string' && leader.length > 0) {
          normalized.leader = leader;
        }

        unwrapped.push(normalized);
        continue;
      }

      // Direct format - entry is already a tab stop object
      // Validate it has the expected structure before adding
      const entryRecord = entry as Record<string, unknown>;

      // Check if it has at least the basic tab stop properties
      const hasValidStructure =
        ('val' in entryRecord || 'tabType' in entryRecord) && ('pos' in entryRecord || 'originalPos' in entryRecord);

      if (hasValidStructure) {
        unwrapped.push(entryRecord);
      }
    }

    return unwrapped.length > 0 ? unwrapped : undefined;
  };

  const styleNodeAttrs = { ...attrs };
  const asTabStopArray = (value: unknown): Array<Record<string, unknown>> | undefined => {
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : undefined;
  };
  const attrTabStops =
    unwrapTabStops(styleNodeAttrs.tabStops ?? styleNodeAttrs.tabs) ?? asTabStopArray(styleNodeAttrs.tabStops);
  const hydratedTabStops = unwrapTabStops(hydrated?.tabStops) ?? asTabStopArray(hydrated?.tabStops);
  const paragraphTabStops = unwrapTabStops(paragraphProps.tabStops) ?? asTabStopArray(paragraphProps.tabStops);

  // Keep the unit heuristic aligned with normalizeOoxmlTabs.
  const TAB_STOP_PX_TO_TWIPS = 15;
  const TAB_STOP_TWIPS_THRESHOLD = 1000;

  const getTabStopPosition = (entry: Record<string, unknown>): number | undefined => {
    const originalPos = pickNumber(entry.originalPos);
    if (originalPos != null) return originalPos;
    const posValue = pickNumber(entry.pos ?? entry.position ?? entry.offset);
    if (posValue == null) return undefined;
    return posValue > TAB_STOP_TWIPS_THRESHOLD ? posValue : Math.round(posValue * TAB_STOP_PX_TO_TWIPS);
  };

  const mergeTabStopSources = (
    ...sources: Array<Array<Record<string, unknown>> | undefined>
  ): Array<Record<string, unknown>> | undefined => {
    const merged = new Map<number, Record<string, unknown>>();
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      for (const stop of source) {
        if (!stop || typeof stop !== 'object') continue;
        const position = getTabStopPosition(stop);
        if (position == null) continue;
        merged.set(position, { ...stop });
      }
    }
    if (merged.size === 0) return undefined;
    return Array.from(merged.entries())
      .sort(([a], [b]) => a - b)
      .map(([, stop]) => stop);
  };

  const mergedTabStops = mergeTabStopSources(hydratedTabStops, paragraphTabStops, attrTabStops);

  if (mergedTabStops) {
    styleNodeAttrs.tabStops = mergedTabStops;
    if ('tabs' in styleNodeAttrs) {
      delete styleNodeAttrs.tabs;
    }
  }

  const styleNode = buildStyleNodeFromAttrs(styleNodeAttrs, normalizedSpacing, normalizedIndent);
  if (styleNodeAttrs.styleId == null && paragraphProps.styleId) {
    styleNode.styleId = paragraphProps.styleId as string;
  }
  const computed = resolveStyle(styleNode, styleContext);
  const { spacing, indent } = resolveSpacingIndent(computed.paragraph, computed.numbering);

  const paragraphAttrs: ParagraphAttrs = {};
  const bidi = resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi') === true;
  const adjustRightInd = resolveParagraphBooleanAttr(para, 'adjustRightInd', 'w:adjustRightInd') === true;

  if (bidi) {
    paragraphAttrs.direction = 'rtl';
    paragraphAttrs.rtl = true;
  }

  /**
   * Paragraph alignment priority cascade (6 levels, highest to lowest):
   *
   * 1. bidi + adjustRightInd: Forced right alignment for BiDi paragraphs with right indent adjustment
   * 2. explicitAlignment: Direct alignment attribute on the paragraph node (attrs.alignment or attrs.textAlign)
   * 3. paragraphAlignment: Paragraph justification from paragraphProperties (inline paragraph-level formatting)
   * 4. bidi alone: Default right alignment for BiDi paragraphs without explicit alignment
   * 5. styleAlignment: Alignment from hydrated paragraph style (style-based formatting)
   * 6. computed.paragraph.alignment: Fallback alignment from style engine computation
   *
   * This cascade ensures that inline paragraph properties (level 3) correctly override style-based
   * alignment (levels 5-6), matching Microsoft Word's behavior where direct paragraph formatting
   * takes precedence over style-based formatting.
   */
  const explicitAlignment = normalizeAlignment(attrs.alignment ?? attrs.textAlign);
  const paragraphAlignment =
    typeof paragraphProps.justification === 'string' ? normalizeAlignment(paragraphProps.justification) : undefined;
  const styleAlignment = hydrated?.alignment ? normalizeAlignment(hydrated.alignment) : undefined;

  if (bidi && adjustRightInd) {
    paragraphAttrs.alignment = 'right';
  } else if (explicitAlignment) {
    paragraphAttrs.alignment = explicitAlignment;
  } else if (paragraphAlignment) {
    // Inline paragraph justification should override style-derived alignment
    paragraphAttrs.alignment = paragraphAlignment;
  } else if (bidi) {
    // RTL paragraphs without explicit alignment default to right
    paragraphAttrs.alignment = 'right';
  } else if (styleAlignment) {
    paragraphAttrs.alignment = styleAlignment;
  } else if (computed.paragraph.alignment) {
    paragraphAttrs.alignment = normalizeAlignment(computed.paragraph.alignment);
  }

  const spacingPx = spacingPtToPx(spacing, normalizedSpacing);
  if (spacingPx) paragraphAttrs.spacing = spacingPx;
  if (normalizedSpacing?.beforeAutospacing != null || normalizedSpacing?.afterAutospacing != null) {
    paragraphAttrs.spacing = paragraphAttrs.spacing ?? {};
    if (normalizedSpacing?.beforeAutospacing != null) {
      (paragraphAttrs.spacing as Record<string, unknown>).beforeAutospacing = normalizedSpacing.beforeAutospacing;
    }
    if (normalizedSpacing?.afterAutospacing != null) {
      (paragraphAttrs.spacing as Record<string, unknown>).afterAutospacing = normalizedSpacing.afterAutospacing;
    }
  }
  paragraphAttrs.spacingExplicit = spacingExplicit;
  /**
   * Extract contextualSpacing from multiple sources with fallback chain.
   *
   * OOXML stores contextualSpacing (w:contextualSpacing) as a sibling to spacing (w:spacing),
   * not nested within it. However, our normalization may place it in different locations.
   *
   * Fallback priority (highest to lowest):
   * 1. normalizedSpacing.contextualSpacing - Value from normalized spacing object
   * 2. paragraphProps.contextualSpacing - Direct property on paragraphProperties
   * 3. attrs.contextualSpacing - Top-level attribute
   * 4. hydrated.contextualSpacing - Value resolved from paragraph style chain
   *
   * The hydrated fallback (priority 4) is critical for style-defined contextualSpacing,
   * such as the ListBullet style which defines w:contextualSpacing to suppress spacing
   * between consecutive list items of the same style ("Don't add space between paragraphs
   * of the same style" in MS Word).
   *
   * OOXML Boolean Handling:
   * - Supports multiple representations: true, 1, '1', 'true', 'on'
   * - Uses isTruthy() to handle all valid OOXML boolean forms
   * - Treats null/undefined as "not set" (no contextualSpacing)
   */
  const contextualSpacingValue =
    normalizedSpacing?.contextualSpacing ??
    safeGetProperty(paragraphProps, 'contextualSpacing') ??
    safeGetProperty(attrs, 'contextualSpacing') ??
    hydrated?.contextualSpacing;

  if (contextualSpacingValue != null) {
    // Use isTruthy to properly handle OOXML boolean representations (true, 1, '1', 'true', 'on')
    paragraphAttrs.contextualSpacing = isTruthy(contextualSpacingValue);
  }

  const hasExplicitIndent = Boolean(normalizedIndent);
  const hasNumberingIndent = Boolean(computed.numbering?.indent?.left || computed.numbering?.indent?.hanging);
  if (hasExplicitIndent || hasNumberingIndent || (bidi && adjustRightInd)) {
    const styleIndentPx = indentPtToPx(indent);

    if (styleIndentPx || normalizedIndent) {
      // Merge style-resolved indent with explicitly set indent (normalizedIndent has priority).
      // The normalizedIndent already has firstLine/hanging mutual exclusivity handled by combineIndentProperties.
      const mergedIndent: ParagraphIndent = { ...(styleIndentPx ?? {}) };

      // Apply explicit indent values, which override style defaults
      if (normalizedIndent) {
        // Copy explicit values from normalizedIndent
        // Note: Zero left/right are treated as "no indent" and filtered out (cosmetic optimization),
        // but zero firstLine/hanging are meaningful overrides and must be preserved.
        if (normalizedIndent.left !== undefined) {
          if (normalizedIndent.left === 0) {
            delete mergedIndent.left; // Zero left is cosmetic, filter it out
          } else {
            mergedIndent.left = normalizedIndent.left;
          }
        }
        if (normalizedIndent.right !== undefined) {
          if (normalizedIndent.right === 0) {
            delete mergedIndent.right; // Zero right is cosmetic, filter it out
          } else {
            mergedIndent.right = normalizedIndent.right;
          }
        }
        if (normalizedIndent.firstLine !== undefined) mergedIndent.firstLine = normalizedIndent.firstLine;
        if (normalizedIndent.hanging !== undefined) mergedIndent.hanging = normalizedIndent.hanging;

        // Handle firstLine/hanging mutual exclusivity: if normalizedIndent has hanging (and thus
        // firstLine was deleted by combineIndentProperties), remove firstLine from merged result.
        // Similarly, if normalizedIndent has firstLine, remove hanging.
        if (normalizedIndent.hanging !== undefined && normalizedIndent.firstLine === undefined) {
          delete mergedIndent.firstLine;
        } else if (normalizedIndent.firstLine !== undefined && normalizedIndent.hanging === undefined) {
          delete mergedIndent.hanging;
        }
      }

      const adjustedIndent = bidi && adjustRightInd ? ensureBidiIndentPx({ ...mergedIndent }) : mergedIndent;
      const finalIndent = bidi && adjustRightInd ? mirrorIndentForRtl({ ...adjustedIndent }) : adjustedIndent;
      paragraphAttrs.indent = finalIndent;
    } else if (bidi && adjustRightInd) {
      const syntheticIndent: ParagraphIndent = { left: DEFAULT_BIDI_INDENT_PX, right: DEFAULT_BIDI_INDENT_PX };
      const finalIndent = mirrorIndentForRtl({ ...syntheticIndent });
      paragraphAttrs.indent = finalIndent;
    }
  }

  const borders = normalizeParagraphBorders(attrs.borders ?? hydrated?.borders ?? paragraphProps.borders);
  if (borders) paragraphAttrs.borders = borders;

  const shading = normalizeParagraphShading(attrs.shading ?? hydrated?.shading ?? paragraphProps.shading);
  if (shading) paragraphAttrs.shading = shading;

  const keepNext = paragraphProps.keepNext ?? hydrated?.keepNext ?? attrs.keepNext;
  if (keepNext === true) paragraphAttrs.keepNext = true;
  const keepLines = paragraphProps.keepLines ?? hydrated?.keepLines ?? attrs.keepLines;
  if (keepLines === true) paragraphAttrs.keepLines = true;

  const paragraphDecimalSeparator = styleContext.defaults?.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR;
  if (paragraphDecimalSeparator !== DEFAULT_DECIMAL_SEPARATOR) {
    paragraphAttrs.decimalSeparator = paragraphDecimalSeparator;
  }
  const styleIdAttr = typeof attrs.styleId === 'string' ? attrs.styleId : undefined;
  if (styleIdAttr) {
    paragraphAttrs.styleId = styleIdAttr;
  } else if (paragraphProps.styleId) {
    paragraphAttrs.styleId = paragraphProps.styleId as string;
  }

  // Per‑paragraph tab interval override (px or twips)
  const paraIntervalTwips =
    pickNumber(attrs.tabIntervalTwips) ??
    ((): number | undefined => {
      const px = pickNumber(attrs.tabIntervalPx);
      return px != null ? Math.round(px * 15) : undefined;
    })();
  const defaultIntervalTwips = styleContext.defaults?.defaultTabIntervalTwips;
  if (paraIntervalTwips != null) {
    paragraphAttrs.tabIntervalTwips = paraIntervalTwips;
  } else if (defaultIntervalTwips != null) {
    paragraphAttrs.tabIntervalTwips = defaultIntervalTwips;
  }

  if (computed.paragraph.tabs && computed.paragraph.tabs.length > 0) {
    paragraphAttrs.tabs = computed.paragraph.tabs.map((tab) => ({ ...tab }));
  } else if (mergedTabStops) {
    const normalizedTabs = normalizeOoxmlTabs(mergedTabStops as unknown);
    if (normalizedTabs) {
      paragraphAttrs.tabs = normalizedTabs;
    }
  } else if (hydratedTabStops) {
    const normalizedTabs = normalizeOoxmlTabs(hydratedTabStops as unknown);
    if (normalizedTabs) {
      paragraphAttrs.tabs = normalizedTabs;
    }
  }

  /**
   * Safely converts an unknown value to a string.
   *
   * @param value - The value to convert
   * @returns The value as a string if it is a string, otherwise undefined
   */
  const asString = (value: unknown): string | undefined => {
    return typeof value === 'string' ? value : undefined;
  };

  /**
   * Normalizes framePr data from various input formats to a consistent object structure.
   *
   * OOXML framePr (w:framePr) defines paragraph positioning and floating text alignment,
   * commonly used for positioned elements like page numbers in headers/footers.
   *
   * This function handles three different input structures:
   * 1. Direct object with frame properties: `{ xAlign: 'right', yAlign: 'top', ... }`
   * 2. Wrapped in attributes object: `{ attributes: { xAlign: 'right', ... } }`
   * 3. Invalid/missing data: returns undefined
   *
   * @param value - The framePr value from OOXML parsing, which may be in various formats
   * @returns A record containing the frame properties, or undefined if invalid
   *
   * @example
   * // Direct object
   * normalizeFramePr({ xAlign: 'right', yAlign: 'top' })
   * // => { xAlign: 'right', yAlign: 'top' }
   *
   * @example
   * // Wrapped in attributes
   * normalizeFramePr({ attributes: { xAlign: 'right' } })
   * // => { xAlign: 'right' }
   *
   * @example
   * // Invalid input
   * normalizeFramePr(null)
   * // => undefined
   */
  const normalizeFramePr = (value: unknown): Record<string, unknown> | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (record.attributes && typeof record.attributes === 'object') {
      return record.attributes as Record<string, unknown>;
    }
    return record;
  };

  /**
   * Extracts framePr from raw OOXML elements array in paragraphProperties.
   *
   * This handles the case where framePr is stored as a raw OOXML element
   * (from ProseMirror serialization) rather than as a decoded object.
   *
   * @param paragraphProperties - The paragraphProperties object that may contain elements array
   * @returns The framePr attributes if found, otherwise undefined
   */
  const extractFramePrFromElements = (paragraphProperties: unknown): Record<string, unknown> | undefined => {
    if (!paragraphProperties || typeof paragraphProperties !== 'object') return undefined;
    const pPr = paragraphProperties as Record<string, unknown>;
    if (!Array.isArray(pPr.elements)) return undefined;
    const framePrElement = pPr.elements.find((el: Record<string, unknown>) => el.name === 'w:framePr');
    if (framePrElement?.attributes && typeof framePrElement.attributes === 'object') {
      return framePrElement.attributes as Record<string, unknown>;
    }
    return undefined;
  };

  // Extract floating alignment and positioning from framePr (OOXML w:framePr).
  // Used for positioned paragraphs like right-aligned page numbers in headers/footers.
  //
  // Three-tier lookup strategy to handle different data sources:
  // 1. attrs.framePr - Top-level framePr from the converter (most direct path)
  // 2. attrs.paragraphProperties.framePr - Decoded framePr object from v3 translator
  // 3. attrs.paragraphProperties.elements[name='w:framePr'] - Raw OOXML element from PM serialization
  const framePr =
    normalizeFramePr(attrs.framePr) ??
    normalizeFramePr((attrs.paragraphProperties as Record<string, unknown> | undefined)?.framePr) ??
    extractFramePrFromElements(attrs.paragraphProperties);

  if (framePr) {
    const rawXAlign = asString(framePr['w:xAlign'] ?? framePr.xAlign);
    const xAlign = typeof rawXAlign === 'string' ? rawXAlign.toLowerCase() : undefined;
    // Only set floatAlignment if xAlign is a valid value
    if (xAlign === 'left' || xAlign === 'right' || xAlign === 'center') {
      paragraphAttrs.floatAlignment = xAlign;
    }

    const dropCap = framePr['w:dropCap'] ?? framePr.dropCap;
    if (
      dropCap != null &&
      (typeof dropCap === 'string' || typeof dropCap === 'number' || typeof dropCap === 'boolean')
    ) {
      // Keep the legacy dropCap flag for backward compatibility
      paragraphAttrs.dropCap = dropCap;

      // Build structured DropCapDescriptor for enhanced drop cap support
      const dropCapMode = typeof dropCap === 'string' ? dropCap.toLowerCase() : 'drop';
      const linesValue = pickNumber(framePr['w:lines'] ?? framePr.lines);
      const wrapValue = asString(framePr['w:wrap'] ?? framePr.wrap);

      // Extract the drop cap text and run styling from paragraph content
      const dropCapRunInfo = extractDropCapRunFromParagraph(para);

      if (dropCapRunInfo) {
        const descriptor: DropCapDescriptor = {
          mode: dropCapMode === 'margin' ? 'margin' : 'drop',
          lines: linesValue != null && linesValue > 0 ? linesValue : 3,
          run: dropCapRunInfo,
        };

        // Map wrap value to the expected types
        if (wrapValue) {
          const normalizedWrap = wrapValue.toLowerCase();
          if (
            normalizedWrap === 'around' ||
            normalizedWrap === 'notbeside' ||
            normalizedWrap === 'none' ||
            normalizedWrap === 'tight'
          ) {
            descriptor.wrap =
              normalizedWrap === 'notbeside' ? 'notBeside' : (normalizedWrap as 'around' | 'none' | 'tight');
          }
        }

        paragraphAttrs.dropCapDescriptor = descriptor;
      }
    }

    const frame: ParagraphAttrs['frame'] = {};
    const wrap = asString(framePr['w:wrap'] ?? framePr.wrap);
    if (wrap) frame.wrap = wrap;

    // Set xAlign in frame (accepts any string, validation deferred to renderer)
    if (xAlign) {
      frame.xAlign = xAlign as 'left' | 'right' | 'center';
    }

    // yAlign: Accept any string value, validation deferred to renderer
    const rawYAlign = asString(framePr['w:yAlign'] ?? framePr.yAlign);
    if (rawYAlign) {
      frame.yAlign = rawYAlign as 'top' | 'center' | 'bottom';
    }

    const hAnchor = asString(framePr['w:hAnchor'] ?? framePr.hAnchor);
    if (hAnchor) frame.hAnchor = hAnchor;
    const vAnchor = asString(framePr['w:vAnchor'] ?? framePr.vAnchor);
    if (vAnchor) frame.vAnchor = vAnchor;

    const xTwips = pickNumber(framePr['w:x'] ?? framePr.x);
    if (xTwips != null) frame.x = twipsToPx(xTwips);
    const yTwips = pickNumber(framePr['w:y'] ?? framePr.y);
    if (yTwips != null) frame.y = twipsToPx(yTwips);

    if (Object.keys(frame).length > 0) {
      paragraphAttrs.frame = frame;
    }
  }

  // Track B: Compute wordLayout for paragraphs with numberingProperties
  const listRendering = normalizeListRenderingAttrs(attrs.listRendering);
  const numberingSource =
    attrs.numberingProperties ?? paragraphProps.numberingProperties ?? hydrated?.numberingProperties;
  let rawNumberingProps = toAdapterNumberingProps(numberingSource);

  /**
   * Fallback mechanism for table paragraphs with list rendering but no numbering properties.
   *
   * **Why this is needed:**
   * Some document sources (particularly table cells imported from certain formats) provide
   * listRendering attributes (marker text, path, styling) but lack the traditional OOXML
   * numberingProperties structure (numId, ilvl). This fallback synthesizes minimal
   * numbering properties from the listRendering data to ensure list markers render correctly.
   *
   * **When this is used:**
   * - Table paragraphs that have listRendering but no numberingProperties
   * - Imported documents where numbering context was lost but visual marker info was preserved
   * - Fallback rendering path when traditional OOXML numbering is unavailable
   *
   * **Synthesis logic:**
   * - `numId`: Set to -1 (sentinel value indicating synthesized/unavailable)
   * - `ilvl`: Calculated from path length (path.length - 1), defaults to 0
   * - `path`: Preserved from listRendering (e.g., [1, 2, 3] for nested lists)
   * - `counterValue`: Extracted from last element of path array
   * - Other properties (markerText, format, justification, suffix) copied from listRendering
   */
  if (!rawNumberingProps && listRendering) {
    const path = listRendering.path;
    const counterFromPath = path && path.length ? path[path.length - 1] : undefined;
    const ilvl = path && path.length > 1 ? path.length - 1 : 0;

    rawNumberingProps = {
      numId: -1,
      ilvl,
      path,
      counterValue: Number.isFinite(counterFromPath) ? Number(counterFromPath) : undefined,
      markerText: listRendering.markerText,
      format: listRendering.numberingType as NumberingFormat | undefined,
      lvlJc: listRendering.justification,
      suffix: listRendering.suffix,
    } as AdapterNumberingProps;
  }

  /**
   * Validates that the paragraph has valid numbering properties.
   * Per OOXML spec §17.9.16, numId="0" (or '0') is a special sentinel value that disables
   * numbering inherited from paragraph styles. We skip word layout processing entirely for numId=0.
   */
  const hasValidNumbering = rawNumberingProps && isValidNumberingId(rawNumberingProps.numId);
  if (hasValidNumbering && rawNumberingProps) {
    const numberingProps = rawNumberingProps;
    const numId = numberingProps.numId;
    const ilvl = Number.isFinite(numberingProps.ilvl) ? Math.max(0, Math.floor(Number(numberingProps.ilvl))) : 0;
    const numericNumId = typeof numId === 'number' ? numId : undefined;

    // Resolve numbering definition details (format, text, indent, marker run) from converter context
    let resolvedLevel: Partial<AdapterNumberingProps> | undefined;
    try {
      resolvedLevel = resolveNumberingFromContext(numId, ilvl, converterContext?.numbering);
    } catch (error) {
      resolvedLevel = undefined;
    }

    if (resolvedLevel) {
      if (resolvedLevel.format && numberingProps.format == null) {
        numberingProps.format = resolvedLevel.format;
      }
      if (resolvedLevel.lvlText && numberingProps.lvlText == null) {
        numberingProps.lvlText = resolvedLevel.lvlText;
      }
      if (resolvedLevel.start != null && numberingProps.start == null) {
        numberingProps.start = resolvedLevel.start;
      }
      if (resolvedLevel.suffix && numberingProps.suffix == null) {
        numberingProps.suffix = resolvedLevel.suffix;
      }
      if (resolvedLevel.lvlJc && numberingProps.lvlJc == null) {
        numberingProps.lvlJc = resolvedLevel.lvlJc;
      }
      if (resolvedLevel.resolvedLevelIndent && !numberingProps.resolvedLevelIndent) {
        numberingProps.resolvedLevelIndent = resolvedLevel.resolvedLevelIndent;
      }
      if (resolvedLevel.resolvedMarkerRpr && !numberingProps.resolvedMarkerRpr) {
        numberingProps.resolvedMarkerRpr = resolvedLevel.resolvedMarkerRpr;
      }
    }

    // Track B: Increment list counter and build path array
    let counterValue = 1;
    if (listCounterContext && typeof numericNumId === 'number') {
      counterValue = listCounterContext.incrementListCounter(numericNumId, ilvl);

      // Reset deeper levels when returning to a shallower level
      // (e.g., going from level 1 back to level 0 should reset level 1's counter)
      for (let deeperLevel = ilvl + 1; deeperLevel <= 8; deeperLevel++) {
        listCounterContext.resetListCounter(numericNumId, deeperLevel);
      }
    }

    // Build path array for multi-level numbering (e.g., "1.2.3")
    const path =
      (listRendering?.path && listRendering.path.length ? listRendering.path : undefined) ??
      buildNumberingPath(numericNumId, ilvl, counterValue, listCounterContext);
    const resolvedCounterValue = path[path.length - 1] ?? counterValue;

    // Enrich numberingProperties with path and counter info
    // Explicitly include numId and ilvl to satisfy TypeScript since they are required
    const enrichedNumberingProps: AdapterNumberingProps = {
      ...numberingProps,
      numId: numberingProps.numId,
      ilvl: numberingProps.ilvl,
      path,
      counterValue: resolvedCounterValue,
    };

    if (listRendering?.numberingType && enrichedNumberingProps.format == null) {
      enrichedNumberingProps.format = listRendering.numberingType as NumberingFormat;
    }
    if (listRendering?.markerText && enrichedNumberingProps.markerText == null) {
      enrichedNumberingProps.markerText = listRendering.markerText;
    }
    if (listRendering?.justification && enrichedNumberingProps.lvlJc == null) {
      enrichedNumberingProps.lvlJc = listRendering.justification;
    }
    if (listRendering?.suffix && enrichedNumberingProps.suffix == null) {
      enrichedNumberingProps.suffix = listRendering.suffix;
    }

    // Try to get marker run properties from numbering definition if not pre-resolved
    // Do NOT set hardcoded defaults here - let computeWordLayoutForParagraph use
    // style-engine fallback to resolve from paragraph style (matching MS Word behavior)
    if (!enrichedNumberingProps.resolvedMarkerRpr) {
      const numbering = computed.numbering as unknown as Record<string, unknown> | undefined;
      if (numbering && typeof numbering.marker === 'object' && numbering.marker !== null) {
        const marker = numbering.marker as Record<string, unknown>;
        if (typeof marker.run === 'object' && marker.run !== null) {
          enrichedNumberingProps.resolvedMarkerRpr = marker.run as ResolvedRunProperties;
        }
      }
      // NOTE: If still not resolved, computeWordLayoutForParagraph will use
      // style-engine to resolve from paragraph style, which is the correct MS Word behavior
    }

    let wordLayout: WordParagraphLayoutOutput | null = null;
    try {
      wordLayout = computeWordLayoutForParagraph(
        paragraphAttrs,
        enrichedNumberingProps,
        styleContext,
        para,
        converterContext,
        hydrated?.resolved as Record<string, unknown> | undefined,
      );
    } catch (error) {
      wordLayout = null;
    }

    // Fallback: some numbering levels only specify a firstLine indent (no left/hanging).
    // When wordLayout computation returns null, ensure we still provide a textStartPx
    // so first-line wrapping in columns has the correct width.
    if (!wordLayout && enrichedNumberingProps.resolvedLevelIndent) {
      const resolvedIndentPx = convertIndentTwipsToPx(enrichedNumberingProps.resolvedLevelIndent);
      const baseIndent = resolvedIndentPx ?? enrichedNumberingProps.resolvedLevelIndent;
      const mergedIndent = { ...baseIndent, ...(paragraphAttrs.indent ?? {}) };
      const firstLinePx = isFiniteNumber(mergedIndent.firstLine) ? mergedIndent.firstLine : 0;
      const hangingPx = isFiniteNumber(mergedIndent.hanging) ? mergedIndent.hanging : 0;
      if (firstLinePx > 0 && !hangingPx) {
        wordLayout = {
          // Treat as first-line-indent mode: text starts after the marker+firstLine offset.
          firstLineIndentMode: true,
          textStartPx: firstLinePx,
        } as WordParagraphLayoutOutput;
      }
    }

    // If computeWordLayout returned an object but did not provide textStartPx and
    // the numbering indent has a firstLine value, set a minimal textStartPx to
    // match the resolved first-line indent. This guards against cases where
    // word-layout computation omits textStart for levels without left/hanging.
    if (wordLayout && !Number.isFinite(wordLayout.textStartPx) && enrichedNumberingProps.resolvedLevelIndent) {
      const resolvedIndentPx = convertIndentTwipsToPx(enrichedNumberingProps.resolvedLevelIndent);
      const baseIndent = resolvedIndentPx ?? enrichedNumberingProps.resolvedLevelIndent;
      const mergedIndent = { ...baseIndent, ...(paragraphAttrs.indent ?? {}) };
      const firstLinePx = isFiniteNumber(mergedIndent.firstLine) ? mergedIndent.firstLine : 0;
      const hangingPx = isFiniteNumber(mergedIndent.hanging) ? mergedIndent.hanging : 0;
      if (firstLinePx > 0 && !hangingPx) {
        wordLayout = {
          ...wordLayout,
          firstLineIndentMode: wordLayout.firstLineIndentMode ?? true,
          textStartPx: firstLinePx,
        };
      }
    }

    if (wordLayout) {
      if (wordLayout.marker) {
        if (listRendering?.markerText) {
          wordLayout.marker.markerText = listRendering.markerText;
        }
        if (listRendering?.justification) {
          wordLayout.marker.justification = listRendering.justification;
        }
        if (listRendering?.suffix) {
          wordLayout.marker.suffix = listRendering.suffix;
        }
      }
      wordLayout = normalizeWordLayoutForIndent(wordLayout, paragraphAttrs.indent);
      paragraphAttrs.wordLayout = wordLayout;
    }

    // Always merge resolvedLevelIndent into paragraphAttrs.indent, regardless of wordLayout success.
    // This ensures sublists get correct indentation even if wordLayout computation fails.
    // Per OOXML spec, paragraph indent MERGES with numbering definition:
    // - Numbering definition provides base values (left, hanging from level)
    // - Paragraph's explicit indent properties override specific values
    // - Missing paragraph indent properties inherit from numbering definition
    // This fixes cases where a paragraph only specifies w:hanging but should
    // inherit w:left from the numbering level definition.
    if (enrichedNumberingProps.resolvedLevelIndent) {
      const resolvedIndentPx = convertIndentTwipsToPx(enrichedNumberingProps.resolvedLevelIndent);
      const baseIndent = resolvedIndentPx ?? enrichedNumberingProps.resolvedLevelIndent;

      // Merge: numbering definition as base, paragraph explicit values override
      paragraphAttrs.indent = {
        ...baseIndent,
        ...(normalizedIndent ?? {}),
      };

      // In OOXML, hanging and firstLine are mutually exclusive.
      // If the paragraph explicitly specifies one, the other should be cleared.
      // This ensures proper marker positioning when paragraph overrides numbering indent.
      if (normalizedIndent?.firstLine !== undefined) {
        delete paragraphAttrs.indent.hanging;
      } else if (normalizedIndent?.hanging !== undefined) {
        delete paragraphAttrs.indent.firstLine;
      }
    }

    // Preserve numberingProperties for downstream consumers (e.g., measurement stage)
    paragraphAttrs.numberingProperties = enrichedNumberingProps as Record<string, unknown>;
  }

  return Object.keys(paragraphAttrs).length > 0 ? paragraphAttrs : undefined;
};

/**
 * Merge two paragraph attributes, with override taking precedence.
 */
export const mergeParagraphAttrs = (base?: ParagraphAttrs, override?: ParagraphAttrs): ParagraphAttrs | undefined => {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;

  const merged: ParagraphAttrs = { ...base };
  if (override.alignment) {
    merged.alignment = override.alignment;
  }
  if (override.spacing) {
    merged.spacing = { ...(base.spacing ?? {}), ...override.spacing };
  }
  if (override.indent) {
    merged.indent = { ...(base.indent ?? {}), ...override.indent };
    // In OOXML, hanging and firstLine are mutually exclusive.
    // If override specifies one, clear the other from the merged result.
    if (override.indent.firstLine !== undefined) {
      delete merged.indent.hanging;
    } else if (override.indent.hanging !== undefined) {
      delete merged.indent.firstLine;
    }
  }
  if (override.borders) {
    merged.borders = { ...(base.borders ?? {}), ...override.borders };
  }
  if (override.shading) {
    merged.shading = { ...(base.shading ?? {}), ...override.shading };
  }
  return merged;
};

/**
 * Convert list paragraph attributes to paragraph attrs format.
 */
export const convertListParagraphAttrs = (attrs?: Record<string, unknown>): ParagraphAttrs | undefined => {
  if (!attrs) return undefined;
  const paragraphAttrs: ParagraphAttrs = {};

  const alignment = normalizeAlignment(attrs.alignment ?? attrs.lvlJc);
  if (alignment) paragraphAttrs.alignment = alignment;

  const spacing = normalizeParagraphSpacing(attrs.spacing);
  if (spacing) paragraphAttrs.spacing = spacing;

  const shading = normalizeParagraphShading(attrs.shading);
  if (shading) paragraphAttrs.shading = shading;

  return Object.keys(paragraphAttrs).length > 0 ? paragraphAttrs : undefined;
};
