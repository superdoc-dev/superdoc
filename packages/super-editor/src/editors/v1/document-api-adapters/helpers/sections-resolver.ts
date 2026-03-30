import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  SectionAddress,
  SectionDomain,
  SectionInfo,
  SectionPageMargins,
  SectionsListQuery,
  SectionsListResult,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildDiscoveryResult, buildResolvedHandle } from '@superdoc/document-api';
import { analyzeSectionRanges } from '@superdoc/pm-adapter/sections/analysis.js';
import { SectionType, type SectionRange } from '@superdoc/pm-adapter/sections/types.js';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';
import { getRevision } from '../plan-engine/revision-tracker.js';
import { paginate, validatePaginationInput } from './adapter-utils.js';
import { toId } from './value-utils.js';
import {
  cloneXmlElement,
  isSectPrElement,
  readSectPrColumns,
  readSectPrDirection,
  readSectPrLineNumbering,
  readSectPrMargins,
  readSectPrPageBorders,
  readSectPrPageNumbering,
  readSectPrPageSetup,
  readSectPrVerticalAlign,
  type XmlElement,
} from './sections-xml.js';

export type SectionMutationTarget =
  | {
      kind: 'paragraph';
      paragraphIndex: number;
      pos: number;
      node: ProseMirrorNode;
      nodeId: string;
    }
  | {
      kind: 'body';
    };

export interface SectionProjection {
  sectionId: string;
  address: SectionAddress;
  range: SectionRange;
  target: SectionMutationTarget;
  domain: SectionDomain;
}

interface ParagraphSnapshot {
  index: number;
  pos: number;
  node: ProseMirrorNode;
  nodeId: string;
}

interface ConverterWithSections {
  bodySectPr?: unknown;
  pageStyles?: {
    alternateHeaders?: boolean;
  };
  convertedXml?: Record<string, unknown>;
}

const PIXELS_PER_INCH = 96;

function pxToInches(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value / PIXELS_PER_INCH;
}

function buildSectionId(index: number): string {
  return `section-${index}`;
}

function getConverter(editor: Editor): ConverterWithSections | undefined {
  return (editor as unknown as { converter?: ConverterWithSections }).converter;
}

export function getBodySectPrFromEditor(editor: Editor): XmlElement | null {
  const converter = getConverter(editor);
  if (isSectPrElement(converter?.bodySectPr)) return cloneXmlElement(converter.bodySectPr);

  const docAttrs = (editor.state.doc.attrs ?? {}) as { bodySectPr?: unknown };
  if (isSectPrElement(docAttrs.bodySectPr)) return cloneXmlElement(docAttrs.bodySectPr);
  return null;
}

function resolveParagraphNodeId(node: ProseMirrorNode): string | undefined {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  return toId(attrs.paraId) ?? toId(attrs.sdBlockId) ?? toId(attrs.blockId) ?? toId(attrs.id);
}

function collectParagraphSnapshots(editor: Editor): ParagraphSnapshot[] {
  const snapshots: ParagraphSnapshot[] = [];
  let paragraphIndex = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const nodeId = resolveParagraphNodeId(node);
    if (!nodeId) {
      paragraphIndex += 1;
      return;
    }

    snapshots.push({
      index: paragraphIndex,
      pos,
      node,
      nodeId,
    });
    paragraphIndex += 1;
  });

  return snapshots;
}

function buildAnalysisDocFromParagraphs(paragraphs: ParagraphSnapshot[]): Parameters<typeof analyzeSectionRanges>[0] {
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      attrs: paragraph.node.attrs ?? {},
    })),
  };
}

function resolveAnalysisDoc(
  editor: Editor,
  paragraphs: ParagraphSnapshot[],
): Parameters<typeof analyzeSectionRanges>[0] {
  const maybeJsonDoc = (editor.state.doc as unknown as { toJSON?: () => unknown }).toJSON?.();
  if (
    maybeJsonDoc &&
    typeof maybeJsonDoc === 'object' &&
    typeof (maybeJsonDoc as { type?: unknown }).type === 'string' &&
    Array.isArray((maybeJsonDoc as { content?: unknown[] }).content)
  ) {
    return maybeJsonDoc as Parameters<typeof analyzeSectionRanges>[0];
  }

  return buildAnalysisDocFromParagraphs(paragraphs);
}

