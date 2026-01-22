/**
 * @superdoc/style-engine/ooxml
 *
 * Shared OOXML style resolution logic used by the converter and layout engine.
 * This module is format-aware (docx), but translator-agnostic.
 */

import {
  combineIndentProperties,
  combineProperties,
  combineRunProperties,
  orderDefaultsAndNormal,
} from '../cascade.js';
import type { PropertyObject } from '../cascade.js';
import type { ParagraphProperties, RunProperties } from './types.ts';
import type { NumberingProperties } from './numbering-types.ts';
import type { StylesDocumentProperties, TableStyleType, TableProperties, TableLookProperties } from './styles-types.ts';

export { combineIndentProperties, combineProperties, combineRunProperties, orderDefaultsAndNormal };
export type { PropertyObject };
export type * from './types.ts';
export type * from './numbering-types.ts';
export type * from './styles-types.ts';

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
}

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
  const isNormalDefault = normalStyleDef?.default ?? false;

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

  const defaultsChain = orderDefaultsAndNormal(defaultProps, normalProps, isNormalDefault);
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
  const isNormalDefault = normalStyleDef?.default ?? false;

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
  const defaultsChain = orderDefaultsAndNormal(defaultProps, normalProps, isNormalDefault);
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
        // If a higher priority source defines firstLine, remove hanging from the final result
        if (target.tabStops != null && source.tabStops != null) {
          return [...(target.tabStops as unknown[]), ...(source.tabStops as unknown[])];
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
  propertyType: 'paragraphProperties' | 'runProperties',
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
  const seenStyles = new Set<string>();
  let nextBasedOn = basedOn;
  while (followBasedOnChain && nextBasedOn) {
    if (seenStyles.has(nextBasedOn as string)) {
      break;
    }
    seenStyles.add(basedOn as string);
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

export function getNumberingProperties<T extends PropertyObject>(
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

export function resolveCellStyles<T extends PropertyObject>(
  propertyType: 'paragraphProperties' | 'runProperties',
  tableInfo: TableInfo | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties,
): T[] {
  if (tableInfo == null || !tableInfo.tableProperties?.tableStyleId) {
    return [];
  }
  const cellStyleProps: T[] = [];
  if (tableInfo != null && tableInfo.tableProperties.tableStyleId) {
    const tableStyleDef = translatedLinkedStyles.styles[tableInfo.tableProperties.tableStyleId];
    const tableStylePropsDef = tableStyleDef?.tableProperties;
    const rowBandSize = tableStylePropsDef?.tableStyleRowBandSize ?? 1;
    const colBandSize = tableStylePropsDef?.tableStyleColBandSize ?? 1;
    const cellStyleTypes = determineCellStyleTypes(
      tableInfo.tableProperties?.tblLook,
      tableInfo.rowIndex,
      tableInfo.cellIndex,
      tableInfo.numRows,
      tableInfo.numCells,
      rowBandSize,
      colBandSize,
    );
    cellStyleTypes.forEach((styleType) => {
      const typeProps = tableStyleDef?.tableStyleProperties?.[styleType]?.[propertyType] as T;
      if (typeProps) {
        cellStyleProps.push(typeProps);
      }
    });
  }
  return cellStyleProps;
}

function determineCellStyleTypes(
  tblLook: TableLookProperties | null | undefined,
  rowIndex: number,
  cellIndex: number,
  numRows?: number | null,
  numCells?: number | null,
  rowBandSize = 1,
  colBandSize = 1,
): TableStyleType[] {
  const styleTypes: TableStyleType[] = ['wholeTable'];

  const normalizedRowBandSize = rowBandSize > 0 ? rowBandSize : 1;
  const normalizedColBandSize = colBandSize > 0 ? colBandSize : 1;
  const rowGroup = Math.floor(rowIndex / normalizedRowBandSize);
  const colGroup = Math.floor(cellIndex / normalizedColBandSize);

  if (!tblLook?.noHBand) {
    if (rowGroup % 2 === 0) {
      styleTypes.push('band1Horz');
    } else {
      styleTypes.push('band2Horz');
    }
  }

  if (!tblLook?.noVBand) {
    if (colGroup % 2 === 0) {
      styleTypes.push('band1Vert');
    } else {
      styleTypes.push('band2Vert');
    }
  }

  if (tblLook?.firstRow && rowIndex === 0) {
    styleTypes.push('firstRow');
  }
  if (tblLook?.firstColumn && cellIndex === 0) {
    styleTypes.push('firstCol');
  }
  if (tblLook?.lastRow && numRows != null && numRows > 0 && rowIndex === numRows - 1) {
    styleTypes.push('lastRow');
  }
  if (tblLook?.lastColumn && numCells != null && numCells > 0 && cellIndex === numCells - 1) {
    styleTypes.push('lastCol');
  }

  if (rowIndex === 0 && cellIndex === 0) {
    styleTypes.push('nwCell');
  }
  if (rowIndex === 0 && numCells != null && numCells > 0 && cellIndex === numCells - 1) {
    styleTypes.push('neCell');
  }
  if (numRows != null && numRows > 0 && rowIndex === numRows - 1 && cellIndex === 0) {
    styleTypes.push('swCell');
  }
  if (
    numRows != null &&
    numRows > 0 &&
    numCells != null &&
    numCells > 0 &&
    rowIndex === numRows - 1 &&
    cellIndex === numCells - 1
  ) {
    styleTypes.push('seCell');
  }

  return styleTypes;
}
