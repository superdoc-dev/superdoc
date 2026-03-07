/**
 * SD Projection — dematerializes ProseMirror nodes into SDM/1 content/inline nodes.
 *
 * This is the inverse of the node-materializer (which converts SD → PM).
 * The projection reads PM document state and produces canonical SDM/1 shapes
 * suitable for the `get`, `getNode`, and `find` operation outputs.
 *
 * ID guarantee: every projected SDContentNode has a non-empty `id` from
 * the PM node's `sdBlockId` attribute.
 */

import type { Node as ProseMirrorNode, Mark as ProseMirrorMark } from 'prosemirror-model';
import type {
  SDContentNode,
  SDInlineNode,
  SDParagraph,
  SDHeading,
  SDTable,
  SDTableRow,
  SDTableCell,
  SDList,
  SDListItem,
  SDRun,
  SDHyperlink,
  SDImage,
  SDToc,
  SDSdt,
  SDBreak,
  SDSectionBreak,
  SDTab,
  SDLineBreak,
  SDFootnoteRef,
  SDEndnoteRef,
  SDField,
  SDDocument,
  SDSection,
  SDNumberingCatalog,
  SDParagraphProps,
  SDRunProps,
  SDReadOptions,
  SectionDomain,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { ParagraphAttrs, TableAttrs, TableCellAttrs, ImageAttrs } from '../../extensions/types/node-attributes.js';
import { getHeadingLevel } from './node-address-resolver.js';
import { parseTocInstruction } from '../../core/super-converter/field-references/shared/toc-switches.js';
import { resolveSectionProjections, type SectionProjection } from './sections-resolver.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Projects a single ProseMirror content node into an SDM/1 SDContentNode.
 */
export function projectContentNode(pmNode: ProseMirrorNode): SDContentNode {
  return projectBlock(pmNode);
}

/**
 * Projects a ProseMirror text node (with marks) into SDM/1 inline nodes.
 */
export function projectInlineNode(pmNode: ProseMirrorNode): SDInlineNode {
  return projectInline(pmNode);
}

/**
 * Projects a mark-based inline candidate (hyperlink, comment) into an SDInlineNode.
 *
 * Mark-based candidates carry `mark` and `attrs` but no PM `node` reference.
 * This resolves the spanned text from the document and builds the correct
 * SDM/1 shape (e.g. SDHyperlink with inlines) rather than a generic run.
 */
export function projectMarkBasedInline(
  editor: Editor,
  candidate: {
    nodeType: string;
    anchor: { start: { blockId: string; offset: number }; end: { blockId: string; offset: number } };
    attrs?: Record<string, unknown>;
  },
): SDInlineNode | null {
  const { nodeType, anchor, attrs } = candidate;

  // Resolve the text spanned by this mark from the document.
  // Anchors use the block's primary ID (paraId on imported docs, sdBlockId on
  // fresh nodes), so we must match against all known ID attributes — not just
  // sdBlockId — to handle paraId-primary documents correctly.
  const text = resolveTextByBlockId(editor, anchor);

  if (nodeType === 'hyperlink') {
    return {
      kind: 'hyperlink',
      hyperlink: {
        ...(typeof attrs?.href === 'string' ? { href: attrs.href } : {}),
        ...(typeof attrs?.anchor === 'string' ? { anchor: attrs.anchor } : {}),
        ...(typeof attrs?.tooltip === 'string' ? { tooltip: attrs.tooltip } : {}),
        inlines: [{ kind: 'run', run: { text } }],
      },
    };
  }

  // Generic fallback for other mark-based inlines (e.g. comments)
  return { kind: 'run', run: { text } };
}

/**
 * Matches a PM block node against a blockId by checking all known ID attributes.
 *
 * The block index assigns primary IDs using `resolveBlockNodeId` which prefers
 * `paraId` over `sdBlockId` for paragraphs and tables. Inline anchors carry
 * this primary ID. To match correctly we must check all candidate attributes.
 */
function blockMatchesId(node: ProseMirrorNode, blockId: string): boolean {
  const attrs = node.attrs as Record<string, unknown> | undefined;
  if (!attrs) return false;
  return (
    attrs.sdBlockId === blockId ||
    attrs.paraId === blockId ||
    attrs.blockId === blockId ||
    attrs.id === blockId ||
    attrs.uuid === blockId
  );
}

/**
 * Resolves text content from a PM document for a given anchor range.
 *
 * Uses {@link blockMatchesId} to find the containing block, which handles
 * both paraId-primary and sdBlockId-primary documents correctly.
 */
export function resolveTextByBlockId(
  editor: Editor,
  anchor: { start: { blockId: string; offset: number }; end: { blockId: string; offset: number } },
): string {
  try {
    const doc = editor.state.doc;
    let text = '';
    doc.descendants((node, pos) => {
      if (blockMatchesId(node, anchor.start.blockId) && node.isBlock) {
        const from = pos + 1 + anchor.start.offset;
        const to = pos + 1 + anchor.end.offset;
        text = doc.textBetween(from, Math.min(to, pos + node.nodeSize - 1), '');
        return false;
      }
      return true;
    });
    return text;
  } catch {
    return '';
  }
}

/**
 * Projects the full editor document into an SDDocument.
 *
 * @param options - SDReadOptions controlling projection depth.
 *   Currently accepted but reserved for future use:
 *   - `includeResolved` — resolved style values (requires style-engine integration)
 *   - `includeProvenance` — source provenance metadata
 *   - `includeContext` — parent/sibling context for each node
 */
export function projectDocument(editor: Editor, options?: SDReadOptions): SDDocument {
  const doc = editor.state.doc;
  const body: SDContentNode[] = [];

  doc.forEach((child) => {
    body.push(projectBlock(child));
  });

  const sections = projectSections(editor);
  const numbering = projectNumberingCatalog(editor);

  return {
    modelVersion: 'sdm/1',
    body,
    ...(sections.length > 0 && { sections }),
    ...(numbering && { numbering }),
  };
}

// ---------------------------------------------------------------------------
// Section projection
// ---------------------------------------------------------------------------

/**
 * Projects section metadata from the editor into SDSection objects.
 */
function projectSections(editor: Editor): SDSection[] {
  let projections: SectionProjection[];
  try {
    projections = resolveSectionProjections(editor);
  } catch {
    // If section resolution fails (e.g. no document loaded), return empty
    return [];
  }
  return projections.map((projection) => domainToSDSection(projection.domain));
}

/**
 * Maps a SectionDomain (document-api adapter model) to an SDSection (SDM/1 model).
 */
function domainToSDSection(domain: SectionDomain): SDSection {
  const section: SDSection = { id: domain.address.sectionId };

  if (domain.breakType) section.breakType = domain.breakType;
  if (domain.pageSetup) section.pageSetup = domain.pageSetup;
  if (domain.margins) {
    section.margins = {
      top: domain.margins.top,
      right: domain.margins.right,
      bottom: domain.margins.bottom,
      left: domain.margins.left,
      gutter: domain.margins.gutter,
    };
  }
  if (domain.headerFooterMargins) section.headerFooterMargins = domain.headerFooterMargins;
  if (domain.columns) section.columns = domain.columns;
  if (domain.lineNumbering) section.lineNumbering = domain.lineNumbering;
  if (domain.pageNumbering) section.pageNumbering = domain.pageNumbering;
  if (domain.titlePage != null) section.titlePage = domain.titlePage;
  if (domain.oddEvenHeadersFooters != null) section.oddEvenHeadersFooters = domain.oddEvenHeadersFooters;
  if (domain.verticalAlign) section.verticalAlign = domain.verticalAlign;
  if (domain.sectionDirection) section.sectionDirection = domain.sectionDirection;

  // headerContent / footerContent projection deferred — requires converter context
  // to look up header/footer parts by reference ID and project their PM content.

  return section;
}

// ---------------------------------------------------------------------------
// Numbering catalog projection
// ---------------------------------------------------------------------------

/** Bullet format values in OOXML. */
const BULLET_FORMATS: ReadonlySet<string> = new Set(['bullet']);

/**
 * Projects the editor's numbering definitions into an SDNumberingCatalog.
 *
 * Reads from `editor.converter.translatedNumbering` which contains the
 * parsed OOXML w:numbering data (definitions keyed by numId, abstracts
 * keyed by abstractNumId with per-level format/text/start/restart info).
 */
function projectNumberingCatalog(editor: Editor): SDNumberingCatalog | undefined {
  const translated = (editor as any).converter?.translatedNumbering as TranslatedNumbering | undefined;
  if (!translated) return undefined;

  const { definitions = {}, abstracts = {} } = translated;
  const entries = Object.entries(definitions);
  if (entries.length === 0) return undefined;

  const catalog: SDNumberingCatalog = { definitions: {} };

  for (const [numId, definition] of entries) {
    if (!definition) continue;

    const abstractId = definition.abstractNumId;
    const abstract = abstractId != null ? abstracts[abstractId] : undefined;
    const levelDefs = abstract?.levels;
    if (!levelDefs) continue;

    const levels: SDNumberingCatalog['definitions'] extends Record<string, infer V> | undefined
      ? V extends { levels: infer L }
        ? L
        : never
      : never = [];

    for (const levelDef of Object.values(levelDefs) as TranslatedLevel[]) {
      const format = levelDef.numFmt?.val;
      const start = definition.lvlOverrides?.[levelDef.ilvl]?.startOverride ?? levelDef.start;

      levels.push({
        level: levelDef.ilvl,
        kind: format && BULLET_FORMATS.has(format) ? 'bullet' : 'ordered',
        ...(format != null && { format }),
        ...(levelDef.lvlText != null && { text: levelDef.lvlText }),
        ...(start != null && { start }),
        ...(levelDef.lvlRestart != null && { restartAfterLevel: levelDef.lvlRestart }),
      });
    }

    if (levels.length > 0) {
      catalog.definitions![numId] = { levels };
    }
  }

  return Object.keys(catalog.definitions!).length > 0 ? catalog : undefined;
}

/** Shape of editor.converter.translatedNumbering */
interface TranslatedNumbering {
  definitions?: Record<
    string,
    {
      abstractNumId?: string;
      lvlOverrides?: Record<number, { startOverride?: number }>;
    }
  >;
  abstracts?: Record<
    string,
    {
      levels?: Record<number | string, TranslatedLevel>;
    }
  >;
}

interface TranslatedLevel {
  ilvl: number;
  numFmt?: { val?: string; format?: string };
  lvlText?: string;
  start?: number;
  lvlRestart?: number | null;
  suff?: string;
}

// ---------------------------------------------------------------------------
// Block-level dispatch
// ---------------------------------------------------------------------------

function projectBlock(pmNode: ProseMirrorNode): SDContentNode {
  const typeName = pmNode.type.name;

  switch (typeName) {
    case 'paragraph':
      return projectParagraphOrHeading(pmNode);
    case 'heading':
      return projectHeadingNode(pmNode);
    case 'table':
      return projectTable(pmNode);
    case 'bulletList':
    case 'orderedList':
      return projectList(pmNode, typeName === 'orderedList');
    case 'listItem':
      return projectListItemAsContent(pmNode);
    case 'image':
      return projectBlockImage(pmNode);
    case 'tableOfContents':
      return projectToc(pmNode);
    case 'sdt':
    case 'structuredContentBlock':
      return projectBlockSdt(pmNode);
    case 'sectionBreak':
      return projectSectionBreak(pmNode);
    case 'pageBreak':
    case 'horizontalRule':
      return projectBreak(pmNode);
    case 'drawing':
      return projectBlockDrawing(pmNode);
    default:
      return projectFallbackBlock(pmNode);
  }
}

// ---------------------------------------------------------------------------
// Paragraph / Heading
// ---------------------------------------------------------------------------

function projectParagraphOrHeading(pmNode: ProseMirrorNode): SDParagraph | SDHeading {
  const attrs = pmNode.attrs as ParagraphAttrs | undefined;
  const headingLevel = getHeadingLevel(attrs?.paragraphProperties?.styleId);

  if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
    return buildHeading(pmNode, attrs, headingLevel as 1 | 2 | 3 | 4 | 5 | 6);
  }

  return buildParagraph(pmNode, attrs);
}

