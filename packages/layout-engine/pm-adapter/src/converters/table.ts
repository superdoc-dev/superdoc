/**
 * Table Node Converter
 *
 * Handles conversion of ProseMirror table nodes to TableBlocks
 */

import type {
  BoxSpacing,
  FlowBlock,
  ParagraphBlock,
  ImageBlock,
  DrawingBlock,
  TableCell,
  TableCellAttrs,
  TableBorders,
  TableRow,
  TableRowAttrs,
  TableBlock,
  TableAnchor,
  TableWrap,
} from '@superdoc/contracts';
import type {
  PMNode,
  NodeHandlerContext,
  BlockIdGenerator,
  PositionMap,
  StyleContext,
  TrackedChangesConfig,
  HyperlinkConfig,
  ThemeColorPalette,
  ConverterContext,
  NestedConverters,
  TableNodeToBlockParams,
} from '../types.js';
import { extractTableBorders, extractCellBorders, extractCellPadding } from '../attributes/index.js';
import { pickNumber, twipsToPx } from '../utilities.js';
import { hydrateTableStyleAttrs } from './table-styles.js';
import { collectTrackedChangeFromMarks } from '../marks/index.js';
import { annotateBlockWithTrackedChange, shouldHideTrackedNode } from '../tracked-changes.js';
import {
  resolveNodeSdtMetadata,
  applySdtMetadataToParagraphBlocks,
  applySdtMetadataToTableBlock,
} from '../sdt/index.js';
import { TableProperties } from '@superdoc/style-engine/ooxml';

type TableParserDependencies = {
  nextBlockId: BlockIdGenerator;
  positions: PositionMap;
  defaultFont: string;
  defaultSize: number;
  styleContext: StyleContext;
  trackedChangesConfig?: TrackedChangesConfig;
  bookmarks?: Map<string, number>;
  hyperlinkConfig: HyperlinkConfig;
  themeColors?: ThemeColorPalette;
  converterContext: ConverterContext;
  converters: NestedConverters;
  enableComments: boolean;
};

type ParseTableCellArgs = {
  cellNode: PMNode;
  rowIndex: number;
  cellIndex: number;
  numCells: number;
  numRows: number;
  context: TableParserDependencies;
  defaultCellPadding?: BoxSpacing;
  tableProperties?: TableProperties;
};

type ParseTableRowArgs = {
  rowNode: PMNode;
  rowIndex: number;
  numRows: number;
  context: TableParserDependencies;
  defaultCellPadding?: BoxSpacing;
  /** Table style to pass to paragraph converter for style cascade */
  tableProperties?: TableProperties;
};

const isTableRowNode = (node: PMNode): boolean => node.type === 'tableRow' || node.type === 'table_row';

const isTableCellNode = (node: PMNode): boolean =>
  node.type === 'tableCell' ||
  node.type === 'table_cell' ||
  node.type === 'tableHeader' ||
  node.type === 'table_header';

type NormalizedRowHeight =
  | {
      value: number;
      rule: 'exact' | 'atLeast' | 'auto';
    }
  | undefined;

/**
 * Normalize row height from DOCX row properties, converting from twips to pixels.
 *
 * Extracts the row height value and rule from OOXML table row properties and converts
 * the height value from twips (twentieth of a point) to pixels for consistent rendering.
 * This conversion is critical to prevent small twips values (e.g., 277 twips ≈ 18.5px)
 * from being misinterpreted as large pixel values.
 *
 * @param rowProps - Table row properties object containing optional rowHeight configuration
 * @returns Normalized height object with pixel value and rule, or undefined if no valid height is found
 *
 * @example
 * // DOCX row with exact height of 277 twips
 * const props = { rowHeight: { value: 277, rule: 'exact' } };
 * const normalized = normalizeRowHeight(props);
 * // Returns: { value: 18.467, rule: 'exact' }
 *
 * @example
 * // Missing or invalid height
 * normalizeRowHeight(undefined); // Returns: undefined
 * normalizeRowHeight({}); // Returns: undefined
 */
