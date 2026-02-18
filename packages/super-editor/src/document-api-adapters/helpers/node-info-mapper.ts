import { getHeadingLevel, type BlockCandidate } from './node-address-resolver.js';
import type { InlineCandidate } from './inline-address-resolver.js';
import { resolveCommentIdFromAttrs, toFiniteNumber } from './value-utils.js';
import { DocumentApiAdapterError } from '../errors.js';
import type {
  BookmarkNodeInfo,
  CommentNodeInfo,
  FootnoteRefNodeInfo,
  HeadingNodeInfo,
  HeadingProperties,
  HyperlinkNodeInfo,
  ImageNodeInfo,
  LineBreakNodeInfo,
  ListItemNodeInfo,
  ListItemProperties,
  ListNumbering,
  NodeInfo,
  NodeType,
  ParagraphNodeInfo,
  ParagraphProperties,
  RunNodeInfo,
  SdtNodeInfo,
  TabNodeInfo,
  TableCellNodeInfo,
  TableNodeInfo,
  TableRowNodeInfo,
} from '@superdoc/document-api';
import type {
  ImageAttrs,
  ParagraphAttrs,
  StructuredContentBlockAttrs,
  TableAttrs,
  TableCellAttrs,
  TableMeasurement,
} from '../../extensions/types/node-attributes.js';

function resolveMeasurement(value: number | TableMeasurement | null | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.value === 'number') return value.value;
  return undefined;
}

function mapTableAlignment(
  justification: TableAttrs['tableProperties'] extends { justification?: infer J } ? J : never,
): TableNodeInfo['properties']['alignment'] {
  switch (justification) {
    case 'start':
      return 'left';
    case 'end':
      return 'right';
    case 'left':
    case 'center':
    case 'right':
      return justification;
    default:
      return undefined;
  }
}

function mapParagraphProperties(attrs: ParagraphAttrs | null | undefined): ParagraphProperties {
  const props = attrs?.paragraphProperties ?? undefined;
  const indentation = props?.indentation
    ? {
        left: props.indentation.left,
        right: props.indentation.right,
        firstLine: props.indentation.firstLine,
        hanging: props.indentation.hanging,
      }
    : undefined;

  const spacing = props?.spacing
    ? {
        before: props.spacing.before,
        after: props.spacing.after,
        line: props.spacing.line,
      }
    : undefined;

  const justification = props?.justification;
  const alignment = justification === 'both' ? 'justify' : justification;

  const paragraphNumbering = props?.numberingProperties
    ? {
        numId: toFiniteNumber(props.numberingProperties.numId),
        level: toFiniteNumber(props.numberingProperties.ilvl),
      }
    : undefined;

  return {
    styleId: props?.styleId ?? undefined,
    alignment: alignment ?? undefined,
    indentation,
    spacing,
    keepWithNext: props?.keepNext ?? undefined,
    outlineLevel: props?.outlineLevel ?? undefined,
    paragraphNumbering,
  };
}

function mapListNumbering(attrs: ParagraphAttrs | null | undefined): ListNumbering | undefined {
  const listRendering = attrs?.listRendering ?? undefined;
  if (!listRendering) return undefined;

  const listNumbering: ListNumbering = {};
  if (listRendering.markerText) listNumbering.marker = listRendering.markerText;
  if (Array.isArray(listRendering.path)) listNumbering.path = listRendering.path;
  if (Array.isArray(listRendering.path) && listRendering.path.length > 0) {
    listNumbering.ordinal = listRendering.path[listRendering.path.length - 1];
  }
  return Object.keys(listNumbering).length ? listNumbering : undefined;
}

function mapParagraphNode(candidate: BlockCandidate): ParagraphNodeInfo {
  const attrs = candidate.node.attrs as ParagraphAttrs | undefined;
  const properties = mapParagraphProperties(attrs);
  return {
    nodeType: 'paragraph',
    kind: 'block',
    properties,
  };
}