function getSettingsRoot(editor: Editor): XmlElement | null {
  const converter = getConverter(editor);
  const settingsPart = converter?.convertedXml?.['word/settings.xml'] as XmlElement | undefined;
  if (!settingsPart) return null;

  if (settingsPart.name === 'w:settings') return settingsPart;
  if (!Array.isArray(settingsPart.elements)) return null;
  const settingsRoot = settingsPart.elements.find((entry) => entry.name === 'w:settings');
  return settingsRoot ?? null;
}

function readOddEvenHeadersFlag(editor: Editor): boolean {
  const converter = getConverter(editor);
  if (converter?.pageStyles?.alternateHeaders != null) return converter.pageStyles.alternateHeaders === true;

  const settingsRoot = getSettingsRoot(editor);
  if (!settingsRoot?.elements) return false;
  return settingsRoot.elements.some((entry) => entry.name === 'w:evenAndOddHeaders');
}

function createSyntheticRange(bodySectPr: XmlElement | null, paragraphCount: number): SectionRange {
  return {
    sectionIndex: 0,
    startParagraphIndex: 0,
    endParagraphIndex: Math.max(paragraphCount - 1, 0),
    sectPr: (bodySectPr as unknown as SectionRange['sectPr']) ?? null,
    margins: null,
    pageSize: null,
    orientation: null,
    columns: null,
    type: SectionType.CONTINUOUS,
    titlePg: false,
    headerRefs: undefined,
    footerRefs: undefined,
    numbering: undefined,
    vAlign: undefined,
  };
}

function projectSectionTarget(
  range: SectionRange,
  rangeIndex: number,
  totalRanges: number,
  hasBodySectPr: boolean,
  paragraphs: ParagraphSnapshot[],
): SectionMutationTarget {
  const paragraph = paragraphs.find((entry) => entry.index === range.endParagraphIndex);
  const isFinalRange = rangeIndex === totalRanges - 1;

  if (paragraph && (!isFinalRange || !hasBodySectPr) && range.sectPr) {
    return {
      kind: 'paragraph',
      paragraphIndex: paragraph.index,
      pos: paragraph.pos,
      node: paragraph.node,
      nodeId: paragraph.nodeId,
    };
  }

  return { kind: 'body' };
}

function toPageMargins(range: SectionRange, sectPr: XmlElement | null): SectionPageMargins | undefined {
  const parsed = sectPr ? readSectPrMargins(sectPr) : {};
  const margins = {
    top: pxToInches(range.margins?.top) ?? parsed.top,
    right: pxToInches(range.margins?.right) ?? parsed.right,
    bottom: pxToInches(range.margins?.bottom) ?? parsed.bottom,
    left: pxToInches(range.margins?.left) ?? parsed.left,
    gutter: parsed.gutter,
  };

  if (
    margins.top == null &&
    margins.right == null &&
    margins.bottom == null &&
    margins.left == null &&
    margins.gutter == null
  ) {
    return undefined;
  }

  return margins;
}

