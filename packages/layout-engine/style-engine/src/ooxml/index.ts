/**
 * @superdoc/style-engine/ooxml
 *
 * Shared OOXML style resolution logic used by the converter and layout engine.
 * This module is format-aware (docx), but translator-agnostic.
 */

import { combineIndentProperties, combineProperties, combineRunProperties } from '../cascade.js';
import type { PropertyObject } from '../cascade.js';
import type { ParagraphConditionalFormatting, ParagraphProperties, ParagraphTabStop, RunProperties } from './types.ts';
import type { NumberingProperties } from './numbering-types.ts';
import type {
  StyleDefinition,
  StylesDocumentProperties,
  TableStyleType,
  TableProperties,
  TableLookProperties,
  TableCellProperties,
} from './styles-types.ts';

export { combineIndentProperties, combineProperties, combineRunProperties };
export type { PropertyObject };
export type * from './types.ts';
export type * from './numbering-types.ts';
export type * from './styles-types.ts';
export {
  TABLE_STYLE_ID_TABLE_GRID,
  TABLE_STYLE_ID_TABLE_NORMAL,
  TABLE_FALLBACK_BORDER,
  TABLE_FALLBACK_BORDERS,
  TABLE_FALLBACK_CELL_PADDING,
  isKnownTableStyleId,
  findTypeDefaultTableStyleId,
  resolveExistingTableEffectiveStyleId,
  resolvePreferredNewTableStyleId,
} from './table-style-selection.js';
export type { ResolvedStyle, ResolvedStyleSource } from './table-style-selection.js';

export interface OoxmlResolverParams {
  translatedNumbering: NumberingProperties | null | undefined;
  translatedLinkedStyles: StylesDocumentProperties | null | undefined;
}

export interface TableInfo {
  tableProperties: TableProperties | null | undefined;
  rowIndex: number;
  cellIndex: number;
  numCells: number;
  numRows: number;
  rowCnfStyle?: ParagraphConditionalFormatting | null;
  cellCnfStyle?: ParagraphConditionalFormatting | null;
}

/**
 * OOXML default tblLook value (0x04A0) per ECMA-376 §17.4.56.
 * Word applies these flags when a table has no explicit w:tblLook element.
 */
export const DEFAULT_TBL_LOOK: TableLookProperties = {
  firstRow: true,
  lastRow: false,
  firstColumn: true,
  lastColumn: false,
  noHBand: false,
  noVBand: true,
};

export function resolveRunProperties(
  params: OoxmlResolverParams,
  inlineRpr: RunProperties | null | undefined,
  resolvedPpr: ParagraphProperties | null | undefined,
  tableInfo: TableInfo | null | undefined = null,
  isListNumber = false,
  numberingDefinedInline = false,
): RunProperties {
  if (!params.translatedLinkedStyles?.styles) {
    return inlineRpr ?? {};
  }
  if (!inlineRpr) {
    inlineRpr = {} as RunProperties;
  }
  // Getting properties from style
  const paragraphStyleId = resolvedPpr?.styleId as string | undefined;
  const paragraphStyleProps = resolveStyleChain('runProperties', params, paragraphStyleId) as RunProperties;

  // Getting default properties and normal style properties
  const defaultProps = params.translatedLinkedStyles.docDefaults?.runProperties ?? {};
  const normalStyleDef = params.translatedLinkedStyles.styles['Normal'];
  const normalProps = (normalStyleDef?.runProperties ?? {}) as RunProperties;

  // Getting table style run properties
  const tableStyleProps = (
    tableInfo?.tableProperties?.tableStyleId
      ? resolveStyleChain('runProperties', params, tableInfo?.tableProperties?.tableStyleId)
      : {}
  ) as RunProperties;

  // Getting cell style run properties
  const cellStyleProps: RunProperties[] = resolveCellStyles<RunProperties>(
    'runProperties',
    tableInfo,
    params.translatedLinkedStyles,
  );

  // Get run properties from direct character style, unless it's inside a TOC paragraph style
  let runStyleProps = {} as RunProperties;
  if (!paragraphStyleId?.startsWith('TOC')) {
    runStyleProps = (
      inlineRpr?.styleId ? resolveStyleChain('runProperties', params, inlineRpr.styleId as string) : {}
    ) as RunProperties;
  }

  let defaultsChain;
  if (!paragraphStyleId) {
    defaultsChain = [defaultProps, normalProps];
  } else {
    defaultsChain = [defaultProps];
  }
  let styleChain: RunProperties[];

  if (isListNumber) {
    const numberingProperties = resolvedPpr?.numberingProperties;
    const numId = resolvedPpr?.numberingProperties?.numId;
    let numberingProps: RunProperties = {} as RunProperties;
    if (numId != null && numId !== 0) {
      numberingProps = getNumberingProperties('runProperties', params, numberingProperties?.ilvl ?? 0, numId);
    }

    if (!numberingDefinedInline) {
      // If numbering is not defined inline, we need to ignore the inline rPr
      inlineRpr = {} as RunProperties;
    }

    // Inline underlines are ignored for list numbers
    if (inlineRpr?.underline) {
      delete inlineRpr.underline;
    }

    styleChain = [
      ...defaultsChain,
      tableStyleProps,
      ...cellStyleProps,
      paragraphStyleProps,
      runStyleProps,
      inlineRpr,
      numberingProps,
    ];
  } else {
    styleChain = [...defaultsChain, tableStyleProps, ...cellStyleProps, paragraphStyleProps, runStyleProps, inlineRpr];
  }

  const finalProps = combineRunProperties(styleChain);

  return finalProps;
}