const normalizeRowHeight = (rowProps?: Record<string, unknown>): NormalizedRowHeight => {
  if (!rowProps || typeof rowProps !== 'object') return undefined;
  const rawRowHeight = (rowProps as Record<string, unknown>).rowHeight;
  if (!rawRowHeight || typeof rawRowHeight !== 'object') return undefined;

  const heightObj = rawRowHeight as Record<string, unknown>;
  const rawValue = pickNumber(heightObj.value ?? heightObj.val);
  if (rawValue == null) return undefined;

  const rawRule = heightObj.rule ?? heightObj.hRule;
  const rule =
    rawRule === 'exact' || rawRule === 'atLeast' || rawRule === 'auto'
      ? (rawRule as 'exact' | 'atLeast' | 'auto')
      : 'atLeast';

  // Row heights from DOCX are defined in twips. Always convert to px so small values (e.g. 277 twips)
  // don't get misinterpreted as pixels.
  const valuePx = twipsToPx(rawValue);

  return {
    value: valuePx,
    rule,
  };
};

/**
 * Parse a ProseMirror table cell node into a TableCell block.
 *
 * Converts a PM table cell node (tableCell, table_cell, tableHeader, or table_header)
 * into the SuperDoc TableCell contract format. Processes all paragraphs within the cell,
 * extracts cell attributes (borders, padding, alignment, background), and handles
 * merged cells (rowspan/colspan).
 *
 * @param args - Cell parsing arguments including node, position, context, and style cascade props
 * @param args.cellNode - ProseMirror cell node to parse
 * @param args.rowIndex - Zero-based row index for ID generation
 * @param args.cellIndex - Zero-based cell index for ID generation
 * @param args.context - Parser dependencies (block ID generator, converters, style context)
 * @param args.defaultCellPadding - Optional default padding from table style
 * @param args.tableStyleParagraphProps - Optional paragraph properties from table style for cascade
 * @returns TableCell object with blocks and attributes, or null if the cell is invalid or empty
 *
 * @example
 * // Valid cell with content
 * const cell = parseTableCell({
 *   cellNode: { type: 'tableCell', content: [paragraphNode] },
 *   rowIndex: 0,
 *   cellIndex: 1,
 *   context: parserDeps,
 * });
 * // Returns: { id: 'cell-0-1', blocks: [...], attrs: {...} }
 *
 * @example
 * // Empty cell returns null
 * parseTableCell({
 *   cellNode: { type: 'tableCell', content: [] },
 *   rowIndex: 0,
 *   cellIndex: 0,
 *   context: parserDeps,
 * });
 * // Returns: null
 */
