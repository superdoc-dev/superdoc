/**
 * HeaderFooterSessionManager - Manages header/footer editing sessions in PresentationEditor.
 *
 * This class encapsulates all the state and logic for:
 * - Header/footer region tracking and hit testing
 * - Session state machine (body/header/footer modes)
 * - Hidden-host story-session coordination for H/F editing
 * - Decoration providers for rendering
 * - Hover UI for edit affordances
 *
 * @module presentation-editor/header-footer/HeaderFooterSessionManager
 */

import type {
  Layout,
  FlowBlock,
  Measure,
  Page,
  SectionMetadata,
  Fragment,
  ResolvedHeaderFooterLayout,
  ResolvedPaintItem,
  ResolvedLayout,
  ResolvedPage,
  LayoutStoryLocator,
} from '@superdoc/contracts';
import { namedStoryLocator } from '@superdoc/contracts';
import type { PageDecorationPayload, PageDecorationProvider } from '@superdoc/painter-dom';
import { resolveHeaderFooterLayout } from '@superdoc/layout-resolved';
import type { HeaderFooterPartStoryLocator } from '@superdoc/document-api';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

import type { Editor } from '../../Editor.js';
import type {
  HeaderFooterMode,
  HeaderFooterSession,
  HeaderFooterRegion,
  HeaderFooterLayoutContext,
  LayoutRect,
  EditorWithConverter,
} from '../types.js';
import {
  HeaderFooterEditorManager,
  HeaderFooterLayoutAdapter,
  type HeaderFooterDescriptor,
  type HeaderFooterTrackedChangesRenderConfig,
} from '../../header-footer/HeaderFooterRegistry.js';
import { initHeaderFooterRegistry } from '../../header-footer/HeaderFooterRegistryInit.js';
import { layoutPerRIdHeaderFooters } from '../../header-footer/HeaderFooterPerRidLayout.js';
import type { FontResolver, HasFace } from '@superdoc/font-system';
import {
  extractIdentifierFromConverter,
  getHeaderFooterType,
  getHeaderFooterTypeForSection,
  resolveEffectiveHeaderFooterRef,
  getBucketForPageNumber,
  getBucketRepresentative,
  buildSectionAwareHeaderFooterLayoutKey,
  type HeaderFooterIdentifier,
  type HeaderFooterLayoutResult,
  type MultiSectionHeaderFooterIdentifier,
  type HeaderFooterConstraints,
} from '@superdoc/layout-bridge';
import { selectionToRects } from '@superdoc/layout-bridge';
import { deduplicateOverlappingRects } from '../../../dom-observer/DomSelectionGeometry.js';
import { resolveSectionProjections } from '../../../document-api-adapters/helpers/sections-resolver.js';
import { computeCaretLayoutRectGeometry as computeCaretLayoutRectGeometryFromHelper } from '../selection/CaretGeometry.js';
import { ensureExplicitHeaderFooterSlot } from '../../../document-api-adapters/helpers/header-footer-slot-materialization.js';
import { normalizeVariant } from './header-footer-variant.js';
import type { HeaderFooterLayoutSnapshot } from '../../header-footer/types.js';
import { buildHeaderFooterLayoutSnapshot } from './header-footer-snapshot.js';

// =============================================================================
// Types
// =============================================================================

type SurfacePmEntry = {
  pmStart: number;
  pmEnd: number;
  el: HTMLElement;
};

type SnapshotAwarePageDecorationPayload = PageDecorationPayload & {
  matchedVariant?: string | null;
};

function hasSectionRefsForKind(
  identifier: MultiSectionHeaderFooterIdentifier | null | undefined,
  kind: 'header' | 'footer',
): identifier is MultiSectionHeaderFooterIdentifier {
  const refKey = kind === 'header' ? 'headerRefs' : 'footerRefs';
  return Boolean(identifier?.sections?.some((section) => section[refKey] !== undefined));
}

// AIDEV-NOTE: compat-fallback - header/footer session interaction still keys
// off `data-pm-*` (prep-002). DomPainter also stamps the parallel neutral
// dataset (`data-layout-fragment-id` etc.) which a future v2 consumer can
// pick up via `LayoutHitV1Compat.readRenderedElementIdentity`. Do not strip
// the PM reads here without an explicit migration plan.
function buildSurfacePmEntries(surface: HTMLElement): SurfacePmEntry[] {
  const nodes = Array.from(surface.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'));
  const nonLeaf = new WeakSet<HTMLElement>();
  const nodeSet = new WeakSet<HTMLElement>();
  nodes.forEach((node) => nodeSet.add(node));

  for (const node of nodes) {
    let parent = node.parentElement;
    while (parent && parent !== surface) {
      if (nodeSet.has(parent)) {
        nonLeaf.add(parent);
      }
      parent = parent.parentElement;
    }
  }

  const entries: SurfacePmEntry[] = [];
  for (const node of nodes) {
    if (node.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER)) {
      continue;
    }
    if (nonLeaf.has(node)) {
      continue;
    }

    const pmStart = Number(node.dataset.pmStart ?? 'NaN');
    const pmEnd = Number(node.dataset.pmEnd ?? 'NaN');
    if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd) || pmEnd < pmStart) {
      continue;
    }

    entries.push({ pmStart, pmEnd, el: node });
  }

  entries.sort((a, b) => (a.pmStart - b.pmStart !== 0 ? a.pmStart - b.pmStart : a.pmEnd - b.pmEnd));
  return entries;
}

function findSurfaceEntriesInRange(
  entries: SurfacePmEntry[],
  from: number,
  to: number,
  options?: { boundaryInclusive?: boolean },
): SurfacePmEntry[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || entries.length === 0) {
    return [];
  }

  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) {
    return [];
  }

  const boundaryInclusive = options?.boundaryInclusive === true;
  return entries.filter((entry) =>
    boundaryInclusive ? entry.pmStart <= end && entry.pmEnd >= start : entry.pmStart < end && entry.pmEnd > start,
  );
}

function findSurfaceEntryAtPos(entries: SurfacePmEntry[], pos: number): SurfacePmEntry | null {
  if (!Number.isFinite(pos) || entries.length === 0) {
    return null;
  }

  const exactEntry = entries.find((entry) => pos >= entry.pmStart && pos <= entry.pmEnd);
  if (exactEntry) {
    return exactEntry;
  }

  const nextEntry = entries.find((entry) => pos < entry.pmStart);
  if (nextEntry) {
    return nextEntry;
  }

  return entries[entries.length - 1] ?? null;
}

function mapPmPosToTextOffset(pos: number, pmStart: number, pmEnd: number, textLength: number): number {
  if (!Number.isFinite(pos) || !Number.isFinite(pmStart) || !Number.isFinite(pmEnd) || textLength <= 0) {
    return 0;
  }

  const pmRange = pmEnd - pmStart;
  if (!Number.isFinite(pmRange) || pmRange <= 0) {
    return 0;
  }

  if (pmRange === textLength) {
    return Math.min(textLength, Math.max(0, pos - pmStart));
  }

  if (pos <= pmStart) {
    return 0;
  }
  if (pos >= pmEnd) {
    return textLength;
  }

  const midpoint = pmStart + pmRange / 2;
  return pos <= midpoint ? 0 : textLength;
}

function setSurfaceRangeStart(range: Range, entry: SurfacePmEntry, pos: number): boolean {
  const textNode = entry.el.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, mapPmPosToTextOffset(pos, entry.pmStart, entry.pmEnd, (textNode as Text).length));
    return true;
  }

  if (!entry.el.isConnected || !entry.el.parentNode) {
    return false;
  }

  if (pos <= entry.pmStart) {
    range.setStartBefore(entry.el);
    return true;
  }

  range.setStartAfter(entry.el);
  return true;
}

function setSurfaceRangeEnd(range: Range, entry: SurfacePmEntry, pos: number): boolean {
  const textNode = entry.el.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setEnd(textNode, mapPmPosToTextOffset(pos, entry.pmStart, entry.pmEnd, (textNode as Text).length));
    return true;
  }

  if (!entry.el.isConnected || !entry.el.parentNode) {
    return false;
  }

  if (pos <= entry.pmStart) {
    range.setEndBefore(entry.el);
    return true;
  }

  range.setEndAfter(entry.el);
  return true;
}

/**
 * Options for initializing the HeaderFooterSessionManager.
 */
export type HeaderFooterSessionManagerOptions = {
  /** The painter host element containing page renders */
  painterHost: HTMLElement;
  /** The visible scrolling container */
  visibleHost: HTMLElement;
  /** The selection overlay element (parent for hover UI) */
  selectionOverlay: HTMLElement;
  /** The main body editor instance */
  editor: Editor;
  /** Debug mode flag */
  isDebug?: boolean;
  /** Budget for header/footer initialization (ms) */
  initBudgetMs?: number;
  /** Default page size */
  defaultPageSize: { w: number; h: number };
  /** Default margins */
  defaultMargins: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    header?: number;
    footer?: number;
  };
  /**
   * Reads the owning document's current font-mapping signature, folded into header/footer
   * paint-reuse versions so a runtime `fonts.map` change repaints them. Omitted => '' (default).
   */
  getFontSignature?: () => string;
};

/**
 * Layout options that the manager needs access to.
 */
export type HeaderFooterLayoutOptions = {
  pageSize?: { w: number; h: number };
  margins?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    header?: number;
    footer?: number;
  };
  zoom?: number;
};

/**
 * Input for header/footer layout computation.
 */
export type HeaderFooterInput = {
  headerBlocks?: unknown;
  footerBlocks?: unknown;
  headerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  footerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  constraints: HeaderFooterConstraints;
} | null;

/**
 * Dependencies provided by PresentationEditor for various operations.
 */
export type SessionManagerDependencies = {
  /** Get current layout options */
  getLayoutOptions: () => HeaderFooterLayoutOptions;
  /** Get page element by index */
  getPageElement: (pageIndex: number) => HTMLElement | null;
  /** Scroll page into view */
  scrollPageIntoView: (pageIndex: number) => void;
  /** Wait for page to mount (virtualization) */
  waitForPageMount: (pageIndex: number, options: { timeout: number }) => Promise<boolean>;
  /** Convert page-local coordinates to overlay coordinates */
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => { x: number; y: number } | null;
  /** Check if view is locked (viewing mode) */
  isViewLocked: () => boolean;
  /** Get body page height */
  getBodyPageHeight: () => number;
  /** Notify input bridge of target change */
  notifyInputBridgeTargetChanged: () => void;
  /** Schedule re-render */
  scheduleRerender: () => void;
  /** Set pending doc change flag */
  setPendingDocChange: () => void;
  /** Get total page count from body layout */
  getBodyPageCount: () => number;
  /** Get the generic story-session manager when enabled */
  getStorySessionManager?: () => {
    activate: (locator: HeaderFooterPartStoryLocator, options?: Record<string, unknown>) => { editor: Editor };
    exit: () => void;
  } | null;
};

/**
 * Callbacks for events that the manager emits.
 */
export type SessionManagerCallbacks = {
  /** Called when header/footer mode changes */
  onModeChanged?: (session: HeaderFooterSession) => void;
  /** Called with editing context when entering/exiting H/F mode */
  onEditingContext?: (data: {
    kind: HeaderFooterMode;
    editor: Editor;
    headerId?: string | null;
    sectionType?: string | null;
  }) => void;
  /** Called when H/F edit is blocked */
  onEditBlocked?: (reason: string) => void;
  /** Called on errors */
  onError?: (error: { error: unknown; context: string }) => void;
  /** Called for announcements (a11y) */
  onAnnounce?: (message: string) => void;
  /** Called to update awareness session */
  onUpdateAwarenessSession?: (session: HeaderFooterSession) => void;
  /** Called when the active header/footer editor emits an update */
  onSurfaceUpdate?: (data: {
    sourceEditor: Editor;
    surface: 'header' | 'footer';
    headerId?: string | null;
    sectionType?: string | null;
  }) => void;
  /** Called when the active header/footer editor emits a transaction */
  onSurfaceTransaction?: (data: {
    sourceEditor: Editor;
    surface: 'header' | 'footer';
    headerId?: string | null;
    sectionType?: string | null;
    transaction: unknown;
    duration?: number;
  }) => void;
};