export function resolveParagraphProperties(
  params: OoxmlResolverParams,
  inlineProps: ParagraphProperties | null | undefined,
  tableInfo: TableInfo | null | undefined,
): ParagraphProperties {
  if (!inlineProps) {
    inlineProps = {} as ParagraphProperties;
  }
  if (!params.translatedLinkedStyles?.styles) {
    return inlineProps;
  }

  // Normal style and default properties
  const defaultProps = params.translatedLinkedStyles.docDefaults?.paragraphProperties ?? {};
  const normalStyleDef = params.translatedLinkedStyles.styles['Normal'];
  const normalProps = (normalStyleDef?.paragraphProperties ?? {}) as ParagraphProperties;

  // Properties from styles
  let styleId = inlineProps.styleId as string | undefined;
  let styleProps = (
    inlineProps.styleId ? resolveStyleChain('paragraphProperties', params, inlineProps.styleId) : {}
  ) as ParagraphProperties;

  // Properties from numbering
  let numberingProps = {} as ParagraphProperties;
  const ilvl = inlineProps?.numberingProperties?.ilvl ?? styleProps?.numberingProperties?.ilvl;
  const numId = inlineProps?.numberingProperties?.numId ?? styleProps?.numberingProperties?.numId;
  let numberingDefinedInline = inlineProps?.numberingProperties?.numId != null;

  const isList = numId != null && numId !== 0;
  if (isList) {
    const ilvlNum = ilvl != null ? (ilvl as number) : 0;
    numberingProps = getNumberingProperties('paragraphProperties', params, ilvlNum, numId);
    if (numberingProps.styleId) {
      // If numbering level defines a style, replace styleProps with that style
      styleId = numberingProps.styleId as string;
      styleProps = resolveStyleChain('paragraphProperties', params, styleId);
      inlineProps.styleId = styleId;
      const inlineNumProps = inlineProps.numberingProperties;
      if (
        styleProps.numberingProperties?.ilvl === inlineNumProps?.ilvl &&
        styleProps.numberingProperties?.numId === inlineNumProps?.numId
      ) {
        // Numbering is already defined in style, so remove from inline props
        delete inlineProps.numberingProperties;
        numberingDefinedInline = false;
      }
    }
  }

  // Table properties
  const tableProps = (
    tableInfo?.tableProperties?.tableStyleId
      ? resolveStyleChain('paragraphProperties', params, tableInfo?.tableProperties?.tableStyleId)
      : {}
  ) as ParagraphProperties;

  // Cell style properties
  const cellStyleProps: ParagraphProperties[] = resolveCellStyles<ParagraphProperties>(
    'paragraphProperties',
    tableInfo,
    params.translatedLinkedStyles,
  );

  // Resolve property chain - regular properties are treated differently from indentation
  //   Chain for regular properties
  let defaultsChain;
  if (!styleId) {
    defaultsChain = [defaultProps, normalProps];
  } else {
    defaultsChain = [defaultProps];
  }
  const propsChain = [...defaultsChain, tableProps, ...cellStyleProps, numberingProps, styleProps, inlineProps];

  //   Chain for indentation properties
  let indentChain: ParagraphProperties[];
  if (isList) {
    if (numberingDefinedInline) {
      // If numbering is defined inline, then numberingProps should override styleProps for indentation
      indentChain = [...defaultsChain, styleProps, numberingProps, inlineProps];
    } else {
      // Otherwise, styleProps should override numberingProps for indentation but it should not follow the based-on chain
      styleProps = resolveStyleChain('paragraphProperties', params, styleId, false);
      indentChain = [...defaultsChain, numberingProps, styleProps, inlineProps];
    }
  } else {
    indentChain = [...defaultsChain, styleProps, inlineProps];
  }

  const finalProps = combineProperties(propsChain, {
    specialHandling: {
      tabStops: (target: ParagraphProperties, source: ParagraphProperties): unknown => {
        if (target.tabStops != null && source.tabStops != null) {
          // Merge tab stops from lower-priority (target) and higher-priority (source).
          // Per OOXML spec, 'clear' tabs in a higher-priority source remove matching
          // tab stops (by position) from lower-priority sources.
          const sourceArr = source.tabStops as ParagraphTabStop[];
          const clearPositions = new Set<number>();
          for (const ts of sourceArr) {
            if (ts.tab?.tabType === 'clear' && ts.tab.pos != null) {
              clearPositions.add(ts.tab.pos);
            }
          }
          const targetArr = target.tabStops as ParagraphTabStop[];
          // Keep target tabs not cleared by source, plus non-clear source tabs
          const merged = targetArr.filter((ts) => !(ts.tab?.pos != null && clearPositions.has(ts.tab.pos)));
          for (const ts of sourceArr) {
            if (ts.tab?.tabType !== 'clear') {
              merged.push(ts);
            }
          }
          return merged;
        }
        return source.tabStops;
      },
    },
  });
  const finalIndent = combineIndentProperties(indentChain);
  finalProps.indent = finalIndent.indent;

  return finalProps;
}