const parseTableCell = (args: ParseTableCellArgs): TableCell | null => {
  const { cellNode, rowIndex, cellIndex, numCells, numRows, context, defaultCellPadding, tableProperties } = args;
  if (!isTableCellNode(cellNode) || !Array.isArray(cellNode.content)) {
    return null;
  }

  // Convert all cell children into blocks.
  // Table cells can contain paragraphs, images/drawings, structured content blocks, and nested tables.
  const blocks: (ParagraphBlock | ImageBlock | DrawingBlock | TableBlock)[] = [];

  // Extract cell background color for auto text color resolution
  const cellBackground = cellNode.attrs?.background as { color?: string } | undefined;
  let cellBackgroundColor: string | undefined;
  if (cellBackground && typeof cellBackground.color === 'string') {
    const rawColor = cellBackground.color.trim();
    if (rawColor) {
      const normalized = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
      // Validate it's a proper hex color (3 or 6 hex digits after #)
      if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(normalized)) {
        cellBackgroundColor = normalized;
      }
    }
  }

  // Create enhanced converter context with table style paragraph props for the style cascade
  // This allows paragraphs inside table cells to inherit table style's pPr
  // Also includes backgroundColor for auto text color resolution
  const cellConverterContext: ConverterContext =
    tableProperties || cellBackgroundColor
      ? ({
          ...context.converterContext,
          ...(tableProperties && { tableInfo: { tableProperties, rowIndex, cellIndex, numCells, numRows } }),
          ...(cellBackgroundColor && { backgroundColor: cellBackgroundColor }),
        } as ConverterContext)
      : context.converterContext;

  const paragraphToFlowBlocks = context.converters.paragraphToFlowBlocks;
  const tableNodeToBlock = context.converters?.tableNodeToBlock;

  /**
   * Appends converted paragraph blocks to the cell's blocks array.
   *
   * This helper:
   * 1. Applies SDT metadata to paragraph blocks (for structured content inheritance)
   * 2. Filters to only include supported block types (paragraph, image, drawing)
   * 3. Appends the filtered blocks to the cell's blocks array
   *
   * @param paragraphBlocks - The converted flow blocks from a paragraph node
   * @param sdtMetadata - Optional SDT metadata to apply (from parent structuredContentBlock)
   */
  const appendParagraphBlocks = (
    paragraphBlocks: FlowBlock[],
    sdtMetadata?: ReturnType<typeof resolveNodeSdtMetadata>,
  ) => {
    applySdtMetadataToParagraphBlocks(
      paragraphBlocks.filter((block) => block.kind === 'paragraph') as ParagraphBlock[],
      sdtMetadata,
    );
    paragraphBlocks.forEach((block) => {
      if (block.kind === 'paragraph' || block.kind === 'image' || block.kind === 'drawing') {
        blocks.push(block);
      }
    });
  };

  for (const childNode of cellNode.content) {
    if (childNode.type === 'paragraph') {
      if (!paragraphToFlowBlocks) continue;
      const paragraphBlocks = paragraphToFlowBlocks({
        para: childNode,
        nextBlockId: context.nextBlockId,
        positions: context.positions,
        defaultFont: context.defaultFont,
        defaultSize: context.defaultSize,
        styleContext: context.styleContext,
        trackedChangesConfig: context.trackedChangesConfig,
        bookmarks: context.bookmarks,
        hyperlinkConfig: context.hyperlinkConfig,
        themeColors: context.themeColors,
        converterContext: cellConverterContext,
        converters: context.converters,
        enableComments: context.enableComments,
      });
      appendParagraphBlocks(paragraphBlocks);
      continue;
    }

    if (childNode.type === 'structuredContentBlock' && Array.isArray(childNode.content)) {
      const structuredContentMetadata = resolveNodeSdtMetadata(childNode, 'structuredContentBlock');
      for (const nestedNode of childNode.content) {
        if (nestedNode.type === 'paragraph') {
          if (!paragraphToFlowBlocks) continue;
          const paragraphBlocks = paragraphToFlowBlocks({
            para: nestedNode,
            nextBlockId: context.nextBlockId,
            positions: context.positions,
            defaultFont: context.defaultFont,
            defaultSize: context.defaultSize,
            styleContext: context.styleContext,
            trackedChangesConfig: context.trackedChangesConfig,
            bookmarks: context.bookmarks,
            hyperlinkConfig: context.hyperlinkConfig,
            themeColors: context.themeColors,
            converterContext: cellConverterContext,
            converters: context.converters,
            enableComments: context.enableComments,
          });
          appendParagraphBlocks(paragraphBlocks, structuredContentMetadata);
          continue;
        }
        if (nestedNode.type === 'table' && tableNodeToBlock) {
          const tableBlock = tableNodeToBlock({
            node: nestedNode,
            nextBlockId: context.nextBlockId,
            positions: context.positions,
            defaultFont: context.defaultFont,
            defaultSize: context.defaultSize,
            styleContext: context.styleContext,
            trackedChangesConfig: context.trackedChangesConfig,
            bookmarks: context.bookmarks,
            hyperlinkConfig: context.hyperlinkConfig,
            themeColors: context.themeColors,
            converterContext: context.converterContext,
            converters: context.converters,
            enableComments: context.enableComments,
          });
          if (tableBlock && tableBlock.kind === 'table') {
            applySdtMetadataToTableBlock(tableBlock, structuredContentMetadata);
            blocks.push(tableBlock);
          }
          continue;
        }
      }
      continue;
    }

    if (childNode.type === 'table' && tableNodeToBlock) {
      const tableBlock = tableNodeToBlock({
        node: childNode,
        nextBlockId: context.nextBlockId,
        positions: context.positions,
        defaultFont: context.defaultFont,
        defaultSize: context.defaultSize,
        styleContext: context.styleContext,
        trackedChangesConfig: context.trackedChangesConfig,
        bookmarks: context.bookmarks,
        hyperlinkConfig: context.hyperlinkConfig,
        themeColors: context.themeColors,
        converterContext: context.converterContext,
        converters: context.converters,
        enableComments: context.enableComments,
      });
      if (tableBlock && tableBlock.kind === 'table') {
        blocks.push(tableBlock);
      }
      continue;
    }

    if (childNode.type === 'image' && context.converters?.imageNodeToBlock) {
      const mergedMarks = [...(childNode.marks ?? [])];
      const trackedMeta = context.trackedChangesConfig ? collectTrackedChangeFromMarks(mergedMarks) : undefined;
      if (shouldHideTrackedNode(trackedMeta, context.trackedChangesConfig)) {
        continue;
      }
      const imageBlock = context.converters.imageNodeToBlock(
        childNode,
        context.nextBlockId,
        context.positions,
        trackedMeta,
        context.trackedChangesConfig,
      );
      if (imageBlock && imageBlock.kind === 'image') {
        annotateBlockWithTrackedChange(imageBlock, trackedMeta, context.trackedChangesConfig);
        blocks.push(imageBlock);
      }
      continue;
    }

    if (childNode.type === 'vectorShape' && context.converters?.vectorShapeNodeToDrawingBlock) {
      const drawingBlock = context.converters.vectorShapeNodeToDrawingBlock(
        childNode,
        context.nextBlockId,
        context.positions,
      );
      if (drawingBlock && drawingBlock.kind === 'drawing') {
        blocks.push(drawingBlock);
      }
      continue;
    }

    if (childNode.type === 'shapeGroup' && context.converters?.shapeGroupNodeToDrawingBlock) {
      const drawingBlock = context.converters.shapeGroupNodeToDrawingBlock(
        childNode,
        context.nextBlockId,
        context.positions,
      );
      if (drawingBlock && drawingBlock.kind === 'drawing') {
        blocks.push(drawingBlock);
      }
      continue;
    }

    if (childNode.type === 'shapeContainer' && context.converters?.shapeContainerNodeToDrawingBlock) {
      const drawingBlock = context.converters.shapeContainerNodeToDrawingBlock(
        childNode,
        context.nextBlockId,
        context.positions,
      );
      if (drawingBlock && drawingBlock.kind === 'drawing') {
        blocks.push(drawingBlock);
      }
      continue;
    }

    if (childNode.type === 'shapeTextbox' && context.converters?.shapeTextboxNodeToDrawingBlock) {
      const drawingBlock = context.converters.shapeTextboxNodeToDrawingBlock(
        childNode,
        context.nextBlockId,
        context.positions,
      );
      if (drawingBlock && drawingBlock.kind === 'drawing') {
        blocks.push(drawingBlock);
      }
      continue;
    }
  }

  if (blocks.length === 0) {
    return null;
  }

  const cellAttrs: TableCellAttrs = {};

  const borders = extractCellBorders(cellNode.attrs ?? {});
  if (borders) cellAttrs.borders = borders;

  const padding =
    extractCellPadding(cellNode.attrs ?? {}) ?? (defaultCellPadding ? { ...defaultCellPadding } : undefined);
  if (padding) cellAttrs.padding = padding;

  const verticalAlign = cellNode.attrs?.verticalAlign;
  const normalizedVerticalAlign =
    verticalAlign === 'middle' ? 'center' : verticalAlign === 'center' ? 'center' : verticalAlign;
  if (
    normalizedVerticalAlign === 'top' ||
    normalizedVerticalAlign === 'center' ||
    normalizedVerticalAlign === 'bottom'
  ) {
    cellAttrs.verticalAlign = normalizedVerticalAlign;
  }

  const background = cellNode.attrs?.background as { color?: string } | undefined;
  if (background && typeof background.color === 'string') {
    const bgColor = background.color;
    cellAttrs.background = bgColor.startsWith('#') ? bgColor : `#${bgColor}`;
  }

  const tableCellProperties = cellNode.attrs?.tableCellProperties;
  if (tableCellProperties && typeof tableCellProperties === 'object') {
    cellAttrs.tableCellProperties = tableCellProperties as Record<string, unknown>;
  }

  const rowSpan = pickNumber(cellNode.attrs?.rowspan);
  const colSpan = pickNumber(cellNode.attrs?.colspan);

  return {
    id: context.nextBlockId(`cell-${rowIndex}-${cellIndex}`),
    blocks,
    // Backward compatibility: set paragraph to first block if it's a paragraph
    paragraph: blocks[0]?.kind === 'paragraph' ? (blocks[0] as ParagraphBlock) : undefined,
    rowSpan: rowSpan ?? undefined,
    colSpan: colSpan ?? undefined,
    attrs: Object.keys(cellAttrs).length > 0 ? cellAttrs : undefined,
  };
};