function mapHeadingNode(candidate: BlockCandidate): HeadingNodeInfo {
  const attrs = candidate.node.attrs as ParagraphAttrs | undefined;
  const baseProps = mapParagraphProperties(attrs);
  const headingLevelCandidate =
    getHeadingLevel(attrs?.paragraphProperties?.styleId) ??
    (baseProps.outlineLevel != null ? baseProps.outlineLevel + 1 : undefined);

  if (!headingLevelCandidate || headingLevelCandidate < 1 || headingLevelCandidate > 6) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Node "${candidate.nodeId}" does not have a valid heading level.`,
    );
  }

  const properties: HeadingProperties = {
    ...baseProps,
    headingLevel: headingLevelCandidate as HeadingProperties['headingLevel'],
  };

  return {
    nodeType: 'heading',
    kind: 'block',
    properties,
  };
}

function mapListItemNode(candidate: BlockCandidate): ListItemNodeInfo {
  const attrs = candidate.node.attrs as ParagraphAttrs | undefined;
  const baseProps = mapParagraphProperties(attrs);
  const properties: ListItemProperties = {
    ...baseProps,
    numbering: mapListNumbering(attrs),
  };

  return {
    nodeType: 'listItem',
    kind: 'block',
    properties,
  };
}

function mapTableNode(candidate: BlockCandidate): TableNodeInfo {
  const attrs = candidate.node.attrs as TableAttrs | undefined;
  const tableProps = attrs?.tableProperties ?? undefined;
  const properties = {
    layout: tableProps?.tableLayout ?? undefined,
    width: resolveMeasurement(tableProps?.tableWidth ?? null) ?? undefined,
    alignment: mapTableAlignment(tableProps?.justification),
  };

  return {
    nodeType: 'table',
    kind: 'block',
    properties,
  };
}

function mapTableRowNode(): TableRowNodeInfo {
  return {
    nodeType: 'tableRow',
    kind: 'block',
    properties: {},
  };
}

function mapTableCellNode(candidate: BlockCandidate): TableCellNodeInfo {
  const attrs = candidate.node.attrs as TableCellAttrs | undefined;
  const cellProps = attrs?.tableCellProperties ?? undefined;
  const properties = {
    width:
      resolveMeasurement(cellProps?.cellWidth ?? null) ??
      (Array.isArray(attrs?.colwidth) && attrs.colwidth.length > 0 ? attrs.colwidth[0] : undefined),
    shading: cellProps?.shading?.fill ?? attrs?.background?.color ?? undefined,
    vMerge:
      cellProps?.vMerge === 'continue' || cellProps?.vMerge === 'restart'
        ? true
        : attrs?.rowspan && attrs.rowspan > 1
          ? true
          : undefined,
    gridSpan: cellProps?.gridSpan ?? attrs?.colspan ?? undefined,
    padding:
      resolveMeasurement(cellProps?.cellMargins?.top ?? null) ?? resolveMeasurement(attrs?.cellMargins?.top ?? null),
  };

  return {
    nodeType: 'tableCell',
    kind: 'block',
    properties,
  };
}

function buildImageInfo(attrs: ImageAttrs | undefined, kind: 'block' | 'inline'): ImageNodeInfo {
  const properties = {
    src: attrs?.src ?? undefined,
    alt: attrs?.alt ?? undefined,
    size: attrs?.size
      ? {
          width: attrs.size.width,
          height: attrs.size.height,
          unit: undefined,
        }
      : undefined,
    wrap: attrs?.wrap?.type ?? undefined,
  };

  return {
    nodeType: 'image',
    kind,
    properties,
  };
}

function buildSdtInfo(attrs: StructuredContentBlockAttrs | undefined, kind: 'block' | 'inline'): SdtNodeInfo {
  const properties = {
    tag: attrs?.tag ?? undefined,
    alias: attrs?.alias ?? undefined,
  };

  return {
    nodeType: 'sdt',
    kind,
    properties,
  };
}

function mapHyperlinkNode(candidate: InlineCandidate): HyperlinkNodeInfo {
  const attrs = (candidate.mark?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  const properties = {
    href: typeof attrs.href === 'string' ? attrs.href : undefined,
    anchor:
      typeof attrs.anchor === 'string'
        ? attrs.anchor
        : typeof attrs.docLocation === 'string'
          ? attrs.docLocation
          : undefined,
    tooltip: typeof attrs.tooltip === 'string' ? attrs.tooltip : undefined,
  };
  return { nodeType: 'hyperlink', kind: 'inline', properties };
}

function mapCommentNode(candidate: InlineCandidate): CommentNodeInfo {
  const attrs = (candidate.mark?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  const commentId = resolveCommentIdFromAttrs(attrs);
  if (!commentId) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Comment node is missing a commentId attribute.');
  }
  const properties = {
    commentId,
  };
  return { nodeType: 'comment', kind: 'inline', properties };
}

function mapBookmarkNode(candidate: InlineCandidate): BookmarkNodeInfo {
  const attrs = (candidate.attrs ?? candidate.node?.attrs ?? {}) as Record<string, unknown>;
  const properties = {
    name: typeof attrs.name === 'string' ? attrs.name : undefined,
    bookmarkId: typeof attrs.id === 'string' ? attrs.id : undefined,
  };
  return { nodeType: 'bookmark', kind: 'inline', properties };
}

function mapFootnoteRefNode(candidate: InlineCandidate): FootnoteRefNodeInfo {
  const attrs = (candidate.node?.attrs ?? candidate.attrs ?? {}) as Record<string, unknown>;
  const properties = {
    noteId: typeof attrs.id === 'string' ? attrs.id : undefined,
  };
  return { nodeType: 'footnoteRef', kind: 'inline', properties };
}

function mapRunNode(candidate: InlineCandidate): RunNodeInfo {
  const attrs = (candidate.node?.attrs ?? candidate.attrs ?? {}) as {
    runProperties?: {
      bold?: boolean;
      italic?: boolean;
      underline?: { val?: string } | boolean;
      rFonts?: { ascii?: string; hAnsi?: string; eastAsia?: string; cs?: string };
      sz?: number;
      color?: { val?: string };
      highlight?: string;
      rStyle?: string;
      lang?: { val?: string };
      u?: { val?: string };
    } | null;
  };
  const runProperties = attrs.runProperties ?? undefined;
  const underline = Boolean(
    runProperties?.underline === true ||
      runProperties?.u?.val === 'single' ||
      (typeof runProperties?.underline === 'object' &&
        typeof runProperties?.underline?.val === 'string' &&
        runProperties.underline.val !== 'none'),
  );
  const font =
    runProperties?.rFonts?.ascii ??
    runProperties?.rFonts?.hAnsi ??
    runProperties?.rFonts?.eastAsia ??
    runProperties?.rFonts?.cs;

  return {
    nodeType: 'run',
    kind: 'inline',
    properties: {
      bold: runProperties?.bold ?? undefined,
      italic: runProperties?.italic ?? undefined,
      underline: underline || undefined,
      font: typeof font === 'string' ? font : undefined,
      size: typeof runProperties?.sz === 'number' ? runProperties.sz : undefined,
      color: runProperties?.color?.val ?? undefined,
      highlight: runProperties?.highlight ?? undefined,
      styleId: runProperties?.rStyle ?? undefined,
      language: runProperties?.lang?.val ?? undefined,
    },
  };
}

function mapTabNode(): TabNodeInfo {
  return { nodeType: 'tab', kind: 'inline', properties: {} };
}

function mapLineBreakNode(): LineBreakNodeInfo {
  return { nodeType: 'lineBreak', kind: 'inline', properties: {} };
}

function isInlineCandidate(candidate: BlockCandidate | InlineCandidate): candidate is InlineCandidate {
  return 'anchor' in candidate;
}

/**
 * Maps a block or inline candidate to its typed {@link NodeInfo} representation.
 *
 * @param candidate - The block or inline candidate to map.
 * @param overrideType - Optional node type override.
 * @returns Typed node information with properties populated from node attributes.
 * @throws {Error} If the node type is not implemented or the candidate kind mismatches.
 */
export function mapNodeInfo(candidate: BlockCandidate | InlineCandidate, overrideType?: NodeType): NodeInfo {
  const nodeType: NodeType = overrideType ?? candidate.nodeType;
  const kind = isInlineCandidate(candidate) ? 'inline' : 'block';

  switch (nodeType) {
    case 'paragraph':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Paragraph nodes can only be resolved as blocks.');
      return mapParagraphNode(candidate as BlockCandidate);
    case 'heading':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Heading nodes can only be resolved as blocks.');
      return mapHeadingNode(candidate as BlockCandidate);
    case 'listItem':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'ListItem nodes can only be resolved as blocks.');
      return mapListItemNode(candidate as BlockCandidate);
    case 'table':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Table nodes can only be resolved as blocks.');
      return mapTableNode(candidate as BlockCandidate);
    case 'tableRow':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'TableRow nodes can only be resolved as blocks.');
      return mapTableRowNode();
    case 'tableCell':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'TableCell nodes can only be resolved as blocks.');
      return mapTableCellNode(candidate as BlockCandidate);
    case 'image': {
      const attrs = candidate.node?.attrs as ImageAttrs | undefined;
      return buildImageInfo(attrs, kind);
    }
    case 'sdt': {
      const attrs = candidate.node?.attrs as StructuredContentBlockAttrs | undefined;
      return buildSdtInfo(attrs, kind);
    }
    case 'hyperlink':
      if (!isInlineCandidate(candidate))
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Hyperlink nodes can only be resolved inline.');
      return mapHyperlinkNode(candidate);
    case 'comment':
      if (!isInlineCandidate(candidate))
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Comment nodes can only be resolved inline.');
      return mapCommentNode(candidate);
    case 'run':
      if (!isInlineCandidate(candidate))
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Run nodes can only be resolved inline.');
      return mapRunNode(candidate);
    case 'bookmark':
      if (!isInlineCandidate(candidate))
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Bookmark nodes can only be resolved inline.');
      return mapBookmarkNode(candidate);
    case 'footnoteRef':
      if (!isInlineCandidate(candidate))
        throw new DocumentApiAdapterError('INVALID_TARGET', 'Footnote references can only be resolved inline.');
      return mapFootnoteRefNode(candidate);
    case 'tab':
      return mapTabNode();
    case 'lineBreak':
      return mapLineBreakNode();
    default:
      throw new DocumentApiAdapterError('INVALID_TARGET', `Node type "${nodeType}" is not implemented yet.`);
  }
}