export function resolveStyleChain<T extends PropertyObject>(
  propertyType: 'paragraphProperties' | 'runProperties' | 'tableProperties',
  params: OoxmlResolverParams,
  styleId: string | undefined,
  followBasedOnChain = true,
): T {
  if (!styleId) return {} as T;

  const styleDef = params.translatedLinkedStyles?.styles?.[styleId];
  if (!styleDef) return {} as T;

  const styleProps = (styleDef[propertyType as keyof typeof styleDef] ?? {}) as T;
  const basedOn = styleDef.basedOn;

  let styleChain: T[] = [styleProps];
  const seenStyles = new Set<string>([styleId]);
  let nextBasedOn = basedOn;
  while (followBasedOnChain && nextBasedOn) {
    if (seenStyles.has(nextBasedOn as string)) {
      break;
    }
    seenStyles.add(nextBasedOn as string);
    const basedOnStyleDef = params.translatedLinkedStyles?.styles?.[nextBasedOn];
    const basedOnProps = basedOnStyleDef?.[propertyType as keyof typeof basedOnStyleDef] as T;

    if (basedOnProps && Object.keys(basedOnProps).length) {
      styleChain.push(basedOnProps);
    }
    nextBasedOn = basedOnStyleDef?.basedOn;
  }
  styleChain = styleChain.reverse();
  return combineProperties(styleChain);
}