/**
 * Parse a ProseMirror table row node into a TableRow block.
 *
 * Converts a PM table row node (tableRow or table_row) into the SuperDoc TableRow
 * contract format. Processes all table cells within the row, extracts row attributes
 * (row height with twips-to-pixels conversion), and preserves OOXML table row properties.
 *
 * @param args - Row parsing arguments including node, position, context, and style cascade props
 * @param args.rowNode - ProseMirror row node to parse
 * @param args.rowIndex - Zero-based row index for ID generation
 * @param args.context - Parser dependencies (block ID generator, converters, style context)
 * @param args.defaultCellPadding - Optional default padding from table style to pass to cells
 * @param args.tableStyleId - Optional table style ID for paragraph style cascade in cells
 * @returns TableRow object with cells and attributes, or null if the row contains no valid cells
 *
 * @example
 * // Row with cells
 * const row = parseTableRow({
 *   rowNode: { type: 'tableRow', content: [cellNode1, cellNode2] },
 *   rowIndex: 0,
 *   context: parserDeps,
 * });
 * // Returns: { id: 'row-0', cells: [...], attrs: {...} }
 *
 * @example
 * // Row with no valid cells returns null
 * parseTableRow({
 *   rowNode: { type: 'tableRow', content: [] },
 *   rowIndex: 0,
 *   context: parserDeps,
 * });
 * // Returns: null
 */
