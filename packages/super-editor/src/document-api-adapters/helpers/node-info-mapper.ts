import type { Node as ProseMirrorNode } from 'prosemirror-model';
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
  TableOfContentsNodeInfo,
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
import { parseTocInstruction } from '../../core/super-converter/field-references/shared/toc-switches.js';

function resolveMeasurement(value: number | TableMeasurement | null | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.value === 'number') return value.value;
  return undefined;
}

function mapTableAlignment(
  justification: NonNullable<TableAttrs['tableProperties']>['justification'],
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
  const indentation = props?.indent
    ? {
        left: props.indent.left,
        right: props.indent.right,
        firstLine: props.indent.firstLine,
        hanging: props.indent.hanging,
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
    outlineLevel: props?.outlineLvl ?? undefined,
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

function mapTableOfContentsNode(candidate: BlockCandidate): TableOfContentsNodeInfo {
  const node = candidate.node;
  const instruction: string = node.attrs?.instruction ?? '';
  const config = parseTocInstruction(instruction);
  const entryCount = node.childCount;

  return {
    nodeType: 'tableOfContents',
    kind: 'block',
    properties: {
      instruction,
      sourceConfig: config.source,
      displayConfig: config.display,
      preservedSwitches: config.preserved,
      entryCount,
    },
  };
}

/**
 * Parse a CSS `inset(top% right% bottom% left%)` string into crop percentages.
 */
function parseCropFromClipPath(clipPath: string | undefined | null): ImageNodeInfo['properties']['crop'] {
  if (!clipPath) return null;
  const match = clipPath.match(/^inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (!match) return null;
  return {
    top: parseFloat(match[1]),
    right: parseFloat(match[2]),
    bottom: parseFloat(match[3]),
    left: parseFloat(match[4]),
  };
}

/**
 * Detect whether the image at `imagePos` has a Caption-styled sibling paragraph.
 * Returns false when `doc` is unavailable (context-free call sites).
 */
function detectCaptionSibling(doc: ProseMirrorNode | undefined, imagePos: number): boolean {
  if (!doc) return false;
  try {
    const $pos = doc.resolve(imagePos);
    const parentDepth = $pos.depth - 1;
    if (parentDepth < 0) return false;
    const parentPos = $pos.before(parentDepth + 1);
    const parentNode = $pos.node(parentDepth + 1);
    const afterParentPos = parentPos + parentNode.nodeSize;
    if (afterParentPos >= doc.content.size) return false;
    const nextNode = doc.nodeAt(afterParentPos);
    if (!nextNode || nextNode.type.name !== 'paragraph') return false;
    return nextNode.attrs?.paragraphProperties?.styleId === 'Caption';
  } catch {
    return false;
  }
}

function buildImageInfo(
  attrs: ImageAttrs | undefined,
  kind: 'block' | 'inline',
  doc?: ProseMirrorNode,
  pos?: number,
): ImageNodeInfo {
  const isFloating = Boolean(attrs?.isAnchor);
  const wrapObj = attrs?.wrap;
  const td = attrs?.transformData;

  const transform: ImageNodeInfo['properties']['transform'] =
    td && (td.rotation || td.verticalFlip || td.horizontalFlip)
      ? {
          rotation: td.rotation ?? undefined,
          verticalFlip: td.verticalFlip ?? undefined,
          horizontalFlip: td.horizontalFlip ?? undefined,
        }
      : null;

  const properties: ImageNodeInfo['properties'] = {
    src: attrs?.src ?? undefined,
    alt: attrs?.alt ?? undefined,
    size: attrs?.size
      ? {
          width: attrs.size.width,
          height: attrs.size.height,
          unit: undefined,
        }
      : undefined,
    placement: isFloating ? 'floating' : 'inline',
    wrap: {
      type: (wrapObj?.type as ImageNodeInfo['properties']['wrap']['type']) ?? 'Inline',
      attrs: wrapObj?.attrs ?? undefined,
    },
    anchorData: attrs?.anchorData ?? null,
    marginOffset: attrs?.marginOffset ?? null,
    relativeHeight: attrs?.relativeHeight ?? null,
    name: attrs?.alt ?? undefined,
    description: attrs?.title ?? undefined,
    transform,
    crop: parseCropFromClipPath(attrs?.clipPath),
    lockAspectRatio: attrs?.lockAspectRatio ?? true,
    decorative: attrs?.decorative ?? false,
    hyperlink: attrs?.hyperlink ?? null,
    hasCaption: pos != null ? detectCaptionSibling(doc, pos) : false,
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

function parseBooleanToken(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'none') return false;
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'single') return true;
  return undefined;
}

function resolveBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return parseBooleanToken(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const explicit = resolveBooleanLike(
      record.val ?? record.value ?? record.type ?? record['w:val'] ?? record['w:value'],
    );
    if (explicit != null) return explicit;
    return true;
  }
  return undefined;
}

function resolveUnderlineLike(values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) continue;
      return normalized !== 'none' && normalized !== 'false' && normalized !== '0';
    }
    const resolved = resolveBooleanLike(value);
    if (resolved != null) return resolved;
  }
  return undefined;
}

function resolveColorValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.val === 'string') return record.val;
    if (typeof record.value === 'string') return record.value;
    if (typeof record['w:val'] === 'string') return record['w:val'] as string;
  }
  return undefined;
}

function resolveHighlightValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const highlightValue = record.val ?? record.value ?? record['w:val'];
    if (typeof highlightValue === 'string') {
      const normalized = highlightValue.trim();
      if (!normalized) return undefined;
      if (normalized.toLowerCase() === 'none') return 'transparent';
      return normalized;
    }

    const fill = record.fill ?? record['w:fill'];
    if (typeof fill === 'string') {
      const normalized = fill.trim();
      if (!normalized || normalized.toLowerCase() === 'auto') return undefined;
      return normalized.startsWith('#') ? normalized : `#${normalized}`;
    }
  }
  return undefined;
}

function resolveFontValue(runProperties: Record<string, unknown>): string | undefined {
  const fromRFonts = runProperties.rFonts;
  if (fromRFonts && typeof fromRFonts === 'object') {
    const fonts = fromRFonts as Record<string, unknown>;
    const selected = fonts.ascii ?? fonts.hAnsi ?? fonts.eastAsia ?? fonts.cs;
    if (typeof selected === 'string') return selected;
  }

  const fromFontFamily = runProperties.fontFamily;
  if (typeof fromFontFamily === 'string') return fromFontFamily;
  if (fromFontFamily && typeof fromFontFamily === 'object') {
    const fonts = fromFontFamily as Record<string, unknown>;
    const selected = fonts.ascii ?? fonts.hAnsi ?? fonts.eastAsia ?? fonts.cs;
    if (typeof selected === 'string') return selected;
  }

  return undefined;
}

function resolveFontSizeValue(runProperties: Record<string, unknown>): number | undefined {
  const candidate = runProperties.sz ?? runProperties.size ?? runProperties.fontSize;
  if (typeof candidate === 'number') return candidate;
  if (typeof candidate === 'string') {
    const parsed = Number.parseFloat(candidate);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function mapRunNode(candidate: InlineCandidate): RunNodeInfo {
  const attrs = (candidate.node?.attrs ?? candidate.attrs ?? {}) as { runProperties?: Record<string, unknown> | null };
  const runProperties =
    attrs.runProperties && typeof attrs.runProperties === 'object'
      ? (attrs.runProperties as Record<string, unknown>)
      : undefined;
  const underline = resolveUnderlineLike([runProperties?.underline, runProperties?.u]);
  const strike = resolveBooleanLike(runProperties?.strike) ?? resolveBooleanLike(runProperties?.dstrike) ?? undefined;
  const languageRaw = runProperties?.lang;
  const language =
    typeof languageRaw === 'string'
      ? languageRaw
      : languageRaw &&
          typeof languageRaw === 'object' &&
          typeof (languageRaw as Record<string, unknown>).val === 'string'
        ? ((languageRaw as Record<string, unknown>).val as string)
        : undefined;

  return {
    nodeType: 'run',
    kind: 'inline',
    properties: {
      bold: resolveBooleanLike(runProperties?.bold) ?? undefined,
      italic: resolveBooleanLike(runProperties?.italic) ?? undefined,
      underline: underline ?? undefined,
      strike,
      font: runProperties ? resolveFontValue(runProperties) : undefined,
      size: runProperties ? resolveFontSizeValue(runProperties) : undefined,
      color: resolveColorValue(runProperties?.color),
      highlight: resolveHighlightValue(runProperties?.highlight),
      styleId:
        typeof runProperties?.rStyle === 'string'
          ? runProperties.rStyle
          : typeof runProperties?.styleId === 'string'
            ? runProperties.styleId
            : undefined,
      language,
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
export function mapNodeInfo(
  candidate: BlockCandidate | InlineCandidate,
  overrideType?: NodeType,
  doc?: ProseMirrorNode,
): NodeInfo {
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
      return buildImageInfo(attrs, kind, doc, candidate.pos);
    }
    case 'sdt': {
      const attrs = candidate.node?.attrs as StructuredContentBlockAttrs | undefined;
      return buildSdtInfo(attrs, kind);
    }
    case 'tableOfContents':
      if (kind !== 'block')
        throw new DocumentApiAdapterError('INVALID_TARGET', 'TableOfContents nodes can only be resolved as blocks.');
      return mapTableOfContentsNode(candidate as BlockCandidate);
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