export function getNumberingProperties<T extends ParagraphProperties | RunProperties>(
  propertyType: 'paragraphProperties' | 'runProperties',
  params: OoxmlResolverParams,
  ilvl: number,
  numId: number,
  tries = 0,
): T {
  const numbering = params.translatedNumbering;
  if (!numbering) return {} as T;
  const { definitions, abstracts } = numbering;
  if (!definitions || !abstracts) return {} as T;

  const propertiesChain: T[] = [];

  const numDefinition = definitions[String(numId)];
  if (!numDefinition) return {} as T;

  const lvlOverride = numDefinition.lvlOverrides?.[String(ilvl)];
  const overrideProps = lvlOverride?.[propertyType as keyof typeof lvlOverride] as T;

  if (overrideProps) {
    propertiesChain.push(overrideProps);
  }

  const abstractNumId = numDefinition.abstractNumId!;

  const listDefinitionForThisNumId = abstracts[String(abstractNumId)];
  if (!listDefinitionForThisNumId) return {} as T;

  const numStyleLinkId = listDefinitionForThisNumId.numStyleLink ?? listDefinitionForThisNumId.styleLink;

  if (numStyleLinkId && tries < 1) {
    const styleDef = params.translatedLinkedStyles?.styles?.[numStyleLinkId];
    const styleProps = styleDef?.paragraphProperties;
    const numIdFromStyle = styleProps?.numberingProperties?.numId;
    if (numIdFromStyle) {
      return getNumberingProperties(propertyType, params, ilvl, numIdFromStyle, tries + 1);
    }
  }

  const levelDefinition = listDefinitionForThisNumId.levels?.[String(ilvl)];
  if (!levelDefinition) return {} as T;

  const abstractProps = levelDefinition[propertyType as keyof typeof levelDefinition] as T;

  if (abstractProps != null) {
    if (levelDefinition?.styleId) {
      abstractProps.styleId = levelDefinition?.styleId;
    }
    propertiesChain.push(abstractProps);
  }

  propertiesChain.reverse();
  return combineProperties(propertiesChain);
}

/**
 * Resolves table-level properties (borders, cellMargins, justification,
 * tableWidth, tableCellSpacing) by walking the full basedOn chain.
 *
 * Returns raw OOXML-translated shapes exactly as stored in
 * `translatedLinkedStyles`. Conversion to layout units (px, pt)
 * remains in the pm-adapter hydrator.
 */
export function resolveTableProperties(
  tableStyleId: string | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): TableProperties {
  if (!tableStyleId || !translatedLinkedStyles?.styles) {
    return {} as TableProperties;
  }

  const params: OoxmlResolverParams = {
    translatedLinkedStyles,
    translatedNumbering: null,
  };

  return resolveStyleChain<TableProperties>('tableProperties', params, tableStyleId);
}

export function resolveDocxFontFamily(
  attributes: Record<string, unknown> | null | undefined,
  docx: Record<string, unknown> | null | undefined,
  toCssFontFamily?: (fontName: string, docx?: Record<string, unknown>) => string,
): string | null {
  if (!attributes || typeof attributes !== 'object') return null;

  const ascii = (attributes['w:ascii'] ?? attributes['ascii'] ?? attributes['eastAsia']) as string | undefined;
  let themeAscii = (attributes['w:asciiTheme'] ?? attributes['asciiTheme']) as string | undefined;
  if ((!ascii && attributes.hint === 'default') || (!ascii && !themeAscii)) {
    themeAscii = 'major';
  }

  let resolved = ascii;
  if (docx && themeAscii) {
    const theme = docx['word/theme/theme1.xml'] as Record<string, unknown> | undefined;
    const themeElements = theme?.elements as Array<Record<string, unknown>> | undefined;
    if (themeElements?.length) {
      const topElement = themeElements[0];
      const topElementElements = topElement?.elements as Array<Record<string, unknown>> | undefined;
      const themeElementsNode = topElementElements?.find((el) => el.name === 'a:themeElements');
      const themeElementsElements = themeElementsNode?.elements as Array<Record<string, unknown>> | undefined;
      const fontScheme = themeElementsElements?.find((el) => el.name === 'a:fontScheme');
      const fontSchemeElements = fontScheme?.elements as Array<Record<string, unknown>> | undefined;
      const prefix = themeAscii.startsWith('minor') ? 'minor' : 'major';
      const font = fontSchemeElements?.find((el) => el.name === `a:${prefix}Font`);
      const fontElements = font?.elements as Array<Record<string, unknown>> | undefined;
      const latin = fontElements?.find((el) => el.name === 'a:latin');
      const typeface = (latin?.attributes as Record<string, unknown> | undefined)?.typeface as string | undefined;
      resolved = typeface || resolved;
    }
  }

  if (!resolved) return null;
  if (toCssFontFamily) {
    return toCssFontFamily(resolved, docx ?? undefined);
  }
  return resolved;
}

/**
 * Resolve effective band sizes by walking the basedOn chain.
 * Returns the first defined value for each band size, falling back to 1.
 */
