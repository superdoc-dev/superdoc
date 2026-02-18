import type { BoxSpacing } from '@superdoc/contracts';
import { _getReferencedTableStyles } from '@superdoc/super-editor/converter/internal/v3/handlers/w/tbl/tbl-translator.js';
import type { PMNode } from '../types.js';
import type { ConverterContext, TableStyleParagraphProps } from '../converter-context.js';
import { hasTableStyleContext } from '../converter-context.js';
import { twipsToPx } from '../utilities.js';
import { normalizeLineValue } from '../attributes/spacing-indent.js';

export type TableStyleHydration = {
  borders?: Record<string, unknown>;
  cellPadding?: BoxSpacing;
  justification?: string;
  tableWidth?: { width?: number; type?: string };
  /**
   * Paragraph properties from the table style's w:pPr element.
   * Per OOXML spec, these should apply to all paragraphs inside the table
   * as part of the style cascade: docDefaults → table style pPr → paragraph style → direct formatting.
   */
  paragraphProps?: TableStyleParagraphProps;
};

/**
 * Hydrates table-level attributes from a table style definition.
 *
 * The hydrator never mutates the PM node and only returns new objects,
 * so callers must merge the result with the node's attrs explicitly.
 */
export const hydrateTableStyleAttrs = (tableNode: PMNode, context?: ConverterContext): TableStyleHydration | null => {
  const hydration: TableStyleHydration = {};
  const tableProps = (tableNode.attrs?.tableProperties ?? null) as Record<string, unknown> | null;

  if (tableProps) {
    const padding = convertCellMarginsToPx(tableProps.cellMargins as Record<string, unknown>);
    if (padding) hydration.cellPadding = padding;

    if (tableProps.borders && typeof tableProps.borders === 'object') {
      hydration.borders = clonePlainObject(tableProps.borders as Record<string, unknown>);
    }

    if (!hydration.justification && typeof tableProps.justification === 'string') {
      hydration.justification = tableProps.justification;
    }

    const tableWidth = normalizeTableWidth(tableProps.tableWidth);
    if (tableWidth) {
      hydration.tableWidth = tableWidth;
    }
  }

  const styleId = typeof tableNode.attrs?.tableStyleId === 'string' ? tableNode.attrs.tableStyleId : undefined;
  if (styleId && hasTableStyleContext(context)) {
    // Cast to bypass JSDoc type mismatch - the JS function actually accepts { docx }
    const referenced = _getReferencedTableStyles(styleId, { docx: context!.docx } as never);
    if (referenced) {
      if (!hydration.borders && referenced.borders) {
        hydration.borders = clonePlainObject(referenced.borders);
      }
      if (!hydration.cellPadding && referenced.cellMargins) {
        const padding = convertCellMarginsToPx(referenced.cellMargins as Record<string, unknown>);
        if (padding) hydration.cellPadding = padding;
      }
      if (!hydration.justification && referenced.justification) {
        hydration.justification = referenced.justification;
      }
    }

    // Extract paragraph properties (w:pPr) from the table style definition
    // This is needed for the style cascade: docDefaults → table style pPr → paragraph style → direct
    const paragraphProps = extractTableStyleParagraphProps(styleId, context.docx);
    if (paragraphProps) {
      hydration.paragraphProps = paragraphProps;
    }
  }

  if (Object.keys(hydration).length > 0) {
    return hydration;
  }

  return null;
};

const clonePlainObject = (value: Record<string, unknown>): Record<string, unknown> => ({ ...value });

const convertCellMarginsToPx = (margins: Record<string, unknown>): BoxSpacing | undefined => {
  if (!margins || typeof margins !== 'object') return undefined;
  const spacing: BoxSpacing = {};
  const keyMap: Record<string, keyof BoxSpacing> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
    marginTop: 'top',
    marginBottom: 'bottom',
    marginLeft: 'left',
    marginRight: 'right',
  };

  Object.entries(margins).forEach(([key, value]) => {
    const side = keyMap[key];
    if (!side) return;
    const px = measurementToPx(value);
    if (px != null) spacing[side] = px;
  });

  return Object.keys(spacing).length ? spacing : undefined;
};