const parseTableRow = (args: ParseTableRowArgs): TableRow | null => {
  const { rowNode, rowIndex, context, defaultCellPadding, tableProperties, numRows } = args;
  if (!isTableRowNode(rowNode) || !Array.isArray(rowNode.content)) {
    return null;
  }

  const cells: TableCell[] = [];
  rowNode.content.forEach((cellNode, cellIndex) => {
    const parsedCell = parseTableCell({
      cellNode,
      rowIndex,
      cellIndex,
      context,
      defaultCellPadding,
      tableProperties,
      numCells: rowNode?.content?.length || 1,
      numRows,
    });
    if (parsedCell) {
      cells.push(parsedCell);
    }
  });

  if (cells.length === 0) return null;

  const rowProps = rowNode.attrs?.tableRowProperties;
  const rowHeight = normalizeRowHeight(rowProps as Record<string, unknown> | undefined);
  const attrs: TableRowAttrs | undefined =
    rowProps && typeof rowProps === 'object'
      ? {
          tableRowProperties: rowProps as Record<string, unknown>,
          ...(rowHeight ? { rowHeight } : {}),
        }
      : rowHeight
        ? { rowHeight }
        : undefined;

  // Note: cantSplit is stored within tableRowProperties.cantSplit (not as a separate attr)
  // The PM table-row extension has both cantSplit as a top-level attr AND within tableRowProperties
  // For layout engine, we only need to read from tableRowProperties.cantSplit

  return {
    id: context.nextBlockId(`row-${rowIndex}`),
    cells,
    attrs,
  };
};