type HeaderFooterActivationOptions = {
  initialSelection?: 'end' | 'defer';
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve a `HeaderFooterLayoutResult` into a `ResolvedHeaderFooterLayout`.
 * Paired with the originals so the decoration provider can deliver aligned
 * `items` alongside `fragments`.
 */
function buildHeaderFooterStory(kind: 'header' | 'footer', id: string | null | undefined): LayoutStoryLocator {
  const normalizedId = typeof id === 'string' && id.length > 0 ? id : undefined;
  return normalizedId ? namedStoryLocator(kind, normalizedId) : { kind };
}

function storyIdFromHeaderFooterLayoutKey(key: string): string {
  return key.replace(/::s\d+$/, '');
}

function refForVariant(
  refs: Partial<Record<'default' | 'first' | 'even' | 'odd', string | null | undefined>> | undefined,
  variant: 'default' | 'first' | 'even' | 'odd',
): { refId: string; matchedVariant: 'default' | 'first' | 'even' | 'odd' } | undefined {
  const ref = refs?.[variant];
  if (ref) return { refId: ref, matchedVariant: variant };
  return variant === 'odd' && refs?.default ? { refId: refs.default, matchedVariant: 'default' } : undefined;
}

function resolveResult(
  result: HeaderFooterLayoutResult,
  storyId?: string | null,
  fontSignature = '',
): ResolvedHeaderFooterLayout {
  const story = buildHeaderFooterStory(result.kind, storyId ?? String(result.type));
  return resolveHeaderFooterLayout(result.layout, result.blocks, result.measures, story, fontSignature);
}

function shiftResolvedPaintItemY(item: ResolvedPaintItem, yOffset: number): ResolvedPaintItem {
  if (item.kind === 'group') {
    return {
      ...item,
      y: item.y + yOffset,
      children: item.children.map((child) => shiftResolvedPaintItemY(child, yOffset)),
    };
  }

  return {
    ...item,
    y: item.y + yOffset,
  };
}

function isExplicitBehindDocMediaFragment(fragment: Fragment): boolean {
  return (fragment.kind === 'image' || fragment.kind === 'drawing') && fragment.behindDoc === true;
}

function getDecorationNormalizationMinY(fragments: Fragment[], layoutMinY: number): number {
  if (!Number.isFinite(layoutMinY) || layoutMinY >= 0) {
    return 0;
  }

  let minY = Infinity;
  for (const fragment of fragments) {
    if (isExplicitBehindDocMediaFragment(fragment)) {
      continue;
    }
    if (Number.isFinite(fragment.y)) {
      minY = Math.min(minY, fragment.y);
    }
  }

  return minY < 0 ? minY : 0;
}

function normalizeDecorationFragments(fragments: Fragment[], normalizationMinY: number): Fragment[] {
  if (normalizationMinY >= 0) {
    return fragments;
  }

  const yOffset = -normalizationMinY;
  return fragments.map((fragment) => ({ ...fragment, y: fragment.y + yOffset }));
}

function normalizeDecorationItems(items: ResolvedPaintItem[], normalizationMinY: number): ResolvedPaintItem[] {
  if (normalizationMinY >= 0) {
    return items;
  }

  const yOffset = -normalizationMinY;
  return items.map((item) => shiftResolvedPaintItemY(item, yOffset));
}

// =============================================================================
// HeaderFooterSessionManager
// =============================================================================

/**
 * Manages header/footer editing sessions for PresentationEditor.
 */
export class HeaderFooterSessionManager {
  // Options and dependencies
  #options: HeaderFooterSessionManagerOptions;
  #deps: SessionManagerDependencies | null = null;
  #callbacks: SessionManagerCallbacks = {};

  // Registry and managers
  #headerFooterManager: HeaderFooterEditorManager | null = null;
  #headerFooterAdapter: HeaderFooterLayoutAdapter | null = null;
  #headerFooterIdentifier: HeaderFooterIdentifier | null = null;
  #multiSectionIdentifier: MultiSectionHeaderFooterIdentifier | null = null;
  #managerCleanups: Array<() => void> = [];

  // Layout results
  #headerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  #footerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  #headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();
  #footerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();

  // Resolved layouts (aligned 1:1 with the results above)
  #resolvedHeaderLayouts: ResolvedHeaderFooterLayout[] | null = null;
  #resolvedFooterLayouts: ResolvedHeaderFooterLayout[] | null = null;
  #resolvedHeaderByRId: Map<string, ResolvedHeaderFooterLayout> = new Map();
  #resolvedFooterByRId: Map<string, ResolvedHeaderFooterLayout> = new Map();

  // Decoration providers
  #headerDecorationProvider: PageDecorationProvider | undefined;
  #footerDecorationProvider: PageDecorationProvider | undefined;

  // Region tracking
  #headerRegions: Map<number, HeaderFooterRegion> = new Map();
  #footerRegions: Map<number, HeaderFooterRegion> = new Map();
  #publishedHeaderFooterLayoutSnapshot: HeaderFooterLayoutSnapshot = {
    pageBindings: [],
    storyLayouts: { headers: [], footers: [] },
  };
  #headerFooterLayoutSnapshotPending = false;

  // Session state
  #session: HeaderFooterSession = { mode: 'body' };
  #activeEditor: Editor | null = null;
  #activeEditorEventCleanup: (() => void) | null = null;

  // Hover UI elements (passed in, not owned)
  #hoverOverlay: HTMLElement | null = null;
  #hoverTooltip: HTMLElement | null = null;
  #modeBanner: HTMLElement | null = null;
  #activeBorderLine: HTMLElement | null = null;
  #hoverRegion: HeaderFooterRegion | null = null;

  // Document mode
  #documentMode: 'editing' | 'viewing' | 'suggesting' = 'editing';
  #trackedChangesRenderConfig: HeaderFooterTrackedChangesRenderConfig = {
    mode: 'review',
    enabled: true,
  };

  constructor(options: HeaderFooterSessionManagerOptions) {
    this.#options = options;
  }

  // ===========================================================================
  // Public Getters
  // ===========================================================================

  /** Current session mode */
  get mode(): HeaderFooterMode {
    return this.#session.mode;
  }

  /** Full session state */
  get session(): HeaderFooterSession {
    return this.#session;
  }

  /** Whether currently editing a header/footer */
  get isEditing(): boolean {
    return this.#session.mode !== 'body';
  }

  /** The active header/footer editor (null if in body mode) */
  get activeEditor(): Editor | null {
    return this.#activeEditor;
  }

  /** Set the editor reference (used when editor is created after session manager) */
  setEditor(editor: Editor): void {
    (this.#options as { editor: Editor }).editor = editor;
  }

  /** Header decoration provider */
  get headerDecorationProvider(): PageDecorationProvider | undefined {
    return this.#headerDecorationProvider;
  }

  /** Set header decoration provider */
  set headerDecorationProvider(provider: PageDecorationProvider | undefined) {
    this.#headerDecorationProvider = provider;
  }

  /** Footer decoration provider */
  get footerDecorationProvider(): PageDecorationProvider | undefined {
    return this.#footerDecorationProvider;
  }

  /** Set footer decoration provider */
  set footerDecorationProvider(provider: PageDecorationProvider | undefined) {
    this.#footerDecorationProvider = provider;
  }

  /** Header/footer adapter for layout */
  get adapter(): HeaderFooterLayoutAdapter | null {
    return this.#headerFooterAdapter;
  }

  /** Header/footer manager */
  get manager(): HeaderFooterEditorManager | null {
    return this.#headerFooterManager;
  }

  /**
   * Refresh header/footer structure after relationship-level changes.
   *
   * This is needed when header/footer parts are added or removed outside the
   * interactive header/footer UI, for example through document-api commands.
   * We refresh the descriptor registry and clear all derived FlowBlock caches
   * so the next layout pass sees the new structure immediately.
   *
   * Pass `purgeCachedEditors: true` after a full document file replace: cached
   * sub-editors keyed by relationship id must not outlive the new converter
   * snapshot when ids are reused.
   */
  refreshStructure(options?: { purgeCachedEditors?: boolean }): void {
    this.#headerFooterManager?.refresh(options?.purgeCachedEditors ? { purgeCachedEditors: true } : undefined);
    this.#headerFooterAdapter?.invalidateAll();
  }

  /**
   * Invalidate cached layout blocks for specific header/footer refs.
   *
   * Content-only changes do not require a full registry refresh. Invalidating
   * the affected refs is enough for the next render to pick up the new PM JSON.
   */
  invalidateLayoutForRefs(refIds: readonly string[]): void {
    const adapter = this.#headerFooterAdapter;
    if (!adapter) {
      return;
    }

    refIds.forEach((refId) => {
      adapter.invalidate(refId);
    });
  }

  /** Header layout results */
  get headerLayoutResults(): HeaderFooterLayoutResult[] | null {
    return this.#headerLayoutResults;
  }

  /** Set header layout results */
  set headerLayoutResults(results: HeaderFooterLayoutResult[] | null) {
    this.#headerFooterLayoutSnapshotPending = true;
    this.#headerLayoutResults = results;
    this.#resolvedHeaderLayouts = results ? results.map((result) => this.#resolveResult(result)) : null;
  }

  /** Footer layout results */
  get footerLayoutResults(): HeaderFooterLayoutResult[] | null {
    return this.#footerLayoutResults;
  }

  /** Set footer layout results */
  set footerLayoutResults(results: HeaderFooterLayoutResult[] | null) {
    this.#headerFooterLayoutSnapshotPending = true;
    this.#footerLayoutResults = results;
    this.#resolvedFooterLayouts = results ? results.map((result) => this.#resolveResult(result)) : null;
  }

  /** Header layouts by rId */
  get headerLayoutsByRId(): Map<string, HeaderFooterLayoutResult> {
    return this.#headerLayoutsByRId;
  }

  /** Footer layouts by rId */
  get footerLayoutsByRId(): Map<string, HeaderFooterLayoutResult> {
    return this.#footerLayoutsByRId;
  }

  /** Multi-section identifier */
  get multiSectionIdentifier(): MultiSectionHeaderFooterIdentifier | null {
    return this.#multiSectionIdentifier;
  }

  /** Set multi-section identifier */
  set multiSectionIdentifier(identifier: MultiSectionHeaderFooterIdentifier | null) {
    this.#multiSectionIdentifier = identifier;
  }

  /** Legacy header/footer identifier */
  get headerFooterIdentifier(): HeaderFooterIdentifier | null {
    return this.#headerFooterIdentifier;
  }

  /** Set legacy header/footer identifier */
  set headerFooterIdentifier(identifier: HeaderFooterIdentifier | null) {
    this.#headerFooterIdentifier = identifier;
  }

  /** Header regions map (pageIndex -> region) */
  get headerRegions(): Map<number, HeaderFooterRegion> {
    return this.#headerRegions;
  }

  /** Footer regions map (pageIndex -> region) */
  get footerRegions(): Map<number, HeaderFooterRegion> {
    return this.#footerRegions;
  }

  /**
   * Read-only header/footer story-part layout snapshot.
   *
   * Projects the per-page region facts (`#headerRegions` / `#footerRegions`) and
   * the per-rId raw/resolved layouts (`#headerLayoutsByRId` / `#footerLayoutsByRId`
   * and their resolved counterparts) into a deterministic, JSON-safe shape: page
   * bindings sorted by `pageIndex`, story entries sorted by section-aware
   * `storyKey`, geometry rounded, and explicit `null` instead of `undefined`. No
   * Maps, DOM nodes, or editor/session instances leak out.
   *
   * Pure readback: does not touch the DOM, rerun layout, or mutate session state.
   * Returns a well-formed but empty snapshot when the document has no
   * headers/footers.
   */
  getHeaderFooterLayoutSnapshot(): HeaderFooterLayoutSnapshot {
    if (this.#headerFooterLayoutSnapshotPending) {
      return this.#publishedHeaderFooterLayoutSnapshot;
    }

    return this.#buildLiveHeaderFooterLayoutSnapshot();
  }

  #buildLiveHeaderFooterLayoutSnapshot(): HeaderFooterLayoutSnapshot {
    return buildHeaderFooterLayoutSnapshot({
      headerRegions: this.#headerRegions,
      footerRegions: this.#footerRegions,
      headerLayoutsByRId: this.#headerLayoutsByRId,
      footerLayoutsByRId: this.#footerLayoutsByRId,
      headerLayoutResults: this.#headerLayoutResults,
      footerLayoutResults: this.#footerLayoutResults,
      resolvedHeaderByRId: this.#resolvedHeaderByRId,
      resolvedFooterByRId: this.#resolvedFooterByRId,
      resolvedHeaderLayouts: this.#resolvedHeaderLayouts,
      resolvedFooterLayouts: this.#resolvedFooterLayouts,
    });
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  /**
   * Set dependencies from PresentationEditor.
   * Must be called before using the manager.
   */
  setDependencies(deps: SessionManagerDependencies): void {
    this.#deps = deps;
  }

  /**
   * Set callbacks for event emission.
   */
  setCallbacks(callbacks: SessionManagerCallbacks): void {
    this.#callbacks = callbacks;
  }

  /**
   * Set hover UI elements.
   */
  setHoverElements(elements: {
    hoverOverlay: HTMLElement | null;
    hoverTooltip: HTMLElement | null;
    modeBanner: HTMLElement | null;
  }): void {
    this.#hoverOverlay = elements.hoverOverlay;
    this.#hoverTooltip = elements.hoverTooltip;
    this.#modeBanner = elements.modeBanner;
  }

  /**
   * Update document mode.
   */
  setDocumentMode(mode: 'editing' | 'viewing' | 'suggesting'): void {
    this.#documentMode = mode;
    if (this.#activeEditor) {
      this.#applyChildEditorDocumentMode(this.#activeEditor, mode);
    }
  }

  setTrackedChangesRenderConfig(config: HeaderFooterTrackedChangesRenderConfig): void {
    const nextConfig: HeaderFooterTrackedChangesRenderConfig = {
      mode: config.mode,
      enabled: config.enabled,
    };

    if (
      this.#trackedChangesRenderConfig.mode === nextConfig.mode &&
      this.#trackedChangesRenderConfig.enabled === nextConfig.enabled
    ) {
      return;
    }

    this.#trackedChangesRenderConfig = nextConfig;
    this.#headerFooterAdapter?.setTrackedChangesRenderConfig(nextConfig);
  }

  /**
   * Set layout results from external layout computation.
   */
  setLayoutResults(
    headerResults: HeaderFooterLayoutResult[] | null,
    footerResults: HeaderFooterLayoutResult[] | null,
  ): void {
    this.#headerFooterLayoutSnapshotPending = true;
    this.#headerLayoutResults = headerResults;
    this.#footerLayoutResults = footerResults;
    this.#resolvedHeaderLayouts = headerResults ? headerResults.map((result) => this.#resolveResult(result)) : null;
    this.#resolvedFooterLayouts = footerResults ? footerResults.map((result) => this.#resolveResult(result)) : null;
  }

  /**
   * Initialize the header/footer registry.
   * Called after the editor is ready.
   */
  initialize(): void {
    // Guard: Cannot initialize without an editor
    if (!this.#options.editor) {
      return;
    }

    const optionsMedia = (this.#options as { mediaFiles?: Record<string, unknown> })?.mediaFiles;
    const storageMedia = (
      this.#options.editor as Editor & { storage?: { image?: { media?: Record<string, unknown> } } }
    ).storage?.image?.media;
    const converter = (this.#options.editor as Editor & { converter?: unknown }).converter;
    const mediaFiles = optionsMedia ?? storageMedia;

    const result = initHeaderFooterRegistry({
      editor: this.#options.editor,
      converter,
      mediaFiles,
      isDebug: Boolean(this.#options.isDebug),
      initBudgetMs: this.#options.initBudgetMs ?? 200,
      resetSession: () => {
        this.#managerCleanups = [];
        this.#session = { mode: 'body' };
        this.#teardownActiveEditorEventBridge();
        this.#activeEditor = null;
        this.#deps?.notifyInputBridgeTargetChanged();
      },
      requestRerender: () => {
        this.#deps?.setPendingDocChange();
        this.#deps?.scheduleRerender();
      },
      previousCleanups: this.#managerCleanups,
      previousAdapter: this.#headerFooterAdapter,
      previousManager: this.#headerFooterManager,
    });

    this.#headerFooterIdentifier = result.headerFooterIdentifier;
    this.#headerFooterManager = result.headerFooterManager;
    this.#headerFooterAdapter = result.headerFooterAdapter;
    this.#headerFooterAdapter?.setTrackedChangesRenderConfig(this.#trackedChangesRenderConfig);
    this.#managerCleanups = result.cleanups;
  }

  // ===========================================================================
  // Region Management
  // ===========================================================================

  /**
   * Rebuild header/footer regions from the resolved layout.
   */
  rebuildRegions(resolvedLayout: ResolvedLayout): void {
    this.#headerRegions.clear();
    this.#footerRegions.clear();

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const fallbackPageHeight =
      resolvedLayout.pages[0]?.height ?? layoutOptions.pageSize?.h ?? this.#options.defaultPageSize.h;
    if (fallbackPageHeight <= 0) return;

    // Build section first page numbers map
    const sectionFirstPageNumbers = new Map<number, number>();
    const sectionPageCounts = new Map<number, number>();
    for (const p of resolvedLayout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
      sectionPageCounts.set(idx, (sectionPageCounts.get(idx) ?? 0) + 1);
    }

    // Resolve section projections to map sectionIndex → sectionId
    const sectionIdBySectionIndex = this.#buildSectionIdMap();

    const defaultMargins = this.#options.defaultMargins;

    resolvedLayout.pages.forEach((page, pageIndex) => {
      const margins = page.margins ?? layoutOptions.margins ?? defaultMargins;
      const actualPageHeight = page.height ?? fallbackPageHeight;
      const sectionIndex = page.sectionIndex ?? 0;
      const sectionId = sectionIdBySectionIndex.get(sectionIndex) ?? `section-${sectionIndex}`;
      const sectionPageCount = sectionPageCounts.get(sectionIndex) ?? resolvedLayout.pages.length ?? 1;

      // Header region
      const headerPayload =
        (this.#headerDecorationProvider?.(page.number, margins, page) as SnapshotAwarePageDecorationPayload | null) ??
        null;
      const headerBox = this.#computeDecorationBox('header', margins, actualPageHeight);
      const displayPageNumber = page.numberText ?? String(page.number);
      const displayPageNumberValue = page.displayNumber ?? page.number;
      const displayPageChapterNumberText = page.pageNumberChapterText;
      const displayPageChapterSeparator = page.pageNumberChapterSeparator;

      this.#headerRegions.set(pageIndex, {
        kind: 'header',
        headerFooterRefId: headerPayload?.headerFooterRefId,
        sectionType:
          headerPayload?.sectionType ?? this.#computeExpectedSectionType('header', page, sectionFirstPageNumbers),
        matchedVariant: headerPayload?.matchedVariant ?? undefined,
        sectionId,
        sectionIndex,
        pageIndex,
        pageNumber: page.number,
        displayPageNumber,
        displayPageNumberValue,
        displayPageChapterNumberText,
        displayPageChapterSeparator,
        sectionPageCount,
        localX: headerPayload?.hitRegion?.x ?? headerBox.x,
        localY: headerPayload?.hitRegion?.y ?? headerBox.offset,
        width: headerPayload?.hitRegion?.width ?? headerBox.width,
        height: headerPayload?.hitRegion?.height ?? headerBox.height,
        contentHeight: headerPayload?.contentHeight,
        minY: headerPayload?.minY,
      });

      // Footer region
      const footerPayload =
        (this.#footerDecorationProvider?.(page.number, margins, page) as SnapshotAwarePageDecorationPayload | null) ??
        null;
      const footerBoxMargins = this.#stripFootnoteReserveFromBottomMargin(margins, page);
      const footerBox = this.#computeDecorationBox('footer', footerBoxMargins, actualPageHeight);
      this.#footerRegions.set(pageIndex, {
        kind: 'footer',
        headerFooterRefId: footerPayload?.headerFooterRefId,
        sectionType:
          footerPayload?.sectionType ?? this.#computeExpectedSectionType('footer', page, sectionFirstPageNumbers),
        matchedVariant: footerPayload?.matchedVariant ?? undefined,
        sectionId,
        sectionIndex,
        pageIndex,
        pageNumber: page.number,
        displayPageNumber,
        displayPageNumberValue,
        displayPageChapterNumberText,
        displayPageChapterSeparator,
        sectionPageCount,
        localX: footerPayload?.hitRegion?.x ?? footerBox.x,
        localY: footerPayload?.hitRegion?.y ?? footerBox.offset,
        width: footerPayload?.hitRegion?.width ?? footerBox.width,
        height: footerPayload?.hitRegion?.height ?? footerBox.height,
        contentHeight: footerPayload?.contentHeight,
        minY: footerPayload?.minY,
      });
    });

    // Debug-mode assertion: every region must have concrete section identity
    if (this.#options.isDebug) {
      for (const [, region] of this.#headerRegions) {
        if (!region.sectionId) console.error('[HeaderFooterSessionManager] Header region missing sectionId', region);
      }
      for (const [, region] of this.#footerRegions) {
        if (!region.sectionId) console.error('[HeaderFooterSessionManager] Footer region missing sectionId', region);
      }
    }

    this.#syncActiveBorder();
  }

  /**
   * Build a map from section index → section ID using section projections.
   * Falls back gracefully if projections cannot be resolved.
   */
  #buildSectionIdMap(): Map<number, string> {
    const map = new Map<number, string>();
    try {
      const projections = resolveSectionProjections(this.#options.editor);
      for (let i = 0; i < projections.length; i++) {
        map.set(i, projections[i].sectionId);
      }
    } catch {
      // Section projection may fail on very early layout passes before
      // the document is fully initialized. The fallback `section-${index}`
      // in rebuildRegions handles this.
    }
    return map;
  }

  /**
   * Hit test for header/footer regions.
   * `y` is a global layout Y coordinate. When `knownPageIndex` and `knownPageLocalY`
   * are provided (from normalizeClientPoint), use them directly as the page index
   * and page-local Y. Otherwise, derive pageIndex and page-local Y from the global `y`.
   */
  hitTestRegion(
    x: number,
    y: number,
    layout: Layout | null,
    knownPageIndex?: number,
    knownPageLocalY?: number,
  ): HeaderFooterRegion | null {
    if (!layout) return null;

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const defaultPageHeight = layout.pageSize?.h ?? layoutOptions.pageSize?.h ?? this.#options.defaultPageSize.h;
    const pageGap = layout.pageGap ?? 0;
    if (defaultPageHeight <= 0) return null;

    let pageIndex: number;
    let pageLocalY: number;

    if (knownPageIndex != null && knownPageLocalY != null) {
      // Best path: both page index and page-local Y are known from the DOM
      pageIndex = knownPageIndex;
      pageLocalY = knownPageLocalY;
    } else if (knownPageIndex != null) {
      // Page index known but no page-local Y — derive from global Y using cumulative heights
      pageIndex = knownPageIndex;
      let pageTopY = 0;
      for (let i = 0; i < pageIndex && i < layout.pages.length; i++) {
        pageTopY += (layout.pages[i].size?.h ?? defaultPageHeight) + pageGap;
      }
      pageLocalY = y - pageTopY;
    } else {
      // Fallback: derive both from global Y using uniform page height
      pageIndex = Math.max(0, Math.floor(y / (defaultPageHeight + pageGap)));
      pageLocalY = y - pageIndex * (defaultPageHeight + pageGap);
    }

    const headerRegion = this.#headerRegions.get(pageIndex);
    if (headerRegion && this.#pointInRegion(headerRegion, x, pageLocalY)) {
      return headerRegion;
    }

    const footerRegion = this.#footerRegions.get(pageIndex);
    if (footerRegion && this.#pointInRegion(footerRegion, x, pageLocalY)) {
      return footerRegion;
    }

    return null;
  }

  /**
   * Get region for a specific page.
   */
  getRegionForPage(kind: 'header' | 'footer', pageIndex: number): HeaderFooterRegion | null {
    const regionMap = kind === 'header' ? this.#headerRegions : this.#footerRegions;
    return regionMap.get(pageIndex) ?? null;
  }

  /**
   * Find a region for a page, with fallback to first available region.
   * Used when we need any region of the given kind, even if not for the specific page.
   */
  findRegionForPage(kind: 'header' | 'footer', pageIndex: number): HeaderFooterRegion | null {
    const regionMap = kind === 'header' ? this.#headerRegions : this.#footerRegions;
    if (!regionMap) return null;
    return regionMap.get(pageIndex) ?? regionMap.values().next().value ?? null;
  }

  /**
   * Resolve the header/footer descriptor for a given region.
   *
   * Lookup order:
   * 1. By concrete `headerFooterRefId` — always correct when present.
   * 2. By `sectionType` (variant) — used only when the decoration provider
   *    did not attach a concrete refId. This is safe in single-section
   *    documents. In multi-section documents, regions are now populated
   *    with concrete refIds by the per-rId decoration path, so this
   *    branch is unreachable for multi-section cases once layout completes.
   * 3. No blind fallback — returns null, triggering materialization in
   *    `#enterMode` for the correct section.
   */
  resolveDescriptorForRegion(region: HeaderFooterRegion): HeaderFooterDescriptor | null {
    const manager = this.#headerFooterManager;
    if (!manager) return null;
    if (region.headerFooterRefId) {
      const descriptor = manager.getDescriptorById(region.headerFooterRefId);
      if (descriptor) return descriptor;
    }
    if (region.sectionType) {
      const descriptors = manager.getDescriptors(region.kind);
      const match = descriptors.find((entry) => entry.variant === region.sectionType);
      if (match) return match;
    }
    return null;
  }

  #pointInRegion(region: HeaderFooterRegion, x: number, localY: number): boolean {
    const withinX = x >= region.localX && x <= region.localX + region.width;
    const withinY = localY >= region.localY && localY <= region.localY + region.height;
    return withinX && withinY;
  }

  // ===========================================================================
  // Mode Transitions
  // ===========================================================================

  /**
   * Activate a header/footer region for editing.
   */
  activateRegion(region: HeaderFooterRegion, options?: HeaderFooterActivationOptions): Promise<Editor | null> {
    const permission = this.#validateEditPermission();
    if (!permission.allowed) {
      this.#callbacks.onEditBlocked?.(permission.reason ?? 'restricted');
      return Promise.resolve(null);
    }
    return this.#enterMode(region, options);
  }

  /**
   * Exit header/footer editing mode.
   */
  exitMode(): void {
    if (this.#session.mode === 'body') return;

    // Capture headerFooterRefId before clearing session - needed for cache invalidation
    const editedHeaderId = this.#session.headerFooterRefId;
    if (this.#activeEditor) {
      this.#applyChildEditorDocumentMode(this.#activeEditor, 'viewing');
    }
    this.#teardownActiveEditorEventBridge();
    this.#deps?.getStorySessionManager?.()?.exit();

    this.#activeEditor = null;
    this.#session = { mode: 'body' };

    this.#emitModeChanged();
    this.#emitEditingContext(this.#options.editor);
    this.#deps?.notifyInputBridgeTargetChanged();

    // Invalidate layout cache and trigger re-render
    if (editedHeaderId) {
      this.#headerFooterAdapter?.invalidate(editedHeaderId);
    }
    this.#headerFooterManager?.refresh();
    this.#deps?.setPendingDocChange();
    this.#deps?.scheduleRerender();

    this.#options.editor?.view?.focus();
  }

  /**
   * Focus header/footer via keyboard shortcut.
   */
  focusShortcut(kind: 'header' | 'footer'): void {
    const region = this.getRegionForPage(kind, 0);
    if (!region) {
      this.#callbacks.onEditBlocked?.('missingRegion');
      return;
    }
    this.activateRegion(region);
  }

  #activateStorySessionForRegion(region: HeaderFooterRegion, descriptor: HeaderFooterDescriptor): Editor | null {
    const storySessionManager = this.#deps?.getStorySessionManager?.() ?? null;
    if (!storySessionManager) {
      return null;
    }

    const locator: HeaderFooterPartStoryLocator = {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: descriptor.id,
    };

    const bodyPageCount = this.#deps?.getBodyPageCount() ?? 1;
    const session = storySessionManager.activate(locator, {
      // Presentation-mode header/footer sessions now reuse the manager-backed
      // per-refId editor, which already exports on update. Commit once on exit
      // to avoid double-syncing every keystroke while still flushing the final
      // state if the session closes mid-batch.
      commitPolicy: 'onExit',
      preferHiddenHost: true,
      hostWidthPx: Math.max(1, region.width),
      editorContext: {
        availableWidth: Math.max(1, region.width),
        availableHeight: Math.max(1, region.height),
        currentPageNumber: Math.max(1, region.pageNumber ?? 1),
        currentPageNumberText: region.displayPageNumber,
        currentPageDisplayNumber: Math.max(1, region.displayPageNumberValue ?? region.pageNumber ?? 1),
        currentPageChapterNumberText: region.displayPageChapterNumberText,
        currentPageChapterSeparator: region.displayPageChapterSeparator,
        totalPageCount: Math.max(1, bodyPageCount),
        sectionPageCount: Math.max(1, region.sectionPageCount ?? bodyPageCount),
        surfaceKind: region.kind,
      },
    });

    return session?.editor ?? null;
  }

  async #enterMode(region: HeaderFooterRegion, options?: HeaderFooterActivationOptions): Promise<Editor | null> {
    try {
      if (!this.#headerFooterManager) {
        this.clearHover();
        return null;
      }

      // Clean up previous session if switching between pages while in editing mode
      if (this.#session.mode !== 'body') {
        if (this.#activeEditor) {
          this.#applyChildEditorDocumentMode(this.#activeEditor, 'viewing');
        }
        this.#teardownActiveEditorEventBridge();
        this.#deps?.getStorySessionManager?.()?.exit();
        this.#activeEditor = null;
        this.#session = { mode: 'body' };
      }

      let descriptor = this.#resolveDescriptorForRegion(region);

      // If no descriptor found and region has section identity, materialize
      // the slot through the real parts system (not converter-only defaults).
      if (!descriptor && region.sectionId) {
        const materializationResult = ensureExplicitHeaderFooterSlot(this.#options.editor, {
          sectionId: region.sectionId,
          kind: region.kind,
          variant: normalizeVariant(region.sectionType ?? 'default'),
          addToHistory: false,
        });
        if (materializationResult) {
          // Refresh registry so the new refId is discoverable
          this.#headerFooterManager.refresh();
          // Look up descriptor by the returned refId directly — no dependency
          // on rebuildRegions or pagination timing.
          descriptor = this.#headerFooterManager.getDescriptorById(materializationResult.refId) ?? null;
        }
      }

      if (!descriptor) {
        console.warn(
          '[HeaderFooterSessionManager] No descriptor found for region after materialization attempt:',
          region,
        );
        this.clearHover();
        return null;
      }
      if (!descriptor.id) {
        console.warn('[HeaderFooterSessionManager] Descriptor missing id:', descriptor);
        this.clearHover();
        return null;
      }

      // Virtualized pages may not be mounted - scroll into view if needed
      let pageElement = this.#deps?.getPageElement(region.pageIndex) ?? null;
      if (!pageElement) {
        try {
          this.#deps?.scrollPageIntoView(region.pageIndex);
          const mounted = await this.#deps?.waitForPageMount(region.pageIndex, { timeout: 2000 });
          if (!mounted) {
            console.error('[HeaderFooterSessionManager] Failed to mount page for header/footer editing');
            this.clearHover();
            this.#callbacks.onError?.({
              error: new Error('Failed to mount page for editing'),
              context: 'enterMode',
            });
            return null;
          }
          pageElement = this.#deps?.getPageElement(region.pageIndex) ?? null;
        } catch (scrollError) {
          console.error('[HeaderFooterSessionManager] Error mounting page:', scrollError);
          this.clearHover();
          this.#callbacks.onError?.({
            error: scrollError,
            context: 'enterMode.pageMount',
          });
          return null;
        }
      }

      if (!pageElement) {
        console.error('[HeaderFooterSessionManager] Page element not found after mount attempt');
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error('Page element not found after mount'),
          context: 'enterMode',
        });
        return null;
      }

      let editor;
      const storySessionManager = this.#deps?.getStorySessionManager?.() ?? null;
      if (!storySessionManager) {
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error('Story session manager unavailable'),
          context: 'enterMode.storySessionUnavailable',
        });
        return null;
      }

      try {
        editor = this.#activateStorySessionForRegion(region, descriptor);
      } catch (editorError) {
        console.error('[HeaderFooterSessionManager] Error creating story session:', editorError);
        this.clearHover();
        this.#callbacks.onError?.({
          error: editorError,
          context: 'enterMode.storySession',
        });
        return null;
      }

      if (!editor) {
        console.warn('[HeaderFooterSessionManager] Failed to ensure editor for descriptor:', descriptor);
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error('Failed to create editor instance'),
          context: 'enterMode.ensureEditor',
        });
        return null;
      }

      const shouldRestoreInitialSelection = options?.initialSelection !== 'defer';

      try {
        this.#applyChildEditorDocumentMode(editor, this.#documentMode);

        if (shouldRestoreInitialSelection) {
          this.#applyDefaultSelectionAtStoryEnd(editor, 'Could not set cursor to end');
        }
      } catch (editableError) {
        console.error('[HeaderFooterSessionManager] Error setting editor editable:', editableError);
        this.clearHover();
        this.#callbacks.onError?.({
          error: editableError,
          context: 'enterMode.setEditable',
        });
        return null;
      }

      this.#activeEditor = editor;
      this.#setupActiveEditorEventBridge(editor);
      this.#session = {
        mode: region.kind,
        kind: region.kind,
        headerFooterRefId: descriptor.id,
        sectionType: descriptor.variant ?? region.sectionType ?? null,
        pageIndex: region.pageIndex,
        pageNumber: region.pageNumber,
      };

      this.clearHover();

      try {
        editor.view?.focus();
      } catch (focusError) {
        console.warn('[HeaderFooterSessionManager] Could not focus editor:', focusError);
      }

      if (shouldRestoreInitialSelection) {
        // WebKit can keep a stale DOM selection when the hidden story editor
        // receives focus. Re-applying the PM selection after focus keeps the
        // first keyboard event aligned with the intended caret position.
        this.#applyDefaultSelectionAtStoryEnd(editor, 'Could not restore cursor after focus');
        try {
          editor.view?.focus();
        } catch (focusError) {
          console.warn('[HeaderFooterSessionManager] Could not refocus editor after restoring selection:', focusError);
        }
        this.#scheduleSelectionRestoreAfterFocus(editor);
      }

      this.#emitModeChanged();
      this.#emitEditingContext(editor);
      this.#deps?.notifyInputBridgeTargetChanged();
      this.#deps?.setPendingDocChange();
      this.#deps?.scheduleRerender();
      return editor;
    } catch (error) {
      console.error('[HeaderFooterSessionManager] Unexpected error in enterMode:', error);

      // Attempt cleanup
      try {
        this.#deps?.getStorySessionManager?.()?.exit();
        this.clearHover();
        this.#teardownActiveEditorEventBridge();
        this.#activeEditor = null;
        this.#session = { mode: 'body' };
      } catch (cleanupError) {
        console.error('[HeaderFooterSessionManager] Error during cleanup:', cleanupError);
      }

      this.#callbacks.onError?.({
        error,
        context: 'enterMode',
      });
      return null;
    }
  }

  #applyChildEditorDocumentMode(editor: Editor, mode: 'editing' | 'viewing' | 'suggesting'): void {
    const pm = editor.view?.dom ?? null;

    if (mode === 'viewing') {
      editor.commands?.enableTrackChangesShowOriginal?.();
      editor.setOptions?.({ documentMode: 'viewing' });
      editor.setEditable?.(false);
    } else if (mode === 'suggesting') {
      editor.commands?.disableTrackChangesShowOriginal?.();
      editor.commands?.enableTrackChanges?.();
      editor.setOptions?.({ documentMode: 'suggesting' });
      editor.setEditable?.(true);
    } else {
      editor.commands?.disableTrackChangesShowOriginal?.();
      editor.commands?.disableTrackChanges?.();
      editor.setOptions?.({ documentMode: 'editing' });
      editor.setEditable?.(true);
    }

    if (pm instanceof HTMLElement) {
      pm.setAttribute('aria-readonly', mode === 'viewing' ? 'true' : 'false');
      pm.setAttribute('documentmode', mode);
      pm.classList.toggle('view-mode', mode === 'viewing');
    }
  }

  #getDefaultSelectionAtStoryEnd(editor: Editor): { from: number; to: number } | null {
    const doc = editor.state?.doc;
    if (!doc) return null;

    const endPos = doc.content.size - 1;
    const pos = Math.max(1, endPos);
    return { from: pos, to: pos };
  }

  #applyEditorTextSelection(editor: Editor, selection: { from: number; to: number }, warningMessage: string): void {
    try {
      editor.commands?.setTextSelection?.(selection);
    } catch (error) {
      console.warn(`[HeaderFooterSessionManager] ${warningMessage}:`, error);
    }
  }

  #applyDefaultSelectionAtStoryEnd(editor: Editor, warningMessage: string): void {
    const selection = this.#getDefaultSelectionAtStoryEnd(editor);
    if (!selection) return;
    this.#applyEditorTextSelection(editor, selection, warningMessage);
  }

  #scheduleSelectionRestoreAfterFocus(editor: Editor): void {
    const win = editor.view?.dom?.ownerDocument?.defaultView;
    if (!win) return;

    win.requestAnimationFrame(() => {
      if (this.#activeEditor !== editor || this.#session.mode === 'body') {
        return;
      }

      this.#applyDefaultSelectionAtStoryEnd(editor, 'Could not restore cursor on the next frame');
      try {
        editor.view?.focus();
      } catch (focusError) {
        console.warn('[HeaderFooterSessionManager] Could not refocus editor on the next frame:', focusError);
      }
    });
  }

  #validateEditPermission(): { allowed: boolean; reason?: string } {
    if (this.#deps?.isViewLocked()) {
      return { allowed: false, reason: 'documentMode' };
    }
    if (!this.#options.editor?.isEditable) {
      return { allowed: false, reason: 'readOnly' };
    }
    return { allowed: true };
  }

  #resolveDescriptorForRegion(region: HeaderFooterRegion): HeaderFooterDescriptor | null {
    if (!this.#headerFooterManager) return null;
    if (region.headerFooterRefId) {
      const descriptor = this.#headerFooterManager.getDescriptorById(region.headerFooterRefId);
      if (descriptor) return descriptor;
    }
    if (region.sectionType) {
      const descriptors = this.#headerFooterManager.getDescriptors(region.kind);
      const match = descriptors.find((entry) => entry.variant === region.sectionType);
      if (match) return match;
    }
    // Return null instead of falling back to the first descriptor — a blind
    // fallback is not section-aware and can open the wrong header/footer in
    // multi-section documents. #enterMode handles null by materializing the
    // correct section-specific slot via ensureExplicitHeaderFooterSlot.
    return null;
  }

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  #emitModeChanged(): void {
    this.#callbacks.onModeChanged?.(this.#session);
    this.#callbacks.onUpdateAwarenessSession?.(this.#session);
    this.#updateModeBanner();
    this.#syncActiveBorder();
  }

  #isActiveDecoration(kind: 'header' | 'footer', headerFooterRefId: string | undefined, pageNumber: number): boolean {
    if (this.#session.mode !== kind) {
      return false;
    }

    if (headerFooterRefId && this.#session.headerFooterRefId) {
      return headerFooterRefId === this.#session.headerFooterRefId;
    }

    return this.#session.pageNumber === pageNumber;
  }

  #emitEditingContext(editor: Editor): void {
    this.#callbacks.onEditingContext?.({
      kind: this.#session.mode,
      editor,
      headerId: this.#session.headerFooterRefId,
      sectionType: this.#session.sectionType,
    });

    const message =
      this.#session.mode === 'body'
        ? 'Exited header/footer edit mode.'
        : `Editing ${this.#session.kind === 'header' ? 'Header' : 'Footer'} (${this.#session.sectionType ?? 'default'})`;
    this.#callbacks.onAnnounce?.(message);
  }

  #setupActiveEditorEventBridge(editor: Editor): void {
    this.#teardownActiveEditorEventBridge();

    const emitSurfaceUpdate = () => {
      if (this.#session.mode !== 'header' && this.#session.mode !== 'footer') return;
      this.#callbacks.onSurfaceUpdate?.({
        sourceEditor: editor,
        surface: this.#session.mode,
        headerId: this.#session.headerFooterRefId ?? null,
        sectionType: this.#session.sectionType ?? null,
      });
    };

    const emitSurfaceTransaction = ({ transaction, duration }: { transaction: unknown; duration?: number }) => {
      if (this.#session.mode !== 'header' && this.#session.mode !== 'footer') return;
      this.#callbacks.onSurfaceTransaction?.({
        sourceEditor: editor,
        surface: this.#session.mode,
        headerId: this.#session.headerFooterRefId ?? null,
        sectionType: this.#session.sectionType ?? null,
        transaction,
        duration,
      });
    };

    editor.on('update', emitSurfaceUpdate);
    editor.on('transaction', emitSurfaceTransaction);

    this.#activeEditorEventCleanup = () => {
      editor.off?.('update', emitSurfaceUpdate);
      editor.off?.('transaction', emitSurfaceTransaction);
    };
  }

  #teardownActiveEditorEventBridge(): void {
    try {
      this.#activeEditorEventCleanup?.();
    } catch (error) {
      console.warn('[HeaderFooterSessionManager] Failed to clean up active editor bridge:', error);
    } finally {
      this.#activeEditorEventCleanup = null;
    }
  }

  #updateModeBanner(): void {
    if (!this.#modeBanner) return;
    if (this.#session.mode === 'body') {
      this.#modeBanner.style.display = 'none';
      this.#modeBanner.textContent = '';
      return;
    }
    const title = this.#session.kind === 'header' ? 'Header' : 'Footer';
    const variant = this.#session.sectionType ?? 'default';
    const page = this.#session.pageNumber != null ? `Page ${this.#session.pageNumber}` : '';
    this.#modeBanner.textContent = `Editing ${title} (${variant}) ${page} – Press Esc to return`;
    this.#modeBanner.style.display = 'block';
  }

  // ===========================================================================
  // Hover UI
  // ===========================================================================

  /**
   * Render hover highlight for a region.
   */
  renderHover(region: HeaderFooterRegion): void {
    if (this.#documentMode === 'viewing') {
      this.clearHover();
      return;
    }
    if (!this.#hoverOverlay || !this.#hoverTooltip) return;

    this.#hoverRegion = region;

    const coords = this.#deps?.convertPageLocalToOverlayCoords(region.pageIndex, region.localX, region.localY);
    if (!coords) {
      this.clearHover();
      return;
    }

    this.#hoverOverlay.style.display = 'block';
    this.#hoverOverlay.style.left = `${coords.x}px`;
    this.#hoverOverlay.style.top = `${coords.y}px`;
    this.#hoverOverlay.style.width = `${region.width}px`;
    this.#hoverOverlay.style.height = `${region.height}px`;

    const tooltipText = `Double-click to edit ${region.kind === 'header' ? 'header' : 'footer'}`;
    this.#hoverTooltip.textContent = tooltipText;
    this.#hoverTooltip.style.display = 'block';
    this.#hoverTooltip.style.left = `${coords.x}px`;

    const tooltipHeight = 24;
    const spaceAbove = coords.y;
    const regionHeight = region.height;
    const tooltipY = spaceAbove < tooltipHeight + 4 ? coords.y + regionHeight + 4 : coords.y - tooltipHeight;
    this.#hoverTooltip.style.top = `${Math.max(0, tooltipY)}px`;
  }

  /**
   * Clear hover highlight.
   */
  clearHover(): void {
    this.#hoverRegion = null;
    if (this.#hoverOverlay) {
      this.#hoverOverlay.style.display = 'none';
    }
    if (this.#hoverTooltip) {
      this.#hoverTooltip.style.display = 'none';
    }
  }

  /** Get current hover region */
  get hoverRegion(): HeaderFooterRegion | null {
    return this.#hoverRegion;
  }

  #getActiveRegion(): HeaderFooterRegion | null {
    if (this.#session.mode === 'header') {
      return this.#headerRegions.get(this.#session.pageIndex ?? -1) ?? null;
    }

    if (this.#session.mode === 'footer') {
      return this.#footerRegions.get(this.#session.pageIndex ?? -1) ?? null;
    }

    return null;
  }

  #hideActiveBorder(): void {
    if (this.#activeBorderLine) {
      this.#activeBorderLine.remove();
      this.#activeBorderLine = null;
    }
  }

  #syncActiveBorder(): void {
    this.#hideActiveBorder();

    const region = this.#getActiveRegion();
    if (!region || this.#session.mode === 'body') {
      return;
    }

    const pageElement = this.#deps?.getPageElement(region.pageIndex);
    if (!pageElement) {
      return;
    }

    const borderLine = pageElement.ownerDocument.createElement('div');
    borderLine.className = 'superdoc-header-footer-border';
    Object.assign(borderLine.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: `${region.kind === 'header' ? region.localY + region.height : region.localY}px`,
      height: '1px',
      backgroundColor: '#4472c4',
      pointerEvents: 'none',
      zIndex: '8',
    });

    pageElement.appendChild(borderLine);
    this.#activeBorderLine = borderLine;
  }

  // ===========================================================================
  // Layout
  // ===========================================================================

  /**
   * Build input for header/footer layout computation.
   */
  buildLayoutInput(): HeaderFooterInput {
    if (!this.#headerFooterAdapter) {
      return null;
    }
    const headerBlocks = this.#headerFooterAdapter.getBatch('header');
    const footerBlocks = this.#headerFooterAdapter.getBatch('footer');
    const headerBlocksByRId = this.#headerFooterAdapter.getBlocksByRId('header');
    const footerBlocksByRId = this.#headerFooterAdapter.getBlocksByRId('footer');

    if (!headerBlocks && !footerBlocks && !headerBlocksByRId && !footerBlocksByRId) {
      return null;
    }

    const constraints = this.#computeConstraints();
    if (!constraints) {
      return null;
    }

    return {
      headerBlocks,
      footerBlocks,
      headerBlocksByRId,
      footerBlocksByRId,
      constraints,
    };
  }

  /**
   * Compute layout constraints for header/footer content.
   */
  #computeConstraints(): HeaderFooterInput extends null ? never : HeaderFooterInput['constraints'] | null {
    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const pageSize = layoutOptions.pageSize ?? this.#options.defaultPageSize;
    const margins = layoutOptions.margins ?? this.#options.defaultMargins;

    const marginLeft = margins.left ?? this.#options.defaultMargins.left ?? 0;
    const marginRight = margins.right ?? this.#options.defaultMargins.right ?? 0;
    const bodyContentWidth = pageSize.w - (marginLeft + marginRight);

    if (!Number.isFinite(bodyContentWidth) || bodyContentWidth <= 0) {
      return null;
    }

    const measurementWidth = bodyContentWidth;
    const marginTop = margins.top ?? this.#options.defaultMargins.top ?? 0;
    const marginBottom = margins.bottom ?? this.#options.defaultMargins.bottom ?? 0;

    if (!Number.isFinite(marginTop) || !Number.isFinite(marginBottom)) {
      console.warn('[HeaderFooterSessionManager] Invalid top or bottom margin: not a finite number');
      return null;
    }

    const totalVerticalMargins = marginTop + marginBottom;
    if (totalVerticalMargins >= pageSize.h) {
      console.warn(
        `[HeaderFooterSessionManager] Invalid margins: top (${marginTop}) + bottom (${marginBottom}) = ${totalVerticalMargins} >= page height (${pageSize.h})`,
      );
      return null;
    }

    const MIN_HEADER_FOOTER_HEIGHT = 1;
    const height = Math.max(MIN_HEADER_FOOTER_HEIGHT, pageSize.h - totalVerticalMargins);
    const headerMargin = margins.header ?? 0;
    const footerMargin = margins.footer ?? 0;
    const headerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginTop - headerMargin);
    const footerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginBottom - footerMargin);
    const overflowBaseHeight = Math.max(headerBand, footerBand);

    return {
      width: measurementWidth,
      height,
      pageWidth: pageSize.w,
      pageHeight: pageSize.h,
      margins: {
        left: marginLeft,
        right: marginRight,
        top: marginTop,
        bottom: marginBottom,
        header: headerMargin,
      },
      overflowBaseHeight,
    };
  }

  /** resolveResult, with this document's font signature folded into the paint-reuse versions. */
  #resolveResult(result: HeaderFooterLayoutResult, storyId?: string | null): ResolvedHeaderFooterLayout {
    return resolveResult(result, storyId, this.#options.getFontSignature?.() ?? '');
  }

  /**
   * Layout per-rId header/footers for multi-section documents.
   */
  async layoutPerRId(
    headerFooterInput: HeaderFooterInput,
    layout: Layout,
    sectionMetadata: SectionMetadata[],
    fontResolver?: FontResolver,
    hasFace?: HasFace,
    effectiveSignature?: string,
  ): Promise<void> {
    await layoutPerRIdHeaderFooters(
      headerFooterInput,
      layout,
      sectionMetadata,
      {
        headerLayoutsByRId: this.#headerLayoutsByRId,
        footerLayoutsByRId: this.#footerLayoutsByRId,
      },
      fontResolver,
      hasFace,
      effectiveSignature,
    );

    // Rebuild resolved maps aligned 1:1 with the raw rId maps.
    this.#resolvedHeaderByRId.clear();
    for (const [key, result] of this.#headerLayoutsByRId) {
      this.#resolvedHeaderByRId.set(key, this.#resolveResult(result, storyIdFromHeaderFooterLayoutKey(key)));
    }
    this.#resolvedFooterByRId.clear();
    for (const [key, result] of this.#footerLayoutsByRId) {
      this.#resolvedFooterByRId.set(key, this.#resolveResult(result, storyIdFromHeaderFooterLayoutKey(key)));
    }
  }

  #computeMetrics(
    kind: 'header' | 'footer',
    layoutHeight: number,
    box: { height: number; offset: number },
    pageHeight: number,
    footerMargin: number,
  ): { layoutHeight: number; containerHeight: number; offset: number } {
    const validatedLayoutHeight = Number.isFinite(layoutHeight) && layoutHeight >= 0 ? layoutHeight : 0;
    const containerHeight = Math.max(box.height, validatedLayoutHeight);
    const offset = kind === 'header' ? box.offset : Math.max(0, pageHeight - footerMargin - containerHeight);

    return {
      layoutHeight: validatedLayoutHeight,
      containerHeight,
      offset,
    };
  }

  #computeDecorationBox(
    kind: 'header' | 'footer',
    margins: HeaderFooterLayoutOptions['margins'],
    pageHeight: number,
  ): { x: number; width: number; height: number; offset: number } {
    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const pageSize = layoutOptions.pageSize ?? this.#options.defaultPageSize;
    const defaultMargins = this.#options.defaultMargins;

    const marginLeft = margins?.left ?? defaultMargins.left ?? 0;
    const marginRight = margins?.right ?? defaultMargins.right ?? 0;
    const marginTop = margins?.top ?? defaultMargins.top ?? 0;
    const marginBottom = margins?.bottom ?? defaultMargins.bottom ?? 0;
    const headerMargin = margins?.header ?? defaultMargins.header ?? 0;
    const footerMargin = margins?.footer ?? defaultMargins.footer ?? 0;

    const width = pageSize.w - marginLeft - marginRight;

    if (kind === 'header') {
      const height = Math.max(1, marginTop - headerMargin);
      return { x: marginLeft, width, height, offset: headerMargin };
    } else {
      const height = Math.max(1, marginBottom - footerMargin);
      const offset = pageHeight - marginBottom;
      return { x: marginLeft, width, height, offset };
    }
  }

  #computeExpectedSectionType(
    kind: 'header' | 'footer',
    page: ResolvedPage,
    sectionFirstPageNumbers: Map<number, number>,
  ): string {
    const pageNumber = page.number;
    const effectivePageNumber = page.effectivePageNumber ?? page.displayNumber ?? pageNumber;
    const sectionIndex = page.sectionIndex ?? 0;
    const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
    const isFirstPageOfSection = firstPageInSection === pageNumber;

    // Check for alternateHeaders in converter or the multi-section identifier.
    const converter = (this.#options.editor as EditorWithConverter).converter;
    const hasAlternateHeaders =
      this.#multiSectionIdentifier?.alternateHeaders === true || converter?.pageStyles?.alternateHeaders === true;

    // Only use 'first' variant when titlePg is enabled (w:titlePg element in OOXML).
    // Without titlePg, even the first page of a section uses 'default'.
    const headerIds = converter?.headerIds as { titlePg?: boolean } | undefined;
    const footerIds = converter?.footerIds as { titlePg?: boolean } | undefined;
    let titlePgEnabled = headerIds?.titlePg === true || footerIds?.titlePg === true;
    if (this.#multiSectionIdentifier?.sectionTitlePg?.has(sectionIndex)) {
      titlePgEnabled = this.#multiSectionIdentifier.sectionTitlePg.get(sectionIndex) === true;
    }

    if (isFirstPageOfSection && titlePgEnabled) {
      return 'first';
    }
    if (hasAlternateHeaders) {
      return effectivePageNumber % 2 === 0 ? 'even' : 'odd';
    }
    return 'default';
  }

  #stripFootnoteReserveFromBottomMargin(
    margins: HeaderFooterLayoutOptions['margins'],
    page: ResolvedPage | null,
  ): HeaderFooterLayoutOptions['margins'] {
    // Note: property is 'footnoteReserved' (with 'd') as defined in @superdoc/contracts
    const footnoteReserved = page?.footnoteReserved ?? 0;
    if (footnoteReserved <= 0) return margins;

    const currentBottom = margins?.bottom ?? this.#options.defaultMargins.bottom ?? 0;
    return {
      ...margins,
      bottom: Math.max(0, currentBottom - footnoteReserved),
    };
  }

  // ===========================================================================
  // Selection (for H/F editing mode)
  // ===========================================================================

  /**
   * Compute selection rectangles in header/footer mode.
   *
   * Header/footer editing uses a hidden off-screen ProseMirror host, so the
   * visible selection overlay must be derived from the rendered header/footer
   * layout rather than from the editor DOM.
   */
  computeSelectionRects(from: number, to: number): LayoutRect[] {
    // Guard: must be in header/footer mode with an active editor and region context.
    if (this.#session.mode === 'body') {
      return [];
    }
    const activeEditor = this.#activeEditor;
    if (!activeEditor?.view) {
      return [];
    }

    const view = activeEditor.view;

    // Resolve layout context for the active header/footer region.
    const context = this.getContext();
    if (!context) {
      console.warn('[HeaderFooterSessionManager] Header/footer context unavailable for selection rects', {
        mode: this.#session.mode,
        pageIndex: this.#session.pageIndex,
      });
      return [];
    }

    const region = context.region;
    const pageIndex = region.pageIndex;
    const bodyPageHeight = this.#deps?.getBodyPageHeight() ?? this.#options.defaultPageSize.h;

    const hiddenHostRects = this.#computeHiddenHostSelectionRects(context, from, to, bodyPageHeight);
    if (hiddenHostRects) {
      return hiddenHostRects;
    }

    const domRectList = this.#computeEditorRangeClientRects(view, from, to);

    if (!domRectList.length) {
      return [];
    }

    // Map DOM client rects to layout coordinates.
    //
    // Range.getClientRects() measures in viewport pixels after PresentationEditor
    // applies scale(zoom). Region coordinates, page offsets, and the rest of the
    // selection pipeline use unscaled layout coordinates, so the DOM-derived
    // deltas and sizes must be converted back out of zoom space here.
    const editorDom = view.dom as HTMLElement;
    const editorHostRect = editorDom.getBoundingClientRect();
    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const zoom =
      typeof layoutOptions.zoom === 'number' && Number.isFinite(layoutOptions.zoom) && layoutOptions.zoom > 0
        ? layoutOptions.zoom
        : 1;
    const toLayoutUnits = (viewportPixels: number): number => viewportPixels / zoom;
    const layoutRects: LayoutRect[] = [];

    for (const clientRect of domRectList) {
      // Ignore rects that do not intersect the active editor host. This
      // prevents stale DOM selections from other header/footer editors (or the
      // body editor) from contributing rectangles when switching between hosts.
      const horizontallyOverlaps = clientRect.right > editorHostRect.left && clientRect.left < editorHostRect.right;
      const verticallyOverlaps = clientRect.bottom > editorHostRect.top && clientRect.top < editorHostRect.bottom;
      if (!horizontallyOverlaps || !verticallyOverlaps) {
        continue;
      }

      const localX = toLayoutUnits(clientRect.left - editorHostRect.left);
      const localY = toLayoutUnits(clientRect.top - editorHostRect.top);
      const width = toLayoutUnits(clientRect.width);
      const height = toLayoutUnits(clientRect.height);

      if (!Number.isFinite(localX) || !Number.isFinite(localY) || width <= 0 || height <= 0) {
        continue;
      }

      layoutRects.push({
        pageIndex,
        x: region.localX + localX,
        y: pageIndex * bodyPageHeight + region.localY + localY,
        width,
        height,
      });
    }

    return layoutRects;
  }

  #computeHiddenHostSelectionRects(
    context: HeaderFooterLayoutContext,
    from: number,
    to: number,
    bodyPageHeight: number,
  ): LayoutRect[] | null {
    const activeEditor = this.#activeEditor;
    const editorDom = activeEditor?.view?.dom as HTMLElement | null;
    if (!editorDom?.closest?.('.presentation-editor__story-hidden-host')) {
      return null;
    }

    const visibleSurfaceRects = this.#computeVisibleSurfaceSelectionRects(context, from, to, bodyPageHeight);
    if (visibleSurfaceRects?.length) {
      return visibleSurfaceRects;
    }

    const localRects = selectionToRects(context.layout, context.blocks, context.measures, from, to) ?? [];
    if (localRects.length) {
      return localRects.map((rect) => ({
        pageIndex: context.region.pageIndex,
        x: context.region.localX + rect.x,
        y: context.region.pageIndex * bodyPageHeight + context.region.localY + rect.y,
        width: rect.width,
        height: rect.height,
      }));
    }

    const liveRect = activeEditor
      ? this.#computeHiddenHostLiveRangeRect(activeEditor, from, to, context, bodyPageHeight)
      : null;
    return liveRect ? [liveRect] : [];
  }

  #computeVisibleSurfaceSelectionRects(
    context: HeaderFooterLayoutContext,
    from: number,
    to: number,
    bodyPageHeight: number,
  ): LayoutRect[] | null {
    const pageElement = this.#deps?.getPageElement(context.region.pageIndex);
    if (!pageElement) {
      return null;
    }

    const surfaceSelector = this.#session.mode === 'header' ? '.superdoc-page-header' : '.superdoc-page-footer';
    const surfaceElement = pageElement.querySelector<HTMLElement>(surfaceSelector);
    if (!surfaceElement) {
      return null;
    }

    const entries = buildSurfacePmEntries(surfaceElement);
    const surfaceEntries = findSurfaceEntriesInRange(entries, from, to, { boundaryInclusive: true });
    if (!surfaceEntries.length) {
      return null;
    }

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const startEntry =
      surfaceEntries.find((entry) => start >= entry.pmStart && start <= entry.pmEnd) ?? surfaceEntries[0] ?? null;
    const endEntry =
      surfaceEntries.find((entry) => end >= entry.pmStart && end <= entry.pmEnd) ??
      surfaceEntries[surfaceEntries.length - 1] ??
      null;
    if (!startEntry || !endEntry) {
      return null;
    }

    const doc = pageElement.ownerDocument;
    if (!doc?.createRange) {
      return null;
    }

    const range = doc.createRange();
    try {
      if (!setSurfaceRangeStart(range, startEntry, start)) {
        return null;
      }
      if (!setSurfaceRangeEnd(range, endEntry, end)) {
        return null;
      }
    } catch {
      return null;
    }

    let clientRects: DOMRect[] = [];
    try {
      clientRects = deduplicateOverlappingRects(Array.from(range.getClientRects()) as unknown as DOMRect[]);
    } catch {
      return null;
    }

    if (!clientRects.length) {
      return null;
    }

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const zoom =
      typeof layoutOptions.zoom === 'number' && Number.isFinite(layoutOptions.zoom) && layoutOptions.zoom > 0
        ? layoutOptions.zoom
        : 1;
    const pageRect = pageElement.getBoundingClientRect();

    const layoutRects: LayoutRect[] = [];
    for (const clientRect of clientRects) {
      const width = clientRect.width / zoom;
      const height = clientRect.height / zoom;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        continue;
      }

      const localX = (clientRect.left - pageRect.left) / zoom;
      const localY = (clientRect.top - pageRect.top) / zoom;
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
        continue;
      }

      layoutRects.push({
        pageIndex: context.region.pageIndex,
        x: localX,
        y: context.region.pageIndex * bodyPageHeight + localY,
        width: Math.max(1, width),
        height: Math.max(1, height),
      });
    }

    return layoutRects.length ? layoutRects : null;
  }

  #computeVisibleSurfaceCaretRect(
    context: HeaderFooterLayoutContext,
    pos: number,
    bodyPageHeight: number,
  ): LayoutRect | null {
    const pageElement = this.#deps?.getPageElement(context.region.pageIndex);
    if (!pageElement) {
      return null;
    }

    const surfaceSelector = this.#session.mode === 'header' ? '.superdoc-page-header' : '.superdoc-page-footer';
    const surfaceElement = pageElement.querySelector<HTMLElement>(surfaceSelector);
    if (!surfaceElement) {
      return null;
    }

    // behindDoc fragments sit directly on the page element (not inside the H/F container)
    // so buildSurfacePmEntries on surfaceElement misses them. Include them explicitly.
    const behindDocFragments = Array.from(
      pageElement.querySelectorAll<HTMLElement>(`[data-behind-doc-section="${this.#session.mode}"]`),
    );
    const allEntries = [
      ...buildSurfacePmEntries(surfaceElement),
      ...behindDocFragments.flatMap((frag) => buildSurfacePmEntries(frag)),
    ].sort((a, b) => a.pmStart - b.pmStart || a.pmEnd - b.pmEnd);

    const entry = findSurfaceEntryAtPos(allEntries, pos);
    if (!entry) {
      return null;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const zoom =
      typeof this.#deps?.getLayoutOptions()?.zoom === 'number' &&
      Number.isFinite(this.#deps?.getLayoutOptions()?.zoom) &&
      (this.#deps?.getLayoutOptions()?.zoom ?? 0) > 0
        ? (this.#deps?.getLayoutOptions()?.zoom as number)
        : 1;

    const textNode = Array.from(entry.el.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
    if (textNode) {
      const range = entry.el.ownerDocument?.createRange();
      if (!range) {
        return null;
      }

      const charIndex = mapPmPosToTextOffset(pos, entry.pmStart, entry.pmEnd, textNode.length);
      range.setStart(textNode, charIndex);
      range.setEnd(textNode, charIndex);

      const rangeRect = range.getBoundingClientRect();
      if (!Number.isFinite(rangeRect.left) || !Number.isFinite(rangeRect.top) || rangeRect.height <= 0) {
        return null;
      }

      return {
        pageIndex: context.region.pageIndex,
        x: (rangeRect.left - pageRect.left) / zoom,
        y: context.region.pageIndex * bodyPageHeight + (rangeRect.top - pageRect.top) / zoom,
        width: 1,
        height: Math.max(1, rangeRect.height / zoom),
      };
    }

    const elementRect = entry.el.getBoundingClientRect();
    if (!Number.isFinite(elementRect.left) || !Number.isFinite(elementRect.top) || elementRect.height <= 0) {
      return null;
    }

    const localX = (pos <= entry.pmStart ? elementRect.left : elementRect.right) - pageRect.left;
    return {
      pageIndex: context.region.pageIndex,
      x: localX / zoom,
      y: context.region.pageIndex * bodyPageHeight + (elementRect.top - pageRect.top) / zoom,
      width: 1,
      height: Math.max(1, elementRect.height / zoom),
    };
  }

  #computeHiddenHostLiveRangeRect(
    editor: Editor,
    from: number,
    to: number,
    context: HeaderFooterLayoutContext,
    bodyPageHeight: number,
  ): LayoutRect | null {
    const view = editor.view as
      | (Editor['view'] & {
          coordsAtPos?: (pos: number, side?: number) => { left: number; right: number; top: number; bottom: number };
        })
      | null
      | undefined;

    if (!view || typeof view.coordsAtPos !== 'function') {
      return null;
    }

    const docSize = editor.state?.doc?.content?.size ?? 0;
    const start = Math.max(0, Math.min(Math.min(from, to), docSize));
    const end = Math.max(0, Math.min(Math.max(from, to), docSize));

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const zoom =
      typeof layoutOptions.zoom === 'number' && Number.isFinite(layoutOptions.zoom) && layoutOptions.zoom > 0
        ? layoutOptions.zoom
        : 1;
    const editorHostRect = view.dom.getBoundingClientRect();

    try {
      const startCoords = view.coordsAtPos(start);
      const endCoords = start === end ? startCoords : view.coordsAtPos(end, -1);
      const left = Math.min(startCoords.left, endCoords.left);
      const right = Math.max(startCoords.right, endCoords.right);
      const top = Math.min(startCoords.top, endCoords.top);
      const bottom = Math.max(startCoords.bottom, endCoords.bottom);
      const width = Math.max(1, (right - left) / zoom);
      const height = Math.max(1, (bottom - top) / zoom);
      const localX = (left - editorHostRect.left) / zoom;
      const localY = (top - editorHostRect.top) / zoom;

      if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
        return null;
      }

      return {
        pageIndex: context.region.pageIndex,
        x: context.region.localX + localX,
        y: context.region.pageIndex * bodyPageHeight + context.region.localY + localY,
        width,
        height,
      };
    } catch {
      return null;
    }
  }

  #computeEditorRangeClientRects(view: Editor['view'], from: number, to: number): DOMRect[] {
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return [];
    }

    const docSize = view.state?.doc?.content?.size ?? 0;
    const start = Math.max(0, Math.min(Math.min(from, to), docSize));
    const end = Math.max(0, Math.min(Math.max(from, to), docSize));
    if (start === end || typeof view.domAtPos !== 'function') {
      return [];
    }

    const doc = view.dom.ownerDocument;
    const range = doc?.createRange?.();
    if (!range) {
      return [];
    }

    try {
      const startBoundary = view.domAtPos(start);
      const endBoundary = view.domAtPos(end);
      range.setStart(startBoundary.node, startBoundary.offset);
      range.setEnd(endBoundary.node, endBoundary.offset);
    } catch {
      return [];
    }

    try {
      const clientRects = Array.from(range.getClientRects()) as unknown as DOMRect[];
      return deduplicateOverlappingRects(clientRects);
    } catch {
      return [];
    }
  }

  computeCaretRect(pos: number): LayoutRect | null {
    if (this.#session.mode === 'body') {
      return null;
    }

    const context = this.getContext();
    if (!context) {
      return null;
    }

    const region = context.region;
    const bodyPageHeight = this.#deps?.getBodyPageHeight() ?? this.#options.defaultPageSize.h;
    const visibleSurfaceCaretRect = this.#computeVisibleSurfaceCaretRect(context, pos, bodyPageHeight);
    if (visibleSurfaceCaretRect) {
      return visibleSurfaceCaretRect;
    }

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const geometry = computeCaretLayoutRectGeometryFromHelper(
      {
        layout: context.layout,
        blocks: context.blocks,
        measures: context.measures,
        painterHost: null,
        viewportHost: this.#options.visibleHost,
        visibleHost: this.#options.visibleHost,
        zoom: layoutOptions.zoom ?? 1,
      },
      pos,
      false,
    );

    if (geometry) {
      return {
        pageIndex: region.pageIndex,
        x: region.localX + geometry.x,
        y: region.pageIndex * bodyPageHeight + region.localY + geometry.y,
        width: 1,
        height: geometry.height,
      };
    }

    const liveRect = this.#activeEditor
      ? this.#computeHiddenHostLiveRangeRect(this.#activeEditor, pos, pos, context, bodyPageHeight)
      : null;
    if (liveRect) {
      return {
        pageIndex: liveRect.pageIndex,
        x: liveRect.x,
        y: liveRect.y,
        width: 1,
        height: liveRect.height,
      };
    }

    return null;
  }

  /**
   * Get the current header/footer layout context.
   */
  getContext(): HeaderFooterLayoutContext | null {
    if (this.#session.mode === 'body') return null;
    if (!this.#headerFooterManager) return null;

    const pageIndex = this.#session.pageIndex;
    if (pageIndex == null) return null;

    const regionMap = this.#session.mode === 'header' ? this.#headerRegions : this.#footerRegions;
    const region = regionMap.get(pageIndex);
    if (!region) {
      console.warn('[HeaderFooterSessionManager] Header/footer region not found for pageIndex:', pageIndex);
      return null;
    }

    const activeLayoutResult = this.#resolveActiveLayoutResult(region);
    if (!activeLayoutResult) {
      console.warn('[HeaderFooterSessionManager] Header/footer layout results not available');
      return null;
    }

    const pageWidth = Math.max(1, region.width);
    const pageHeight = Math.max(1, activeLayoutResult.layout.height ?? region.height ?? 1);

    const layoutLike: Layout = {
      pageSize: { w: pageWidth, h: pageHeight },
      pages: activeLayoutResult.layout.pages.map((page: Page) => ({
        number: page.number,
        displayNumber: page.displayNumber,
        numberText: page.numberText,
        fragments: page.fragments,
      })),
    };

    return {
      layout: layoutLike,
      blocks: activeLayoutResult.blocks,
      measures: activeLayoutResult.measures,
      region,
    };
  }

  #resolveActiveLayoutResult(region: HeaderFooterRegion): HeaderFooterLayoutResult | null {
    const layoutsByRId = this.#session.mode === 'header' ? this.#headerLayoutsByRId : this.#footerLayoutsByRId;
    const concreteRefId = this.#session.headerFooterRefId ?? region.headerFooterRefId ?? null;

    if (concreteRefId && layoutsByRId.size > 0) {
      const compositeKey = buildSectionAwareHeaderFooterLayoutKey(concreteRefId, region.sectionIndex ?? 0);
      const layoutByRef = layoutsByRId.get(compositeKey) ?? layoutsByRId.get(concreteRefId) ?? null;
      if (layoutByRef) {
        return layoutByRef;
      }
    }

    const results = this.#session.mode === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    if (!results || results.length === 0) {
      return null;
    }

    return results.find((entry) => entry.type === this.#session.sectionType) ?? results[0] ?? null;
  }

  /**
   * Get the page height for header/footer mode.
   */
  getPageHeight(): number {
    const context = this.getContext();
    if (!context) {
      console.warn('[HeaderFooterSessionManager] Header/footer context missing when computing page height');
      return 1;
    }
    return context.layout.pageSize?.h ?? context.region.height ?? 1;
  }

  /**
   * Set the multi-section identifier.
   */
  setMultiSectionIdentifier(identifier: MultiSectionHeaderFooterIdentifier | null): void {
    this.#multiSectionIdentifier = identifier;
  }

  // ===========================================================================
  // Decoration Provider Creation
  // ===========================================================================

  /**
   * Update decoration providers for header and footer.
   * Creates new providers based on layout results and sets them on this manager.
   */
  updateDecorationProviders(resolvedLayout: ResolvedLayout): void {
    this.#headerDecorationProvider = this.createDecorationProvider('header', resolvedLayout);
    this.#footerDecorationProvider = this.createDecorationProvider('footer', resolvedLayout);
    this.rebuildRegions(resolvedLayout);
    this.#publishedHeaderFooterLayoutSnapshot = this.#buildLiveHeaderFooterLayoutSnapshot();
    this.#headerFooterLayoutSnapshotPending = false;
  }

  private resolveAlignedDecorationItems(
    fragments: Fragment[],
    slotPageNumber: number,
    result: HeaderFooterLayoutResult,
    cachedResolvedLayout: ResolvedHeaderFooterLayout | undefined,
    contextLabel: string,
    storyId?: string | null,
  ): ResolvedPaintItem[] | undefined {
    const cachedPage = cachedResolvedLayout?.pages.find((page) => page.number === slotPageNumber);
    const cachedItems = cachedPage?.items;
    if (cachedItems && cachedItems.length === fragments.length) {
      return cachedItems;
    }
    if (cachedItems) {
      console.warn(
        `[HeaderFooterSessionManager] Resolved items length (${cachedItems.length}) does not match fragments length (${fragments.length}) for ${contextLabel}. Recomputing items.`,
      );
    }

    const freshResolvedLayout = this.#resolveResult(result, storyId);
    const freshPage = freshResolvedLayout.pages.find((page) => page.number === slotPageNumber);
    const freshItems = freshPage?.items;
    if (freshItems && freshItems.length === fragments.length) {
      return freshItems;
    }
    if (freshItems) {
      console.warn(
        `[HeaderFooterSessionManager] Fresh resolved items length (${freshItems.length}) does not match fragments length (${fragments.length}) for ${contextLabel}. Dropping items.`,
      );
    }
    return undefined;
  }

  /**
   * Create a decoration provider for header or footer rendering.
   */
  createDecorationProvider(
    kind: 'header' | 'footer',
    resolvedLayout: ResolvedLayout,
  ): PageDecorationProvider | undefined {
    const results = kind === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    const layoutsByRId = kind === 'header' ? this.#headerLayoutsByRId : this.#footerLayoutsByRId;
    const resolvedResults = kind === 'header' ? this.#resolvedHeaderLayouts : this.#resolvedFooterLayouts;
    const resolvedByRId = kind === 'header' ? this.#resolvedHeaderByRId : this.#resolvedFooterByRId;

    if ((!results || results.length === 0) && (!layoutsByRId || layoutsByRId.size === 0)) {
      return undefined;
    }

    const multiSectionId = this.#multiSectionIdentifier;
    const legacyIdentifier =
      this.#headerFooterIdentifier ??
      extractIdentifierFromConverter((this.#options.editor as Editor & { converter?: unknown }).converter);

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const defaultPageSize = this.#options.defaultPageSize;
    const defaultMargins = this.#options.defaultMargins;

    // Build section first page map
    const sectionFirstPageNumbers = new Map<number, number>();
    for (const p of resolvedLayout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
    }
    const hasSectionResolution = hasSectionRefsForKind(multiSectionId, kind);

    return (pageNumber, pageMargins, page) => {
      const sectionIndex = page?.sectionIndex ?? 0;
      const effectivePageNumber = page?.effectivePageNumber ?? page?.displayNumber ?? pageNumber;
      const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
      const sectionPageNumber =
        typeof firstPageInSection === 'number' ? pageNumber - firstPageInSection + 1 : pageNumber;
      const headerFooterType = hasSectionResolution
        ? getHeaderFooterTypeForSection(effectivePageNumber, sectionIndex, multiSectionId, {
            kind,
            sectionPageNumber,
            parityPageNumber: effectivePageNumber,
          })
        : getHeaderFooterType(pageNumber, legacyIdentifier, { kind, parityPageNumber: effectivePageNumber });

      if (!headerFooterType) {
        return null;
      }

      const pageSectionRefs = kind === 'header' ? page?.sectionRefs?.headerRefs : page?.sectionRefs?.footerRefs;
      const sectionResolvedRef = hasSectionResolution
        ? resolveEffectiveHeaderFooterRef({
            sections: multiSectionId.sections,
            sectionIndex,
            kind,
            variant: headerFooterType,
          })
        : null;
      const legacyRefs = kind === 'header' ? legacyIdentifier.headerIds : legacyIdentifier.footerIds;
      const resolvedRef =
        refForVariant(pageSectionRefs, headerFooterType) ??
        sectionResolvedRef ??
        (!hasSectionResolution ? refForVariant(legacyRefs, headerFooterType) : undefined);
      const sectionRId = resolvedRef?.refId;
      const layoutVariantType = resolvedRef?.matchedVariant ?? headerFooterType;

      // PRIORITY 1: Try per-rId layout (composite key first for per-section margins, then plain rId)
      const compositeKey = sectionRId ? `${sectionRId}::s${sectionIndex}` : undefined;
      const rIdLayoutKey =
        (compositeKey && layoutsByRId.has(compositeKey) && compositeKey) ||
        (sectionRId && layoutsByRId.has(sectionRId) && sectionRId) ||
        undefined;
      if (rIdLayoutKey) {
        const rIdLayout = layoutsByRId.get(rIdLayoutKey);
        if (!rIdLayout) {
          console.warn(
            `[HeaderFooterSessionManager] Inconsistent state: layoutsByRId.has('${sectionRId}') returned true but get() returned undefined`,
          );
        } else {
          const slotPage = this.#findPageForNumber(rIdLayout.layout.pages, pageNumber);
          if (slotPage) {
            const fragments = slotPage.fragments ?? [];
            const rIdResolvedLayout = resolvedByRId.get(rIdLayoutKey);
            const alignedItems = this.resolveAlignedDecorationItems(
              fragments,
              slotPage.number,
              rIdLayout,
              rIdResolvedLayout,
              `rId '${rIdLayoutKey}' page ${pageNumber}`,
              sectionRId,
            );
            if (!alignedItems) {
              return null;
            }
            const pageHeight =
              page?.height ?? resolvedLayout.pages[0]?.height ?? layoutOptions.pageSize?.h ?? defaultPageSize.h;
            const margins = pageMargins ?? resolvedLayout.pages[0]?.margins ?? layoutOptions.margins ?? defaultMargins;
            const decorationMargins =
              kind === 'footer' ? this.#stripFootnoteReserveFromBottomMargin(margins, page ?? null) : margins;
            const box = this.#computeDecorationBox(kind, decorationMargins, pageHeight);

            // When a table grid width exceeds the section content width, the layout
            // was computed at the wider effectiveWidth. Use it for the container (SD-1837).
            const effectiveWidth = rIdLayout.effectiveWidth ?? box.width;

            const rawLayoutHeight = rIdLayout.layout.height ?? 0;
            const metrics = this.#computeMetrics(kind, rawLayoutHeight, box, pageHeight, margins?.footer ?? 0);

            const layoutMinY = rIdLayout.layout.minY ?? 0;
            const normalizationMinY = getDecorationNormalizationMinY(fragments, layoutMinY);
            const normalizedFragments = normalizeDecorationFragments(fragments, normalizationMinY);
            const normalizedItems = normalizeDecorationItems(alignedItems, normalizationMinY);
            const isActiveHeaderFooter = this.#isActiveDecoration(kind, sectionRId, pageNumber);

            const payload: SnapshotAwarePageDecorationPayload = {
              fragments: normalizedFragments,
              items: normalizedItems,
              height: metrics.containerHeight,
              contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
              offset: metrics.offset,
              marginLeft: box.x,
              contentWidth: effectiveWidth,
              headerFooterRefId: sectionRId,
              sectionType: headerFooterType,
              isActiveHeaderFooter,
              minY: layoutMinY,
              box: { x: box.x, y: metrics.offset, width: effectiveWidth, height: metrics.containerHeight },
              hitRegion: { x: box.x, y: metrics.offset, width: effectiveWidth, height: metrics.containerHeight },
              matchedVariant: layoutVariantType,
            };
            return payload;
          }
        }
      }

      // PRIORITY 2: Fall back to variant-based layout
      if (!results || results.length === 0) {
        return null;
      }

      const variantIndex = results.findIndex((entry) => entry.type === layoutVariantType);
      const variant = variantIndex >= 0 ? results[variantIndex] : undefined;
      if (!variant || !variant.layout?.pages?.length) {
        return null;
      }

      const slotPage = this.#findPageForNumber(variant.layout.pages, pageNumber);
      if (!slotPage) {
        return null;
      }
      const fragments = slotPage.fragments ?? [];
      const fallbackId = this.#headerFooterManager?.getVariantId(kind, headerFooterType);
      const finalHeaderId = sectionRId ?? fallbackId ?? undefined;

      const resolvedVariant = resolvedResults?.[variantIndex];
      const alignedVariantItems = this.resolveAlignedDecorationItems(
        fragments,
        slotPage.number,
        variant,
        resolvedVariant,
        `variant '${layoutVariantType}' page ${pageNumber}`,
        finalHeaderId ?? headerFooterType,
      );
      if (!alignedVariantItems) {
        return null;
      }

      const pageHeight =
        page?.height ?? resolvedLayout.pages[0]?.height ?? layoutOptions.pageSize?.h ?? defaultPageSize.h;
      const margins = pageMargins ?? resolvedLayout.pages[0]?.margins ?? layoutOptions.margins ?? defaultMargins;
      const decorationMargins =
        kind === 'footer' ? this.#stripFootnoteReserveFromBottomMargin(margins, page ?? null) : margins;
      const box = this.#computeDecorationBox(kind, decorationMargins, pageHeight);

      const rawLayoutHeight = variant.layout.height ?? 0;
      const metrics = this.#computeMetrics(kind, rawLayoutHeight, box, pageHeight, margins?.footer ?? 0);

      const layoutMinY = variant.layout.minY ?? 0;
      const normalizationMinY = getDecorationNormalizationMinY(fragments, layoutMinY);
      const normalizedFragments = normalizeDecorationFragments(fragments, normalizationMinY);
      const normalizedItems = normalizeDecorationItems(alignedVariantItems, normalizationMinY);
      const isActiveHeaderFooter = this.#isActiveDecoration(kind, finalHeaderId, pageNumber);

      const payload: SnapshotAwarePageDecorationPayload = {
        fragments: normalizedFragments,
        items: normalizedItems,
        height: metrics.containerHeight,
        contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
        offset: metrics.offset,
        marginLeft: box.x,
        contentWidth: box.width,
        headerFooterRefId: finalHeaderId,
        sectionType: headerFooterType,
        isActiveHeaderFooter,
        minY: layoutMinY,
        box: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
        hitRegion: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
        matchedVariant: layoutVariantType,
      };
      return payload;
    };
  }

  /**
   * Find header/footer page layout for a given page number with bucket fallback.
   */
  #findPageForNumber(
    pages: Array<{ number: number; fragments: Fragment[] }>,
    pageNumber: number,
  ): { number: number; fragments: Fragment[] } | undefined {
    if (!pages || pages.length === 0) {
      return undefined;
    }

    // 1. Try exact match
    const exactMatch = pages.find((p) => p.number === pageNumber);
    if (exactMatch) {
      return exactMatch;
    }

    // 2. Try bucket representative
    const bucket = getBucketForPageNumber(pageNumber);
    const representative = getBucketRepresentative(bucket);
    const bucketMatch = pages.find((p) => p.number === representative);
    if (bucketMatch) {
      return bucketMatch;
    }

    // 3. Fallback to first page
    return pages[0];
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.#teardownActiveEditorEventBridge();

    // Run cleanup functions
    this.#managerCleanups.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('[HeaderFooterSessionManager] Cleanup error:', e);
      }
    });
    this.#managerCleanups = [];

    // Clear adapter
    this.#headerFooterAdapter?.clear();
    this.#headerFooterAdapter = null;

    // Destroy manager
    this.#headerFooterManager?.destroy();
    this.#headerFooterManager = null;

    // Clear identifiers
    this.#headerFooterIdentifier = null;
    this.#multiSectionIdentifier = null;

    // Clear layout results
    this.#headerLayoutResults = null;
    this.#footerLayoutResults = null;
    this.#headerLayoutsByRId.clear();
    this.#footerLayoutsByRId.clear();
    this.#resolvedHeaderLayouts = null;
    this.#resolvedFooterLayouts = null;
    this.#resolvedHeaderByRId.clear();
    this.#resolvedFooterByRId.clear();
    this.#publishedHeaderFooterLayoutSnapshot = {
      pageBindings: [],
      storyLayouts: { headers: [], footers: [] },
    };
    this.#headerFooterLayoutSnapshotPending = false;

    // Clear decoration providers
    this.#headerDecorationProvider = undefined;
    this.#footerDecorationProvider = undefined;

    // Clear regions
    this.#headerRegions.clear();
    this.#footerRegions.clear();

    // Reset session
    this.#session = { mode: 'body' };
    this.#activeEditor = null;

    // Clear UI references
    this.#hideActiveBorder();
    this.#hoverOverlay = null;
    this.#hoverTooltip = null;
    this.#modeBanner = null;
    this.#hoverRegion = null;
  }
}
