import type {
  ChartDrawing,
  CellBorders,
  ColumnLayout,
  CustomGeometryData,
  DrawingBlock,
  DrawingFragment,
  DrawingGeometry,
  DrawingMeasure,
  FlowBlock,
  FlowMode,
  Fragment,
  GradientFill,
  ImageBlock,
  ImageFragment,
  ImageHyperlink,
  Line,
  PageMargins,
  PageNumberChapterSeparator,
  PageNumberFormat,
  ParaFragment,
  ParagraphBlock,
  PositionedDrawingGeometry,
  Run,
  ShapeGroupChild,
  ShapeGroupDrawing,
  ShapeTextContent,
  SolidFillWithAlpha,
  SourceAnchor,
  TableBlock,
  TableFragment,
  TableMeasure,
  TextboxDrawing,
  VectorShapeDrawing,
  VectorShapeStyle,
  DocumentBackground,
  ResolvedLayout,
  ResolvedFragmentItem,
  ResolvedPage,
  ResolvedPaintItem,
  ResolvedTableItem,
  ResolvedImageItem,
  ResolvedDrawingItem,
  LayoutSourceIdentity,
  LayoutStoryLocator,
} from '@superdoc/contracts';
import {
  computeLinePmRange,
  LAYOUT_BOUNDARY_SCHEMA,
  buildLayoutSourceIdentity,
  buildLayoutSourceIdentityForFragment,
  expandRunsForInlineNewlines,
  formatPageNumber,
  formatSectionPageNumberText,
  getColumnGeometry,
  getColumnSeparatorPositions as getColumnSeparatorPositionsFromGeometry,
  isPositionedParagraphFrame,
  normalizeColumnLayout,
  resolveColumnMode,
  resolveFooterPageFrameOriginY,
  rescaleColumnWidths,
  getCellSpacingPx,
  isPagePositionedParagraphFrame,
} from '@superdoc/contracts';
import { DATASET_KEYS, decodeLayoutStoryDataset } from '@superdoc/dom-contract';
import { resolvePhysicalFamily } from '@superdoc/font-system';
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
import { DOM_CLASS_NAMES } from './constants.js';
import {
  createEmptyPaintWorkSummary,
  isNonBodyStoryBlockId,
  patchPage as patchPageContent,
  renderPage as renderPageContent,
  type PageContentContext,
  type PageDomState,
  type PaintWorkSummary,
  type PatchPageWork,
} from './page-content.js';
import {
  clonePersistentPageSurfaceState,
  disposePersistentPageSurfaceState,
  isPersistentPageSurfaceIntact,
  reconcilePersistentPageSurface,
  resolveDesiredContentPageIndices,
  type DomPainterPersistentPageInput,
  type PersistentPageSurfaceState,
  type PersistentPageWorkKind,
} from './persistent-page-surface.js';
import { createChartElement as renderChartToElement } from './chart-renderer.js';
import {
  CLASS_NAMES,
  containerStyles,
  ensureSurfaceStylePreflight,
  fragmentStyles,
  type PageStyles,
} from './styles.js';
import { applyAlphaToSVG, applyGradientToSVG, validateHexColor } from './svg-utils.js';
import {
  renderTableFragment as renderTableFragmentElement,
  type TableRenderDependencies,
} from './table/renderTableFragment.js';
import { applyCellBorders } from './table/border-utils.js';
import type { SdtBoundaryOptions } from './sdt/container.js';
import { applyContainerSdtDataset, applySdtDataset } from './sdt/dataset.js';
import {
  createInlineSdtWrapper,
  expandSdtWrapperPmRange,
  resolveRunSdtId,
  syncInlineSdtWrapperTypography,
} from './sdt/inline.js';
import {
  collectSdtSnapshotEntitiesFromDomRoot,
  type PaintSnapshotStructuredContentBlockEntity,
  type PaintSnapshotStructuredContentInlineEntity,
} from './sdt/snapshot.js';
import { computeBetweenBorderFlags, type BetweenBorderInfo } from './paragraph/borders/index.js';
import { applyParagraphFragmentPmAttributes } from './paragraph/frame.js';
import { renderParagraphFragment as renderParagraphFragmentElement } from './paragraph/renderParagraphFragment.js';
import { renderLine as renderRunLine } from './runs/render-line.js';
import type { RunRenderContext } from './runs/types.js';
import {
  createPositionValidationCollector,
  type PositionValidationCollector,
  type PositionValidationOptions,
  type PositionValidationSummary,
} from './pm-position-validation.js';
import {
  createDrawingImageElement,
  createShapeGroupImageElement,
  createShapeTextImageElement,
} from './images/drawing-image.js';
import { renderImageFragment as renderImageFragmentElement } from './images/image-fragment.js';
import { buildImageHyperlinkAnchor as buildSharedImageHyperlinkAnchor } from './images/hyperlink.js';
import { applyStyles } from './utils/apply-styles.js';
import { applyTrackedChangeDecorations, resolveTrackedChangesConfig } from './runs/tracked-changes.js';
import { applyTextEffects } from './runs/text-effects.js';
import { applyLayoutIdentityDataset } from './utils/layout-identity.js';
import { applySourceAnchorDataset } from './utils/source-anchor.js';

export type {
  PaintSnapshotStructuredContentBlockEntity,
  PaintSnapshotStructuredContentInlineEntity,
} from './sdt/snapshot.js';
export { applyLayoutIdentityDataset } from './utils/layout-identity.js';

const ACTIVE_HEADER_FOOTER_WATERMARK_PREVIEW_OPACITY = '1';
const INACTIVE_HEADER_FOOTER_WATERMARK_PREVIEW_OPACITY = '0.5';

type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

type LineEnds = {
  head?: LineEnd;
  tail?: LineEnd;
};

type EffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ShapeTextDrawingWithEffects = (VectorShapeDrawing | TextboxDrawing) & {
  lineEnds?: LineEnds;
  effectExtent?: EffectExtent;
};

/**
 * Layout mode for document rendering.
 *
 * `'vertical'` (page-by-page vertical layout) is the only paginated
 * arrangement — horizontal and book modes were deleted at painter plan P7
 * (product decision 2026-07-05). The real presentation axis is `FlowMode`
 * (`'paginated' | 'semantic'`); this type remains for API-shape compatibility.
 */
export type LayoutMode = 'vertical';
// FlowMode is re-exported from @superdoc/contracts
export type { FlowMode } from '@superdoc/contracts';

/**
 * Interface for position mapping from ProseMirror transactions.
 * Used to efficiently update DOM position attributes without full re-render.
 */
export interface PositionMapping {
  /** Transform a position from old to new document coordinates */
  map(pos: number, bias?: number): number;
  /** Array of step maps - length indicates transaction complexity */
  readonly maps: readonly unknown[];
}

export type RenderedLineInfo = {
  el: HTMLElement;
  top: number;
  height: number;
};

/**
 * Input to `DomPainter.paint()`.
 *
 * The painter consumes only `resolvedLayout`. All fragment, geometry, and
 * page-level metadata it needs is reachable from `ResolvedPaintItem.fragment`
 * back-pointers and `ResolvedPage` fields.
 */
export type DomPainterInput = {
  resolvedLayout: ResolvedLayout;
};

export type PageDecorationPayload = {
  fragments: Fragment[];
  /** Resolved items aligned 1:1 with `fragments`. Same length, same order. */
  items: ResolvedPaintItem[];
  /** Minimum Y coordinate from layout; negative when content extends above y=0. */
  minY?: number;
  height: number;
  /** Optional measured content height to aid bottom alignment in footers. */
  contentHeight?: number;
  /** Decoration band origin in page-local Y. Producer is the sole source of truth (SD-2957). */
  offset: number;
  marginLeft?: number;
  // Optional explicit content width (px) for the decoration container
  contentWidth?: number;
  headerFooterRefId?: string;
  sectionType?: string;
  /** True while this rendered header/footer story is the active editing surface. */
  isActiveHeaderFooter?: boolean;
  /**
   * When `false`, total-page-count fields (`NUMPAGES` / `SECTIONPAGES`) in this
   * decoration render their pre-resolved provisional text (source-cached DOCX
   * result, em dash when absent) instead of the current page totals — used
   * while pagination is still partial. Absent/`true` = exact totals (existing
   * caller behavior).
   */
  pageCountFieldsExact?: boolean;
  box?: { x: number; y: number; width: number; height: number };
  hitRegion?: { x: number; y: number; width: number; height: number };
};

/**
 * Provider function for page decorations (headers and footers).
 * Called for each page to generate header or footer content.
 *
 * @param {number} pageNumber - The page number (1-indexed)
 * @param {PageMargins} [pageMargins] - Page margin configuration
 * @param {ResolvedPage} [page] - Resolved page from the layout
 * @returns {PageDecorationPayload | null} Decoration payload containing fragments and layout info, or null if no decoration
 */
export type PageDecorationProvider = (
  pageNumber: number,
  pageMargins?: PageMargins,
  page?: ResolvedPage,
) => PageDecorationPayload | null;

type PainterOptions = {
  pageStyles?: PageStyles;
  layoutMode?: LayoutMode;
  flowMode?: FlowMode;
  /** Gap between pages in pixels (default: 24px) */
  pageGap?: number;
  headerProvider?: PageDecorationProvider;
  footerProvider?: PageDecorationProvider;
  /** Called with the paint snapshot after each paint cycle completes. */
  onPaintSnapshot?: (snapshot: PaintSnapshot) => void;
  /** Render nonprinting formatting marks such as spaces, tabs, and paragraph marks. */
  showFormattingMarks?: boolean;
  /** Built-in SDT chrome rendering mode. */
  contentControlsChrome?: 'default' | 'none';
  /** Per-document logical->physical font resolver (face-aware); see DomPainterOptions.resolvePhysical. */
  resolvePhysical?: (cssFontFamily: string, face: { weight: '400' | '700'; style: 'normal' | 'italic' }) => string;
  /** Populate PaintWorkSummary's per-page index arrays (P5 §4.6). Dark by default; see DomPainterOptions.paintWorkAttribution. */
  paintWorkAttribution?: boolean;
  /** Story-aware position-coverage validation. Dark by default; see DomPainterOptions.positionValidation. */
  positionValidation?: PositionValidationOptions;
};

/**
 * Rendering context passed to fragment renderers containing page metadata.
 * Provides information about the current page position and section for dynamic content like page numbers.
 *
 * @typedef {Object} FragmentRenderContext
 * @property {number} pageNumber - Current page number (1-indexed)
 * @property {number} totalPages - Total number of pages in the document
 * @property {'body'|'header'|'footer'} section - Document section being rendered
 * @property {string} [pageNumberText] - Optional formatted page number text (e.g., "Page 1 of 10")
 * @property {number} [displayPageNumber] - Section-aware numeric page value before formatting
 * @property {number} [sectionPageCount] - Physical page count in the current section
 */
export type FragmentRenderContext = {
  pageNumber: number;
  totalPages: number;
  section: 'body' | 'header' | 'footer';
  story?: LayoutStoryLocator;
  pageNumberText?: string;
  displayPageNumber?: number;
  pageNumberFormat?: PageNumberFormat;
  pageNumberChapterText?: string;
  pageNumberChapterSeparator?: PageNumberChapterSeparator;
  sectionPageCount?: number;
  pageIndex?: number;
  /**
   * When `false`, total-page-count tokens render their pre-resolved
   * provisional run text (source-cached DOCX result / em dash) instead of
   * `totalPages` / `sectionPageCount`. Absent/`true` = exact (default).
   */
  pageCountFieldsExact?: boolean;
};

const provisionalPageCountText = (cachedText: string | undefined): string =>
  cachedText && cachedText.trim().length > 0 ? cachedText : '—';

function buildSectionPageCounts(pages: ResolvedPage[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const page of pages) {
    const sectionIndex = page.sectionIndex ?? 0;
    counts.set(sectionIndex, (counts.get(sectionIndex) ?? 0) + 1);
  }
  return counts;
}

function readSectionPageCounts(counts: Readonly<Record<string, number>>): Map<number, number> {
  const result = new Map<number, number>();
  for (const [sectionKey, pageCount] of Object.entries(counts)) {
    const sectionIndex = Number(sectionKey);
    if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || !Number.isInteger(pageCount) || pageCount <= 0) {
      continue;
    }
    result.set(sectionIndex, pageCount);
  }
  return result;
}

export type PaintSnapshotLineStyle = {
  paddingLeftPx?: number;
  paddingRightPx?: number;
  textIndentPx?: number;
  marginLeftPx?: number;
  marginRightPx?: number;
  leftPx?: number;
  topPx?: number;
  widthPx?: number;
  heightPx?: number;
  display?: string;
  position?: string;
  textAlign?: string;
  justifyContent?: string;
};

export type PaintSnapshotMarkerStyle = {
  text?: string;
  leftPx?: number;
  widthPx?: number;
  paddingRightPx?: number;
  display?: string;
  position?: string;
  textAlign?: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  sourceAnchor?: SourceAnchor;
};

export type PaintSnapshotTabStyle = {
  widthPx?: number;
  leftPx?: number;
  position?: string;
  borderBottom?: string;
};

export type PaintSnapshotAnnotationEntity = {
  element: HTMLElement;
  pageIndex: number;
  pmStart?: number;
  pmEnd?: number;
  fieldId?: string;
  fieldType?: string;
  type?: string;
  layoutSourceIdentity?: LayoutSourceIdentity;
};

export type PaintSnapshotImageEntity = {
  element: HTMLElement;
  pageIndex: number;
  kind: 'inline' | 'fragment';
  pmStart?: number;
  pmEnd?: number;
  blockId?: string;
  sourceAnchor?: SourceAnchor;
  layoutSourceIdentity?: LayoutSourceIdentity;
};

export type PaintSnapshotEntities = {
  annotations: PaintSnapshotAnnotationEntity[];
  structuredContentBlocks: PaintSnapshotStructuredContentBlockEntity[];
  structuredContentInlines: PaintSnapshotStructuredContentInlineEntity[];
  images: PaintSnapshotImageEntity[];
};

export type PaintSnapshotLine = {
  index: number;
  inTableFragment: boolean;
  inTableParagraph: boolean;
  style: PaintSnapshotLineStyle;
  markers?: PaintSnapshotMarkerStyle[];
  tabs?: PaintSnapshotTabStyle[];
  sourceAnchor?: SourceAnchor;
  layoutSourceIdentity?: LayoutSourceIdentity;
};

export type PaintSnapshotPage = {
  index: number;
  pageNumber?: number;
  lineCount: number;
  lines: PaintSnapshotLine[];
};

export type PaintSnapshot = {
  formatVersion: 1;
  pageCount: number;
  lineCount: number;
  markerCount: number;
  tabCount: number;
  pages: PaintSnapshotPage[];
  entities: PaintSnapshotEntities;
};

type PaintSnapshotPageBuilder = {
  index: number;
  pageNumber: number | null;
  lineCount: number;
  lines: PaintSnapshotLine[];
};

type PaintSnapshotBuilder = {
  formatVersion: 1;
  lineCount: number;
  markerCount: number;
  tabCount: number;
  pages: PaintSnapshotPageBuilder[];
};

type PersistentPagePainterStateSnapshot = {
  mount: HTMLElement | null;
  doc: Document | null;
  pageStates: PageDomState[];
  currentLayout: ResolvedLayout | null;
  changedBlocks: Set<string>;
  headerProvider?: PageDecorationProvider;
  footerProvider?: PageDecorationProvider;
  totalPages: number;
  sectionPageCounts: Map<number, number>;
  linkIdCounter: number;
  sdtLabelsRendered: Set<string>;
  pendingTooltips: WeakMap<HTMLElement, string>;
  pageGap: number;
  layoutVersion: number;
  layoutEpoch: number;
  processedLayoutVersion: number;
  currentMapping: PositionMapping | null;
  persistentDecorationsDirty: boolean;
  persistentDocumentBackground: DocumentBackground | null;
  persistentSurface: PersistentPageSurfaceState | null;
  paintWork: PaintWorkSummary;
  paintSnapshotBuilder: PaintSnapshotBuilder | null;
  lastPaintSnapshot: PaintSnapshot | null;
  persistentPageIndices: number[];
  resolvedLayout: ResolvedLayout | null;
  showFormattingMarks: boolean;
  contentControlsChrome: 'default' | 'none';
};

type ActivePersistentPagePainterTransaction = {
  snapshot: PersistentPagePainterStateSnapshot;
  pendingPaintSnapshot: PaintSnapshot | null;
  hasPendingPaintSnapshot: boolean;
};

type PersistentPagePainterTransaction = {
  commit(): void;
  rollback(): void;
};

function clonePageDomStateMetadata(state: PageDomState): PageDomState {
  return {
    element: state.element,
    fragments: state.fragments.map((fragment) => ({
      ...fragment,
      context: { ...fragment.context },
    })),
  };
}

function clonePaintWorkSummary(summary: PaintWorkSummary): PaintWorkSummary {
  return {
    ...summary,
    createdPersistentPageIndices: [...summary.createdPersistentPageIndices],
    removedPersistentPageIndices: [...summary.removedPersistentPageIndices],
    patchedContentPageIndices: [...summary.patchedContentPageIndices],
    untouchedContentPageIndices: [...summary.untouchedContentPageIndices],
    decorationRefreshedContentPageIndices: [...summary.decorationRefreshedContentPageIndices],
    remappedContentPageIndices: [...summary.remappedContentPageIndices],
    pmDemotedContentPageIndices: [...summary.pmDemotedContentPageIndices],
    hydratedContentPageIndices: [...summary.hydratedContentPageIndices],
    dehydratedContentPageIndices: [...summary.dehydratedContentPageIndices],
  };
}

function clonePaintSnapshotBuilder(builder: PaintSnapshotBuilder | null): PaintSnapshotBuilder | null {
  if (!builder) return null;
  return {
    ...builder,
    pages: builder.pages.map((page) => ({
      ...page,
      lines: page.lines.map((line) => ({
        ...line,
        style: { ...line.style },
        ...(line.markers ? { markers: line.markers.map((marker) => ({ ...marker })) } : {}),
        ...(line.tabs ? { tabs: line.tabs.map((tab) => ({ ...tab })) } : {}),
      })),
    })),
  };
}

type PaintSnapshotCaptureOptions = {
  inTableFragment?: boolean;
  inTableParagraph?: boolean;
  wrapperEl?: HTMLElement;
  sourceAnchor?: SourceAnchor;
};