function projectHeadingNode(pmNode: ProseMirrorNode): SDHeading {
  const attrs = pmNode.attrs as ParagraphAttrs | undefined;
  const rawLevel = (pmNode.attrs as any)?.level;
  const level = (rawLevel ?? getHeadingLevel(attrs?.paragraphProperties?.styleId) ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
  return buildHeading(pmNode, attrs, level);
}

function buildParagraph(pmNode: ProseMirrorNode, attrs: ParagraphAttrs | undefined): SDParagraph {
  const inlines = projectInlineChildren(pmNode);
  const result: SDParagraph = {
    kind: 'paragraph',
    id: resolveNodeId(pmNode),
    paragraph: { inlines },
  };

  const styleRef = attrs?.paragraphProperties?.styleId ?? (pmNode.attrs as any)?.paragraphStyle;
  if (styleRef) result.paragraph.styleRef = styleRef;

  const props = extractParagraphProps(attrs);
  if (props) result.paragraph.props = props;

  return result;
}

function buildHeading(
  pmNode: ProseMirrorNode,
  attrs: ParagraphAttrs | undefined,
  level: 1 | 2 | 3 | 4 | 5 | 6,
): SDHeading {
  const inlines = projectInlineChildren(pmNode);
  const result: SDHeading = {
    kind: 'heading',
    id: resolveNodeId(pmNode),
    heading: { level, inlines },
  };

  const styleRef = attrs?.paragraphProperties?.styleId ?? (pmNode.attrs as any)?.paragraphStyle;
  if (styleRef) result.heading.styleRef = styleRef;

  const props = extractParagraphProps(attrs);
  if (props) result.heading.props = props;

  return result;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function projectTable(pmNode: ProseMirrorNode): SDTable {
  const attrs = pmNode.attrs as TableAttrs | undefined;
  const pmAttrs = pmNode.attrs as Record<string, unknown>;
  const rows: SDTableRow[] = [];

  pmNode.forEach((child) => {
    if (child.type.name === 'tableRow') {
      rows.push(projectTableRow(child));
    }
  });

  const result: SDTable = {
    kind: 'table',
    id: resolveNodeId(pmNode),
    table: { rows },
  };

  const styleRef = attrs?.tableProperties?.tableStyleId ?? (pmAttrs as any)?.tableStyleId;
  if (styleRef) result.table.styleRef = styleRef;

  const props = extractTableProps(attrs, pmAttrs);
  if (props) result.table.props = props;

  const gridModel = (pmAttrs as any)?.grid ?? (pmAttrs as any)?.tableGridModel ?? attrs?.tableGrid?.colWidths;
  if (gridModel && Array.isArray(gridModel)) {
    const columns = gridModel
      .map((item: any) => (typeof item === 'number' ? item : (item?.col ?? item?.width)))
      .filter((width: unknown): width is number => typeof width === 'number' && Number.isFinite(width))
      .map((width: number) => ({ width }));
    if (columns.length > 0) {
      result.table.columns = columns;
    }
  }

  if ((pmAttrs as any)?.needsTableStyleNormalization === true) {
    const ext = isRecord(result.ext) ? { ...result.ext } : {};
    const superdocExt = isRecord(ext.superdoc) ? { ...(ext.superdoc as Record<string, unknown>) } : {};
    superdocExt.needsTableStyleNormalization = true;
    result.ext = {
      ...ext,
      superdoc: superdocExt,
    };
  }

  return result;
}

function projectTableRow(pmNode: ProseMirrorNode): SDTableRow {
  const cells: SDTableCell[] = [];
  pmNode.forEach((child) => {
    if (child.type.name === 'tableCell' || child.type.name === 'tableHeader') {
      cells.push(projectTableCell(child));
    }
  });

  const row: SDTableRow = { cells };
  const attrs = pmNode.attrs;
  if (attrs?.minHeight !== undefined || attrs?.cantSplit !== undefined) {
    row.props = {};
    if (attrs.minHeight !== undefined) row.props.minHeight = attrs.minHeight;
    if (attrs.cantSplit !== undefined) row.props.cantSplit = attrs.cantSplit;
  }
  return row;
}

function projectTableCell(pmNode: ProseMirrorNode): SDTableCell {
  const attrs = pmNode.attrs as TableCellAttrs | undefined;
  const content: SDContentNode[] = [];
  pmNode.forEach((child) => {
    content.push(projectBlock(child));
  });

  const cell: SDTableCell = { content };
  if (attrs?.colspan && attrs.colspan > 1) cell.colSpan = attrs.colspan;
  if (attrs?.rowspan && attrs.rowspan > 1) cell.rowSpan = attrs.rowspan;

  const cellProps = attrs?.tableCellProperties;
  const vAlign = cellProps?.vAlign ?? attrs?.verticalAlign;
  if (vAlign) {
    cell.props = { verticalAlign: vAlign as 'top' | 'center' | 'bottom' };
  }

  return cell;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function projectList(pmNode: ProseMirrorNode, ordered: boolean): SDList {
  const items: SDListItem[] = [];
  pmNode.forEach((child) => {
    if (child.type.name === 'listItem') {
      items.push(projectListItem(child));
    }
  });

  const result: SDList = {
    kind: 'list',
    id: resolveNodeId(pmNode),
    list: {
      items,
      levels: [{ level: 0, kind: ordered ? 'ordered' : 'bullet' }],
    },
  };

  const attrs = pmNode.attrs;
  if (attrs?.listStyleId) result.list.styleRef = attrs.listStyleId;

  return result;
}

function projectListItem(pmNode: ProseMirrorNode): SDListItem {
  const content: SDContentNode[] = [];
  pmNode.forEach((child) => {
    content.push(projectBlock(child));
  });

  const item: SDListItem = {
    level: pmNode.attrs?.level ?? 0,
    content,
  };

  return item;
}

/** When a listItem appears at top-level (orphan), wrap it in a paragraph. */
function projectListItemAsContent(pmNode: ProseMirrorNode): SDParagraph {
  const inlines = projectInlineChildren(pmNode);
  return {
    kind: 'paragraph',
    id: resolveNodeId(pmNode),
    paragraph: { inlines },
  };
}

// ---------------------------------------------------------------------------
// Image (block-level)
// ---------------------------------------------------------------------------

function projectBlockImage(pmNode: ProseMirrorNode): SDImage {
  const attrs = pmNode.attrs as ImageAttrs | undefined;
  return {
    kind: 'image',
    id: resolveNodeId(pmNode),
    image: {
      src: attrs?.src ?? '',
      ...(attrs?.alt ? { alt: attrs.alt } : {}),
      ...(attrs?.size ? { geometry: { width: attrs.size.width, height: attrs.size.height } } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// TOC
// ---------------------------------------------------------------------------

function projectToc(pmNode: ProseMirrorNode): SDToc {
  const instruction: string = pmNode.attrs?.instruction ?? '';
  const config = parseTocInstruction(instruction);

  return {
    kind: 'toc',
    id: resolveNodeId(pmNode),
    toc: {
      ...(instruction ? { instruction } : {}),
      ...(config.source ? { sourceConfig: config.source } : {}),
      ...(config.display ? { displayConfig: config.display } : {}),
      ...(config.preserved ? { preservedSwitches: config.preserved } : {}),
      entryCount: pmNode.childCount,
    },
  };
}

// ---------------------------------------------------------------------------
// SDT (block + inline)
// ---------------------------------------------------------------------------

const LOCK_MODE_TO_SDT_LOCK: Record<string, SDSdt['sdt']['lock']> = {
  unlocked: 'none',
  sdtLocked: 'sdt',
  contentLocked: 'content',
  sdtContentLocked: 'both',
};

function extractSdtMetadata(attrs: Record<string, unknown>): Omit<SDSdt['sdt'], 'content' | 'inlines' | 'scope'> {
  const lock = LOCK_MODE_TO_SDT_LOCK[attrs.lockMode as string];
  const controlType = attrs.controlType ?? attrs.type;

  return {
    ...(attrs.tag ? { tag: attrs.tag as string } : {}),
    ...(attrs.alias ? { alias: attrs.alias as string } : {}),
    ...(typeof controlType === 'string' ? { type: controlType } : {}),
    ...(attrs.appearance ? { appearance: attrs.appearance as string } : {}),
    ...(attrs.placeholder ? { placeholder: attrs.placeholder as string } : {}),
    ...(lock && lock !== 'none' ? { lock } : {}),
  };
}

function projectBlockSdt(pmNode: ProseMirrorNode): SDSdt {
  const children: SDContentNode[] = [];
  pmNode.forEach((child) => {
    children.push(projectBlock(child));
  });

  return {
    kind: 'sdt',
    id: resolveSdtNodeId(pmNode),
    sdt: {
      ...extractSdtMetadata(pmNode.attrs ?? {}),
      scope: 'block',
      ...(children.length > 0 ? { content: children } : {}),
    },
  };
}

function projectInlineSdt(pmNode: ProseMirrorNode): SDSdt {
  const inlines = projectInlineChildren(pmNode);

  return {
    kind: 'sdt',
    id: resolveSdtNodeId(pmNode),
    sdt: {
      ...extractSdtMetadata(pmNode.attrs ?? {}),
      scope: 'inline',
      ...(inlines.length > 0 ? { inlines } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Section break / break
// ---------------------------------------------------------------------------

function projectSectionBreak(pmNode: ProseMirrorNode): SDSectionBreak {
  return {
    kind: 'sectionBreak',
    id: resolveNodeId(pmNode),
    sectionBreak: {
      targetSectionId: pmNode.attrs?.targetSectionId ?? '',
    },
  };
}

function projectBreak(pmNode: ProseMirrorNode): SDBreak {
  const breakType = pmNode.attrs?.breakType ?? 'page';
  return {
    kind: 'break',
    id: resolveNodeId(pmNode),
    break: { type: breakType === 'column' ? 'column' : 'page' },
  };
}

// ---------------------------------------------------------------------------
// Drawing (block-level)
// ---------------------------------------------------------------------------

function projectBlockDrawing(pmNode: ProseMirrorNode): SDContentNode {
  return {
    kind: 'drawing',
    id: resolveNodeId(pmNode),
    drawing: {
      source: pmNode.attrs?.source ?? { type: 'unknown' },
      ...(pmNode.attrs?.geometry ? { geometry: pmNode.attrs.geometry } : {}),
      ...(pmNode.attrs?.layout ? { layout: pmNode.attrs.layout } : {}),
    },
  } as SDContentNode;
}

// ---------------------------------------------------------------------------
// Fallback block
// ---------------------------------------------------------------------------

function projectFallbackBlock(pmNode: ProseMirrorNode): SDParagraph {
  const inlines = projectInlineChildren(pmNode);
  return {
    kind: 'paragraph',
    id: resolveNodeId(pmNode),
    paragraph: { inlines },
  };
}

// ---------------------------------------------------------------------------
// Inline projection
// ---------------------------------------------------------------------------

function projectInlineChildren(pmNode: ProseMirrorNode): SDInlineNode[] {
  const inlines: SDInlineNode[] = [];
  pmNode.forEach((child) => {
    const projected = projectInline(child);
    inlines.push(projected);
  });
  return inlines;
}

function projectInline(pmNode: ProseMirrorNode): SDInlineNode {
  if (pmNode.isText) {
    return projectTextRun(pmNode);
  }

  switch (pmNode.type.name) {
    case 'run':
      return projectRunNode(pmNode);
    case 'image':
      return projectInlineImage(pmNode);
    case 'tab':
      return projectTab();
    case 'hardBreak':
    case 'lineBreak':
      return projectLineBreak();
    case 'footnoteRef':
    case 'footnoteReference':
      return projectFootnoteRef(pmNode);
    case 'endnoteRef':
    case 'endnoteReference':
      return projectEndnoteRef(pmNode);
    case 'field':
      return projectInlineField(pmNode);
    case 'structuredContent':
      return projectInlineSdt(pmNode);
    default:
      return projectInlineFallback(pmNode);
  }
}

// ---------------------------------------------------------------------------
// Run node (SuperDoc schema: paragraph → run → text)
// ---------------------------------------------------------------------------

function projectRunNode(pmNode: ProseMirrorNode): SDRun | SDHyperlink {
  const attrs = (pmNode.attrs ?? {}) as Record<string, any>;
  const runProperties = attrs.runProperties as Record<string, any> | undefined;
  const text = pmNode.textContent;

  // Check for hyperlink wrapping via link mark on children
  let linkMark: ProseMirrorMark | undefined;
  pmNode.forEach((child) => {
    if (!linkMark) {
      linkMark = child.marks?.find((m) => m.type.name === 'link');
    }
  });

  if (linkMark) {
    return buildHyperlinkFromRunNode(pmNode, linkMark);
  }

  const run: SDRun = { kind: 'run', run: { text } };

  const styleRef =
    typeof runProperties?.rStyle === 'string'
      ? runProperties.rStyle
      : typeof runProperties?.styleId === 'string'
        ? runProperties.styleId
        : undefined;
  if (styleRef) run.run.styleRef = styleRef;

  const props = extractRunPropsFromRunProperties(runProperties);
  if (props) run.run.props = props;

  return run;
}

function buildHyperlinkFromRunNode(pmNode: ProseMirrorNode, linkMark: ProseMirrorMark): SDHyperlink {
  const attrs = linkMark.attrs as Record<string, unknown>;
  const childRun: SDRun = {
    kind: 'run',
    run: { text: pmNode.textContent },
  };

  const runProperties = (pmNode.attrs as Record<string, any>)?.runProperties;
  const props = extractRunPropsFromRunProperties(runProperties);
  if (props) childRun.run.props = props;

  return {
    kind: 'hyperlink',
    hyperlink: {
      ...(typeof attrs.href === 'string' ? { href: attrs.href } : {}),
      ...(typeof attrs.anchor === 'string' ? { anchor: attrs.anchor } : {}),
      ...(typeof attrs.tooltip === 'string' ? { tooltip: attrs.tooltip } : {}),
      inlines: [childRun],
    },
  };
}

/**
 * Extracts SDRunProps from PM run node's `runProperties` attribute object.
 * This handles the SuperDoc schema where run properties are stored as node attributes
 * rather than PM marks.
 */
function extractRunPropsFromRunProperties(runProperties: Record<string, any> | undefined): SDRunProps | undefined {
  if (!runProperties) return undefined;

  const props: SDRunProps = {};
  let hasProps = false;

  const resolveBool = (v: unknown): boolean | undefined => {
    if (typeof v === 'boolean') return v;
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const val = obj.val ?? obj.value;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val !== '0' && val !== 'false' && val !== 'none';
      return true; // presence of object = true (OOXML toggle)
    }
    if (typeof v === 'string') return v !== '0' && v !== 'false';
    return undefined;
  };

  const bold = resolveBool(runProperties.bold ?? runProperties.b);
  if (bold) {
    props.bold = true;
    hasProps = true;
  }

  const italic = resolveBool(runProperties.italic ?? runProperties.i);
  if (italic) {
    props.italic = true;
    hasProps = true;
  }

  const underline = runProperties.underline ?? runProperties.u;
  if (underline !== undefined && underline !== 'none' && underline !== false) {
    props.underline = typeof underline === 'object' ? underline : { style: 'single' };
    hasProps = true;
  }

  const strike = resolveBool(runProperties.strike ?? runProperties.dstrike);
  if (strike) {
    props.strikethrough = true;
    hasProps = true;
  }

  if (runProperties.highlight) {
    const h = runProperties.highlight;
    const color = typeof h === 'string' ? h : (h?.val ?? h?.color);
    if (typeof color === 'string') {
      props.highlight = color as SDRunProps['highlight'];
      hasProps = true;
    }
  }

  if (runProperties.color) {
    const c = runProperties.color;
    props.color = typeof c === 'string' ? { model: 'rgb', value: c } : c;
    hasProps = true;
  }

  const sz = runProperties.sz ?? runProperties.size ?? runProperties.fontSize;
  if (typeof sz === 'number') {
    props.fontSize = sz;
    hasProps = true;
  } else if (typeof sz === 'string') {
    const parsed = Number.parseFloat(sz);
    if (Number.isFinite(parsed)) {
      props.fontSize = parsed;
      hasProps = true;
    }
  }

  const rFonts = runProperties.rFonts ?? runProperties.fontFamily;
  if (rFonts) {
    if (typeof rFonts === 'string') {
      props.fontFamily = rFonts;
      hasProps = true;
    } else if (typeof rFonts === 'object') {
      const selected = rFonts.ascii ?? rFonts.hAnsi ?? rFonts.eastAsia ?? rFonts.cs;
      if (typeof selected === 'string') {
        props.fontFamily = selected;
        hasProps = true;
      }
      props.fonts = rFonts as SDRunProps['fonts'];
      hasProps = true;
    }
  }

  const lang = runProperties.lang;
  if (lang) {
    props.lang = typeof lang === 'string' ? { val: lang } : lang;
    hasProps = true;
  }

  if (resolveBool(runProperties.caps)) {
    props.caps = true;
    hasProps = true;
  }
  if (resolveBool(runProperties.smallCaps)) {
    props.smallCaps = true;
    hasProps = true;
  }
  if (resolveBool(runProperties.vanish)) {
    props.vanish = true;
    hasProps = true;
  }

  return hasProps ? props : undefined;
}

// ---------------------------------------------------------------------------
// Text run (bare PM text nodes — used in schemas without the run node wrapper)
// ---------------------------------------------------------------------------

function projectTextRun(pmNode: ProseMirrorNode): SDRun | SDHyperlink {
  const marks = pmNode.marks;

  // Check if wrapped in a link mark → hyperlink
  const linkMark = marks.find((m) => m.type.name === 'link');
  if (linkMark) {
    return projectHyperlinkFromMark(pmNode, linkMark);
  }

  const run: SDRun = {
    kind: 'run',
    run: { text: pmNode.text ?? '' },
  };

  const styleRef = extractRunStyleRef(marks);
  if (styleRef) run.run.styleRef = styleRef;

  const props = extractRunProps(marks);
  if (props) run.run.props = props;

  return run;
}

function projectHyperlinkFromMark(pmNode: ProseMirrorNode, linkMark: ProseMirrorMark): SDHyperlink {
  const attrs = linkMark.attrs as Record<string, unknown>;
  const childRun: SDRun = {
    kind: 'run',
    run: { text: pmNode.text ?? '' },
  };

  const otherMarks = pmNode.marks.filter((m) => m !== linkMark);
  const props = extractRunPropsFromMarks(otherMarks);
  if (props) childRun.run.props = props;
  const styleRef = extractRunStyleRefFromMarks(otherMarks);
  if (styleRef) childRun.run.styleRef = styleRef;

  return {
    kind: 'hyperlink',
    hyperlink: {
      ...(typeof attrs.href === 'string' ? { href: attrs.href } : {}),
      ...(typeof attrs.anchor === 'string' ? { anchor: attrs.anchor } : {}),
      ...(typeof attrs.tooltip === 'string' ? { tooltip: attrs.tooltip } : {}),
      inlines: [childRun],
    },
  };
}

// ---------------------------------------------------------------------------
// Inline image
// ---------------------------------------------------------------------------

function projectInlineImage(pmNode: ProseMirrorNode): SDImage {
  const attrs = pmNode.attrs as ImageAttrs | undefined;
  return {
    kind: 'image',
    image: {
      src: attrs?.src ?? '',
      ...(attrs?.alt ? { alt: attrs.alt } : {}),
      ...(attrs?.size ? { geometry: { width: attrs.size.width, height: attrs.size.height } } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Simple inline nodes
// ---------------------------------------------------------------------------

function projectTab(): SDTab {
  return { kind: 'tab', tab: {} };
}

function projectLineBreak(): SDLineBreak {
  return { kind: 'lineBreak', lineBreak: {} };
}

function projectFootnoteRef(pmNode: ProseMirrorNode): SDFootnoteRef {
  return {
    kind: 'footnoteRef',
    footnoteRef: {
      ...(pmNode.attrs?.id ? { noteId: pmNode.attrs.id } : {}),
      ...(pmNode.attrs?.noteId ? { noteId: pmNode.attrs.noteId } : {}),
    },
  };
}

function projectEndnoteRef(pmNode: ProseMirrorNode): SDEndnoteRef {
  return {
    kind: 'endnoteRef',
    endnoteRef: {
      ...(pmNode.attrs?.id ? { noteId: pmNode.attrs.id } : {}),
      ...(pmNode.attrs?.noteId ? { noteId: pmNode.attrs.noteId } : {}),
    },
  };
}

function projectInlineField(pmNode: ProseMirrorNode): SDField {
  return {
    kind: 'field',
    field: {
      ...(pmNode.attrs?.fieldType ? { fieldType: pmNode.attrs.fieldType } : {}),
      ...(pmNode.attrs?.instruction ? { instruction: pmNode.attrs.instruction } : {}),
      ...(pmNode.attrs?.resultText ? { resultText: pmNode.attrs.resultText } : {}),
      placement: 'inline',
    },
  };
}

function projectInlineFallback(pmNode: ProseMirrorNode): SDRun {
  return {
    kind: 'run',
    run: { text: pmNode.textContent ?? '\ufffc' },
  };
}

// ---------------------------------------------------------------------------
// Helpers: node ID
// ---------------------------------------------------------------------------

function resolveNodeId(pmNode: ProseMirrorNode): string | undefined {
  const id = pmNode.attrs?.sdBlockId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function resolveSdtNodeId(pmNode: ProseMirrorNode): string | undefined {
  const attrs = pmNode.attrs ?? {};
  // SDT nodes use `id` as their canonical identifier (target-resolution matches on attrs.id).
  // Fall back to sdBlockId for nodes materialised through the structural write engine.
  const id = attrs.id ?? attrs.sdBlockId;
  if (typeof id === 'number') return String(id);
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractTableProps(
  attrs: TableAttrs | undefined,
  pmAttrs: Record<string, unknown>,
): SDTable['table']['props'] | undefined {
  const tableProps = attrs?.tableProperties as Record<string, unknown> | null | undefined;
  const props: NonNullable<SDTable['table']['props']> = {};
  let hasProps = false;

  const width = extractTableWidth((tableProps as any)?.tableWidth ?? (pmAttrs as any)?.tableWidth);
  if (width) {
    props.width = width;
    hasProps = true;
  }

  const layout = (tableProps as any)?.tableLayout ?? (pmAttrs as any)?.tableLayout;
  if (layout === 'fixed' || layout === 'autofit') {
    props.layout = layout;
    hasProps = true;
  }

  const alignment = mapTableAlignmentToSD((tableProps as any)?.justification ?? (pmAttrs as any)?.justification);
  if (alignment) {
    props.alignment = alignment;
    hasProps = true;
  }

  return hasProps ? props : undefined;
}

function mapTableAlignmentToSD(value: unknown): NonNullable<SDTable['table']['props']>['alignment'] | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value) {
    case 'start':
    case 'left':
      return 'left';
    case 'end':
    case 'right':
      return 'right';
    case 'center':
    case 'inside':
    case 'outside':
      return value;
    default:
      return undefined;
  }
}

function extractTableWidth(width: unknown): NonNullable<SDTable['table']['props']>['width'] | undefined {
  if (!isRecord(width)) return undefined;

  const type = typeof width.type === 'string' ? width.type.toLowerCase() : undefined;
  const value =
    typeof width.value === 'number' ? width.value : typeof width.width === 'number' ? width.width : undefined;

  if (type === 'auto') {
    return { kind: 'auto' };
  }
  if (type === 'nil' || type === 'none') {
    return { kind: 'none' };
  }
  if (type === 'pct' && typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'percent', value };
  }
  if (type === 'dxa' && typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'points', value: value / 20 };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'points', value };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers: paragraph properties extraction
// ---------------------------------------------------------------------------

function extractParagraphProps(attrs: ParagraphAttrs | undefined): SDParagraphProps | undefined {
  const pp = attrs?.paragraphProperties;
  if (!pp) return undefined;

  // Cast to any for runtime fields not in the strict ParagraphProperties type
  const ppAny = pp as Record<string, any>;
  const props: SDParagraphProps = {};
  let hasProps = false;

  if (pp.justification) {
    props.alignment = pp.justification === 'both' ? 'justify' : pp.justification;
    hasProps = true;
  }
  if (pp.indent) {
    props.indent = pp.indent;
    hasProps = true;
  }
  if (pp.spacing) {
    props.spacing = pp.spacing;
    hasProps = true;
  }
  if (pp.keepNext !== undefined) {
    props.keepWithNext = pp.keepNext;
    hasProps = true;
  }
  if (pp.keepLines !== undefined) {
    props.keepLines = pp.keepLines;
    hasProps = true;
  }
  if (pp.pageBreakBefore !== undefined) {
    props.pageBreakBefore = pp.pageBreakBefore;
    hasProps = true;
  }
  if (pp.widowControl !== undefined) {
    props.widowControl = pp.widowControl;
    hasProps = true;
  }
  if (pp.outlineLvl !== undefined) {
    props.outlineLevel = pp.outlineLvl;
    hasProps = true;
  }
  if (pp.numberingProperties) {
    props.numbering = {
      numId: String(pp.numberingProperties.numId ?? ''),
      level: pp.numberingProperties.ilvl,
    };
    hasProps = true;
  }
  if (ppAny.tabs) {
    props.tabs = ppAny.tabs;
    hasProps = true;
  }
  if (ppAny.borders) {
    props.borders = ppAny.borders;
    hasProps = true;
  }
  if (ppAny.shading) {
    props.shading = ppAny.shading;
    hasProps = true;
  }
  if (ppAny.bidi !== undefined) {
    props.bidi = ppAny.bidi;
    hasProps = true;
  }
  if (ppAny.markRunProps) {
    props.markRunProps = ppAny.markRunProps;
    hasProps = true;
  }

  return hasProps ? props : undefined;
}

// ---------------------------------------------------------------------------
// Helpers: run properties extraction from PM marks
// ---------------------------------------------------------------------------

function extractRunStyleRef(marks: readonly ProseMirrorMark[]): string | undefined {
  return extractRunStyleRefFromMarks(marks);
}

function extractRunStyleRefFromMarks(marks: readonly ProseMirrorMark[]): string | undefined {
  const textStyle = marks.find((m) => m.type.name === 'textStyle');
  if (!textStyle) return undefined;
  return typeof textStyle.attrs?.rStyle === 'string' ? textStyle.attrs.rStyle : undefined;
}

function extractRunProps(marks: readonly ProseMirrorMark[]): SDRunProps | undefined {
  return extractRunPropsFromMarks(marks);
}

function extractRunPropsFromMarks(marks: readonly ProseMirrorMark[]): SDRunProps | undefined {
  const props: SDRunProps = {};
  let hasProps = false;

  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        props.bold = true;
        hasProps = true;
        break;
      case 'italic':
        props.italic = true;
        hasProps = true;
        break;
      case 'underline':
        props.underline =
          mark.attrs && typeof mark.attrs === 'object' && Object.keys(mark.attrs).length > 0
            ? (mark.attrs as SDRunProps['underline'])
            : { style: 'single' };
        hasProps = true;
        break;
      case 'strikethrough':
        props.strikethrough = true;
        hasProps = true;
        break;
      case 'highlight': {
        const color = mark.attrs?.color;
        if (typeof color === 'string') {
          props.highlight = color as SDRunProps['highlight'];
          hasProps = true;
        }
        break;
      }
      case 'textStyle': {
        const a = mark.attrs as Record<string, unknown> | null;
        if (!a) break;
        if (a.color) {
          props.color = a.color as SDRunProps['color'];
          hasProps = true;
        }
        if (a.fontSize !== undefined) {
          props.fontSize = a.fontSize as number;
          hasProps = true;
        }
        if (a.fontSizeCs !== undefined) {
          props.fontSizeCs = a.fontSizeCs as number;
          hasProps = true;
        }
        if (a.fontFamily) {
          props.fontFamily = a.fontFamily as string;
          hasProps = true;
        }
        if (a.fonts) {
          props.fonts = a.fonts as SDRunProps['fonts'];
          hasProps = true;
        }
        if (a.caps) {
          props.caps = true;
          hasProps = true;
        }
        if (a.smallCaps) {
          props.smallCaps = true;
          hasProps = true;
        }
        if (a.vanish) {
          props.vanish = true;
          hasProps = true;
        }
        if (a.characterSpacing !== undefined) {
          props.characterSpacing = a.characterSpacing as number;
          hasProps = true;
        }
        break;
      }
    }
  }

  return hasProps ? props : undefined;
}