function sectionRangeToSectionDomain(
  range: SectionRange,
  address: SectionAddress,
  oddEvenHeadersFooters: boolean,
): SectionDomain {
  const sectPr = isSectPrElement(range.sectPr) ? range.sectPr : null;
  const parsedSetup = sectPr ? readSectPrPageSetup(sectPr) : undefined;
  const parsedColumns = sectPr ? readSectPrColumns(sectPr) : undefined;
  const parsedLineNumbering = sectPr ? readSectPrLineNumbering(sectPr) : undefined;
  const parsedPageNumbering = sectPr ? readSectPrPageNumbering(sectPr) : undefined;
  const parsedDirection = sectPr ? readSectPrDirection(sectPr) : undefined;
  const parsedVerticalAlign = sectPr ? readSectPrVerticalAlign(sectPr) : undefined;
  const parsedBorders = sectPr ? readSectPrPageBorders(sectPr) : undefined;
  const parsedMargins = sectPr ? readSectPrMargins(sectPr) : {};

  const pageSetup = {
    width: pxToInches(range.pageSize?.w) ?? parsedSetup?.width,
    height: pxToInches(range.pageSize?.h) ?? parsedSetup?.height,
    orientation: range.orientation ?? parsedSetup?.orientation,
    paperSize: parsedSetup?.paperSize,
  };

  const margins = toPageMargins(range, sectPr);
  const headerFooterMargins = {
    header: pxToInches(range.margins?.header) ?? parsedMargins.header,
    footer: pxToInches(range.margins?.footer) ?? parsedMargins.footer,
  };

  const columns = {
    count: range.columns?.count ?? parsedColumns?.count,
    gap: pxToInches(range.columns?.gap) ?? parsedColumns?.gap,
    equalWidth: parsedColumns?.equalWidth,
  };

  const toRefs = (
    refs: SectionRange['headerRefs'] | undefined,
  ):
    | {
        default?: string;
        first?: string;
        even?: string;
      }
    | undefined => {
    if (!refs) return undefined;
    const mapped = {
      default: refs.default ?? refs.odd,
      first: refs.first,
      even: refs.even,
    };
    if (mapped.default == null && mapped.first == null && mapped.even == null) return undefined;
    return mapped;
  };

  const hasPageSetup =
    pageSetup.width != null || pageSetup.height != null || pageSetup.orientation != null || pageSetup.paperSize != null;
  const hasHeaderFooterMargins = headerFooterMargins.header != null || headerFooterMargins.footer != null;
  const hasColumns = columns.count != null || columns.gap != null || columns.equalWidth != null;

  return {
    address,
    index: range.sectionIndex,
    range: {
      startParagraphIndex: range.startParagraphIndex,
      endParagraphIndex: range.endParagraphIndex,
    },
    breakType: range.type,
    pageSetup: hasPageSetup ? pageSetup : undefined,
    margins,
    headerFooterMargins: hasHeaderFooterMargins ? headerFooterMargins : undefined,
    columns: hasColumns ? columns : undefined,
    lineNumbering: parsedLineNumbering,
    pageNumbering: range.numbering ?? parsedPageNumbering,
    titlePage: range.titlePg,
    oddEvenHeadersFooters,
    verticalAlign: range.vAlign ?? parsedVerticalAlign,
    sectionDirection: parsedDirection,
    headerRefs: toRefs(range.headerRefs),
    footerRefs: toRefs(range.footerRefs),
    pageBorders: parsedBorders,
  };
}

export function resolveSectionProjections(editor: Editor): SectionProjection[] {
  const paragraphs = collectParagraphSnapshots(editor);
  const bodySectPr = getBodySectPrFromEditor(editor);
  const oddEvenHeadersFooters = readOddEvenHeadersFlag(editor);
  const analysisDoc = resolveAnalysisDoc(editor, paragraphs);
  const analyzed = analyzeSectionRanges(analysisDoc, bodySectPr ?? undefined);
  const ranges = analyzed.length > 0 ? analyzed : [createSyntheticRange(bodySectPr, paragraphs.length)];

  return ranges.map((range, index) => {
    const sectionId = buildSectionId(index);
    const address: SectionAddress = { kind: 'section', sectionId };
    const target = projectSectionTarget(range, index, ranges.length, bodySectPr != null, paragraphs);
    const domain = sectionRangeToSectionDomain(range, address, oddEvenHeadersFooters);
    return { sectionId, address, range, target, domain };
  });
}

export function resolveSectionProjectionByAddress(editor: Editor, address: SectionAddress): SectionProjection {
  const match = resolveSectionProjections(editor).find((projection) => projection.sectionId === address.sectionId);
  if (!match) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Section address was not found.', { target: address });
  }
  return match;
}

export function resolveSectionProjectionByIndex(editor: Editor, index: number): SectionProjection | undefined {
  return resolveSectionProjections(editor).find((projection) => projection.range.sectionIndex === index);
}

export function getDefaultSectionAddress(editor: Editor): SectionAddress {
  const first = resolveSectionProjections(editor)[0];
  return first?.address ?? { kind: 'section', sectionId: buildSectionId(0) };
}

export function sectionsListAdapter(editor: Editor, query?: SectionsListQuery): SectionsListResult {
  validatePaginationInput(query?.offset, query?.limit);
  const projections = resolveSectionProjections(editor);
  const offset = query?.offset ?? 0;
  const { total, items: paged } = paginate(projections, offset, query?.limit);
  const evaluatedRevision = getRevision(editor);

  const items = paged.map((projection) => {
    const handle = buildResolvedHandle(projection.sectionId, 'ephemeral', 'section');
    return buildDiscoveryItem(projection.sectionId, handle, projection.domain);
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total,
    items,
    page: {
      limit: query?.limit ?? total,
      offset,
      returned: items.length,
    },
  });
}

export function sectionsGetAdapter(editor: Editor, address: SectionAddress): SectionInfo {
  return resolveSectionProjectionByAddress(editor, address).domain;
}