function roundSnapshotMetric(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function readSnapshotPxMetric(styleValue: string | null | undefined): number | null {
  if (typeof styleValue !== 'string' || styleValue.length === 0) return null;
  const parsed = Number.parseFloat(styleValue);
  return Number.isFinite(parsed) ? roundSnapshotMetric(parsed) : null;
}

function readSnapshotStyleValue(styleValue: string | null | undefined): string | null {
  if (typeof styleValue !== 'string' || styleValue.length === 0) return null;
  return styleValue;
}

function createEmptyPaintSnapshotEntities(): PaintSnapshotEntities {
  return {
    annotations: [],
    structuredContentBlocks: [],
    structuredContentInlines: [],
    images: [],
  };
}

function readSnapshotDatasetNumber(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSnapshotPageIndex(element: HTMLElement): number | null {
  const pageEl = element.closest(`.${DOM_CLASS_NAMES.PAGE}`) as HTMLElement | null;
  if (!pageEl) return null;
  return readSnapshotDatasetNumber(pageEl.dataset.pageIndex);
}

function compactSnapshotObject<T extends Record<string, unknown>>(input: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

const resolveOrBuildFragmentIdentity = (
  fragment: Fragment,
  story?: LayoutStoryLocator,
  existing?: LayoutSourceIdentity,
): LayoutSourceIdentity =>
  buildLayoutSourceIdentityForFragment(
    existing
      ? {
          ...fragment,
          layoutSourceIdentity: existing,
          sourceAnchor: fragment.sourceAnchor ?? existing.sourceAnchor,
        }
      : fragment,
    story,
  );

const resolveSectionStory = (section?: 'body' | 'header' | 'footer'): LayoutStoryLocator | undefined => {
  if (!section || section === 'body') return undefined;
  return { kind: section };
};

// Footnote/endnote body fragments are laid out inside the body page's note
// band, so they would otherwise inherit the body story. Give them their own
// note story (`footnote:<id>` / `endnote:<id>`) so a click resolves a caret in
// the note, not the body. Separators carry no note id and stay body.
const resolveNoteStory = (fragment: Fragment): LayoutStoryLocator | undefined => {
  if (typeof fragment.blockId !== 'string') return undefined;
  const match = /^(footnote|endnote)-(.+)$/.exec(fragment.blockId);
  if (!match) return undefined;
  const noteId = match[2].split(/[/-]/)[0];
  if (!noteId || noteId === 'separator' || noteId === 'continuation') return undefined;
  return { kind: match[1] as 'footnote' | 'endnote', id: noteId };
};

// Note band fragments carry `data-sd-note-*` so render-conformance proofs can
// read the painted note band and match it to the layout-product geometry
// snapshot. The matching key is `bandId` (`${kind}-p${pageIndex}-c${columnIndex}`),
// derived identically to buildV2NoteGeometrySnapshot so DOM and product agree.
const noteFragmentColumnIndex = (fragment: Fragment): number | undefined =>
  'columnIndex' in fragment && typeof (fragment as { columnIndex?: unknown }).columnIndex === 'number'
    ? (fragment as { columnIndex: number }).columnIndex
    : undefined;

interface NoteFragmentDataset {
  role: 'body' | 'separator';
  kind: 'footnote' | 'endnote';
  id?: string;
  columnIndex: number;
}
const resolveNoteFragmentDataset = (fragment: Fragment): NoteFragmentDataset | undefined => {
  if (typeof fragment.blockId !== 'string') return undefined;
  const match = /^(footnote|endnote)-(.+)$/.exec(fragment.blockId);
  if (!match) return undefined;
  const kind = match[1] as 'footnote' | 'endnote';
  const separator = /^(?:continuation-)?separator-page-\d+-col-(\d+)$/.exec(match[2]);
  if (separator) {
    return { role: 'separator', kind, columnIndex: noteFragmentColumnIndex(fragment) ?? Number(separator[1]) };
  }
  const id = match[2].split(/[/-]/)[0];
  if (!id || id === 'separator' || id === 'continuation') return undefined;
  return { role: 'body', kind, id, columnIndex: noteFragmentColumnIndex(fragment) ?? 0 };
};

const applyNoteFragmentDataset = (el: HTMLElement, fragment: Fragment, pageIndex: number): void => {
  const note = resolveNoteFragmentDataset(fragment);
  if (!note) return;
  el.dataset.sdNoteRole = note.role;
  el.dataset.sdNoteKind = note.kind;
  if (note.id) el.dataset.sdNoteId = note.id;
  el.dataset.sdNoteBandId = `${note.kind}-p${pageIndex}-c${note.columnIndex}`;
  el.dataset.sdNotePageIndex = String(pageIndex);
  el.dataset.sdNoteColumnIndex = String(note.columnIndex);
};

const resolveDecorationStory = (kind: 'header' | 'footer', data: PageDecorationPayload): LayoutStoryLocator => {
  const id = data.headerFooterRefId ?? data.sectionType;
  return typeof id === 'string' && id.length > 0 ? { kind, id } : { kind };
};

function readSourceAnchorDataset(element: HTMLElement | null | undefined): SourceAnchor | undefined {
  if (!element) return undefined;
  const encoded = element.dataset?.sourceAnchor;
  if (typeof encoded !== 'string' || encoded.length === 0) return undefined;

  try {
    const parsed = JSON.parse(encoded) as SourceAnchor;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readNearestSourceAnchor(element: HTMLElement | null | undefined): SourceAnchor | undefined {
  if (!element) return undefined;
  return (
    readSourceAnchorDataset(element) ??
    readSourceAnchorDataset(element.closest(`.${CLASS_NAMES.fragment}`) as HTMLElement | null)
  );
}

function readLayoutIdentityDataset(element: HTMLElement | null | undefined): LayoutSourceIdentity | undefined {
  if (!element) return undefined;
  const fragmentId = element.dataset?.[DATASET_KEYS.LAYOUT_FRAGMENT_ID];
  const blockRef = element.dataset?.[DATASET_KEYS.LAYOUT_BLOCK_REF];
  const story = decodeLayoutStoryDataset(element.dataset?.[DATASET_KEYS.LAYOUT_STORY]);
  if (!fragmentId || !blockRef || story.kind === 'unknown') return undefined;
  return compactSnapshotObject({
    schema: LAYOUT_BOUNDARY_SCHEMA,
    story,
    blockRef,
    fragmentId,
    sourceAnchor: readNearestSourceAnchor(element),
  }) as LayoutSourceIdentity;
}

function readNearestLayoutSourceIdentity(element: HTMLElement | null | undefined): LayoutSourceIdentity | undefined {
  if (!element) return undefined;
  return (
    readLayoutIdentityDataset(element) ??
    readLayoutIdentityDataset(element.closest(`.${CLASS_NAMES.fragment}`) as HTMLElement | null)
  );
}

function shouldIncludeInlineImageSnapshotElement(element: HTMLElement): boolean {
  if (element.classList.contains(DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER)) {
    return true;
  }

  if (!element.classList.contains(DOM_CLASS_NAMES.INLINE_IMAGE)) {
    return false;
  }

  return !element.closest(`.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}`);
}

function collectPaintSnapshotEntitiesFromDomRoot(rootEl: HTMLElement): PaintSnapshotEntities {
  const entities = createEmptyPaintSnapshotEntities();

  const annotationElements = Array.from(
    rootEl.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.ANNOTATION}[data-pm-start]`),
  );
  for (const element of annotationElements) {
    const pageIndex = resolveSnapshotPageIndex(element);
    if (pageIndex == null) continue;

    entities.annotations.push(
      compactSnapshotObject({
        element,
        pageIndex,
        pmStart: readSnapshotDatasetNumber(element.dataset.pmStart),
        pmEnd: readSnapshotDatasetNumber(element.dataset.pmEnd),
        fieldId: element.dataset.fieldId || null,
        fieldType: element.dataset.fieldType || null,
        type: element.dataset.type || null,
        layoutSourceIdentity: readNearestLayoutSourceIdentity(element),
      }) as PaintSnapshotAnnotationEntity,
    );
  }

  const sdtEntities = collectSdtSnapshotEntitiesFromDomRoot(rootEl, {
    resolvePageIndex: resolveSnapshotPageIndex,
    readDatasetNumber: readSnapshotDatasetNumber,
    readLayoutSourceIdentity: readNearestLayoutSourceIdentity,
    compactObject: compactSnapshotObject,
  });
  entities.structuredContentBlocks.push(...sdtEntities.structuredContentBlocks);
  entities.structuredContentInlines.push(...sdtEntities.structuredContentInlines);

  const inlineImageElements = Array.from(
    rootEl.querySelectorAll<HTMLElement>(
      `.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}[data-pm-start], .${DOM_CLASS_NAMES.INLINE_IMAGE}[data-pm-start]`,
    ),
  );
  for (const element of inlineImageElements) {
    if (!shouldIncludeInlineImageSnapshotElement(element)) continue;

    const pageIndex = resolveSnapshotPageIndex(element);
    if (pageIndex == null) continue;

    entities.images.push(
      compactSnapshotObject({
        element,
        pageIndex,
        kind: 'inline',
        pmStart: readSnapshotDatasetNumber(element.dataset.pmStart),
        pmEnd: readSnapshotDatasetNumber(element.dataset.pmEnd),
        sourceAnchor: readNearestSourceAnchor(element),
        layoutSourceIdentity: readNearestLayoutSourceIdentity(element),
      }) as PaintSnapshotImageEntity,
    );
  }

  const fragmentImageElements = Array.from(
    rootEl.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}[data-pm-start]`),
  );
  for (const element of fragmentImageElements) {
    const pageIndex = resolveSnapshotPageIndex(element);
    if (pageIndex == null) continue;

    entities.images.push(
      compactSnapshotObject({
        element,
        pageIndex,
        kind: 'fragment',
        pmStart: readSnapshotDatasetNumber(element.dataset.pmStart),
        pmEnd: readSnapshotDatasetNumber(element.dataset.pmEnd),
        blockId: element.getAttribute('data-sd-block-id'),
        sourceAnchor: readNearestSourceAnchor(element),
        layoutSourceIdentity: readNearestLayoutSourceIdentity(element),
      }) as PaintSnapshotImageEntity,
    );
  }

  return entities;
}

function snapshotLineStyleFromElement(lineEl: HTMLElement): PaintSnapshotLineStyle {
  const style = lineEl?.style;
  if (!style) return {};
  return compactSnapshotObject({
    paddingLeftPx: readSnapshotPxMetric(style.paddingLeft),
    paddingRightPx: readSnapshotPxMetric(style.paddingRight),
    textIndentPx: readSnapshotPxMetric(style.textIndent),
    marginLeftPx: readSnapshotPxMetric(style.marginLeft),
    marginRightPx: readSnapshotPxMetric(style.marginRight),
    leftPx: readSnapshotPxMetric(style.left),
    topPx: readSnapshotPxMetric(style.top),
    widthPx: readSnapshotPxMetric(style.width),
    heightPx: readSnapshotPxMetric(style.height),
    display: readSnapshotStyleValue(style.display),
    position: readSnapshotStyleValue(style.position),
    textAlign: readSnapshotStyleValue(style.textAlign),
    justifyContent: readSnapshotStyleValue(style.justifyContent),
  }) as PaintSnapshotLineStyle;
}

function applyWrapperMarginsToSnapshotStyle(
  lineStyle: PaintSnapshotLineStyle,
  wrapperEl?: HTMLElement,
): PaintSnapshotLineStyle {
  if (!wrapperEl?.style) return lineStyle;

  return compactSnapshotObject({
    ...lineStyle,
    marginLeftPx: readSnapshotPxMetric(wrapperEl.style.marginLeft) ?? lineStyle.marginLeftPx,
    marginRightPx: readSnapshotPxMetric(wrapperEl.style.marginRight) ?? lineStyle.marginRightPx,
  }) as PaintSnapshotLineStyle;
}

function snapshotMarkerStyleFromElement(markerEl: HTMLElement): PaintSnapshotMarkerStyle {
  const style = markerEl?.style;
  if (!style) return {};
  return compactSnapshotObject({
    text: markerEl?.textContent ?? '',
    leftPx: readSnapshotPxMetric(style.left),
    widthPx: readSnapshotPxMetric(style.width),
    paddingRightPx: readSnapshotPxMetric(style.paddingRight),
    display: readSnapshotStyleValue(style.display),
    position: readSnapshotStyleValue(style.position),
    textAlign: readSnapshotStyleValue(style.textAlign),
    fontWeight: readSnapshotStyleValue(style.fontWeight),
    fontStyle: readSnapshotStyleValue(style.fontStyle),
    color: readSnapshotStyleValue(style.color),
    sourceAnchor: readNearestSourceAnchor(markerEl),
  }) as PaintSnapshotMarkerStyle;
}

function collectLineMarkersForSnapshot(lineEl: HTMLElement): PaintSnapshotMarkerStyle[] {
  const markers: PaintSnapshotMarkerStyle[] = [];
  const parent = lineEl?.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (!child.classList.contains('superdoc-paragraph-marker')) continue;
      markers.push(snapshotMarkerStyleFromElement(child));
    }
  }

  const inlineMarkers = lineEl?.querySelectorAll?.('.superdoc-paragraph-marker') ?? [];
  for (const markerEl of Array.from(inlineMarkers)) {
    if (!(markerEl instanceof HTMLElement)) continue;
    const markerStyle = snapshotMarkerStyleFromElement(markerEl);
    const markerText = markerEl.textContent ?? '';
    const markerLeft = readSnapshotPxMetric(markerEl.style.left);
    if (markers.some((existing) => existing.text === markerText && existing.leftPx === markerLeft)) {
      continue;
    }
    markers.push(markerStyle);
  }

  return markers;
}