/**
 * Floating table properties from OOXML w:tblpPr.
 * Values are in twips.
 */
type FloatingTableProperties = {
  leftFromText?: number;
  rightFromText?: number;
  topFromText?: number;
  bottomFromText?: number;
  tblpX?: number;
  tblpY?: number;
  horzAnchor?: 'margin' | 'page' | 'text';
  vertAnchor?: 'margin' | 'page' | 'text';
  tblpXSpec?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  tblpYSpec?: 'inline' | 'top' | 'center' | 'bottom' | 'inside' | 'outside';
};

/**
 * Extract floating table properties from node attrs and convert to TableAnchor and TableWrap.
 * Returns undefined values if the table is not floating (no tblpPr).
 */
function extractFloatingTableAnchorWrap(node: PMNode): { anchor?: TableAnchor; wrap?: TableWrap } {
  const tableProperties = node.attrs?.tableProperties as Record<string, unknown> | undefined;
  const floatingProps = tableProperties?.floatingTableProperties as FloatingTableProperties | undefined;

  if (!floatingProps) {
    return {};
  }

  // A table is considered anchored/floating if it has any positioning properties
  const hasPositioning =
    floatingProps.tblpX !== undefined ||
    floatingProps.tblpY !== undefined ||
    floatingProps.tblpXSpec !== undefined ||
    floatingProps.tblpYSpec !== undefined ||
    floatingProps.horzAnchor !== undefined ||
    floatingProps.vertAnchor !== undefined;

  if (!hasPositioning) {
    return {};
  }

  // Map OOXML anchor values to contract types
  const mapHorzAnchor = (val?: string): TableAnchor['hRelativeFrom'] => {
    switch (val) {
      case 'page':
        return 'page';
      case 'margin':
        return 'margin';
      case 'text':
      default:
        return 'column'; // 'text' in OOXML maps to column-relative positioning
    }
  };

  const mapVertAnchor = (val?: string): TableAnchor['vRelativeFrom'] => {
    switch (val) {
      case 'page':
        return 'page';
      case 'margin':
        return 'margin';
      case 'text':
      default:
        return 'paragraph'; // 'text' in OOXML maps to paragraph-relative positioning
    }
  };

  const anchor: TableAnchor = {
    isAnchored: true,
    hRelativeFrom: mapHorzAnchor(floatingProps.horzAnchor),
    vRelativeFrom: mapVertAnchor(floatingProps.vertAnchor),
  };

  // Set alignment from tblpXSpec/tblpYSpec if present
  if (floatingProps.tblpXSpec) {
    anchor.alignH = floatingProps.tblpXSpec;
  }
  if (floatingProps.tblpYSpec) {
    anchor.alignV = floatingProps.tblpYSpec;
  }

  // Set absolute offsets (convert twips to px)
  if (floatingProps.tblpX !== undefined) {
    anchor.offsetH = twipsToPx(floatingProps.tblpX);
  }
  if (floatingProps.tblpY !== undefined) {
    anchor.offsetV = twipsToPx(floatingProps.tblpY);
  }

  // Build wrap properties from text distances
  const hasDistances =
    floatingProps.leftFromText !== undefined ||
    floatingProps.rightFromText !== undefined ||
    floatingProps.topFromText !== undefined ||
    floatingProps.bottomFromText !== undefined;

  const wrap: TableWrap = {
    type: 'Square', // Floating tables with text distances use square wrapping
    wrapText: 'bothSides', // Default to text on both sides
  };

  if (hasDistances) {
    if (floatingProps.topFromText !== undefined) {
      wrap.distTop = twipsToPx(floatingProps.topFromText);
    }
    if (floatingProps.bottomFromText !== undefined) {
      wrap.distBottom = twipsToPx(floatingProps.bottomFromText);
    }
    if (floatingProps.leftFromText !== undefined) {
      wrap.distLeft = twipsToPx(floatingProps.leftFromText);
    }
    if (floatingProps.rightFromText !== undefined) {
      wrap.distRight = twipsToPx(floatingProps.rightFromText);
    }
  }

  return { anchor, wrap };
}