function resolveEffectiveBandSizes(
  styleId: string,
  translatedLinkedStyles: StylesDocumentProperties,
): { rowBandSize: number; colBandSize: number } {
  const seen = new Set<string>();
  let currentId: string | undefined = styleId;
  let rowBandSize: number | undefined;
  let colBandSize: number | undefined;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const def: StyleDefinition | undefined = translatedLinkedStyles.styles?.[currentId];
    const tblProps = def?.tableProperties;
    if (rowBandSize == null && tblProps?.tableStyleRowBandSize != null) {
      rowBandSize = tblProps.tableStyleRowBandSize;
    }
    if (colBandSize == null && tblProps?.tableStyleColBandSize != null) {
      colBandSize = tblProps.tableStyleColBandSize;
    }
    if (rowBandSize != null && colBandSize != null) break;
    currentId = def?.basedOn;
  }
  return { rowBandSize: rowBandSize ?? 1, colBandSize: colBandSize ?? 1 };
}

/**
 * Resolve a single conditional table style property type across the basedOn chain.
 * Collects entries from ancestors (deepest first) and merges them so the leaf wins.
 */
function resolveConditionalProps<T extends PropertyObject>(
  propertyType: 'paragraphProperties' | 'runProperties' | 'tableCellProperties',
  styleType: TableStyleType,
  styleId: string,
  translatedLinkedStyles: StylesDocumentProperties,
): T | undefined {
  const chain: T[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = styleId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const def: StyleDefinition | undefined = translatedLinkedStyles.styles?.[currentId];
    const props = def?.tableStyleProperties?.[styleType]?.[propertyType] as T | undefined;
    if (props) chain.push(props);
    currentId = def?.basedOn;
  }
  if (chain.length === 0) return undefined;
  chain.reverse();
  return combineProperties(chain) as T;
}

export function resolveCellStyles<T extends PropertyObject>(
  propertyType: 'paragraphProperties' | 'runProperties' | 'tableCellProperties',
  tableInfo: TableInfo | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties,
): T[] {
  if (tableInfo == null || !tableInfo.tableProperties?.tableStyleId) {
    return [];
  }
  const cellStyleProps: T[] = [];
  const tableStyleId = tableInfo.tableProperties.tableStyleId;
  const { rowBandSize, colBandSize } = resolveEffectiveBandSizes(tableStyleId, translatedLinkedStyles);
  const cellStyleTypes = determineCellStyleTypes(
    tableInfo.tableProperties?.tblLook ?? DEFAULT_TBL_LOOK,
    tableInfo.rowIndex,
    tableInfo.cellIndex,
    tableInfo.numRows,
    tableInfo.numCells,
    rowBandSize,
    colBandSize,
    tableInfo.rowCnfStyle,
    tableInfo.cellCnfStyle,
  );
  cellStyleTypes.forEach((styleType) => {
    const typeProps = resolveConditionalProps<T>(propertyType, styleType, tableStyleId, translatedLinkedStyles);
    if (typeProps) {
      cellStyleProps.push(typeProps);
    }
  });
  return cellStyleProps;
}

/**
 * Resolve table cell properties (shading, borders, margins) by cascading
 * conditional table style properties with inline cell properties.
 *
 * Cascade order (low → high priority):
 *   wholeTable → bands → firstRow/lastRow/firstCol/lastCol → corner cells → inline
 */
export function resolveTableCellProperties(
  inlineProps: TableCellProperties | null | undefined,
  tableInfo: TableInfo | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): TableCellProperties {
  if (!translatedLinkedStyles) {
    return (inlineProps ?? {}) as TableCellProperties;
  }

  const cellStyleProps = resolveCellStyles<TableCellProperties>(
    'tableCellProperties',
    tableInfo,
    translatedLinkedStyles,
  );

  if (cellStyleProps.length === 0) {
    return (inlineProps ?? {}) as TableCellProperties;
  }

  // Cascade: style properties (low→high) then inline wins last
  const chain: TableCellProperties[] = [...cellStyleProps];
  if (inlineProps && Object.keys(inlineProps).length > 0) {
    chain.push(inlineProps);
  }

  return combineProperties(chain, { fullOverrideProps: ['shading'] });
}