function collectLineTabsForSnapshot(lineEl: HTMLElement): PaintSnapshotTabStyle[] {
  const tabs: PaintSnapshotTabStyle[] = [];
  const tabElements = lineEl?.querySelectorAll?.('.superdoc-tab') ?? [];
  for (const tabEl of Array.from(tabElements)) {
    if (!(tabEl instanceof HTMLElement)) continue;
    tabs.push(
      compactSnapshotObject({
        widthPx: readSnapshotPxMetric(tabEl.style.width),
        leftPx: readSnapshotPxMetric(tabEl.style.left),
        position: readSnapshotStyleValue(tabEl.style.position),
        borderBottom: readSnapshotStyleValue(tabEl.style.borderBottom),
      }) as PaintSnapshotTabStyle,
    );
  }
  return tabs;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const WORDART_LINE_FILL_RATIO = 0.9;
// Comment highlight color tokens moved to CommentHighlightDecorator.

/**
 * DOM-based document painter that renders layout fragments to HTML elements.
 * One paint entry per mode (painter plan P7): the persistent shell/content
 * reconcile owns paginated flow, while `paint()` owns semantic flow.
 *
 * @class DomPainter
 *
 * @remarks
 * The DomPainter is responsible for:
 * - Rendering layout fragments (paragraphs, lists, images, tables, drawings) to DOM elements
 * - Managing page-level DOM structure and styling
 * - Handling headers and footers via PageDecorationProvider
 * - Incremental re-rendering when only specific blocks change
 * - Hyperlink rendering with security sanitization and accessibility
 */
export class DomPainter {
  private readonly options: PainterOptions;
  private mount: HTMLElement | null = null;
  private doc: Document | null = null;
  private pageStates: PageDomState[] = [];
  private currentLayout: ResolvedLayout | null = null;
  private changedBlocks = new Set<string>();
  private readonly isSemanticFlow: boolean;
  private headerProvider?: PageDecorationProvider;
  private footerProvider?: PageDecorationProvider;
  private totalPages = 0;
  private sectionPageCounts = new Map<number, number>();
  private linkIdCounter = 0; // Counter for generating unique link IDs
  private shapeImageFillCounter = 0;
  private sdtLabelsRendered = new Set<string>(); // Tracks SDT labels rendered across pages

  /**
   * WeakMap storing tooltip data for hyperlink elements before DOM insertion.
   * Uses WeakMap to prevent memory leaks - entries are automatically garbage collected
   * when the corresponding element is removed from memory.
   * @private
   */
  private pendingTooltips = new WeakMap<HTMLElement, string>();
  // Gap between pages in px
  private pageGap = 24;
  private layoutVersion = 0;
  private layoutEpoch = 0;
  private processedLayoutVersion = -1;
  /** Current transaction mapping for position updates (null if no mapping or complex transaction) */
  private currentMapping: PositionMapping | null = null;
  /**
   * Persistent paginated page surface (default persistent page geometry
   * plan, Unit 1): the generation-owned shell registry plus the bounded
   * content plane, retained across paints. Snapshot/restored by the private
   * persistent-page transaction like every other retained plane.
   */
  private persistentSurface: PersistentPageSurfaceState | null = null;
  private persistentSurfaceInvalidationHandler: () => void = () => undefined;
  /**
   * Provider identity may advance every render generation even when the body
   * page remains reusable. Refresh header/footer DOM on the next content reconcile
   * without discarding the retained page element or its body fragments.
   */
  private persistentDecorationsDirty = false;
  /**
   * Page-window analog of `currentLayout.documentBackground`: the window path
   * deliberately runs with `currentLayout = null`, so the document background
   * scalar from `DomPainterPersistentPageInput` is retained here for
   * `getEffectivePageStyles()`. Reset by dense `paint()`/`resetState()`/
   * `dispose()` so a stale window value can never leak across modes/mounts.
   */
  private persistentDocumentBackground: DocumentBackground | null = null;
  // Painter plan P3a/§4.6: dark work counters for the persistent-page path,
  // accumulated across paints until consumed.
  private paintWork: PaintWorkSummary = createEmptyPaintWorkSummary();
  /**
   * P5 §4.6 (review fix): per-page attribution arrays are opt-in. Counters
   * are O(1) when never consumed; the arrays grow per paint, and product
   * code never drains the summary — only the perf harness (which needs WHICH
   * pages for its repaint oracle) turns this on.
   */
  private readonly paintWorkAttribution: boolean;
  /**
   * Story-aware position-coverage collector, owned per painter instance so the
   * live persistent surface and fresh-state oracle never mix counts.
   * Dark unless enabled via options; when dark, `record()` is a single branch.
   */
  private readonly positionValidation: PositionValidationCollector;
  private paintSnapshotBuilder: PaintSnapshotBuilder | null = null;
  private lastPaintSnapshot: PaintSnapshot | null = null;
  private onPaintSnapshotCallback: ((snapshot: PaintSnapshot) => void) | null = null;
  /**
   * Private persistent-page transaction state. The package handle exposes this
   * only through a non-enumerable Symbol.for seam; it is deliberately absent
   * from the public DomPainterHandle contract.
   */
  private activePersistentPageTransaction: ActivePersistentPagePainterTransaction | null = null;
  private persistentPageIndices: number[] = [];
  /** Resolved layout for the next-gen paint pipeline. */
  private resolvedLayout: ResolvedLayout | null = null;
  private showFormattingMarks = false;
  private contentControlsChrome: 'default' | 'none' = 'default';

  constructor(options: PainterOptions = {}) {
    this.options = options;
    this.isSemanticFlow = (options.flowMode ?? 'paginated') === 'semantic';
    this.headerProvider = options.headerProvider;
    this.footerProvider = options.footerProvider;
    this.showFormattingMarks = options.showFormattingMarks === true;
    this.contentControlsChrome = options.contentControlsChrome ?? 'default';
    this.paintWorkAttribution = options.paintWorkAttribution === true;
    this.positionValidation = createPositionValidationCollector(options.positionValidation);

    // Initialize page gap (default: 24px between vertical pages)
    this.pageGap =
      typeof options.pageGap === 'number' && Number.isFinite(options.pageGap) ? Math.max(0, options.pageGap) : 24;

    this.onPaintSnapshotCallback = options.onPaintSnapshot ?? null;
  }

  public setShowFormattingMarks(showFormattingMarks: boolean): void {
    const next = showFormattingMarks === true;
    if (this.showFormattingMarks === next) return;
    this.showFormattingMarks = next;
    this.applyFormattingMarksClass();
    this.invalidateRenderedContent();
  }

  public setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void {
    if (this.headerProvider === header && this.footerProvider === footer) return;
    this.headerProvider = header;
    this.footerProvider = footer;
    // Provider output is rendered into page DOM but is NOT a term in
    // Mark decorations dirty so the next persistent content reconcile
    // refreshes them from the new providers. Do not discard the retained page
    // element/body-fragment state: generation-scoped provider closures may
    // legitimately change identity on every edit, and a decoration refresh
    // does not require freshly mounting the body page.
    this.persistentDecorationsDirty = true;
  }

  private applyFormattingMarksClass(mount: HTMLElement | null = this.mount): void {
    mount?.classList.toggle('superdoc-show-formatting-marks', this.showFormattingMarks);
    mount?.classList.toggle('superdoc-cc-chrome-none', this.contentControlsChrome === 'none');
  }

  private invalidateRenderedContent(): void {
    this.pageStates = [];
    this.currentLayout = null;
    this.processedLayoutVersion = -1;
    this.layoutVersion += 1;
    // Rendered content is invalid everywhere: the persistent-page reuse cache
    // must not serve pages rendered under the old settings (e.g. formatting
    // marks are real spans baked in at render time, not CSS-only).
    this.invalidateWindowSurface();
  }

  /**
   * Forget the persistent surface so its next reconcile rebuilds content
   * under the current render settings. Provider swaps use a
   * decoration-only refresh.
   */
  private invalidateWindowSurface(): void {
    // The persistent surface's content was rendered under the old settings
    // too; forgetting it makes the next persistent paint rebuild shells and
    // rehydrate the desired content window from scratch.
    disposePersistentPageSurfaceState(this.persistentSurface);
    this.persistentSurface = null;
  }

  /** Returns the resolved page for a given index, or null if resolved data is unavailable. */
  private getResolvedPage(pageIndex: number): ResolvedPage | null {
    return this.resolvedLayout?.pages[pageIndex] ?? null;
  }

  /**
   * Returns the latest painter snapshot captured during the last paint cycle.
   */
  public getPaintSnapshot(): PaintSnapshot | null {
    return this.lastPaintSnapshot;
  }

  /**
   * Returns the stable page-root indices owned by the current surface.
   */
  public getPersistentPageIndices(): number[] {
    return [...this.persistentPageIndices];
  }

  /**
   * Begin a rollbackable transaction around a content paint. Named for the
   * paginated persistent-page path it was minted for; the captured snapshot is
   * the painter's COMPLETE retained/index state, so the same journal serves
   * the semantic flow's dense `paint()` entry (the v2 host's canonical
   * atomic visible commit wraps both paint kinds in one transaction).
   *
   * This method is not part of DomPainterHandle. The package factory installs
   * a non-enumerable Symbol.for hook that the v2 routed wrapper alone reads.
   * The caller owns the matching DOM mutation journal; rollback here restores
   * every painter-owned retained/index plane to references for those restored
   * last-good nodes.
   */
  public beginPersistentPageTransaction(): PersistentPagePainterTransaction {
    if (this.activePersistentPageTransaction) {
      throw new Error('persistent-page painter transaction already active');
    }

    const active: ActivePersistentPagePainterTransaction = {
      snapshot: this.capturePersistentPagePainterState(),
      pendingPaintSnapshot: null,
      hasPendingPaintSnapshot: false,
    };
    // Tooltip staging is ephemeral but mutable during fragment rendering.
    // Isolate candidate keys so a mid-render throw cannot leave any candidate
    // metadata in the last-good plane restored on rollback.
    this.pendingTooltips = new WeakMap<HTMLElement, string>();
    this.activePersistentPageTransaction = active;
    let settled = false;

    const claim = (): boolean => {
      if (settled) return false;
      if (this.activePersistentPageTransaction !== active) {
        throw new Error('persistent-page painter transaction is no longer active');
      }
      settled = true;
      return true;
    };

    return {
      commit: () => {
        if (!claim()) return;
        try {
          if (active.hasPendingPaintSnapshot && active.pendingPaintSnapshot) {
            this.onPaintSnapshotCallback?.(active.pendingPaintSnapshot);
          }
          this.activePersistentPageTransaction = null;
        } catch (error) {
          // The routed wrapper still owns a live DOM journal at this point.
          // Restore painter state before propagating so it can roll the DOM
          // back too and leave the whole visible commit at last-good.
          this.restorePersistentPagePainterState(active.snapshot);
          this.activePersistentPageTransaction = null;
          throw error;
        }
      },
      rollback: () => {
        if (!claim()) return;
        this.restorePersistentPagePainterState(active.snapshot);
        this.activePersistentPageTransaction = null;
      },
    };
  }

  private capturePersistentPagePainterState(): PersistentPagePainterStateSnapshot {
    return {
      mount: this.mount,
      doc: this.doc,
      pageStates: this.pageStates.map(clonePageDomStateMetadata),
      currentLayout: this.currentLayout,
      changedBlocks: new Set(this.changedBlocks),
      headerProvider: this.headerProvider,
      footerProvider: this.footerProvider,
      totalPages: this.totalPages,
      sectionPageCounts: new Map(this.sectionPageCounts),
      linkIdCounter: this.linkIdCounter,
      sdtLabelsRendered: new Set(this.sdtLabelsRendered),
      pendingTooltips: this.pendingTooltips,
      pageGap: this.pageGap,
      layoutVersion: this.layoutVersion,
      layoutEpoch: this.layoutEpoch,
      processedLayoutVersion: this.processedLayoutVersion,
      currentMapping: this.currentMapping,
      persistentDecorationsDirty: this.persistentDecorationsDirty,
      persistentDocumentBackground: this.persistentDocumentBackground,
      persistentSurface: clonePersistentPageSurfaceState(this.persistentSurface, clonePageDomStateMetadata),
      paintWork: clonePaintWorkSummary(this.paintWork),
      paintSnapshotBuilder: clonePaintSnapshotBuilder(this.paintSnapshotBuilder),
      lastPaintSnapshot: this.lastPaintSnapshot,
      persistentPageIndices: [...this.persistentPageIndices],
      resolvedLayout: this.resolvedLayout,
      showFormattingMarks: this.showFormattingMarks,
      contentControlsChrome: this.contentControlsChrome,
    };
  }

  private restorePersistentPagePainterState(snapshot: PersistentPagePainterStateSnapshot): void {
    this.mount = snapshot.mount;
    this.doc = snapshot.doc;
    this.pageStates = snapshot.pageStates;
    this.currentLayout = snapshot.currentLayout;
    this.changedBlocks = snapshot.changedBlocks;
    this.headerProvider = snapshot.headerProvider;
    this.footerProvider = snapshot.footerProvider;
    this.totalPages = snapshot.totalPages;
    this.sectionPageCounts = snapshot.sectionPageCounts;
    this.linkIdCounter = snapshot.linkIdCounter;
    this.sdtLabelsRendered = snapshot.sdtLabelsRendered;
    this.pendingTooltips = snapshot.pendingTooltips;
    this.pageGap = snapshot.pageGap;
    this.layoutVersion = snapshot.layoutVersion;
    this.layoutEpoch = snapshot.layoutEpoch;
    this.processedLayoutVersion = snapshot.processedLayoutVersion;
    this.currentMapping = snapshot.currentMapping;
    this.persistentDecorationsDirty = snapshot.persistentDecorationsDirty;
    this.persistentDocumentBackground = snapshot.persistentDocumentBackground;
    this.persistentSurface = snapshot.persistentSurface;
    this.paintWork = snapshot.paintWork;
    this.paintSnapshotBuilder = snapshot.paintSnapshotBuilder;
    this.lastPaintSnapshot = snapshot.lastPaintSnapshot;
    this.persistentPageIndices = snapshot.persistentPageIndices;
    this.resolvedLayout = snapshot.resolvedLayout;
    this.showFormattingMarks = snapshot.showFormattingMarks;
    this.contentControlsChrome = snapshot.contentControlsChrome;
  }

  private createAllPageIndices(pageCount: number): number[] {
    return Array.from({ length: pageCount }, (_, pageIndex) => pageIndex);
  }

  private setPersistentPageIndices(pageIndices: number[]): void {
    this.persistentPageIndices = [...pageIndices];
  }

  private emitPaintSnapshot(snapshot: PaintSnapshot): void {
    this.lastPaintSnapshot = snapshot;
    if (this.activePersistentPageTransaction) {
      this.activePersistentPageTransaction.pendingPaintSnapshot = snapshot;
      this.activePersistentPageTransaction.hasPendingPaintSnapshot = true;
      return;
    }
    this.onPaintSnapshotCallback?.(snapshot);
  }

  private beginPaintSnapshot(layout: ResolvedLayout): void {
    this.paintSnapshotBuilder = {
      formatVersion: 1,
      lineCount: 0,
      markerCount: 0,
      tabCount: 0,
      pages: layout.pages.map((page, index) => ({
        index,
        pageNumber: Number.isFinite(page.number) ? page.number : null,
        lineCount: 0,
        lines: [],
      })),
    };
  }

  private finalizePaintSnapshotFromBuilder(rootEl?: HTMLElement): void {
    const builder = this.paintSnapshotBuilder;
    if (!builder) {
      this.lastPaintSnapshot = null;
      return;
    }

    const pages = builder.pages.map((page) =>
      compactSnapshotObject({
        index: page.index,
        pageNumber: page.pageNumber,
        lineCount: page.lineCount,
        lines: page.lines,
      }),
    ) as PaintSnapshotPage[];

    this.emitPaintSnapshot({
      formatVersion: builder.formatVersion,
      pageCount: pages.length,
      lineCount: builder.lineCount,
      markerCount: builder.markerCount,
      tabCount: builder.tabCount,
      pages,
      entities: rootEl ? collectPaintSnapshotEntitiesFromDomRoot(rootEl) : createEmptyPaintSnapshotEntities(),
    });
    this.paintSnapshotBuilder = null;
  }

  private capturePaintSnapshotLine(
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options: PaintSnapshotCaptureOptions = {},
  ): void {
    const builder = this.paintSnapshotBuilder;
    if (!builder) return;
    const pageIndex = context.pageIndex;
    if (!Number.isInteger(pageIndex)) return;

    const page = builder.pages[pageIndex as number];
    if (!page) return;

    const markers = collectLineMarkersForSnapshot(lineEl);
    const tabs = collectLineTabsForSnapshot(lineEl);
    const lineIndex = page.lines.length;
    const style = applyWrapperMarginsToSnapshotStyle(snapshotLineStyleFromElement(lineEl), options.wrapperEl);

    page.lines.push(
      compactSnapshotObject({
        index: lineIndex,
        inTableFragment: options.inTableFragment === true,
        inTableParagraph: options.inTableParagraph === true,
        style,
        markers,
        tabs,
        sourceAnchor:
          readNearestSourceAnchor(lineEl) ?? readNearestSourceAnchor(options.wrapperEl) ?? options.sourceAnchor,
        layoutSourceIdentity:
          readNearestLayoutSourceIdentity(lineEl) ?? readNearestLayoutSourceIdentity(options.wrapperEl),
      }) as PaintSnapshotLine,
    );

    page.lineCount += 1;
    builder.lineCount += 1;
    builder.markerCount += markers.length;
    builder.tabCount += tabs.length;
  }

  private collectPaintSnapshotFromDomRoot(rootEl: HTMLElement): PaintSnapshot {
    const pageElements = Array.from(rootEl?.querySelectorAll?.('.superdoc-page') ?? []);
    const pages: PaintSnapshotPage[] = [];
    let lineCount = 0;
    let markerCount = 0;
    let tabCount = 0;

    for (let domPageIndex = 0; domPageIndex < pageElements.length; domPageIndex += 1) {
      const pageEl = pageElements[domPageIndex];
      if (!(pageEl instanceof HTMLElement)) continue;
      const pageIndexRaw = pageEl.dataset?.pageIndex;
      const pageIndexParsed = pageIndexRaw == null ? Number.NaN : Number(pageIndexRaw);
      const pageIndex = Number.isInteger(pageIndexParsed) ? pageIndexParsed : domPageIndex;

      const lineElements = Array.from(pageEl.querySelectorAll('.superdoc-line'));
      const lines: PaintSnapshotLine[] = [];
      for (let lineIndex = 0; lineIndex < lineElements.length; lineIndex += 1) {
        const lineEl = lineElements[lineIndex];
        if (!(lineEl instanceof HTMLElement)) continue;

        const markers = collectLineMarkersForSnapshot(lineEl);
        const tabs = collectLineTabsForSnapshot(lineEl);
        markerCount += markers.length;
        tabCount += tabs.length;
        lineCount += 1;

        lines.push(
          compactSnapshotObject({
            index: lineIndex,
            inTableFragment: Boolean(lineEl.closest('.superdoc-table-fragment')),
            inTableParagraph: Boolean(lineEl.closest('.superdoc-table-paragraph')),
            style: snapshotLineStyleFromElement(lineEl),
            markers,
            tabs,
            sourceAnchor: readNearestSourceAnchor(lineEl),
            layoutSourceIdentity: readNearestLayoutSourceIdentity(lineEl),
          }) as PaintSnapshotLine,
        );
      }

      const pageNumberRaw = pageEl.dataset?.pageNumber;
      const pageNumberParsed = pageNumberRaw == null ? Number.NaN : Number(pageNumberRaw);

      pages.push(
        compactSnapshotObject({
          index: pageIndex,
          pageNumber: Number.isFinite(pageNumberParsed) ? pageNumberParsed : null,
          lineCount: lines.length,
          lines,
        }) as PaintSnapshotPage,
      );
    }

    return {
      formatVersion: 1,
      pageCount: pages.length,
      lineCount,
      markerCount,
      tabCount,
      pages,
      entities: collectPaintSnapshotEntitiesFromDomRoot(rootEl),
    };
  }

  /** Semantic continuous paint. Paginated flow has only `paintPersistentPages()`. */
  public paint(input: DomPainterInput, mount: HTMLElement, mapping?: PositionMapping): void {
    if (!this.isSemanticFlow) {
      throw new Error('DomPainter.paint() rejects paginated flow; use paintPersistentPages()');
    }
    const resolvedLayout = input.resolvedLayout;
    if (resolvedLayout.flowMode !== 'semantic') {
      throw new Error('DomPainter.paint() rejects paginated layout input; use paintPersistentPages()');
    }
    this.resolvedLayout = resolvedLayout;
    this.changedBlocks.clear();

    if (!(mount instanceof HTMLElement)) {
      throw new Error('DomPainter.paint requires a valid HTMLElement mount');
    }

    const doc = mount.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DomPainter.paint requires a DOM-like document');
    }
    this.doc = doc;
    this.sdtLabelsRendered.clear(); // Reset SDT label tracking for new render cycle

    // Simple transaction gate: only use position mapping optimization for single-step transactions.
    // Complex transactions (paste, multi-step replace, etc.) fall back to full rebuild.
    const isSimpleTransaction = mapping && mapping.maps.length === 1;
    if (mapping && !isSimpleTransaction) {
      // Complex transaction, force all body fragments to rebuild (safe fallback).
      for (const page of input.resolvedLayout.pages) {
        for (const item of page.items) {
          if ('blockId' in item) this.changedBlocks.add(item.blockId);
        }
      }
      this.currentMapping = null;
    } else {
      this.currentMapping = mapping ?? null;
    }

    // Document-scoped style preflight: ONE shared manifest across dense and
    // persistent painting so tracked-change decoration cannot silently diverge.
    ensureSurfaceStylePreflight(doc);
    // Mode switch: dense ownership means page styles derive from
    // currentLayout, never from a stale persistent-page input.
    this.persistentDocumentBackground = null;
    mount.classList.add(CLASS_NAMES.container);
    this.applyFormattingMarksClass(mount);

    if (this.mount && this.mount !== mount) {
      this.resetState();
      this.applyFormattingMarksClass(mount);
    }
    this.layoutVersion += 1;

    this.layoutEpoch = resolvedLayout.layoutEpoch ?? 0;
    this.mount = mount;
    this.beginPaintSnapshot(resolvedLayout);

    this.totalPages = resolvedLayout.pages.length;
    this.sectionPageCounts = buildSectionPageCounts(resolvedLayout.pages);
    const previousLayout = this.currentLayout;
    this.currentLayout = resolvedLayout;
    applyStyles(mount, containerStyles);
    mount.style.gap = '0px';
    mount.style.alignItems = 'stretch';
    if (!previousLayout || this.pageStates.length === 0) {
      this.fullRender(resolvedLayout);
    } else {
      this.patchLayout(resolvedLayout);
    }
    this.setPersistentPageIndices(this.createAllPageIndices(resolvedLayout.pages.length));
    this.changedBlocks.clear();
    this.currentMapping = null;
  }

  /**
   * The persistent paginated reconcile (default persistent page geometry
   * plan, Unit 1): one generation-scoped scaffold owns every page root for
   * the whole layout generation, and only content descendants are
   * virtualized. Same-scaffold calls skip shell work in O(1); a new scaffold
   * identity reconciles page roots by index. There is no viewport-owned shell
   * set and no spacer node — the scroll extent derives
   * from the persistent shells plus the container gap alone.
   */
  public paintPersistentPages(input: DomPainterPersistentPageInput, mount: HTMLElement): void {
    if (this.isSemanticFlow) {
      throw new Error(
        'DomPainter.paintPersistentPages() rejects semantic flow (painter plan P7). ' +
          'Semantic documents paint through paint(); persistent page scaffolds exist only in paginated flow.',
      );
    }
    if (!(mount instanceof HTMLElement)) {
      throw new Error('DomPainter.paintPersistentPages requires a valid HTMLElement mount');
    }
    const doc = mount.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DomPainter.paintPersistentPages requires a DOM-like document');
    }
    this.doc = doc;
    this.mount = mount;
    this.currentLayout = null;
    this.currentMapping = null;
    this.changedBlocks.clear();
    this.pageStates = [];
    // The persistent surface owns no ResolvedLayout; the document background
    // scalar rides the input exactly like the persistent-page path.
    this.persistentDocumentBackground = input.documentBackground ?? null;
    this.totalPages = input.scaffold.pageCount;
    this.layoutEpoch = input.scaffold.generation;
    // Window-scoped fallback (mounted parity): only the desired content
    // pages' packets inform section counts when the caller supplies none —
    // the persistent surface never materializes the whole resolved layout.
    this.sectionPageCounts = input.sectionPageCounts
      ? readSectionPageCounts(input.sectionPageCounts)
      : buildSectionPageCounts(
          resolveDesiredContentPageIndices(input)
            .map((pageIndex) => input.packetsByPageIndex.get(pageIndex))
            .filter((packet): packet is ResolvedPage => packet != null),
        );

    ensureSurfaceStylePreflight(doc);
    mount.classList.add(CLASS_NAMES.container);
    this.applyFormattingMarksClass(mount);
    applyStyles(mount, containerStyles);

    // A fresh surface (or a surface invalidated by a render-settings change)
    // starts from an empty mount; the retained reconcile path never wipes.
    if (this.persistentSurface == null || this.persistentSurface.mount !== mount) {
      disposePersistentPageSurfaceState(this.persistentSurface);
      this.persistentSurface = null;
      mount.innerHTML = '';
    }

    this.persistentSurface = reconcilePersistentPageSurface(
      {
        contentContext: this.pageContentContext(),
        work: this.paintWork,
        recordPageWork: (kind, pageIndex) => this.recordPageWork(kind, pageIndex),
        consumeDecorationsDirty: () => {
          const dirty = this.persistentDecorationsDirty;
          this.persistentDecorationsDirty = false;
          return dirty;
        },
        // The only per-document dynamic input to shell styles is the
        // document background; instance-static pageStyles need no signature.
        shellStyleSignature: `bg:${this.persistentDocumentBackground?.color ?? ''}`,
        onIntegrityInvalidated: this.persistentSurfaceInvalidationHandler,
      },
      this.persistentSurface,
      input,
      mount,
    );

    this.setPersistentPageIndices(this.createAllPageIndices(input.scaffold.pageCount));
    if (input.captureSnapshot !== false) {
      this.emitPaintSnapshot(this.collectPaintSnapshotFromDomRoot(mount));
    }
  }

  /** True only while the retained document-wide page-shell plane matches the live DOM. */
  public isPersistentPageSurfaceIntact(): boolean {
    return isPersistentPageSurfaceIntact(this.persistentSurface);
  }

  /** Register the host wake-up used when foreign DOM work removes/replaces page shells. */
  public setPersistentSurfaceInvalidationHandler(handler?: () => void): void {
    const effectiveHandler = handler ?? (() => undefined);
    this.persistentSurfaceInvalidationHandler = effectiveHandler;
    // A host may attach its canonical scheduler after the first scaffold was
    // painted. The integrity observer reads the handler retained by that live
    // surface, so update it as well as the factory default; otherwise the
    // observer marks the surface dirty but calls the original no-op and the
    // shell is repaired only after an unrelated scroll or repaint.
    if (this.persistentSurface) {
      this.persistentSurface.integrity.onInvalidated = effectiveHandler;
    }
  }

  /**
   * Hydrated content page indices of the persistent surface, ascending.
   * Page roots cover the whole scaffold; this is the bounded content set.
   */
  public getHydratedContentPageIndices(): number[] {
    if (!this.persistentSurface) return [];
    return [...this.persistentSurface.content.keys()].sort((left, right) => left - right);
  }

  /**
   * Painter plan §4.6 (dark observability): persistent-page paint work since the
   * last consume. Never invents values — fields the path cannot attribute yet
   * stay 0/null.
   */
  public consumePaintWorkSummary(): PaintWorkSummary {
    const summary = this.paintWork;
    this.paintWork = createEmptyPaintWorkSummary();
    return summary;
  }

  /**
   * Story-aware position-coverage since the last consume, drained and reset at
   * this documented pass boundary. Content-free and bounded; safe to serialize
   * into a performance report. When the collector is dark (the product
   * default), the summary is empty (`checked: 0`).
   */
  public consumePositionValidationSummary(): PositionValidationSummary {
    return this.positionValidation.consume();
  }

  /**
   * Per-page work attribution (P5 §4.6), opt-in via `paintWorkAttribution`:
   * the arrays are only drained by `consumePaintWorkSummary()`, so an
   * always-on push would grow unboundedly on the product path where nothing
   * ever consumes the summary. Counters stay always-on and O(1).
   */
  private recordPageWork(kind: PersistentPageWorkKind, pageIndex: number): void {
    if (!this.paintWorkAttribution) return;
    this.paintWork[kind].push(pageIndex);
  }

  private renderColumnSeparators(pageEl: HTMLElement, page: ResolvedPage, pageWidth: number, pageHeight: number): void {
    if (!this.doc) return;
    pageEl.querySelectorAll('[data-superdoc-column-separator="true"]').forEach((separator) => separator.remove());

    const pageMargins = page.margins;
    if (!pageMargins) return;

    const leftMargin = pageMargins.left ?? 0;
    const rightMargin = pageMargins.right ?? 0;
    const topMargin = pageMargins.top ?? 0;
    const bottomMargin = pageMargins.bottom ?? 0;
    const contentWidth = pageWidth - leftMargin - rightMargin;

    // Prefer columnRegions (per-region configs for pages with continuous
    // section breaks that change column layout mid-page). Fall back to a
    // single region derived from page.columns so pages without mid-page
    // changes keep working unchanged.
    const regions =
      page.columnRegions ??
      (page.columns
        ? [
            {
              yStart: topMargin,
              yEnd: pageHeight - bottomMargin,
              columns: page.columns,
            },
          ]
        : []);

    for (const region of regions) {
      const { columns, yStart, yEnd } = region;
      if (!columns.withSeparator) continue;
      if (columns.count <= 1) continue;

      const regionHeight = yEnd - yStart;
      if (regionHeight <= 0) continue;

      const separatorPositions = this.getColumnSeparatorPositions(columns, leftMargin, contentWidth);
      if (separatorPositions.length === 0) continue;

      // Word only renders the column separator between columns that both have
      // content. For a 2-col page where col 1 is empty (e.g. the last page of
      // a multi-column section that fits in col 0, or a `nextPage` section
      // where Word fills col 0 first without balancing), Word draws no line
      // even when the section's `w:cols` declared `w:sep="1"`. Gate each
      // separator on whether any fragment sits past it within the region.
      const fragmentsInRegion = page.items.filter((item) => item.y >= yStart - 0.5 && item.y < yEnd + 0.5);

      for (const separatorX of separatorPositions) {
        const hasContentPastSeparator = fragmentsInRegion.some((f) => f.x >= separatorX);
        if (!hasContentPastSeparator) continue;

        const separatorEl = this.doc.createElement('div');
        separatorEl.dataset.superdocColumnSeparator = 'true';

        separatorEl.style.position = 'absolute';
        separatorEl.style.left = `${separatorX}px`;
        separatorEl.style.top = `${yStart}px`;
        separatorEl.style.height = `${regionHeight}px`;
        separatorEl.style.width = '1px';
        separatorEl.style.backgroundColor = '#000000';
        separatorEl.style.pointerEvents = 'none';
        pageEl.appendChild(separatorEl);
      }
    }
  }

  private getColumnSeparatorPositions(columns: ColumnLayout, leftMargin: number, contentWidth: number): number[] {
    // SD-2629: separator positions come from the one resolved column geometry (the same source as
    // fill count and column widths), not a re-derivation here. The caller has already gated on
    // withSeparator and count > 1.
    const normalized = normalizeColumnLayout(columns, contentWidth);
    // Equal mode: skip when the evenly-divided column is too narrow for a 1px line. This must be
    // checked PRE-geometry because normalize floors fabricated widths at 1 (and falls back to the
    // full content width when the gap overflows the content area), so the geometry width alone would
    // not reveal the overflow. Keyed on resolveColumnMode (not the presence of a widths array) so a
    // raw equalWidth:true config carrying stray widths still takes the equal-mode guard. Legacy guard.
    if (resolveColumnMode(columns) === 'equal') {
      const equalWidth = (contentWidth - columns.gap * (normalized.count - 1)) / normalized.count;
      if (equalWidth <= 1) return [];
    }
    const geometry = getColumnGeometry(normalized);
    if (geometry.length <= 1) return [];
    if (geometry.some((column) => column.width <= 1)) return [];
    return getColumnSeparatorPositionsFromGeometry(geometry, leftMargin);
  }
  private renderDecorationsForPage(pageEl: HTMLElement, page: ResolvedPage, pageIndex: number): void {
    if (this.isSemanticFlow) return;
    this.renderDecorationSection(pageEl, page, pageIndex, 'header');
    this.renderDecorationSection(pageEl, page, pageIndex, 'footer');
  }

  /**
   * Check if a fragment is vertically anchored to the page.
   * Used to determine special Y positioning for page-relative anchored content
   * in header/footer decoration sections.
   */
  private isPageRelativeAnchoredFragment(fragment: Fragment, resolvedItem: ResolvedPaintItem | undefined): boolean {
    if (this.isPageRelativeParagraphFrame(fragment, resolvedItem)) return true;
    const block = resolvedItem && 'block' in resolvedItem ? resolvedItem.block : undefined;
    return (
      (fragment.kind === 'image' || fragment.kind === 'drawing') &&
      (block?.kind === 'image' || block?.kind === 'drawing') &&
      block.anchor?.vRelativeFrom === 'page'
    );
  }

  private isPageRelativeParagraphFrame(fragment: Fragment, resolvedItem: ResolvedPaintItem | undefined): boolean {
    if (fragment.kind !== 'para') return false;
    const block = resolvedItem && 'block' in resolvedItem ? resolvedItem.block : undefined;
    const frame = block?.kind === 'paragraph' ? block.attrs?.frame : undefined;
    return isPagePositionedParagraphFrame(frame);
  }

  private isPageRelativeHorizontalAnchoredFragment(
    fragment: Fragment,
    resolvedItem: ResolvedPaintItem | undefined,
  ): boolean {
    const block = resolvedItem && 'block' in resolvedItem ? resolvedItem.block : undefined;
    if (fragment.kind === 'para' && block?.kind === 'paragraph') {
      const frame = block.attrs?.frame;
      return isPositionedParagraphFrame(frame) && frame.hAnchor === 'page';
    }
    if (fragment.kind !== 'image' && fragment.kind !== 'drawing') {
      return false;
    }
    if (!block || (block.kind !== 'image' && block.kind !== 'drawing')) {
      return false;
    }
    return block.anchor?.hRelativeFrom === 'page';
  }

  /**
   * Header/footer layout emits normalized anchor Y coordinates:
   * - headers: local to the header container origin
   * - footers: local to the top of the footer band (pageHeight - bottomMargin)
   *
   * Footer containers can grow upward when content overflows the reserved footer
   * band, so their top edge is not always the same as the footer band origin.
   * This helper returns the page-space origin that normalized anchor Y values
   * are measured from.
   */
  private getDecorationAnchorPageOriginY(
    page: ResolvedPage,
    kind: 'header' | 'footer',
    effectiveOffset: number,
  ): number {
    if (kind === 'header') {
      return effectiveOffset;
    }

    if (!Number.isFinite(page.height) || page.height <= 0) {
      throw new Error(
        `DomPainter: invalid ResolvedPage.height (${page.height}) for page ${page.index}; resolve stage must produce a positive numeric height.`,
      );
    }

    const pageMargins = page.margins;
    const pageHeight = page.height;

    const footerDistance = pageMargins?.footer;
    if (typeof footerDistance === 'number' && Number.isFinite(footerDistance)) {
      return Math.max(0, pageHeight - Math.max(0, footerDistance));
    }

    const bottomMargin = pageMargins?.bottom;
    if (bottomMargin == null) {
      return effectiveOffset;
    }

    const footnoteReserve = page.footnoteReserved ?? 0;
    const adjustedBottomMargin = Math.max(0, bottomMargin - footnoteReserve);

    return Math.max(0, pageHeight - adjustedBottomMargin);
  }

  private getFooterFragmentAnchorPageOriginY(
    page: ResolvedPage,
    effectiveOffset: number,
    fragment: Fragment,
    resolvedItem: ResolvedPaintItem | undefined,
  ): number {
    const mediaOrigin = this.getDecorationAnchorPageOriginY(page, 'footer', effectiveOffset);
    if (!this.isPageRelativeParagraphFrame(fragment, resolvedItem)) return mediaOrigin;

    return resolveFooterPageFrameOriginY(page.height, page.baseMargins?.bottom ?? page.margins?.bottom);
  }

  private renderDecorationSection(
    pageEl: HTMLElement,
    page: ResolvedPage,
    pageIndex: number,
    kind: 'header' | 'footer',
  ): void {
    if (!this.doc) return;
    const provider = kind === 'header' ? this.headerProvider : this.footerProvider;
    const className = kind === 'header' ? CLASS_NAMES.pageHeader : CLASS_NAMES.pageFooter;
    const existing = pageEl.querySelector(`.${className}`);
    const data = provider ? provider(page.number, page.margins, page) : null;
    // Behind-document decoration fragments are direct page children, not
    // descendants of the normal header/footer container. Clear them before
    // the empty-provider return so removing or emptying a provider cannot
    // leave a stale watermark on an otherwise retained page.
    const behindDocSelector = `[data-behind-doc-section="${kind}"]`;
    pageEl.querySelectorAll(behindDocSelector).forEach((el) => el.remove());

    if (!data || data.fragments.length === 0) {
      existing?.remove();
      return;
    }

    const container = (existing as HTMLElement) ?? this.doc.createElement('div');
    container.className = className;
    container.innerHTML = '';
    // Stamp a stable header/footer STORY REF ID
    // (and resolved variant) on the decoration container so host-visible DOM
    // readback can associate the painted region with its header/footer story.
    // The payload already carries `headerFooterRefId` — no upstream import is
    // introduced and the painter boundary is preserved.
    if (typeof data.headerFooterRefId === 'string' && data.headerFooterRefId.length > 0) {
      container.setAttribute('data-sd-headerfooter-ref-id', data.headerFooterRefId);
    } else {
      container.removeAttribute('data-sd-headerfooter-ref-id');
    }
    if (typeof data.sectionType === 'string' && data.sectionType.length > 0) {
      container.setAttribute('data-sd-headerfooter-variant', data.sectionType);
    } else {
      container.removeAttribute('data-sd-headerfooter-variant');
    }
    container.setAttribute('data-sd-headerfooter-kind', kind);
    const baseOffset = data.offset;
    const marginLeft = data.marginLeft ?? 0;
    const pageMargins = page.margins;
    const marginRight = pageMargins?.right ?? 0;

    // For footers, if content is taller than reserved space, expand container upward
    // The container bottom stays anchored at footerMargin from page bottom
    let effectiveHeight = data.height;
    let effectiveOffset = baseOffset;
    if (
      kind === 'footer' &&
      typeof data.contentHeight === 'number' &&
      Number.isFinite(data.contentHeight) &&
      data.contentHeight > 0 &&
      data.contentHeight > data.height
    ) {
      effectiveHeight = data.contentHeight;
      // Move container up to accommodate taller content while keeping bottom edge in place
      effectiveOffset = baseOffset - (data.contentHeight - data.height);
    }

    container.style.position = 'absolute';
    container.style.left = `${marginLeft}px`;
    if (typeof data.contentWidth === 'number') {
      container.style.width = `${Math.max(0, data.contentWidth)}px`;
    } else {
      container.style.width = `calc(100% - ${marginLeft + marginRight}px)`;
    }
    // Header/footer stories are directly hit-tested by the v2 editable bridge.
    // Keep the container targetable so `elementsFromPoint()` can reach the
    // stamped fragment node instead of falling through to the page background.
    container.style.pointerEvents = 'auto';
    container.style.height = `${effectiveHeight}px`;
    container.style.top = `${Math.max(0, effectiveOffset)}px`;
    // Body fragments must win where normal header/footer stories overflow into the main story.
    container.style.zIndex = '0';
    // Allow header/footer content to overflow its container bounds.
    // In OOXML, headers and footers can extend past their allocated margin space
    // into the body region, similar to how body content can have negative indents.
    container.style.overflow = 'visible';

    // For footers, calculate offset to push content to bottom of container
    // Fragments are absolutely positioned, so we need to adjust their y values
    // Use effectiveHeight (which accounts for overflow) rather than reserved height
    let footerYOffset = 0;
    if (kind === 'footer' && data.fragments.length > 0) {
      const contentHeight =
        typeof data.contentHeight === 'number'
          ? data.contentHeight
          : data.fragments.reduce((max, f, fi) => {
              const resolvedItem = data.items?.[fi];
              const fragHeight =
                'height' in f && typeof f.height === 'number' ? f.height : this.estimateFragmentHeight(f, resolvedItem);
              return Math.max(max, f.y + Math.max(0, fragHeight));
            }, 0);
      // Offset to push content to bottom of container
      // When container has expanded (effectiveHeight >= contentHeight), offset is 0
      footerYOffset = Math.max(0, effectiveHeight - contentHeight);
    }

    const context: FragmentRenderContext = {
      pageNumber: page.number,
      totalPages: this.totalPages,
      section: kind,
      story: resolveDecorationStory(kind, data),
      pageNumberText: page.numberText,
      displayPageNumber: page.displayNumber,
      pageNumberFormat: page.pageNumberFormat,
      pageNumberChapterText: page.pageNumberChapterText,
      pageNumberChapterSeparator: page.pageNumberChapterSeparator,
      sectionPageCount: this.getSectionPageCount(page),
      pageIndex,
      ...(data.pageCountFieldsExact === false ? { pageCountFieldsExact: false } : {}),
    };

    // Compute between-border flags for header/footer paragraph fragments
    const decorationItems = data.items ?? [];
    const betweenBorderFlags = computeBetweenBorderFlags(decorationItems);

    // Separate behindDoc fragments from normal fragments.
    // Prefer explicit fragment.behindDoc when present. Keep zIndex===0 as a
    // compatibility fallback for older layouts that predate explicit metadata.
    // Track original index for between-border flag lookup.
    const behindDocFragments: { fragment: (typeof data.fragments)[number]; originalIndex: number }[] = [];
    const normalFragments: { fragment: (typeof data.fragments)[number]; originalIndex: number }[] = [];

    for (let fi = 0; fi < data.fragments.length; fi += 1) {
      const fragment = data.fragments[fi];
      let isBehindDoc = false;
      if (fragment.kind === 'image' || fragment.kind === 'drawing') {
        const resolvedItem = decorationItems[fi] as ResolvedDrawingItem | undefined;
        const isTextboxShape =
          fragment.kind === 'drawing' &&
          (fragment.drawingKind === 'textboxShape' ||
            (resolvedItem?.kind === 'fragment' &&
              'block' in resolvedItem &&
              resolvedItem.block.kind === 'drawing' &&
              resolvedItem.block.drawingKind === 'textboxShape'));
        isBehindDoc =
          !isTextboxShape &&
          (fragment.behindDoc === true ||
            (fragment.behindDoc == null && 'zIndex' in fragment && fragment.zIndex === 0) ||
            this.shouldRenderBehindPageContent(fragment, kind, resolvedItem));
      }
      if (isBehindDoc) {
        behindDocFragments.push({ fragment, originalIndex: fi });
      } else {
        normalFragments.push({ fragment, originalIndex: fi });
      }
    }

    // Remove any previously rendered behindDoc fragments for this section before re-rendering.
    // Unlike the header/footer container (which uses innerHTML = '' to clear), behindDoc
    // fragments are placed directly on the page element and must be explicitly removed.
    // Render behindDoc fragments directly on the page with z-index: 0
    // and insert them at the beginning of the page so they render behind body content.
    // We can't use z-index: -1 because that goes behind the page's white background.
    // By inserting at the beginning and using z-index: 0, they render below body content
    // which also has z-index values but comes later in DOM order.
    behindDocFragments.forEach(({ fragment, originalIndex }) => {
      const resolvedItem = data.items?.[originalIndex];
      const fragEl = this.renderFragment(
        fragment,
        context,
        undefined,
        betweenBorderFlags.get(originalIndex),
        resolvedItem,
      );
      this.applyHeaderFooterTextWatermarkPreviewOpacity(fragEl, data.isActiveHeaderFooter === true);
      const isPageRelative = this.isPageRelativeAnchoredFragment(fragment, resolvedItem);

      let pageY: number;
      if (isPageRelative && kind === 'footer') {
        // Footer page-relative: fragment.y is normalized to band-local coords
        pageY = this.getFooterFragmentAnchorPageOriginY(page, effectiveOffset, fragment, resolvedItem) + fragment.y;
      } else if (isPageRelative) {
        // Header page-relative: fragment.y is raw inner-layout absolute Y
        pageY = fragment.y;
      } else {
        pageY = effectiveOffset + fragment.y + (kind === 'footer' ? footerYOffset : 0);
      }

      fragEl.style.top = `${pageY}px`;
      fragEl.style.left = `${isPageRelative ? fragment.x : marginLeft + fragment.x}px`;
      fragEl.style.zIndex = '0'; // Same level as page, but inserted first so renders behind
      fragEl.dataset.behindDocSection = kind; // Track for cleanup on re-render
      // Insert at beginning of page so it renders behind body content due to DOM order
      pageEl.insertBefore(fragEl, pageEl.firstChild);
    });

    // Render normal fragments in the header/footer container
    normalFragments.forEach(({ fragment, originalIndex }) => {
      const resolvedItem = data.items?.[originalIndex];
      const fragEl = this.renderFragment(
        fragment,
        context,
        undefined,
        betweenBorderFlags.get(originalIndex),
        resolvedItem,
      );
      this.applyHeaderFooterTextWatermarkPreviewOpacity(fragEl, data.isActiveHeaderFooter === true);
      const isPageRelative = this.isPageRelativeAnchoredFragment(fragment, resolvedItem);
      const isPageRelativeX = this.isPageRelativeHorizontalAnchoredFragment(fragment, resolvedItem);

      if (isPageRelative && kind === 'footer') {
        // Footer page-relative: fragment.y is normalized to band-local coords
        const anchorPageOriginY = this.getFooterFragmentAnchorPageOriginY(
          page,
          effectiveOffset,
          fragment,
          resolvedItem,
        );
        fragEl.style.top = `${fragment.y + anchorPageOriginY - effectiveOffset}px`;
      } else if (isPageRelative) {
        // Header page-relative: convert raw inner-layout Y to container-local
        fragEl.style.top = `${fragment.y - effectiveOffset}px`;
      } else if (footerYOffset > 0) {
        // Non-anchored footer content: push to bottom of container
        const currentTop = parseFloat(fragEl.style.top) || fragment.y;
        fragEl.style.top = `${currentTop + footerYOffset}px`;
      }
      if (isPageRelativeX) {
        fragEl.style.left = `${fragment.x - marginLeft}px`;
      }

      container.appendChild(fragEl);
    });

    const firstBodyFragment = Array.from(pageEl.children).find(
      (child) => child.classList.contains(CLASS_NAMES.fragment) && !child.hasAttribute('data-behind-doc-section'),
    );
    pageEl.insertBefore(container, firstBodyFragment ?? null);
  }

  private resetState(): void {
    disposePersistentPageSurfaceState(this.persistentSurface);
    this.persistentSurface = null;
    if (this.mount) {
      this.mount.innerHTML = '';
    }
    this.pageStates = [];
    this.currentLayout = null;
    this.persistentDocumentBackground = null;
    this.layoutVersion = 0;
    this.processedLayoutVersion = -1;
    this.paintSnapshotBuilder = null;
    this.lastPaintSnapshot = null;
    this.persistentPageIndices = [];
  }

  public dispose(): void {
    disposePersistentPageSurfaceState(this.persistentSurface);
    if (this.mount) {
      this.mount.innerHTML = '';
    }
    this.pageStates = [];
    this.currentLayout = null;
    this.persistentDocumentBackground = null;
    this.changedBlocks.clear();
    this.sectionPageCounts.clear();
    this.sdtLabelsRendered.clear();
    this.persistentDecorationsDirty = false;
    this.persistentSurface = null;
    this.paintWork = createEmptyPaintWorkSummary();
    this.layoutVersion = 0;
    this.layoutEpoch = 0;
    this.processedLayoutVersion = -1;
    this.currentMapping = null;
    this.paintSnapshotBuilder = null;
    this.lastPaintSnapshot = null;
    this.persistentPageIndices = [];
    this.resolvedLayout = null;
    this.totalPages = 0;
    this.mount = null;
    this.doc = null;
  }

  private getSectionPageCount(page: ResolvedPage): number {
    return this.sectionPageCounts.get(page.sectionIndex ?? 0) ?? this.totalPages ?? 1;
  }

  private fullRender(layout: ResolvedLayout): void {
    if (!this.mount || !this.doc) return;
    this.mount.innerHTML = '';
    this.pageStates = [];

    layout.pages.forEach((page, pageIndex) => {
      const pageState = this.createPageState(page, pageIndex);
      pageState.element.dataset.pageNumber = String(page.number);
      pageState.element.dataset.pageIndex = String(pageIndex);
      this.mount!.appendChild(pageState.element);
      this.pageStates.push(pageState);
    });
  }

  private patchLayout(layout: ResolvedLayout): void {
    if (!this.mount || !this.doc) return;

    const nextStates: PageDomState[] = [];

    layout.pages.forEach((page, index) => {
      const prevState = this.pageStates[index];
      if (!prevState) {
        const newState = this.createPageState(page, index);
        newState.element.dataset.pageNumber = String(page.number);
        newState.element.dataset.pageIndex = String(index);
        this.mount!.insertBefore(newState.element, this.mount!.children[index] ?? null);
        nextStates.push(newState);
        return;
      }
      this.patchPage(prevState, page, index);
      nextStates.push(prevState);
    });

    if (this.pageStates.length > layout.pages.length) {
      for (let i = layout.pages.length; i < this.pageStates.length; i += 1) {
        this.pageStates[i]?.element.remove();
      }
    }

    this.pageStates = nextStates;
  }

  private patchPage(state: PageDomState, page: ResolvedPage, pageIndex: number): PatchPageWork {
    return patchPageContent(this.pageContentContext(), state, page, pageIndex);
  }

  /**
   * Updates data-pm-start/data-pm-end attributes on all elements within a fragment
   * using the transaction's mapping. Skips header/footer content (separate PM coordinate space).
   * Also skips fragments that end before the edit point (their positions don't change).
   */
  /**
   * Refreshes data-pm-start/data-pm-end on a REUSED story fragment from the
   * fresh resolved item. Story positions are local to their story document,
   * so the body transaction mapping cannot update them; instead the uniform
   * shift between the fresh first position and the painted one is applied.
   * Exact for unchanged blocks (positions inside one block shift uniformly).
   */
  private updateStoryPositionAttributes(fragmentEl: HTMLElement, resolvedItem: ResolvedPaintItem | undefined): void {
    if (!resolvedItem || resolvedItem.kind !== 'fragment') return;

    // Fragment-scoped fresh landmark: the pm start of THIS fragment's first
    // line (matches what render-line stamps as the first painted attribute,
    // including continuation fragments that start mid-block).
    let freshStart: number | undefined;
    const block = 'block' in resolvedItem ? resolvedItem.block : undefined;
    const firstLine = 'content' in resolvedItem ? resolvedItem.content?.lines?.[0]?.line : undefined;
    if (block && firstLine) {
      const range = computeLinePmRange(block, firstLine);
      if (typeof range.pmStart === 'number' && Number.isFinite(range.pmStart)) {
        freshStart = range.pmStart;
      }
    }
    if (freshStart == null && block) {
      const runs = (block as { runs?: Array<{ pmStart?: number | null }> }).runs;
      if (Array.isArray(runs)) {
        for (const run of runs) {
          if (typeof run?.pmStart === 'number' && Number.isFinite(run.pmStart)) {
            freshStart = run.pmStart;
            break;
          }
        }
      }
    }
    if (freshStart == null || !Number.isFinite(freshStart)) return;

    const elements = [
      fragmentEl,
      ...Array.from(fragmentEl.querySelectorAll<HTMLElement>('[data-pm-start], [data-pm-end]')),
    ];
    let paintedStart = Infinity;
    for (const el of elements) {
      const start = Number(el.dataset.pmStart);
      if (Number.isFinite(start)) paintedStart = Math.min(paintedStart, start);
    }
    if (!Number.isFinite(paintedStart)) return;

    const delta = freshStart - paintedStart;
    if (delta === 0) return;

    for (const el of elements) {
      const start = Number(el.dataset.pmStart);
      if (el.dataset.pmStart !== undefined && el.dataset.pmStart !== '' && Number.isFinite(start)) {
        el.dataset.pmStart = String(start + delta);
      }
      const end = Number(el.dataset.pmEnd);
      if (el.dataset.pmEnd !== undefined && el.dataset.pmEnd !== '' && Number.isFinite(end)) {
        el.dataset.pmEnd = String(end + delta);
      }
    }
  }

  private updatePositionAttributes(fragmentEl: HTMLElement, mapping: PositionMapping): void {
    // Skip header/footer elements (they use a separate PM coordinate space)
    if (fragmentEl.closest('.superdoc-page-header, .superdoc-page-footer')) {
      return;
    }
    // Notes use local story positions, so body mappings must not rewrite them.
    if (isNonBodyStoryBlockId(fragmentEl.dataset.blockId)) {
      return;
    }

    // Wrap mapping logic in try-catch to prevent corrupted mappings from crashing paint cycle
    try {
      // Quick check: if the fragment's end position doesn't change, nothing inside needs updating.
      // This happens for all content BEFORE the edit point.
      const fragEnd = fragmentEl.dataset.pmEnd;
      if (fragEnd !== undefined && fragEnd !== '') {
        const endNum = Number(fragEnd);
        if (Number.isFinite(endNum) && mapping.map(endNum, -1) === endNum) {
          // Fragment ends before edit point - no position changes needed
          return;
        }
      }

      // Get all elements with position attributes (including the fragment element itself)
      const elements = fragmentEl.querySelectorAll('[data-pm-start], [data-pm-end]');
      const allElements = [fragmentEl, ...Array.from(elements)] as HTMLElement[];

      for (const el of allElements) {
        const oldStart = el.dataset.pmStart;
        const oldEnd = el.dataset.pmEnd;

        if (oldStart !== undefined && oldStart !== '') {
          const num = Number(oldStart);
          if (Number.isFinite(num)) {
            el.dataset.pmStart = String(mapping.map(num));
          }
        }

        if (oldEnd !== undefined && oldEnd !== '') {
          const num = Number(oldEnd);
          if (Number.isFinite(num)) {
            // Use bias -1 for end positions to handle edge cases correctly
            el.dataset.pmEnd = String(mapping.map(num, -1));
          }
        }
      }
    } catch (error) {
      // Log the error but don't crash the paint cycle - corrupted mappings shouldn't break rendering
      console.error('Error updating position attributes with mapping:', error);
    }
  }

  private createPageState(page: ResolvedPage, pageIndex: number): PageDomState {
    if (!this.doc) {
      throw new Error('DomPainter.createPageState requires a document');
    }
    return renderPageContent(this.pageContentContext(), page, pageIndex);
  }

  /**
   * Explicit page-content context (painter plan P3a, §4.2): the class state
   * `renderPage`/`patchPage` consume, rebuilt per call because totalPages,
   * layoutEpoch, and the transaction mapping change between paints. The deep
   * fragment-rendering call graph stays on the class, reached through these
   * bound members.
   */
  private pageContentContext(): PageContentContext {
    if (!this.doc) {
      throw new Error('DomPainter.pageContentContext requires a document');
    }
    return {
      doc: this.doc,
      layoutEpoch: this.layoutEpoch,
      totalPages: this.totalPages,
      currentMapping: this.currentMapping,
      changedBlocks: this.changedBlocks,
      sdtLabelsRendered: this.sdtLabelsRendered,
      getEffectivePageStyles: () => this.getEffectivePageStyles(),
      applySemanticPageOverrides: (el) => this.applySemanticPageOverrides(el),
      getSectionPageCount: (page) => this.getSectionPageCount(page),
      renderFragment: (fragment, context, sdtBoundary, betweenInfo, resolvedItem) =>
        this.renderFragment(fragment, context, sdtBoundary, betweenInfo, resolvedItem),
      renderDecorationsForPage: (pageEl, page, pageIndex) => this.renderDecorationsForPage(pageEl, page, pageIndex),
      renderColumnSeparators: (pageEl, page, pageWidth, pageHeight) =>
        this.renderColumnSeparators(pageEl, page, pageWidth, pageHeight),
      updateStoryPositionAttributes: (fragmentEl, resolvedItem) =>
        this.updateStoryPositionAttributes(fragmentEl, resolvedItem),
      updatePositionAttributes: (fragmentEl, mapping) => this.updatePositionAttributes(fragmentEl, mapping),
      updateFragmentElement: (el, fragment, section, resolvedItem) =>
        this.updateFragmentElement(el, fragment, section, resolvedItem),
    };
  }

  private applySemanticPageOverrides(el: HTMLElement): void {
    if (this.isSemanticFlow) {
      el.style.overflow = 'visible';
      el.style.width = '100%';
      el.style.minWidth = '100%';
    }
  }

  private getEffectivePageStyles(): PageStyles | undefined {
    // Dense/semantic paints own a ResolvedLayout; persistent-page paints run with
    // currentLayout = null and carry the same scalar via their input
    // (persistentDocumentBackground). One mode's source is never consulted in the
    // other mode.
    const documentBackground = this.currentLayout
      ? this.currentLayout.documentBackground
      : this.persistentDocumentBackground;
    const documentBackgroundColor = documentBackground?.color;
    const base = this.options.pageStyles ?? {};
    const baseWithDocumentBackground = documentBackgroundColor
      ? { ...base, background: documentBackgroundColor }
      : base;

    if (this.isSemanticFlow) {
      return {
        ...baseWithDocumentBackground,
        background: baseWithDocumentBackground.background ?? 'var(--sd-layout-page-bg, #fff)',
        boxShadow: 'none',
        border: 'none',
        margin: '0',
      };
    }
    return documentBackgroundColor ? baseWithDocumentBackground : this.options.pageStyles;
  }

  private renderFragment(
    fragment: Fragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
    betweenInfo?: BetweenBorderInfo,
    resolvedItem?: ResolvedPaintItem,
  ): HTMLElement {
    // Note fragments share the body page's geometry but not its editor story.
    // Use the same canonical block-id-derived story that wrapper identity uses
    // so run rendering (including nested table content) validates and resolves
    // coordinates in the note rather than in the body.
    const noteStory = resolveNoteStory(fragment);
    const effectiveContext = noteStory ? { ...context, story: noteStory } : context;
    let el: HTMLElement;
    if (fragment.kind === 'para') {
      el = this.renderParagraphFragment(
        fragment,
        effectiveContext,
        sdtBoundary,
        betweenInfo,
        resolvedItem as ResolvedFragmentItem | undefined,
      );
    } else if (fragment.kind === 'image') {
      el = this.renderImageFragment(fragment, effectiveContext, resolvedItem as ResolvedImageItem | undefined);
    } else if (fragment.kind === 'drawing') {
      el = this.renderDrawingFragment(fragment, effectiveContext, resolvedItem as ResolvedDrawingItem | undefined);
    } else if (fragment.kind === 'table') {
      el = this.renderTableFragment(
        fragment,
        effectiveContext,
        sdtBoundary,
        resolvedItem as ResolvedTableItem | undefined,
      );
    } else {
      throw new Error(`DomPainter: unsupported fragment kind ${(fragment as Fragment).kind}`);
    }
    // Stamp note-band identity here (single dispatch with the page index in
    // scope); a no-op for non-note fragments. Note fragments always carry a
    // page index (set by renderPage); guard satisfies the optional type.
    if (typeof effectiveContext.pageIndex === 'number') {
      applyNoteFragmentDataset(el, fragment, effectiveContext.pageIndex);
    }
    return el;
  }

  /**
   * Renders a paragraph fragment with defensive error handling.
   * Falls back to error placeholder on rendering errors to prevent full paint failure.
   *
   * @param fragment - The paragraph fragment to render
   * @param context - Rendering context with page and column information
   * @param sdtBoundary - Optional SDT boundary overrides for multi-fragment containers
   * @returns HTMLElement containing the rendered fragment or error placeholder
   */
  private renderParagraphFragment(
    fragment: ParaFragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
    betweenInfo?: BetweenBorderInfo,
    resolvedItem?: ResolvedFragmentItem,
  ): HTMLElement {
    return renderParagraphFragmentElement({
      doc: this.doc,
      fragment,
      sdtBoundary,
      betweenInfo,
      resolvedItem,
      applyStyles,
      applyResolvedFragmentFrame: (el, item, paraFragment) =>
        this.applyResolvedFragmentFrame(el, item, paraFragment, context.section, context.story),
      applyFragmentFrame: (el, paraFragment) =>
        this.applyFragmentFrame(el, paraFragment, context.section, context.story),
      applySdtDataset,
      applyContainerSdtDataset,
      // Per-document font resolver so list markers and drop caps paint the same physical family
      // they were measured in (undefined => the renderers fall back to the global default).
      resolvePhysical: this.options.resolvePhysical,
      renderLine: ({
        block,
        line,
        availableWidth,
        lineIndex,
        skipJustify,
        preExpandedRuns,
        resolvedListTextStartPx,
        indentOffsetOverride,
        paragraphMarkLeftOffsetOverride,
      }) =>
        this.renderLine(
          block,
          line,
          context,
          availableWidth,
          lineIndex,
          skipJustify,
          preExpandedRuns,
          resolvedListTextStartPx,
          indentOffsetOverride,
          paragraphMarkLeftOffsetOverride,
        ),
      captureLineSnapshot: (lineEl, options) => {
        this.capturePaintSnapshotLine(lineEl, context, {
          inTableFragment: false,
          inTableParagraph: false,
          wrapperEl: options?.wrapperEl,
          sourceAnchor: options?.sourceAnchor,
        });
      },
      contentControlsChrome: this.contentControlsChrome,
      createErrorPlaceholder: this.createErrorPlaceholder.bind(this),
    });
  }

  /**
   * Creates an error placeholder element for failed fragment renders.
   * Prevents entire paint operation from failing due to single fragment error.
   *
   * @param blockId - The block ID that failed to render
   * @param error - The error that occurred
   * @returns HTMLElement showing the error
   */
  private createErrorPlaceholder(blockId: string, error: unknown): HTMLElement {
    if (!this.doc) {
      // Fallback if doc is not available
      const el = document.createElement('div');
      el.className = 'render-error-placeholder';
      el.style.cssText = 'color: red; padding: 4px; border: 1px solid red; background: #fee;';
      el.textContent = `[Render Error: ${blockId}]`;
      return el;
    }

    const el = this.doc.createElement('div');
    el.className = 'render-error-placeholder';
    el.style.cssText = 'color: red; padding: 4px; border: 1px solid red; background: #fee;';
    el.textContent = `[Render Error: ${blockId}]`;
    if (error instanceof Error) {
      el.title = error.message;
    }
    return el;
  }

  private renderImageFragment(
    fragment: ImageFragment,
    context: FragmentRenderContext,
    resolvedItem?: ResolvedImageItem,
  ): HTMLElement {
    const fragmentEl = renderImageFragmentElement({
      doc: this.doc,
      fragment,
      context,
      resolvedItem,
      applyResolvedFragmentFrame: (el, item, imageFragment, section) =>
        this.applyResolvedFragmentFrame(el, item, imageFragment, section, context.story),
      applyFragmentFrame: (el, imageFragment, section) =>
        this.applyFragmentFrame(el, imageFragment, section, context.story),
      applyFragmentWrapperZIndex: this.applyFragmentWrapperZIndex.bind(this),
      applySdtDataset,
      applyContainerSdtDataset,
      buildImageHyperlinkAnchor: this.buildImageHyperlinkAnchor.bind(this),
      createErrorPlaceholder: this.createErrorPlaceholder.bind(this),
      trackedConfig: resolvedItem?.block
        ? resolveTrackedChangesConfig(resolvedItem.block)
        : { mode: 'review', enabled: true },
    });

    if (this.isVmlTextWatermarkImage(resolvedItem?.block)) {
      fragmentEl.dataset.vmlTextWatermark = 'true';
    }

    return fragmentEl;
  }

  /**
   * Optionally wrap an image element in an anchor for DrawingML hyperlinks (a:hlinkClick).
   *
   * When `hyperlink` is present and its URL passes sanitization, returns an
   * `<a class="superdoc-link">` wrapping `imageEl`. The existing EditorInputManager
   * click-delegation on `a.superdoc-link` handles both viewing-mode navigation and
   * editing-mode event dispatch automatically, with no extra wiring needed here.
   *
   * When `hyperlink` is absent or the URL fails sanitization the original element
   * is returned unchanged.
   *
   * @param imageEl   - The image element (img or span wrapper) to potentially wrap.
   * @param hyperlink - Hyperlink metadata from the ImageBlock/ImageRun, or undefined.
   * @param display   - CSS display value for the anchor: 'block' for fragment images,
   *                    'inline-block' for inline runs.
   */
  private buildImageHyperlinkAnchor(
    imageEl: HTMLElement,
    hyperlink: ImageHyperlink | undefined,
    display: 'block' | 'inline-block',
  ): HTMLElement {
    if (!this.doc) return imageEl;
    return buildSharedImageHyperlinkAnchor(this.doc, imageEl, hyperlink, display);
  }

  /**
   * SD-3521 — stamp canonical textbox interaction metadata (`data-sd-textbox-*`)
   * onto a painted drawing fragment. The host reads these to drive object
   * selection + move/resize gestures from canonical geometry (intrinsic
   * unrotated extent, rotation, flips, per-axis layout scale) plus kernel
   * capability + OCC revision, never from the rotated outer AABB. Repeated
   * header/footer instances share the textbox id but get a distinct
   * instance key (page-scoped). No-ops for non-textbox drawings.
   */
  private applyTextboxInteractionDataset(
    interactionHost: HTMLElement,
    block: DrawingBlock,
    geometry: DrawingGeometry,
    scale: number,
    blockId: string,
    textboxIdFromFragment: string | undefined,
    context: FragmentRenderContext,
  ): void {
    const attrs = block.attrs as Record<string, unknown> | undefined;
    if (typeof attrs?.textboxStaticReason === 'string') {
      interactionHost.dataset.sdTextboxStaticReason = attrs.textboxStaticReason;
    }
    const textboxId =
      typeof textboxIdFromFragment === 'string'
        ? textboxIdFromFragment
        : typeof attrs?.textboxId === 'string'
          ? (attrs.textboxId as string)
          : undefined;
    const binding = attrs?.textboxBinding;
    if (!textboxId || !binding || typeof binding !== 'object') return;
    const b = binding as Record<string, unknown>;
    const ds = interactionHost.dataset;
    ds.sdTextboxId = textboxId;
    if (typeof b.geometryRevision === 'string') ds.sdTextboxRevision = b.geometryRevision;
    if (typeof b.ownerBlockId === 'string') ds.sdTextboxOwnerBlock = b.ownerBlockId;
    ds.sdTextboxCanMove = b.canMove === true ? 'true' : 'false';
    ds.sdTextboxCanResize = b.canResize === true ? 'true' : 'false';
    const unsupportedReason =
      (b.canMove !== true && typeof b.moveReason === 'string' ? (b.moveReason as string) : null) ??
      (b.canResize !== true && typeof b.resizeReason === 'string' ? (b.resizeReason as string) : null);
    if (unsupportedReason) ds.sdTextboxUnsupportedReason = unsupportedReason;
    // Intrinsic (unrotated) geometry — distinct from the outer rotated paint
    // bounds (fragment.width/height). Layout scale is distinct from host zoom.
    ds.sdTextboxWidth = String(geometry.width);
    ds.sdTextboxHeight = String(geometry.height);
    ds.sdTextboxRotation = String(geometry.rotation ?? 0);
    ds.sdTextboxFlipH = geometry.flipH ? 'true' : 'false';
    ds.sdTextboxFlipV = geometry.flipV ? 'true' : 'false';
    ds.sdTextboxScaleX = String(scale);
    ds.sdTextboxScaleY = String(scale);
    const pageKey = context.pageIndex ?? context.pageNumber;
    ds.sdTextboxInstanceKey = `${context.section}:p${pageKey}:${blockId}:${textboxId}`;
  }

  private renderDrawingFragment(
    fragment: DrawingFragment,
    context: FragmentRenderContext,
    resolvedItem?: ResolvedDrawingItem,
  ): HTMLElement {
    try {
      // Pre-extracted block from the resolved item.
      if (resolvedItem?.block?.kind !== 'drawing') {
        throw new Error(`DomPainter: missing resolved drawing block for fragment ${fragment.blockId}`);
      }
      const block = resolvedItem.block as DrawingBlock;
      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }
      const fragmentEl = this.doc.createElement('div');
      fragmentEl.classList.add(CLASS_NAMES.fragment, 'superdoc-drawing-fragment');
      applyStyles(fragmentEl, fragmentStyles);
      if (resolvedItem) {
        this.applyResolvedFragmentFrame(fragmentEl, resolvedItem, fragment, context.section, context.story);
      } else {
        this.applyFragmentFrame(fragmentEl, fragment, context.section, context.story);
        fragmentEl.style.height = `${fragment.height}px`;
        this.applyFragmentWrapperZIndex(fragmentEl, fragment);
      }
      fragmentEl.style.position = 'absolute';
      fragmentEl.style.overflow = this.shapeTextAllowsOverflow(block) ? 'visible' : 'hidden';
      const inlineBackgroundColor = block.attrs?.inlineBackgroundColor;
      if (typeof inlineBackgroundColor === 'string' && inlineBackgroundColor.length > 0) {
        fragmentEl.style.backgroundColor = inlineBackgroundColor;
      }

      // SD-3521: project canonical textbox interaction metadata onto the
      // painted fragment so the host object-interaction controller can bind by
      // stable identity + capability WITHOUT measuring the rotated AABB. Only
      // reads resolved data (block attrs + fragment geometry/scale + context),
      // never paint-time DOM measurement.
      this.applyTextboxInteractionDataset(
        fragmentEl,
        block,
        fragment.geometry,
        fragment.scale ?? 1,
        fragment.blockId,
        fragment.textboxId,
        context,
      );

      const innerWrapper = this.doc.createElement('div');
      innerWrapper.classList.add('superdoc-drawing-inner');
      innerWrapper.style.position = 'absolute';
      innerWrapper.style.left = '50%';
      innerWrapper.style.top = '50%';
      innerWrapper.style.width = `${fragment.geometry.width}px`;
      innerWrapper.style.height = `${fragment.geometry.height}px`;
      innerWrapper.style.transformOrigin = 'center';

      const scale = fragment.scale ?? 1;
      const transforms: string[] = ['translate(-50%, -50%)'];
      transforms.push(`rotate(${fragment.geometry.rotation ?? 0}deg)`);
      transforms.push(`scaleX(${fragment.geometry.flipH ? -1 : 1})`);
      transforms.push(`scaleY(${fragment.geometry.flipV ? -1 : 1})`);
      transforms.push(`scale(${scale})`);
      innerWrapper.style.transform = transforms.join(' ');

      innerWrapper.appendChild(this.renderDrawingContent(block, fragment, context));
      fragmentEl.appendChild(innerWrapper);

      return fragmentEl;
    } catch (error) {
      console.error('[DomPainter] Drawing fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  private renderDrawingContent(
    block: DrawingBlock,
    fragment: DrawingFragment,
    context?: FragmentRenderContext,
  ): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }
    if (block.drawingKind === 'image') {
      return createDrawingImageElement(this.doc, block, this.buildImageHyperlinkAnchor.bind(this));
    }
    if (block.drawingKind === 'vectorShape' || block.drawingKind === 'textboxShape') {
      return this.createVectorShapeElement(block, fragment.geometry, false, 1, 1, context, fragment);
    }
    if (block.drawingKind === 'shapeGroup') {
      return this.createShapeGroupElement(block, context);
    }
    if (block.drawingKind === 'chart') {
      return this.createChartElement(block);
    }
    return this.createDrawingPlaceholder();
  }

  private createVectorShapeElement(
    block: ShapeTextDrawingWithEffects,
    geometry?: DrawingGeometry,
    applyTransforms = false,
    groupScaleX = 1,
    groupScaleY = 1,
    context?: FragmentRenderContext,
    fragment?: DrawingFragment,
  ): HTMLElement {
    const container = this.doc!.createElement('div');
    container.classList.add('superdoc-vector-shape');
    if (block.drawingKind === 'textboxShape') {
      container.classList.add('superdoc-textbox-shape');
    }
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.position = 'relative';
    container.style.overflow = this.shapeTextAllowsOverflow(block) ? 'visible' : 'hidden';

    const metrics = this.getEffectExtentMetrics(block, geometry);
    const isLineShape = block.shapeKind === 'line' || block.shapeKind === 'straightConnector1';
    // ECMA-376 Part 4 §19.1.2.12 models a VML line by its two endpoints.
    // A horizontal line therefore has zero authored height and a vertical line
    // has zero authored width. SVG cannot paint through a zero-sized viewport,
    // so reserve one physical paint pixel on the degenerate axis while keeping
    // the authored endpoints and wrapper position unchanged.
    const offsetX = metrics.offsetX;
    const offsetY = metrics.offsetY;
    const innerWidth = isLineShape ? Math.max(1, metrics.innerWidth) : metrics.innerWidth;
    const innerHeight = isLineShape ? Math.max(1, metrics.innerHeight) : metrics.innerHeight;
    const contentContainer = this.doc!.createElement('div');
    contentContainer.style.position = 'absolute';
    contentContainer.style.left = `${offsetX}px`;
    contentContainer.style.top = `${offsetY}px`;
    contentContainer.style.width = `${innerWidth}px`;
    contentContainer.style.height = `${innerHeight}px`;
    if (applyTransforms && geometry) {
      this.applyVectorShapeTransforms(contentContainer, geometry);
    }

    // Custom geometry takes priority — shapeKind may carry a schema default ('rect')
    // even when the source shape only had a:custGeom and no a:prstGeom.
    const customGeomSvg = block.customGeometry ? this.tryCreateCustomGeometrySvg(block, innerWidth, innerHeight) : null;
    const svgMarkup =
      !customGeomSvg && block.shapeKind ? this.tryCreatePresetSvg(block, innerWidth, innerHeight) : null;
    const resolvedSvgMarkup = customGeomSvg || svgMarkup;
    if (resolvedSvgMarkup) {
      const svgElement = this.parseSafeSvg(resolvedSvgMarkup);
      if (svgElement) {
        this.applyPhysicalStrokeSemantics(svgElement, block);
        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
        svgElement.style.position = 'absolute';
        svgElement.style.left = '0';
        svgElement.style.top = '0';
        svgElement.style.zIndex = '0';
        svgElement.style.pointerEvents = 'none';
        svgElement.style.display = 'block';
        // A centered DrawingML stroke paints outside a zero-height/zero-width
        // connector's authored box. Its wp:effectExtent provides the outer
        // clipping budget, so let the SVG stroke reach that budget instead of
        // clipping it to the coerced 1px content box.
        const hasEffectExtent =
          (block.effectExtent?.left ?? 0) > 0 ||
          (block.effectExtent?.top ?? 0) > 0 ||
          (block.effectExtent?.right ?? 0) > 0 ||
          (block.effectExtent?.bottom ?? 0) > 0;
        if (isLineShape || hasEffectExtent) svgElement.style.overflow = 'visible';

        // Apply gradient fill if present
        if (block.fillColor && typeof block.fillColor === 'object') {
          if ('type' in block.fillColor && block.fillColor.type === 'gradient') {
            applyGradientToSVG(svgElement, block.fillColor as GradientFill);
          } else if ('type' in block.fillColor && block.fillColor.type === 'solidWithAlpha') {
            applyAlphaToSVG(svgElement, block.fillColor as SolidFillWithAlpha);
          }
        }

        if (block.imageFill) {
          this.applyShapeImageFill(svgElement, block);
        }

        this.applyLineEnds(svgElement, block);
        contentContainer.appendChild(svgElement);

        if (block.drawingKind === 'textboxShape' || this.hasShapeTextContent(block.textContent)) {
          const textElement =
            block.drawingKind === 'textboxShape'
              ? this.createTextboxContentElement(block, fragment, innerWidth, innerHeight, context)
              : this.createShapeTextElement(block, innerWidth, innerHeight, groupScaleX, groupScaleY, context);
          contentContainer.appendChild(textElement);
        }

        container.appendChild(contentContainer);
        return container;
      }
    }

    // Fallback rendering when no preset shape SVG is available
    this.applyFallbackShapeStyle(contentContainer, block);

    if (block.drawingKind === 'textboxShape' || this.hasShapeTextContent(block.textContent)) {
      const textElement =
        block.drawingKind === 'textboxShape'
          ? this.createTextboxContentElement(block, fragment, innerWidth, innerHeight, context)
          : this.createShapeTextElement(block, innerWidth, innerHeight, groupScaleX, groupScaleY, context);
      contentContainer.appendChild(textElement);
    }

    container.appendChild(contentContainer);
    return container;
  }

  /**
   * Apply fill and stroke styles to a fallback shape container
   */
  private applyFallbackShapeStyle(container: HTMLElement, block: ShapeTextDrawingWithEffects): void {
    const isTextboxShape = block.drawingKind === 'textboxShape';
    if (block.imageFill?.mode === 'stretch') {
      container.style.backgroundImage = `url("${block.imageFill.src.replace(/"/g, '%22')}")`;
      container.style.backgroundRepeat = 'no-repeat';
      container.style.backgroundSize = '100% 100%';
    } else {
      // Handle fill color
      if (block.fillColor === null || (isTextboxShape && block.fillColor === undefined)) {
        container.style.background = 'none';
      } else if (typeof block.fillColor === 'string') {
        container.style.background = block.fillColor;
      } else if (typeof block.fillColor === 'object' && 'type' in block.fillColor) {
        if (block.fillColor.type === 'solidWithAlpha') {
          const alpha = (block.fillColor as SolidFillWithAlpha).alpha;
          const color = (block.fillColor as SolidFillWithAlpha).color;
          container.style.background = color;
          container.style.opacity = alpha.toString();
        } else if (block.fillColor.type === 'gradient') {
          // For CSS gradients in fallback, we'd need to convert
          // For now, use a placeholder color
          container.style.background = 'rgba(15, 23, 42, 0.1)';
        }
      } else {
        container.style.background = 'rgba(15, 23, 42, 0.1)';
      }
    }

    // Handle stroke color
    if (block.strokeColor === null || (isTextboxShape && block.strokeColor === undefined)) {
      container.style.border = 'none';
    } else if (typeof block.strokeColor === 'string') {
      const strokeWidth = block.strokeWidth ?? 1;
      container.style.border = `${strokeWidth}px solid ${block.strokeColor}`;
    } else {
      container.style.border = '1px solid rgba(15, 23, 42, 0.3)';
    }
  }

  /**
   * Shape stroke widths reach the painter in physical CSS pixels. Preset SVGs
   * use a normalized 100 × 100 viewBox while VML custom geometry often uses a
   * coordsize in the thousands. In both cases allowing the viewBox transform to
   * scale the stroke changes the authored line weight, sometimes by orders of
   * magnitude. Keep geometry scalable and paint the resolved width verbatim.
   */
  private applyPhysicalStrokeSemantics(svgElement: SVGElement, block: ShapeTextDrawingWithEffects): void {
    if (typeof block.strokeColor !== 'string' || !(Number(block.strokeWidth) > 0)) return;
    const dashArray = block.strokeDashArray?.filter((value) => Number.isFinite(value) && value > 0);
    svgElement.querySelectorAll<SVGElement>('[stroke]:not([stroke="none"])').forEach((element) => {
      element.setAttribute('vector-effect', 'non-scaling-stroke');
      if (dashArray?.length) element.setAttribute('stroke-dasharray', dashArray.join(' '));
      if (block.strokeLineJoin) element.setAttribute('stroke-linejoin', block.strokeLineJoin);
      if (block.strokeLineCap) element.setAttribute('stroke-linecap', block.strokeLineCap);
    });
  }

  /** Paint a DrawingML picture fill through the existing SVG geometry. */
  private applyShapeImageFill(svgElement: SVGElement, block: ShapeTextDrawingWithEffects): void {
    const fill = block.imageFill;
    if (!fill) return;

    const rect = fill.sourceRect ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const visibleWidth = 1 - (rect.left + rect.right) / 100000;
    const visibleHeight = 1 - (rect.top + rect.bottom) / 100000;
    if (!(visibleWidth > 0) || !(visibleHeight > 0)) return;

    const defs = this.ensureSvgDefs(svgElement);
    const id = this.sanitizeSvgId(`superdoc-shape-image-fill-${block.id}-${this.shapeImageFillCounter++}`);
    const pattern = this.doc!.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'objectBoundingBox');
    pattern.setAttribute('patternContentUnits', 'objectBoundingBox');

    if (fill.mode === 'stretch') {
      pattern.setAttribute('x', '0');
      pattern.setAttribute('y', '0');
      pattern.setAttribute('width', '1');
      pattern.setAttribute('height', '1');
      this.appendShapeFillImage(pattern, fill.src, 0, 0, 1, 1, rect, visibleWidth, visibleHeight);
    } else {
      const tile = fill.tile ?? {};
      const tileWidth = (tile.scaleX ?? 100000) / 100000;
      const tileHeight = (tile.scaleY ?? 100000) / 100000;
      if (!(tileWidth > 0) || !(tileHeight > 0)) return;

      const alignment = this.resolveShapeTileOrigin(tile.alignment, tileWidth, tileHeight);
      const offsetX = (tile.offsetX ?? 0) / 9525 / Math.max(1, block.geometry.width);
      const offsetY = (tile.offsetY ?? 0) / 9525 / Math.max(1, block.geometry.height);
      const originX = alignment.x + offsetX;
      const originY = alignment.y + offsetY;
      const flipX = tile.flip === 'x' || tile.flip === 'xy';
      const flipY = tile.flip === 'y' || tile.flip === 'xy';
      pattern.setAttribute('x', String(originX));
      pattern.setAttribute('y', String(originY));
      pattern.setAttribute('width', String(tileWidth * (flipX ? 2 : 1)));
      pattern.setAttribute('height', String(tileHeight * (flipY ? 2 : 1)));

      for (let row = 0; row < (flipY ? 2 : 1); row += 1) {
        for (let column = 0; column < (flipX ? 2 : 1); column += 1) {
          this.appendShapeFillImage(
            pattern,
            fill.src,
            column * tileWidth,
            row * tileHeight,
            tileWidth,
            tileHeight,
            rect,
            visibleWidth,
            visibleHeight,
            column === 1,
            row === 1,
          );
        }
      }
    }
    defs.appendChild(pattern);

    svgElement.querySelectorAll<SVGElement>('path, rect, ellipse, circle, polygon').forEach((element) => {
      if (element.closest('defs') || element.getAttribute('fill') === 'none') return;
      element.setAttribute('fill', `url(#${id})`);
    });
  }

  private appendShapeFillImage(
    pattern: SVGPatternElement,
    src: string,
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
    sourceRect: { left: number; top: number; right: number; bottom: number },
    visibleWidth: number,
    visibleHeight: number,
    flipX = false,
    flipY = false,
  ): void {
    const image = this.doc!.createElementNS(SVG_NS, 'image');
    image.setAttribute('href', src);
    image.setAttribute('x', String(tileX - (sourceRect.left / 100000 / visibleWidth) * tileWidth));
    image.setAttribute('y', String(tileY - (sourceRect.top / 100000 / visibleHeight) * tileHeight));
    image.setAttribute('width', String(tileWidth / visibleWidth));
    image.setAttribute('height', String(tileHeight / visibleHeight));
    image.setAttribute('preserveAspectRatio', 'none');
    if (flipX || flipY) {
      const centerX = tileX + tileWidth / 2;
      const centerY = tileY + tileHeight / 2;
      image.setAttribute(
        'transform',
        `translate(${centerX} ${centerY}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1}) translate(${-centerX} ${-centerY})`,
      );
    }
    pattern.appendChild(image);
  }

  private resolveShapeTileOrigin(
    alignment: string | undefined,
    tileWidth: number,
    tileHeight: number,
  ): { x: number; y: number } {
    const horizontal =
      alignment === 't' || alignment === 'ctr' || alignment === 'b'
        ? (1 - tileWidth) / 2
        : alignment === 'tr' || alignment === 'r' || alignment === 'br'
          ? 1 - tileWidth
          : 0;
    const vertical =
      alignment === 'l' || alignment === 'ctr' || alignment === 'r'
        ? (1 - tileHeight) / 2
        : alignment === 'bl' || alignment === 'b' || alignment === 'br'
          ? 1 - tileHeight
          : 0;
    return { x: horizontal, y: vertical };
  }

  private hasShapeTextContent(textContent?: ShapeTextContent): textContent is ShapeTextContent {
    return Array.isArray(textContent?.parts) && textContent.parts.length > 0;
  }

  private createShapeTextElement(
    block: VectorShapeDrawing | TextboxDrawing,
    width: number,
    height: number,
    groupScaleX = 1,
    groupScaleY = 1,
    context?: FragmentRenderContext,
  ): Element {
    const textContent = block.textContent;
    if (!this.hasShapeTextContent(textContent)) {
      return this.doc!.createElement('div');
    }

    if (this.shouldUseWordArtTextRenderer(block)) {
      return this.createWordArtTextElement(
        textContent,
        block.textAlign ?? 'center',
        block.textInsets,
        width,
        height,
        context,
      );
    }

    return this.createFallbackTextElement(
      textContent,
      block.textAlign ?? 'center',
      block.textVerticalAlign,
      block.textFlow,
      block.textLayout,
      block.textInsets,
      groupScaleX,
      groupScaleY,
      context,
    );
  }

  private createTextboxContentElement(
    block: TextboxDrawing,
    fragment: DrawingFragment | undefined,
    width: number,
    height: number,
    context?: FragmentRenderContext,
  ): Element {
    const contentMeasures = fragment?.contentMeasures ?? block.contentMeasures;
    if (!Array.isArray(contentMeasures) || contentMeasures.length === 0) {
      return this.hasShapeTextContent(block.textContent)
        ? this.createShapeTextElement(block, width, height, 1, 1, context)
        : this.doc!.createElement('div');
    }

    const contentRoot = this.doc!.createElement('div');
    contentRoot.style.position = 'absolute';
    contentRoot.style.top = '0';
    contentRoot.style.left = '0';
    contentRoot.style.width = '100%';
    contentRoot.style.height = '100%';
    contentRoot.style.display = 'flex';
    contentRoot.style.flexDirection = 'column';
    contentRoot.style.boxSizing = 'border-box';
    contentRoot.style.overflow = this.shapeTextAllowsOverflow(block) ? 'visible' : 'hidden';
    contentRoot.style.zIndex = '1';
    contentRoot.style.pointerEvents = 'auto';
    this.applyShapeTextFlow(contentRoot, block.textFlow);

    const insets = block.textInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    contentRoot.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;

    const verticalAlign = block.textVerticalAlign ?? 'top';
    contentRoot.style.justifyContent =
      verticalAlign === 'bottom' ? 'flex-end' : verticalAlign === 'center' ? 'center' : 'flex-start';

    const linesHost = this.doc!.createElement('div');
    linesHost.style.display = 'flex';
    linesHost.style.flexDirection = 'column';
    linesHost.style.minWidth = '0';
    linesHost.style.width = '100%';
    if (block.textLayout?.wrap === 'none') linesHost.style.whiteSpace = 'nowrap';

    const renderContext = context ?? this.defaultFragmentRenderContext();
    const availableWidth = Math.max(1, width - insets.left - insets.right);
    const fragmentTextboxId = typeof fragment?.textboxId === 'string' ? fragment.textboxId : undefined;
    const textboxId =
      fragmentTextboxId ?? (typeof block.attrs?.textboxId === 'string' ? block.attrs.textboxId : undefined);

    const tableLineRenderer = this.createTableCellLineRenderer();
    block.contentBlocks.forEach((contentBlock, blockIndex) => {
      const measure = contentMeasures[blockIndex];
      if (contentBlock.kind === 'paragraph' && measure?.kind === 'paragraph') {
        const paragraphTextboxId =
          typeof contentBlock.attrs?.textboxId === 'string' ? contentBlock.attrs.textboxId : textboxId;
        const paragraphContext: FragmentRenderContext = {
          ...renderContext,
          story: {
            kind: 'textbox',
            ...(paragraphTextboxId ? { id: paragraphTextboxId } : {}),
          },
        };
        measure.lines.forEach((line, lineIndex) => {
          const lineEl = this.renderLine(contentBlock, line, paragraphContext, availableWidth, lineIndex);
          if (paragraphTextboxId) {
            applyLayoutIdentityDataset(
              lineEl,
              buildLayoutSourceIdentity({
                blockId: contentBlock.id,
                story: { kind: 'textbox', id: paragraphTextboxId },
                kind: 'para',
                fromLine: lineIndex,
                toLine: lineIndex + 1,
                sourceAnchor: contentBlock.sourceAnchor,
              }),
            );
          }
          applySourceAnchorDataset(lineEl, contentBlock.sourceAnchor);
          linesHost.appendChild(lineEl);
        });
        return;
      }

      if (contentBlock.kind !== 'table' || measure?.kind !== 'table') return;
      const columnWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, availableWidth);
      const fragmentWidth = columnWidths ? availableWidth : measure.totalWidth;
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: contentBlock.id,
        fromRow: 0,
        toRow: contentBlock.rows.length,
        x: 0,
        y: 0,
        width: fragmentWidth,
        height: measure.totalHeight,
        ...(columnWidths ? { columnWidths } : {}),
        sourceAnchor: contentBlock.sourceAnchor,
      };
      const tableContext: FragmentRenderContext = {
        ...renderContext,
        story: { kind: 'textbox', ...(textboxId ? { id: textboxId } : {}) },
      };
      const tableHost = this.doc!.createElement('div');
      tableHost.style.position = 'relative';
      tableHost.style.flex = '0 0 auto';
      tableHost.style.width = '100%';
      tableHost.style.height = `${measure.totalHeight}px`;
      const tableEl = renderTableFragmentElement({
        doc: this.doc!,
        fragment: tableFragment,
        context: tableContext,
        block: contentBlock,
        measure,
        cellSpacingPx: measure.cellSpacingPx ?? getCellSpacingPx(contentBlock.attrs?.cellSpacing),
        effectiveColumnWidths: columnWidths ?? measure.columnWidths,
        chrome: this.contentControlsChrome,
        renderLine: tableLineRenderer,
        captureLineSnapshot: (lineEl, lineContext, options) => {
          this.capturePaintSnapshotLine(lineEl, lineContext, {
            inTableFragment: true,
            inTableParagraph: options?.inTableParagraph ?? false,
            wrapperEl: options?.wrapperEl,
          });
        },
        renderDrawingContent: (drawingBlock, interactionHost, drawingMeasure) =>
          this.renderDrawingContentForTable(drawingBlock, interactionHost, drawingMeasure, tableContext),
        applyFragmentFrame: (element, childFragment) =>
          this.applyFragmentFrame(element, childFragment, tableContext.section, tableContext.story),
        applySdtDataset,
        applyContainerSdtDataset,
        applyStyles,
        resolvePhysical: this.options.resolvePhysical,
      });
      tableHost.appendChild(tableEl);
      linesHost.appendChild(tableHost);
    });

    contentRoot.appendChild(linesHost);
    return contentRoot;
  }

  private shouldUseWordArtTextRenderer(block: VectorShapeDrawing | TextboxDrawing): boolean {
    return block.attrs?.isWordArt === true && this.hasShapeTextContent(block.textContent);
  }

  private createWordArtTextElement(
    textContent: ShapeTextContent,
    textAlign: string,
    textInsets: { top: number; right: number; bottom: number; left: number } | undefined,
    width: number,
    height: number,
    context?: FragmentRenderContext,
  ): SVGSVGElement {
    const svg = this.doc!.createElementNS(SVG_NS, 'svg');
    svg.classList.add('superdoc-wordart-text');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';

    const insets = textInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const availableWidth = Math.max(1, width - insets.left - insets.right);
    const availableHeight = Math.max(1, height - insets.top - insets.bottom);
    const lines = this.buildWordArtLines(textContent, context);
    const lineCount = Math.max(lines.length, 1);
    const lineHeight = availableHeight / lineCount;
    const fontSize = Math.max(1, lineHeight * WORDART_LINE_FILL_RATIO);
    const textAnchor = this.getWordArtTextAnchor(textAlign);
    const textX = this.getWordArtTextX(textAlign, insets.left, availableWidth);

    lines.forEach((parts, lineIndex) => {
      if (parts.length === 0) {
        return;
      }

      const textEl = this.doc!.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('xml:space', 'preserve');
      textEl.setAttribute('x', String(textX));
      textEl.setAttribute('y', String(insets.top + lineHeight * (lineIndex + 0.5)));
      textEl.setAttribute('text-anchor', textAnchor);
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', String(fontSize));
      textEl.setAttribute('textLength', String(availableWidth));
      textEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');

      parts.forEach((part) => {
        const tspan = this.doc!.createElementNS(SVG_NS, 'tspan');
        tspan.setAttribute('xml:space', 'preserve');
        tspan.textContent = part.text;
        this.applyWordArtTextFormatting(tspan, part.formatting);
        textEl.appendChild(tspan);
      });

      svg.appendChild(textEl);
    });

    return svg;
  }

  private buildWordArtLines(
    textContent: ShapeTextContent,
    context?: FragmentRenderContext,
  ): Array<Array<{ text: string; formatting?: ShapeTextContent['parts'][number]['formatting'] }>> {
    const lines: Array<Array<{ text: string; formatting?: ShapeTextContent['parts'][number]['formatting'] }>> = [[]];

    textContent.parts.forEach((part) => {
      if (part.isLineBreak) {
        lines.push([]);
        return;
      }

      const resolvedText = this.resolveShapeTextPartText(part, context);
      if (!resolvedText) {
        return;
      }

      lines[lines.length - 1].push({
        text: resolvedText,
        formatting: part.formatting,
      });
    });

    const nonEmptyLines = lines.filter((line) => line.length > 0);
    return nonEmptyLines.length > 0 ? nonEmptyLines : [[]];
  }

  private resolveShapeTextPartText(part: ShapeTextContent['parts'][number], context?: FragmentRenderContext): string {
    if (part.fieldType === 'PAGE') {
      if (part.pageNumberFormat || context?.pageNumberChapterText) {
        return formatSectionPageNumberText({
          displayNumber: context?.displayPageNumber ?? context?.pageNumber ?? 1,
          pageFormat: part.pageNumberFormat ?? context?.pageNumberFormat ?? 'decimal',
          chapterNumberText: context?.pageNumberChapterText,
          chapterSeparator: context?.pageNumberChapterSeparator,
        });
      }
      return context?.pageNumberText ?? String(context?.pageNumber ?? 1);
    }
    if (part.fieldType === 'NUMPAGES') {
      if (context?.pageCountFieldsExact === false) return provisionalPageCountText(part.text);
      const totalPages = context?.totalPages ?? 1;
      return part.pageNumberFormat ? formatPageNumber(totalPages, part.pageNumberFormat) : String(totalPages);
    }
    if (part.fieldType === 'SECTIONPAGES') {
      if (context?.pageCountFieldsExact === false) return provisionalPageCountText(part.text);
      if (context?.sectionPageCount == null) return part.text ?? '1';
      const sectionPageCount = context.sectionPageCount;
      return part.pageNumberFormat
        ? formatPageNumber(sectionPageCount, part.pageNumberFormat)
        : String(sectionPageCount);
    }
    return part.text;
  }

  private getWordArtTextAnchor(textAlign: string): 'start' | 'middle' | 'end' {
    if (textAlign === 'right' || textAlign === 'r') {
      return 'end';
    }
    if (textAlign === 'center') {
      return 'middle';
    }
    return 'start';
  }

  private getWordArtTextX(textAlign: string, leftInset: number, availableWidth: number): number {
    if (textAlign === 'right' || textAlign === 'r') {
      return leftInset + availableWidth;
    }
    if (textAlign === 'center') {
      return leftInset + availableWidth / 2;
    }
    return leftInset;
  }

  private applyWordArtTextFormatting(
    element: SVGTextElement | SVGTSpanElement,
    formatting?: ShapeTextContent['parts'][number]['formatting'],
  ): void {
    if (!formatting) {
      return;
    }
    if (formatting.bold) {
      element.setAttribute('font-weight', 'bold');
    }
    if (formatting.italic) {
      element.setAttribute('font-style', 'italic');
    }
    if (formatting.fontFamily) {
      element.setAttribute('font-family', formatting.fontFamily);
    }
    if (formatting.color) {
      const validatedColor = validateHexColor(formatting.color);
      if (validatedColor) {
        element.setAttribute('fill', validatedColor);
      }
    }
    if (formatting.letterSpacing != null) {
      element.setAttribute('letter-spacing', String(formatting.letterSpacing));
    }
  }

  /**
   * Create a fallback text element for shapes without SVG
   * @param textContent - Text content with formatting
   * @param textAlign - Horizontal text alignment
   * @param textVerticalAlign - Vertical text alignment (top, center, bottom)
   * @param textInsets - Text insets in pixels (top, right, bottom, left)
   * @param _groupScaleX - Reserved parent-group scale factor
   * @param _groupScaleY - Reserved parent-group scale factor
   */
  private createFallbackTextElement(
    textContent: ShapeTextContent,
    textAlign: string,
    textVerticalAlign?: 'top' | 'center' | 'bottom',
    textFlow?: VectorShapeStyle['textFlow'],
    textLayout?: VectorShapeStyle['textLayout'],
    textInsets?: { top: number; right: number; bottom: number; left: number },
    _groupScaleX = 1,
    _groupScaleY = 1,
    context?: FragmentRenderContext,
  ): HTMLElement {
    const textDiv = this.doc!.createElement('div');
    textDiv.style.position = 'absolute';
    textDiv.style.top = '0';
    textDiv.style.left = '0';
    textDiv.style.width = '100%';
    textDiv.style.height = '100%';
    textDiv.style.display = 'flex';
    textDiv.style.flexDirection = 'column';
    this.applyShapeTextFlow(textDiv, textFlow);

    // Use extracted vertical alignment or default to top per OOXML spec
    // In flex-direction: column, justifyContent controls vertical (main axis)
    const verticalAlign = textVerticalAlign ?? 'top';
    if (verticalAlign === 'top') {
      textDiv.style.justifyContent = 'flex-start';
    } else if (verticalAlign === 'bottom') {
      textDiv.style.justifyContent = 'flex-end';
    } else {
      textDiv.style.justifyContent = 'center';
    }

    // Use extracted text insets or default to 10px all around
    if (textInsets) {
      textDiv.style.padding = `${textInsets.top}px ${textInsets.right}px ${textInsets.bottom}px ${textInsets.left}px`;
    } else {
      textDiv.style.padding = '10px';
    }

    textDiv.style.boxSizing = 'border-box';
    textDiv.style.whiteSpace = textLayout?.wrap === 'none' ? 'nowrap' : 'normal';
    textDiv.style.wordWrap = textLayout?.wrap === 'none' ? 'normal' : 'break-word';
    textDiv.style.overflowWrap = textLayout?.wrap === 'none' ? 'normal' : 'break-word';
    textDiv.style.overflow =
      textLayout?.horizontalOverflow === 'overflow' || textLayout?.verticalOverflow === 'overflow'
        ? 'visible'
        : 'hidden';
    // min-width: 0 allows flex container to shrink below content size for text wrapping
    textDiv.style.minWidth = '0';
    // Match the line-box strut to authored text. A fixed 12px strut can push
    // smaller runs below short Word table cells even when the span itself fits.
    const authoredBaseFontSize = textContent.parts.find((part) => part.formatting?.fontSize != null)?.formatting
      ?.fontSize;
    textDiv.style.fontSize = `${authoredBaseFontSize ?? 12}px`;
    // An absent w:spacing/@w:line means single spacing, whose used height is
    // derived from the active font metrics. A synthetic 1.2 multiplier makes
    // small VML grid labels accumulate several extra pixels and overflow their
    // authored coordinate boxes. Let the resolved physical font establish the
    // default strut; explicit paragraph line spacing still overrides it below.
    textDiv.style.lineHeight = 'normal';

    // Horizontal text alignment uses CSS text-align property
    // Note: justifyContent is already set above for vertical alignment
    if (textAlign === 'center') {
      textDiv.style.textAlign = 'center';
    } else if (textAlign === 'right' || textAlign === 'r') {
      textDiv.style.textAlign = 'right';
    } else {
      textDiv.style.textAlign = 'left';
    }

    // Create paragraphs by splitting on line breaks
    let currentParagraph = this.doc!.createElement('div');
    // Set width to 100% to enable text wrapping within the shape bounds
    currentParagraph.style.width = '100%';
    // min-width: 0 prevents flex item from overflowing (flexbox default is min-width: auto)
    currentParagraph.style.minWidth = '0';
    // Override inherited white-space: pre from parent fragment to allow text wrapping
    currentParagraph.style.whiteSpace = textLayout?.wrap === 'none' ? 'nowrap' : 'normal';

    const applyParagraphProperties = (
      paragraph: HTMLElement,
      properties: ShapeTextContent['parts'][number]['paragraphProperties'],
    ): void => {
      if (!properties) return;
      if (properties.horizontalAlign) {
        paragraph.style.textAlign = properties.horizontalAlign;
      }
      if (properties.spacingBefore != null) {
        paragraph.style.marginTop = `${properties.spacingBefore}px`;
      }
      if (properties.spacingAfter != null) {
        paragraph.style.marginBottom = `${properties.spacingAfter}px`;
      }
      if (properties.line != null) {
        paragraph.style.lineHeight = properties.lineUnit === 'px' ? `${properties.line}px` : String(properties.line);
      }
      if (properties.leftIndent != null) {
        paragraph.style.paddingLeft = `${properties.leftIndent}px`;
      }
      if (properties.rightIndent != null) {
        paragraph.style.paddingRight = `${properties.rightIndent}px`;
      }
      if (properties.firstLineIndent != null) {
        paragraph.style.textIndent = `${properties.firstLineIndent}px`;
      }
      paragraph.style.boxSizing = 'border-box';
    };

    textContent.parts.forEach((part) => {
      if (part.isLineBreak) {
        // Finish current paragraph and start a new one
        textDiv.appendChild(currentParagraph);
        currentParagraph = this.doc!.createElement('div');
        currentParagraph.style.width = '100%';
        currentParagraph.style.minWidth = '0';
        currentParagraph.style.whiteSpace = textLayout?.wrap === 'none' ? 'nowrap' : 'normal';
        // Empty paragraphs create extra spacing (blank line)
        if (part.isEmptyParagraph) {
          currentParagraph.style.minHeight = '1em';
        }
      } else if (part.kind === 'image' && part.src) {
        applyParagraphProperties(currentParagraph, part.paragraphProperties);
        currentParagraph.appendChild(createShapeTextImageElement(this.doc!, part));
      } else {
        applyParagraphProperties(currentParagraph, part.paragraphProperties);
        const span = this.doc!.createElement('span');
        span.textContent = this.resolveShapeTextPartText(part, context);
        if (part.formatting) {
          if (part.formatting.bold) {
            span.style.fontWeight = 'bold';
          }
          if (part.formatting.italic) {
            span.style.fontStyle = 'italic';
          }
          if (part.formatting.fontFamily) {
            const face = {
              weight: part.formatting.bold ? ('700' as const) : ('400' as const),
              style: part.formatting.italic ? ('italic' as const) : ('normal' as const),
            };
            span.style.fontFamily = this.options.resolvePhysical
              ? this.options.resolvePhysical(part.formatting.fontFamily, face)
              : resolvePhysicalFamily(part.formatting.fontFamily);
          }
          if (part.formatting.color) {
            // Validate and normalize color format (handles both with and without # prefix)
            const validatedColor = validateHexColor(part.formatting.color);
            if (validatedColor) {
              span.style.color = validatedColor;
            }
          }
          if (part.formatting.fontSize) {
            span.style.fontSize = `${part.formatting.fontSize}px`;
          }
          if (part.formatting.letterSpacing != null) {
            span.style.letterSpacing = `${part.formatting.letterSpacing}px`;
          }
          applyTextEffects(span, part.formatting.textEffects);
        }
        currentParagraph.appendChild(span);
      }
    });

    // Add the final paragraph
    textDiv.appendChild(currentParagraph);

    return textDiv;
  }

  private shapeTextAllowsOverflow(block: DrawingBlock): boolean {
    if (block.drawingKind === 'shapeGroup') {
      return block.shapes.some((child) => {
        if (child.shapeType !== 'vectorShape') return false;
        const layout = (child.attrs as VectorShapeStyle).textLayout;
        return layout?.horizontalOverflow === 'overflow' || layout?.verticalOverflow === 'overflow';
      });
    }
    if (block.drawingKind !== 'vectorShape' && block.drawingKind !== 'textboxShape') return false;
    return block.textLayout?.horizontalOverflow === 'overflow' || block.textLayout?.verticalOverflow === 'overflow';
  }

  private applyShapeTextFlow(element: HTMLElement, textFlow?: VectorShapeStyle['textFlow']): void {
    if (!textFlow || textFlow === 'horizontal' || textFlow === 'horizontal-ideographic') return;
    element.style.writingMode = 'vertical-rl';
    element.style.textOrientation = textFlow === 'vertical-ideographic' ? 'upright' : 'mixed';
    if (textFlow === 'bottom-to-top') element.style.direction = 'rtl';
  }

  private tryCreatePresetSvg(
    block: ShapeTextDrawingWithEffects,
    widthOverride?: number,
    heightOverride?: number,
  ): string | null {
    try {
      // For preset shapes, we need to pass string colors only
      // Gradients and alpha will be applied after SVG is created
      // null means explicitly "no fill" (from <a:noFill/> or fillRef idx="0"), so use 'none'.
      // For textboxShape, undefined also means no visible fill/stroke; the preset library defaults
      // to black paths, which turns missing VML/DrawingML presentation into a filled rectangle.
      let fillColor: string | undefined;
      const isTextboxShape = block.drawingKind === 'textboxShape';
      if (block.fillColor === null || (isTextboxShape && block.fillColor === undefined)) {
        fillColor = 'none';
      } else if (typeof block.fillColor === 'string') {
        fillColor = block.fillColor;
      }
      const strokeColor =
        block.strokeColor === null || (isTextboxShape && block.strokeColor === undefined)
          ? 'none'
          : typeof block.strokeColor === 'string'
            ? block.strokeColor
            : undefined;

      // Special case: handle line-like shapes directly since getPresetShapeSvg doesn't support them well
      if (block.shapeKind === 'line' || block.shapeKind === 'straightConnector1') {
        const width = widthOverride ?? block.geometry.width;
        const height = heightOverride ?? block.geometry.height;
        const stroke = strokeColor ?? '#000000';
        const isHorizontal = height <= 1 && width > 1;
        const isVertical = width <= 1 && height > 1;
        // Word promotes axis-aligned vector hairlines to one physical screen
        // pixel. Preserve authored weights above that threshold and leave
        // diagonal connectors untouched.
        const strokeWidth = isHorizontal || isVertical ? Math.max(block.strokeWidth ?? 1, 1) : (block.strokeWidth ?? 1);
        const x1 = isVertical ? width / 2 : 0;
        const y1 = isHorizontal ? height / 2 : 0;
        const x2 = isVertical ? width / 2 : width;
        const y2 = isHorizontal ? height / 2 : height;
        const axisPaint = isHorizontal || isVertical ? ' shape-rendering="crispEdges"' : '';

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}"${axisPaint} />
</svg>`;
      }

      return getPresetShapeSvg({
        preset: block.shapeKind ?? '',
        styleOverrides: () => ({
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: block.strokeWidth ?? undefined,
        }),
        width: widthOverride ?? block.geometry.width,
        height: heightOverride ?? block.geometry.height,
      });
    } catch (error) {
      console.warn(`[DomPainter] Unable to render preset shape "${block.shapeKind}":`, error);
      return null;
    }
  }

  /**
   * Creates an SVG string from custom geometry path data (a:custGeom).
   * Each path in the custom geometry has its own coordinate space (w × h) which is
   * mapped to the shape's actual dimensions via the SVG viewBox.
   */
  private tryCreateCustomGeometrySvg(block: ShapeTextDrawingWithEffects, width: number, height: number): string | null {
    const custGeom = block.customGeometry;
    if (!custGeom?.paths?.length) return null;

    let fillColor: string;
    if (block.fillColor === null) {
      fillColor = 'none';
    } else if (typeof block.fillColor === 'string') {
      fillColor = block.fillColor;
    } else if (block.drawingKind === 'textboxShape') {
      fillColor = 'none';
    } else {
      // Gradient / solidWithAlpha: use a placeholder fill so that downstream
      // applyGradientToSVG / applyAlphaToSVG (which skip fill="none") can
      // target these elements and replace the fill.
      fillColor = '#000000';
    }
    const strokeColor =
      block.strokeColor === null || (block.drawingKind === 'textboxShape' && block.strokeColor === undefined)
        ? 'none'
        : typeof block.strokeColor === 'string'
          ? block.strokeColor
          : 'none';
    const strokeWidth = strokeColor === 'none' ? 0 : (block.strokeWidth ?? 0);

    // Build SVG paths. Each path has its own coordinate space (w × h).
    // Use the first path's coordinate space for the viewBox, and scale subsequent paths if needed.
    const firstPath = custGeom.paths[0];
    const viewW = firstPath.w || width;
    const viewH = firstPath.h || height;

    // Degenerate: zero-dimension viewBox is invalid SVG — skip rendering.
    if (viewW === 0 || viewH === 0) return null;

    // When the SVG viewBox maps to a non-uniform aspect ratio (common with group transforms),
    // thin opaque fill borders can become sub-pixel on one axis. Add a hairline stroke only when
    // it can exactly match that fill. Object fills use a temporary black placeholder that is
    // replaced after parsing, so stroking it would fabricate a persistent black outline.
    const needsEdgeStroke = typeof block.fillColor === 'string' && fillColor !== 'none' && strokeColor === 'none';
    const edgeStroke = needsEdgeStroke
      ? ` stroke="${fillColor}" stroke-width="0.5" vector-effect="non-scaling-stroke"`
      : '';

    const pathElements = custGeom.paths
      .map((p) => {
        // If this path has a different coordinate space, apply a transform to map it
        const pathW = p.w || viewW;
        const pathH = p.h || viewH;
        const needsTransform = pathW !== viewW || pathH !== viewH;
        const scaleX = viewW / pathW;
        const scaleY = viewH / pathH;
        const transform = needsTransform ? ` transform="scale(${scaleX}, ${scaleY})"` : '';
        // `strokeWidth` is already resolved to physical CSS pixels by the
        // adapter. Custom VML paths commonly retain a large coordsize-backed
        // viewBox (for example 7200 × 3600). Without a non-scaling stroke the
        // browser scales the physical width through that viewBox a second
        // time, turning a valid Word hairline into a near-transparent 0.03px
        // mark. Geometry scales with the viewBox; line weight does not.
        const strokeAttr =
          strokeColor !== 'none'
            ? ` stroke="${strokeColor}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"`
            : edgeStroke;
        return `<path d="${p.d}" fill="${fillColor}" fill-rule="evenodd"${strokeAttr}${transform} />`;
      })
      .join('\n  ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="none">
  ${pathElements}
</svg>`;
  }

  private parseSafeSvg(markup: string): SVGElement | null {
    const DOMParserCtor = this.doc?.defaultView?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!DOMParserCtor) {
      return null;
    }
    const parser = new DOMParserCtor();
    const parsed = parser.parseFromString(markup, 'image/svg+xml');
    if (!parsed || parsed.getElementsByTagName('parsererror').length > 0) {
      return null;
    }
    // documentElement might be HTMLElement or Element, use type guard via unknown
    const svgElement = parsed.documentElement as unknown as SVGElement | null;
    if (!svgElement) return null;
    this.stripUnsafeSvgContent(svgElement);
    // Safe cast: importNode preserves the element type, and we've verified it's an SVGElement
    const imported = this.doc?.importNode(svgElement, true);
    return imported ? (imported as unknown as SVGElement) : null;
  }

  private stripUnsafeSvgContent(element: Element): void {
    element.querySelectorAll('script').forEach((script) => script.remove());
    const sanitize = (node: Element) => {
      Array.from(node.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith('on')) {
          node.removeAttribute(attr.name);
        }
      });
      Array.from(node.children).forEach((child) => {
        sanitize(child as Element);
      });
    };
    sanitize(element);
  }

  private getEffectExtentMetrics(
    block: ShapeTextDrawingWithEffects,
    geometry?: DrawingGeometry,
  ): {
    offsetX: number;
    offsetY: number;
    innerWidth: number;
    innerHeight: number;
  } {
    const left = block.effectExtent?.left ?? 0;
    const top = block.effectExtent?.top ?? 0;
    const right = block.effectExtent?.right ?? 0;
    const bottom = block.effectExtent?.bottom ?? 0;
    const sourceGeometry = geometry ?? block.geometry;
    const width = sourceGeometry.width ?? 0;
    const height = sourceGeometry.height ?? 0;
    const innerWidth = Math.max(0, width - left - right);
    const innerHeight = Math.max(0, height - top - bottom);
    return { offsetX: left, offsetY: top, innerWidth, innerHeight };
  }

  private applyLineEnds(svgElement: SVGElement, block: ShapeTextDrawingWithEffects): void {
    const lineEnds = block.lineEnds;
    if (!lineEnds) return;
    if (block.strokeColor === null) return;
    const strokeColor = typeof block.strokeColor === 'string' ? block.strokeColor : '#000000';
    const strokeWidth = block.strokeWidth ?? 1;
    if (strokeWidth <= 0) return;

    const target = this.findLineEndTarget(svgElement);
    if (!target) return;

    const defs = this.ensureSvgDefs(svgElement);
    const baseId = this.sanitizeSvgId(`sd-line-${block.id}`);

    if (lineEnds.tail) {
      const id = `${baseId}-tail`;
      this.appendLineEndMarker(
        defs,
        id,
        lineEnds.tail,
        strokeColor,
        strokeWidth,
        true,
        block.effectExtent ?? undefined,
      );
      target.setAttribute('marker-start', `url(#${id})`);
    }

    if (lineEnds.head) {
      const id = `${baseId}-head`;
      this.appendLineEndMarker(
        defs,
        id,
        lineEnds.head,
        strokeColor,
        strokeWidth,
        false,
        block.effectExtent ?? undefined,
      );
      target.setAttribute('marker-end', `url(#${id})`);
    }
  }

  private findLineEndTarget(svgElement: SVGElement): SVGElement | null {
    const line = svgElement.querySelector('line');
    if (line) return line as SVGElement;
    const path = svgElement.querySelector('path');
    if (path) return path as SVGElement;
    const polyline = svgElement.querySelector('polyline');
    return polyline as SVGElement | null;
  }

  private ensureSvgDefs(svgElement: SVGElement): SVGDefsElement {
    const existing = svgElement.querySelector('defs');
    if (existing) return existing as SVGDefsElement;
    const defs = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgElement.insertBefore(defs, svgElement.firstChild);
    return defs;
  }

  private appendLineEndMarker(
    defs: SVGDefsElement,
    id: string,
    lineEnd: LineEnd,
    strokeColor: string,
    _strokeWidth: number,
    isStart: boolean,
    effectExtent?: EffectExtent,
  ): void {
    if (defs.querySelector(`#${id}`)) return;

    const marker = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('orient', 'auto');

    const sizeScale = (value?: string): number => {
      if (value === 'sm') return 0.75;
      if (value === 'lg') return 1.25;
      return 1;
    };
    const effectMax = effectExtent
      ? Math.max(effectExtent.left ?? 0, effectExtent.right ?? 0, effectExtent.top ?? 0, effectExtent.bottom ?? 0)
      : 0;
    const useEffectExtent = Number.isFinite(effectMax) && effectMax > 0;
    const markerWidth = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.length);
    const markerHeight = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.width);
    marker.setAttribute('markerUnits', useEffectExtent ? 'userSpaceOnUse' : 'strokeWidth');
    marker.setAttribute('markerWidth', markerWidth.toString());
    marker.setAttribute('markerHeight', markerHeight.toString());
    marker.setAttribute('refX', isStart ? '0' : '10');
    marker.setAttribute('refY', '5');

    const shape = this.createLineEndShape(lineEnd.type ?? 'triangle', strokeColor, isStart);
    marker.appendChild(shape);
    defs.appendChild(marker);
  }

  private createLineEndShape(type: string, strokeColor: string, isStart: boolean): SVGElement {
    const normalized = type.toLowerCase();
    if (normalized === 'diamond') {
      const path = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0 5 L 5 0 L 10 5 L 5 10 Z');
      path.setAttribute('fill', strokeColor);
      path.setAttribute('stroke', 'none');
      return path;
    }
    if (normalized === 'oval') {
      const circle = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '5');
      circle.setAttribute('cy', '5');
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', strokeColor);
      circle.setAttribute('stroke', 'none');
      return circle;
    }

    const path = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = isStart ? 'M 10 0 L 0 5 L 10 10 Z' : 'M 0 0 L 10 5 L 0 10 Z';
    path.setAttribute('d', d);
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    return path;
  }

  private sanitizeSvgId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private applyVectorShapeTransforms(target: HTMLElement | SVGElement, geometry: DrawingGeometry): void {
    const transforms: string[] = [];
    if (geometry.rotation) {
      transforms.push(`rotate(${geometry.rotation}deg)`);
    }
    if (geometry.flipH) {
      transforms.push('scaleX(-1)');
    }
    if (geometry.flipV) {
      transforms.push('scaleY(-1)');
    }
    if (transforms.length > 0) {
      target.style.transformOrigin = 'center';
      target.style.transform = transforms.join(' ');
    } else {
      target.style.removeProperty('transform');
      target.style.removeProperty('transform-origin');
    }
  }

  private createShapeGroupElement(block: ShapeGroupDrawing, context?: FragmentRenderContext): HTMLElement {
    const groupEl = this.doc!.createElement('div');
    groupEl.classList.add('superdoc-shape-group');
    groupEl.style.position = 'relative';
    groupEl.style.width = '100%';
    groupEl.style.height = '100%';

    const groupTransform = block.groupTransform;
    let contentContainer: HTMLElement = groupEl;

    const visibleWidth = groupTransform?.width ?? block.geometry.width ?? 0;
    const visibleHeight = groupTransform?.height ?? block.geometry.height ?? 0;

    if (groupTransform) {
      const inner = this.doc!.createElement('div');
      inner.style.position = 'absolute';
      inner.style.left = '0';
      inner.style.top = '0';
      // Container at visible dimensions. Children use pre-scaled positions/sizes.
      inner.style.width = `${Math.max(1, visibleWidth)}px`;
      inner.style.height = `${Math.max(1, visibleHeight)}px`;
      groupEl.appendChild(inner);
      contentContainer = inner;
    }

    block.shapes.forEach((child) => {
      const childContent = this.createGroupChildContent(child, 1, 1, context);
      if (!childContent) return;
      const attrs = (child as ShapeGroupChild).attrs ?? {};
      const wrapper = this.doc!.createElement('div');
      wrapper.classList.add('superdoc-shape-group__child');
      wrapper.style.position = 'absolute';
      wrapper.style.boxSizing = 'border-box';

      // Children use pre-scaled (visual-space) positions/sizes from import.
      wrapper.style.left = `${Number(attrs.x ?? 0)}px`;
      wrapper.style.top = `${Number(attrs.y ?? 0)}px`;

      const childW = typeof attrs.width === 'number' ? attrs.width : block.geometry.width;
      const childH = typeof attrs.height === 'number' ? attrs.height : block.geometry.height;
      wrapper.style.width = `${Math.max(1, childW)}px`;
      wrapper.style.height = `${Math.max(1, childH)}px`;
      if ('borders' in attrs && attrs.borders) {
        applyCellBorders(wrapper, attrs.borders as CellBorders);
      }

      wrapper.style.transformOrigin = 'center';
      const transforms: string[] = [];
      if (attrs.rotation) {
        transforms.push(`rotate(${attrs.rotation}deg)`);
      }
      if (attrs.flipH) {
        transforms.push('scaleX(-1)');
      }
      if (attrs.flipV) {
        transforms.push('scaleY(-1)');
      }
      if (transforms.length > 0) {
        wrapper.style.transform = transforms.join(' ');
      }
      childContent.style.width = '100%';
      childContent.style.height = '100%';
      wrapper.appendChild(childContent);
      contentContainer.appendChild(wrapper);
    });

    return groupEl;
  }

  private createGroupChildContent(
    child: ShapeGroupChild,
    groupScaleX: number = 1,
    groupScaleY: number = 1,
    context?: FragmentRenderContext,
  ): HTMLElement | null {
    // Type narrowing with explicit checks to help TypeScript distinguish union members
    if (child.shapeType === 'vectorShape' && 'fillColor' in child.attrs) {
      // After this check, child should be ShapeGroupVectorChild
      const attrs = child.attrs as PositionedDrawingGeometry &
        VectorShapeStyle & {
          kind?: string;
          customGeometry?: CustomGeometryData;
          shapeId?: string;
          shapeName?: string;
          textContent?: ShapeTextContent;
          textAlign?: string;
          lineEnds?: LineEnds;
        };
      const childGeometry = {
        width: attrs.width ?? 0,
        height: attrs.height ?? 0,
        rotation: attrs.rotation ?? 0,
        flipH: attrs.flipH ?? false,
        flipV: attrs.flipV ?? false,
      };
      const vectorChild: ShapeTextDrawingWithEffects = {
        drawingKind: 'vectorShape',
        kind: 'drawing',
        id: `${attrs.shapeId ?? child.shapeType}`,
        geometry: childGeometry,
        padding: undefined,
        margin: undefined,
        anchor: undefined,
        wrap: undefined,
        attrs: child.attrs,
        drawingContentId: undefined,
        drawingContent: undefined,
        shapeKind: attrs.kind,
        customGeometry: attrs.customGeometry,
        fillColor: attrs.fillColor,
        imageFill: attrs.imageFill,
        strokeColor: attrs.strokeColor,
        strokeWidth: attrs.strokeWidth,
        strokeDashArray: attrs.strokeDashArray,
        strokeLineJoin: attrs.strokeLineJoin,
        strokeLineCap: attrs.strokeLineCap,
        lineEnds: attrs.lineEnds,
        textContent: attrs.textContent,
        textAlign: attrs.textAlign,
        textVerticalAlign: attrs.textVerticalAlign,
        textFlow: attrs.textFlow,
        textLayout: attrs.textLayout,
        textInsets: attrs.textInsets,
      };
      // Pass geometry and scale factors to ensure text overlay has correct dimensions
      return this.createVectorShapeElement(vectorChild, childGeometry, false, groupScaleX, groupScaleY, context);
    }
    if (child.shapeType === 'image' && 'src' in child.attrs) {
      return createShapeGroupImageElement(this.doc!, child);
    }
    return this.createDrawingPlaceholder();
  }

  private createDrawingPlaceholder(): HTMLElement {
    const placeholder = this.doc!.createElement('div');
    placeholder.classList.add('superdoc-drawing-placeholder');
    placeholder.style.width = '100%';
    placeholder.style.height = '100%';
    placeholder.style.background =
      'repeating-linear-gradient(45deg, rgba(15,23,42,0.1), rgba(15,23,42,0.1) 6px, rgba(15,23,42,0.2) 6px, rgba(15,23,42,0.2) 12px)';
    placeholder.style.border = '1px dashed rgba(15, 23, 42, 0.3)';
    return placeholder;
  }

  // ============================================================================
  // Chart Rendering
  // ============================================================================

  /**
   * Create an SVG chart element from a ChartDrawing block.
   * Delegates to the chart-renderer module for clean separation.
   */
  private createChartElement(block: ChartDrawing): HTMLElement {
    return renderChartToElement(this.doc!, block.chartData, block.geometry, block.placeholder);
  }

  private resolveTableRenderData(
    fragment: TableFragment,
    resolvedItem?: ResolvedTableItem,
  ): {
    block: TableBlock;
    measure: TableMeasure;
    cellSpacingPx: number;
    effectiveColumnWidths: number[];
  } {
    if (!resolvedItem) {
      throw new Error(`DomPainter: missing resolved table item for fragment ${fragment.blockId}`);
    }
    return {
      block: resolvedItem.block,
      measure: resolvedItem.measure,
      cellSpacingPx: resolvedItem.cellSpacingPx,
      effectiveColumnWidths: resolvedItem.effectiveColumnWidths,
    };
  }

  private createTableCellLineRenderer(): TableRenderDependencies['renderLine'] {
    const expandedRunsCache = new WeakMap<ParagraphBlock, Run[]>();
    return (block, line, context, lineIndex, isLastLine, resolvedListTextStartPx?: number) => {
      const lastRun = block.runs.length > 0 ? block.runs[block.runs.length - 1] : null;
      const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';
      const shouldSkipJustify = isLastLine && !paragraphEndsWithLineBreak;

      let expandedRuns = expandedRunsCache.get(block);
      if (!expandedRuns) {
        expandedRuns = expandRunsForInlineNewlines(block.runs);
        expandedRunsCache.set(block, expandedRuns);
      }

      return this.renderLine(
        block,
        line,
        context,
        undefined,
        lineIndex,
        shouldSkipJustify,
        expandedRuns,
        resolvedListTextStartPx,
      );
    };
  }

  /** Render drawing content nested in any canonical table, including a textbox-owned table. */
  private renderDrawingContentForTable(
    block: DrawingBlock,
    interactionHost: HTMLElement,
    measure: DrawingMeasure,
    context: FragmentRenderContext,
  ): HTMLElement {
    this.applyTextboxInteractionDataset(
      interactionHost,
      block,
      measure.geometry,
      measure.scale ?? 1,
      block.id,
      typeof block.attrs?.textboxId === 'string' ? block.attrs.textboxId : undefined,
      context,
    );
    if (block.drawingKind === 'image') {
      return createDrawingImageElement(this.doc!, block, this.buildImageHyperlinkAnchor.bind(this));
    }
    if (block.drawingKind === 'shapeGroup') return this.createShapeGroupElement(block, context);
    if (block.drawingKind === 'vectorShape' || block.drawingKind === 'textboxShape') {
      const fragment: DrawingFragment = {
        kind: 'drawing',
        blockId: block.id,
        drawingKind: block.drawingKind,
        x: 0,
        y: 0,
        width: measure.width,
        height: measure.height,
        geometry: measure.geometry,
        scale: measure.scale,
        ...(Array.isArray(measure.contentMeasures) ? { contentMeasures: measure.contentMeasures } : {}),
      };
      return this.createVectorShapeElement(block, measure.geometry, false, 1, 1, context, fragment);
    }
    if (block.drawingKind === 'chart') return this.createChartElement(block);
    return this.createDrawingPlaceholder();
  }

  private renderTableFragment(
    fragment: TableFragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
    resolvedItem?: ResolvedTableItem,
  ): HTMLElement {
    try {
      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }

      // Wrap applyFragmentFrame to capture section from context.
      // Table cell inner fragments always stay on the legacy frame path for now.
      const applyFragmentFrameWithSection = (el: HTMLElement, frag: Fragment): void => {
        this.applyFragmentFrame(el, frag, context.section, context.story);
      };

      const renderLineForTableCell = this.createTableCellLineRenderer();
      const renderDrawingContentForTableCell = (
        block: DrawingBlock,
        interactionHost: HTMLElement,
        measure: DrawingMeasure,
      ): HTMLElement => this.renderDrawingContentForTable(block, interactionHost, measure, context);

      const tableRenderData = this.resolveTableRenderData(fragment, resolvedItem);

      const el = renderTableFragmentElement({
        doc: this.doc,
        fragment,
        context,
        block: tableRenderData.block,
        measure: tableRenderData.measure,
        cellSpacingPx: tableRenderData.cellSpacingPx,
        effectiveColumnWidths: tableRenderData.effectiveColumnWidths,
        chrome: this.contentControlsChrome,
        sdtBoundary,
        renderLine: renderLineForTableCell,
        captureLineSnapshot: (lineEl, lineContext, options) => {
          this.capturePaintSnapshotLine(lineEl, lineContext, {
            inTableFragment: true,
            inTableParagraph: options?.inTableParagraph ?? false,
            wrapperEl: options?.wrapperEl,
          });
        },
        renderDrawingContent: renderDrawingContentForTableCell,
        applyFragmentFrame: applyFragmentFrameWithSection,
        applySdtDataset,
        applyContainerSdtDataset,
        applyStyles,
        // Per-document font resolver so in-cell list markers and drop caps paint the same physical
        // family they were measured in (undefined => the renderers fall back to the global default).
        resolvePhysical: this.options.resolvePhysical,
      });

      // Override outer wrapper positioning with resolved data when available.
      // Inner cell fragments still use legacy applyFragmentFrame via deps closure.
      if (resolvedItem) {
        this.applyResolvedFragmentFrame(el, resolvedItem, fragment, context.section, context.story);
        // Re-apply the SDT group width override after the resolved frame, so block-SDT
        // containers can stretch table fragments to match sibling paragraph widths.
        if (sdtBoundary?.widthOverride != null) {
          el.style.width = `${sdtBoundary.widthOverride}px`;
        }
      }

      return el;
    } catch (error) {
      console.error('[DomPainter] Table fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  private renderLine(
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    availableWidthOverride?: number,
    lineIndex?: number,
    skipJustify?: boolean,
    preExpandedRuns?: Run[],
    resolvedListTextStartPx?: number,
    indentOffsetOverride?: number,
    paragraphMarkLeftOffsetOverride?: number,
  ): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }

    return renderRunLine({
      block,
      line,
      context,
      availableWidthOverride,
      lineIndex,
      skipJustify,
      preExpandedRuns,
      resolvedListTextStartPx,
      indentOffsetOverride,
      paragraphMarkLeftOffsetOverride,
      runContext: this.createRunRenderContext(),
    });
  }

  private createRunRenderContext(): RunRenderContext {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }

    const runContext: RunRenderContext = {
      doc: this.doc,
      layoutEpoch: this.layoutEpoch,
      showFormattingMarks: this.showFormattingMarks,
      contentControlsChrome: this.contentControlsChrome,
      // Per-document font resolver (undefined => applyRunStyles falls back to the global default).
      resolvePhysical: this.options.resolvePhysical,
      pendingTooltips: this.pendingTooltips,
      getNextLinkId: () => `superdoc-link-${++this.linkIdCounter}`,
      applySdtDataset,
      buildImageHyperlinkAnchor: this.buildImageHyperlinkAnchor.bind(
        this,
      ) as RunRenderContext['buildImageHyperlinkAnchor'],
      resolveTrackedChangesConfig,
      applyTrackedChangeDecorations,
      resolveRunSdtId,
      createInlineSdtWrapper: (sdt) => createInlineSdtWrapper(sdt, runContext),
      syncInlineSdtWrapperTypography,
      expandSdtWrapperPmRange,
      positionValidation: this.positionValidation,
    };
    return runContext;
  }

  private defaultFragmentRenderContext(): FragmentRenderContext {
    return {
      pageNumber: 1,
      totalPages: 1,
      section: 'body',
    };
  }

  /**
   * Updates an existing fragment element's position and dimensions in place.
   * Used during incremental updates to efficiently reposition fragments without full re-render.
   *
   * @param el - The HTMLElement representing the fragment to update
   * @param fragment - The fragment data containing updated position and dimensions
   * @param section - The document section ('body', 'header', 'footer') containing this fragment.
   *                  Selects the wrapper's section-scoped identity and legacy PM attributes.
   */
  private updateFragmentElement(
    el: HTMLElement,
    fragment: Fragment,
    section?: 'body' | 'header' | 'footer',
    resolvedItem?: ResolvedPaintItem,
  ): void {
    // Narrow to fragment-kind resolved items (excludes ResolvedGroupItem)
    const fragmentItem = resolvedItem?.kind === 'fragment' ? resolvedItem : undefined;
    const story = resolveSectionStory(section);

    if (fragmentItem) {
      this.applyResolvedFragmentFrame(el, fragmentItem, fragment, section, story);
    } else {
      this.applyFragmentFrame(el, fragment, section, story);
      if (fragment.kind === 'image' || fragment.kind === 'drawing') {
        el.style.height = `${fragment.height}px`;
        this.applyFragmentWrapperZIndex(el, fragment);
      }
    }
  }

  /**
   * Applies fragment positioning, dimensions, and metadata to an HTML element.
   *
   * @param el - The HTMLElement to apply fragment properties to
   * @param fragment - The fragment data containing position, dimensions, and PM position information
   * @param section - The document section ('body', 'header', 'footer') containing this fragment.
   *                  Selects the wrapper's section-scoped identity and legacy PM attributes.
   */
  private applyFragmentFrame(
    el: HTMLElement,
    fragment: Fragment,
    section?: 'body' | 'header' | 'footer',
    story?: LayoutStoryLocator,
  ): void {
    el.style.left = `${fragment.x}px`;
    el.style.top = `${fragment.y}px`;
    el.style.width = `${fragment.width}px`;
    el.dataset.blockId = fragment.blockId;
    el.dataset.layoutEpoch = String(this.layoutEpoch);
    applySourceAnchorDataset(el, fragment.sourceAnchor);
    applyLayoutIdentityDataset(
      el,
      resolveOrBuildFragmentIdentity(fragment, resolveNoteStory(fragment) ?? story ?? resolveSectionStory(section)),
    );
    this.applyFragmentFlowClass(el, fragment);

    // Footnote content is read-only: prevent cursor placement and typing (blockId prefix from FootnotesBuilder)
    if (typeof fragment.blockId === 'string' && fragment.blockId.startsWith('footnote-')) {
      el.setAttribute('contenteditable', 'false');
    }

    if (fragment.kind === 'para') {
      applyParagraphFragmentPmAttributes(el, fragment, section);
    }
  }

  /**
   * Applies PM position data attributes from a legacy Fragment.
   * Extracted from applyFragmentFrame for use in the resolved wrapper path.
   * When a resolvedItem is provided, its fields take precedence over fragment fields.
   */
  private applyFragmentPmAttributes(
    el: HTMLElement,
    fragment: Fragment,
    section?: 'body' | 'header' | 'footer',
    resolvedItem?: ResolvedFragmentItem | ResolvedTableItem | ResolvedImageItem | ResolvedDrawingItem,
  ): void {
    // Footnote content is read-only: prevent cursor placement and typing
    if (typeof fragment.blockId === 'string' && fragment.blockId.startsWith('footnote-')) {
      el.setAttribute('contenteditable', 'false');
    }

    if (fragment.kind === 'para') {
      applyParagraphFragmentPmAttributes(el, fragment, section, resolvedItem as ResolvedFragmentItem | undefined);
    }
  }

  /**
   * Applies fragment wrapper positioning from a ResolvedFragmentItem.
   * Uses resolved data for spatial properties and delegates PM attributes to the legacy path.
   */
  private isAnchoredMediaFragment(fragment: Fragment): fragment is ImageFragment | DrawingFragment {
    return (fragment.kind === 'image' || fragment.kind === 'drawing') && fragment.isAnchored === true;
  }

  /**
   * Marks fragments whose paint coordinates are independent from body flow.
   * DOM consumers such as header/footer hit-testing must not infer page margins
   * from floating objects that happen to paint above the first flow block.
   */
  private applyFragmentFlowClass(
    el: HTMLElement,
    fragment: Fragment,
    item?: ResolvedFragmentItem | ResolvedTableItem | ResolvedImageItem | ResolvedDrawingItem,
  ): void {
    const block = item?.block;
    const isFloatingMedia =
      (fragment.kind === 'image' || fragment.kind === 'drawing') &&
      (fragment.isAnchored === true ||
        ((block?.kind === 'image' || block?.kind === 'drawing') && block.anchor?.isAnchored === true));
    const isFloatingTable = fragment.kind === 'table' && block?.kind === 'table' && block.anchor?.isAnchored === true;
    const isPositionedFrame =
      fragment.kind === 'para' && block?.kind === 'paragraph' && isPositionedParagraphFrame(block.attrs?.frame);

    el.classList.toggle(DOM_CLASS_NAMES.FLOATING_FRAGMENT, isFloatingMedia || isFloatingTable || isPositionedFrame);
  }

  private shouldRenderBehindPageContent(
    fragment: ImageFragment | DrawingFragment,
    section: 'header' | 'footer',
    resolvedItem?: ResolvedImageItem | ResolvedDrawingItem,
  ): boolean {
    if (fragment.behindDoc === true || (fragment.behindDoc == null && 'zIndex' in fragment && fragment.zIndex === 0)) {
      return true;
    }

    if (section !== 'header') {
      return false;
    }

    if (fragment.kind === 'drawing') {
      return this.isHeaderWordArtWatermark(resolvedItem?.block);
    }

    return this.isVmlTextWatermarkImage(resolvedItem?.block);
  }

  private isHeaderWordArtWatermark(block: FlowBlock | undefined): block is DrawingBlock {
    if (!block || block.kind !== 'drawing' || block.drawingKind !== 'vectorShape') {
      return false;
    }

    const attrs = (block.attrs as Record<string, unknown> | undefined) ?? {};
    const hasTextContent = Array.isArray(block.textContent?.parts) && block.textContent.parts.length > 0;

    return (
      attrs.isWordArt === true &&
      attrs.isTextBox === true &&
      hasTextContent &&
      block.anchor?.isAnchored === true &&
      block.anchor.hRelativeFrom === 'page' &&
      block.anchor.alignH === 'center' &&
      block.anchor.vRelativeFrom === 'page' &&
      block.anchor.alignV === 'center' &&
      block.wrap?.type === 'None'
    );
  }

  private isVmlTextWatermarkImage(block: FlowBlock | undefined): block is ImageBlock {
    return block?.kind === 'image' && block.attrs?.vmlTextWatermark === true;
  }

  private applyHeaderFooterTextWatermarkPreviewOpacity(el: HTMLElement, isActiveHeaderFooter: boolean): void {
    if (el.dataset.vmlTextWatermark !== 'true') {
      return;
    }

    el.style.opacity = isActiveHeaderFooter
      ? ACTIVE_HEADER_FOOTER_WATERMARK_PREVIEW_OPACITY
      : INACTIVE_HEADER_FOOTER_WATERMARK_PREVIEW_OPACITY;
  }

  /**
   * Only anchored images and drawings participate in explicit wrapper stacking.
   * Inline media intentionally rely on DOM order to preserve legacy paint order.
   */
  private resolveFragmentWrapperZIndex(fragment: Fragment, resolvedZIndex?: number): string {
    if (!this.isAnchoredMediaFragment(fragment)) {
      return '';
    }

    const zIndex = resolvedZIndex;
    return zIndex != null ? String(zIndex) : '';
  }

  private applyFragmentWrapperZIndex(el: HTMLElement, fragment: Fragment, resolvedZIndex?: number): void {
    el.style.zIndex = this.resolveFragmentWrapperZIndex(fragment, resolvedZIndex);
  }

  private applyResolvedFragmentFrame(
    el: HTMLElement,
    item: ResolvedFragmentItem | ResolvedTableItem | ResolvedImageItem | ResolvedDrawingItem,
    fragment: Fragment,
    section?: 'body' | 'header' | 'footer',
    story?: LayoutStoryLocator,
  ): void {
    el.style.left = `${item.x}px`;
    el.style.top = `${item.y}px`;
    el.style.width = `${item.width}px`;
    el.dataset.blockId = item.blockId;
    el.dataset.layoutEpoch = String(this.layoutEpoch);
    applySourceAnchorDataset(el, item.sourceAnchor);
    applyLayoutIdentityDataset(
      el,
      resolveOrBuildFragmentIdentity(
        fragment,
        resolveNoteStory(fragment) ?? story ?? resolveSectionStory(section),
        item.layoutSourceIdentity
          ? { ...item.layoutSourceIdentity, sourceAnchor: item.sourceAnchor ?? item.layoutSourceIdentity.sourceAnchor }
          : undefined,
      ),
    );
    this.applyFragmentFlowClass(el, fragment, item);
    this.applyFragmentWrapperZIndex(el, fragment, item.zIndex);

    if (item.fragmentKind === 'image' || item.fragmentKind === 'drawing' || item.fragmentKind === 'table') {
      el.style.height = `${item.height}px`;
    }

    this.applyFragmentPmAttributes(el, fragment, section, item);
  }

  /**
   * Estimates the height of a fragment when explicit height is not available.
   *
   * This method provides fallback height calculations for footer bottom-alignment
   * from resolved layout data, or using the fragment's height property for
   * tables, images, and drawings.
   *
   * @param fragment - The fragment to estimate height for
   * @returns Estimated height in pixels, or 0 if height cannot be determined
   */
  private estimateFragmentHeight(fragment: Fragment, resolvedItem?: ResolvedPaintItem): number {
    if (resolvedItem && 'height' in resolvedItem && typeof resolvedItem.height === 'number') {
      return resolvedItem.height;
    }
    // Atomic fragment kinds carry their own height on the fragment.
    if (fragment.kind === 'table' || fragment.kind === 'image' || fragment.kind === 'drawing') {
      return fragment.height;
    }
    return 0;
  }
}