/**
 * Convert a ProseMirror table node to a TableBlock
 *
 * @param node - Table node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @param defaultFont - Default font family
 * @param defaultSize - Default font size
 * @param _styleContext - Style context (unused in current implementation)
 * @param trackedChanges - Optional tracked changes configuration
 * @param bookmarks - Optional bookmark position map
 * @param hyperlinkConfig - Hyperlink configuration
 * @param paragraphToFlowBlocks - Paragraph converter function (injected to avoid circular deps)
 * @returns TableBlock or null if conversion fails
 */
export function tableNodeToBlock({
  node,
  nextBlockId,
  positions,
  defaultFont,
  defaultSize,
  styleContext,
  trackedChangesConfig,
  bookmarks,
  hyperlinkConfig,
  themeColors,
  converterContext,
  converters,
  enableComments,
}: TableNodeToBlockParams): FlowBlock | null {
  if (!Array.isArray(node.content) || node.content.length === 0) return null;
  const paragraphConverter = converters.paragraphToFlowBlocks;
  if (!paragraphConverter) return null;

  const parserDeps: TableParserDependencies = {
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    themeColors,
    converterContext,
    converters,
    enableComments,
  };

  const hydratedTableStyle = hydrateTableStyleAttrs(node, converterContext);
  const defaultCellPadding = hydratedTableStyle?.cellPadding;

  const rows: TableRow[] = [];
  node.content.forEach((rowNode, rowIndex) => {
    const parsedRow = parseTableRow({
      rowNode,
      rowIndex,
      numRows: node?.content?.length ?? 1,
      context: parserDeps,
      defaultCellPadding,
      tableProperties: node.attrs?.tableProperties as TableProperties | undefined,
    });
    if (parsedRow) {
      rows.push(parsedRow);
    }
  });

  if (rows.length === 0) return null;

  const tableAttrs: Record<string, unknown> = {};
  const getBorderSource = (): Record<string, unknown> | undefined => {
    if (node.attrs?.borders && typeof node.attrs.borders === 'object' && node.attrs.borders !== null) {
      return node.attrs.borders as Record<string, unknown>;
    }
    if (
      hydratedTableStyle?.borders &&
      typeof hydratedTableStyle.borders === 'object' &&
      hydratedTableStyle.borders !== null
    ) {
      return hydratedTableStyle.borders as Record<string, unknown>;
    }
    return undefined;
  };
  const borderSource = getBorderSource();
  const tableBorders: TableBorders | undefined = extractTableBorders(borderSource);
  if (tableBorders) tableAttrs.borders = tableBorders;

  if (node.attrs?.borderCollapse) {
    tableAttrs.borderCollapse = node.attrs.borderCollapse;
  }

  if (node.attrs?.tableCellSpacing) {
    tableAttrs.cellSpacing = node.attrs.tableCellSpacing;
  }

  if (node.attrs?.justification) {
    tableAttrs.justification = node.attrs.justification;
  } else if (hydratedTableStyle?.justification) {
    tableAttrs.justification = hydratedTableStyle.justification;
  }

  if (node.attrs?.tableWidth) {
    tableAttrs.tableWidth = node.attrs.tableWidth;
  } else if (hydratedTableStyle?.tableWidth) {
    tableAttrs.tableWidth = hydratedTableStyle.tableWidth;
  }

  // Pass tableLayout through (extracted by tblLayout-translator.js)
  const tableLayout = node.attrs?.tableLayout;
  if (tableLayout) {
    tableAttrs.tableLayout = tableLayout;
  }

  // Preserve tableProperties for floating table detection and other OOXML metadata
  const tableProperties = node.attrs?.tableProperties;
  if (tableProperties && typeof tableProperties === 'object') {
    tableAttrs.tableProperties = tableProperties as Record<string, unknown>;
  }

  let columnWidths: number[] | undefined = undefined;

  const twipsToPixels = (twips: number): number => {
    const PIXELS_PER_INCH = 96;
    return (twips / 1440) * PIXELS_PER_INCH;
  };

  /**
   * Column width priority hierarchy (per plan Phase 3):
   * 1. User-edited grid (userEdited flag + grid attribute)
   * 2. PM colwidth attributes (fallback for PM-native edits)
   * 3. Original OOXML grid (untouched documents)
   * 4. Auto-calculate from content (no explicit widths)
   *
   * When both grid and colwidth are present:
   * - If userEdited=true: use grid (Priority 1)
   * - Otherwise: use colwidth (Priority 2) over grid (Priority 3)
   */

  // Priority 1: User-edited grid (preserves resize operations)
  const hasUserEditedGrid =
    node.attrs?.userEdited === true && Array.isArray(node.attrs?.grid) && node.attrs.grid.length > 0;

  if (hasUserEditedGrid) {
    columnWidths = (node.attrs!.grid as Array<{ col?: number } | null | undefined>)
      .filter((col): col is { col?: number } => col != null && typeof col === 'object')
      .map((col) => {
        const twips = typeof col.col === 'number' ? col.col : 0;
        return twips > 0 ? twipsToPixels(twips) : 0;
      })
      .filter((width: number) => width > 0);

    if (columnWidths.length === 0) {
      columnWidths = undefined;
    }
  }

  // Priority 2: PM colwidth attributes (higher priority than grid when userEdited !== true)
  if (!columnWidths && Array.isArray(node.content) && node.content.length > 0) {
    const firstRow = node.content[0];
    if (firstRow && isTableRowNode(firstRow) && Array.isArray(firstRow.content) && firstRow.content.length > 0) {
      const tempWidths: number[] = [];
      for (const cellNode of firstRow.content) {
        if (cellNode && isTableCellNode(cellNode) && cellNode.attrs?.colwidth !== undefined) {
          const colwidth = cellNode.attrs.colwidth;
          if (Array.isArray(colwidth)) {
            tempWidths.push(...colwidth.filter((w) => typeof w === 'number' && w > 0));
          } else if (typeof colwidth === 'number' && colwidth > 0) {
            tempWidths.push(colwidth);
          }
        }
      }
      if (tempWidths.length > 0) {
        columnWidths = tempWidths;
      }
    }
  }

  // Priority 3: Original OOXML grid (fallback when no colwidth)
  if (!columnWidths && Array.isArray(node.attrs?.grid) && node.attrs.grid.length > 0) {
    columnWidths = (node.attrs.grid as Array<{ col?: number } | null | undefined>)
      .filter((col): col is { col?: number } => col != null && typeof col === 'object')
      .map((col) => {
        const twips = typeof col.col === 'number' ? col.col : 0;
        return twips > 0 ? twipsToPixels(twips) : 0;
      })
      .filter((width: number) => width > 0);

    if (columnWidths.length === 0) {
      columnWidths = undefined;
    }
  }

  // Priority 4: Auto-calculate from content (columnWidths remains undefined)

  // Extract floating table anchor/wrap properties
  const { anchor, wrap } = extractFloatingTableAnchorWrap(node);

  const tableBlock: TableBlock = {
    kind: 'table',
    id: nextBlockId('table'),
    rows,
    attrs: Object.keys(tableAttrs).length > 0 ? tableAttrs : undefined,
    columnWidths,
    ...(anchor ? { anchor } : {}),
    ...(wrap ? { wrap } : {}),
  };

  return tableBlock;
}

/**
 * Handle table nodes.
 * Converts table node to table block.
 *
 * @param node - Table node to process
 * @param context - Shared handler context
 */
export function handleTableNode(node: PMNode, context: NodeHandlerContext): void {
  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    converters,
    converterContext,
    enableComments,
  } = context;

  const tableBlock = tableNodeToBlock({
    node,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    themeColors: undefined,
    converterContext,
    converters,
    enableComments,
  });
  if (tableBlock) {
    blocks.push(tableBlock);
    recordBlockKind(tableBlock.kind);
  }
}