/** Maps cnfStyle boolean flags to their corresponding TableStyleType keys. */
const CNF_STYLE_MAP: ReadonlyArray<[keyof ParagraphConditionalFormatting, TableStyleType]> = [
  ['oddHBand', 'band1Horz'],
  ['evenHBand', 'band2Horz'],
  ['oddVBand', 'band1Vert'],
  ['evenVBand', 'band2Vert'],
  ['firstRow', 'firstRow'],
  ['firstColumn', 'firstCol'],
  ['lastRow', 'lastRow'],
  ['lastColumn', 'lastCol'],
  ['firstRowFirstColumn', 'nwCell'],
  ['firstRowLastColumn', 'neCell'],
  ['lastRowFirstColumn', 'swCell'],
  ['lastRowLastColumn', 'seCell'],
];

// ECMA-376 §17.7.6 precedence order (low → high).
// combineProperties treats later entries as higher priority, so this array
// must list types from lowest to highest override strength.
const TABLE_STYLE_PRECEDENCE: TableStyleType[] = [
  'wholeTable',
  'band1Horz',
  'band2Horz',
  'band1Vert',
  'band2Vert',
  'firstCol',
  'lastCol',
  'firstRow',
  'lastRow',
  'nwCell',
  'neCell',
  'swCell',
  'seCell',
];

function determineCellStyleTypes(
  tblLook: TableLookProperties | null | undefined,
  rowIndex: number,
  cellIndex: number,
  numRows?: number | null,
  numCells?: number | null,
  rowBandSize = 1,
  colBandSize = 1,
  rowCnfStyle?: ParagraphConditionalFormatting | null,
  cellCnfStyle?: ParagraphConditionalFormatting | null,
): TableStyleType[] {
  const applicable = new Set<TableStyleType>(['wholeTable']);

  const normalizedRowBandSize = rowBandSize > 0 ? rowBandSize : 1;
  const normalizedColBandSize = colBandSize > 0 ? colBandSize : 1;

  // Per ECMA-376, banding excludes header/footer rows and first/last columns.
  // Offset the index so the first data row/column starts at band1.
  const bandRowIndex = Math.max(0, rowIndex - (tblLook?.firstRow ? 1 : 0));
  const bandColIndex = Math.max(0, cellIndex - (tblLook?.firstColumn ? 1 : 0));
  const rowGroup = Math.floor(bandRowIndex / normalizedRowBandSize);
  const colGroup = Math.floor(bandColIndex / normalizedColBandSize);

  if (!tblLook?.noHBand) {
    applicable.add(rowGroup % 2 === 0 ? 'band1Horz' : 'band2Horz');
  }

  if (!tblLook?.noVBand) {
    applicable.add(colGroup % 2 === 0 ? 'band1Vert' : 'band2Vert');
  }

  if (tblLook?.firstRow && rowIndex === 0) {
    applicable.add('firstRow');
  }
  if (tblLook?.firstColumn && cellIndex === 0) {
    applicable.add('firstCol');
  }
  if (tblLook?.lastRow && numRows != null && numRows > 0 && rowIndex === numRows - 1) {
    applicable.add('lastRow');
  }
  if (tblLook?.lastColumn && numCells != null && numCells > 0 && cellIndex === numCells - 1) {
    applicable.add('lastCol');
  }

  if (rowIndex === 0 && cellIndex === 0) {
    applicable.add('nwCell');
  }
  if (rowIndex === 0 && numCells != null && numCells > 0 && cellIndex === numCells - 1) {
    applicable.add('neCell');
  }
  if (numRows != null && numRows > 0 && rowIndex === numRows - 1 && cellIndex === 0) {
    applicable.add('swCell');
  }
  if (
    numRows != null &&
    numRows > 0 &&
    numCells != null &&
    numCells > 0 &&
    rowIndex === numRows - 1 &&
    cellIndex === numCells - 1
  ) {
    applicable.add('seCell');
  }

  // Union in cnfStyle-derived types that index-based logic didn't already add.
  // cnfStyle only adds types, never removes them.
  if (rowCnfStyle || cellCnfStyle) {
    for (const [flag, styleType] of CNF_STYLE_MAP) {
      const rowFlag = rowCnfStyle?.[flag];
      const cellFlag = cellCnfStyle?.[flag];
      if (rowFlag === true || cellFlag === true) {
        applicable.add(styleType);
      }
    }
  }

  // Return types in ECMA-376 precedence order (low → high) so that
  // combineProperties applies overrides correctly.
  return TABLE_STYLE_PRECEDENCE.filter((t) => applicable.has(t));
}