const measurementToPx = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as { value?: number; type?: string };
  if (typeof entry.value !== 'number') return undefined;
  if (!entry.type || entry.type === 'px' || entry.type === 'pixel') return entry.value;
  if (entry.type === 'dxa') return twipsToPx(entry.value);
  return undefined;
};

const normalizeTableWidth = (value: unknown): { width?: number; type?: string } | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const measurement = value as { value?: number; width?: number; type?: string };
  const raw = typeof measurement.width === 'number' ? measurement.width : measurement.value;
  if (typeof raw !== 'number') return undefined;
  if (!measurement.type || measurement.type === 'px' || measurement.type === 'pixel') {
    return { width: raw, type: measurement.type ?? 'px' };
  }
  if (measurement.type === 'dxa') {
    return { width: twipsToPx(raw), type: 'px' };
  }
  return { width: raw, type: measurement.type };
};

/**
 * XML element type for OOXML parsing.
 */
type OoxmlElement = {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: OoxmlElement[];
};

/**
 * Extracts paragraph properties (w:pPr) from a table style definition.
 *
 * Per OOXML spec, table styles can define paragraph properties that apply
 * to all paragraphs within the table. This includes spacing, indentation, etc.
 *
 * @param styleId - The table style ID (e.g., "TableGrid")
 * @param docx - The docx object containing styles.xml
 * @returns Paragraph properties from the table style, or undefined if not found
 */
const extractTableStyleParagraphProps = (
  styleId: string,
  docx: Record<string, unknown>,
): TableStyleParagraphProps | undefined => {
  try {
    // Navigate to styles.xml
    const stylesXml = docx['word/styles.xml'] as OoxmlElement | undefined;
    if (!stylesXml?.elements?.[0]?.elements) return undefined;

    const styleElements = stylesXml.elements[0].elements.filter((el: OoxmlElement) => el.name === 'w:style');

    // Find the table style by styleId
    const styleTag = styleElements.find((el: OoxmlElement) => el.attributes?.['w:styleId'] === styleId);
    if (!styleTag?.elements) {
      return undefined;
    }

    // Find w:pPr (paragraph properties) in the style
    const pPr = styleTag.elements.find((el: OoxmlElement) => el.name === 'w:pPr');
    if (!pPr?.elements) {
      return undefined;
    }

    // Extract w:spacing
    const spacingEl = pPr.elements.find((el: OoxmlElement) => el.name === 'w:spacing');
    if (!spacingEl?.attributes) {
      return undefined;
    }

    // Cast attributes to Record<string, unknown> for runtime validation
    const attrs = spacingEl.attributes as Record<string, unknown>;
    const spacing: TableStyleParagraphProps['spacing'] = {};

    // Convert spacing values from twips to pixels using parseIntSafe for type coercion
    const before = parseIntSafe(attrs['w:before']);
    const after = parseIntSafe(attrs['w:after']);
    const line = parseIntSafe(attrs['w:line']);

    // Validate lineRule is one of the expected values
    const rawLineRule = attrs['w:lineRule'];
    const lineRule: 'auto' | 'exact' | 'atLeast' | undefined =
      rawLineRule === 'auto' || rawLineRule === 'exact' || rawLineRule === 'atLeast' ? rawLineRule : undefined;

    if (before != null) spacing.before = twipsToPx(before);
    if (after != null) spacing.after = twipsToPx(after);
    if (line != null) {
      const { value: normalizedLine, unit: lineUnit } = normalizeLineValue(line, lineRule);
      spacing.line = normalizedLine;
      spacing.lineUnit = lineUnit;
    }
    if (lineRule) spacing.lineRule = lineRule;

    const result = Object.keys(spacing).length > 0 ? { spacing } : undefined;
    return result;
  } catch {
    // Gracefully handle any parsing errors
    return undefined;
  }
};

/**
 * Safely parse an integer from an unknown value.
 */
const parseIntSafe = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(num) ? num : undefined;
};
