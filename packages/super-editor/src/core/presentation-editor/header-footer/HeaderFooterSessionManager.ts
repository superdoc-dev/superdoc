/**
 * HeaderFooterSessionManager - Manages header/footer editing sessions in PresentationEditor.
 *
 * This class encapsulates all the state and logic for:
 * - Header/footer region tracking and hit testing
 * - Session state machine (body/header/footer modes)
 * - Editor overlay management for H/F editing
 * - Decoration providers for rendering
 * - Hover UI for edit affordances
 *
 * @module presentation-editor/header-footer/HeaderFooterSessionManager
 */

import type { Layout, FlowBlock, Measure, Page, SectionMetadata, Fragment } from '@superdoc/contracts';
import type { PageDecorationProvider } from '@superdoc/painter-dom';

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
} from '../../header-footer/HeaderFooterRegistry.js';
import { EditorOverlayManager } from '../../header-footer/EditorOverlayManager.js';
import { initHeaderFooterRegistry } from '../../header-footer/HeaderFooterRegistryInit.js';
import { layoutPerRIdHeaderFooters } from '../../header-footer/HeaderFooterPerRidLayout.js';
import {
  extractIdentifierFromConverter,
  getHeaderFooterType,
  getHeaderFooterTypeForSection,
  getBucketForPageNumber,
  getBucketRepresentative,
  type HeaderFooterIdentifier,
  type HeaderFooterLayoutResult,
  type MultiSectionHeaderFooterIdentifier,
  type HeaderFooterConstraints,
} from '@superdoc/layout-bridge';
import { deduplicateOverlappingRects } from '../dom/DomSelectionGeometry.js';
import { resolveSectionProjections } from '../../../document-api-adapters/helpers/sections-resolver.js';
import {
  ensureExplicitHeaderFooterSlot,
  normalizeVariant,
} from '../../../document-api-adapters/helpers/header-footer-slot-materialization.js';

// =============================================================================
// Types
// =============================================================================

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
  #overlayManager: EditorOverlayManager | null = null;
  #managerCleanups: Array<() => void> = [];

  // Layout results
  #headerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  #footerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  #headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();
  #footerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();

  // Decoration providers
  #headerDecorationProvider: PageDecorationProvider | undefined;
  #footerDecorationProvider: PageDecorationProvider | undefined;

  // Region tracking
  #headerRegions: Map<number, HeaderFooterRegion> = new Map();
  #footerRegions: Map<number, HeaderFooterRegion> = new Map();

  // Session state
  #session: HeaderFooterSession = { mode: 'body' };
  #activeEditor: Editor | null = null;
  #activeEditorEventCleanup: (() => void) | null = null;

  // Hover UI elements (passed in, not owned)
  #hoverOverlay: HTMLElement | null = null;
  #hoverTooltip: HTMLElement | null = null;
  #modeBanner: HTMLElement | null = null;
  #hoverRegion: HeaderFooterRegion | null = null;

  // Document mode
  #documentMode: 'editing' | 'viewing' | 'suggesting' = 'editing';

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
   */
  refreshStructure(): void {
    this.#headerFooterManager?.refresh();
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

  /** Editor overlay manager */
  get overlayManager(): EditorOverlayManager | null {
    return this.#overlayManager;
  }

  /** Header layout results */
  get headerLayoutResults(): HeaderFooterLayoutResult[] | null {
    return this.#headerLayoutResults;
  }

  /** Set header layout results */
  set headerLayoutResults(results: HeaderFooterLayoutResult[] | null) {
    this.#headerLayoutResults = results;
  }

  /** Footer layout results */
  get footerLayoutResults(): HeaderFooterLayoutResult[] | null {
    return this.#footerLayoutResults;
  }

  /** Set footer layout results */
  set footerLayoutResults(results: HeaderFooterLayoutResult[] | null) {
    this.#footerLayoutResults = results;
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
  }

  /**
   * Set layout results from external layout computation.
   */
  setLayoutResults(
    headerResults: HeaderFooterLayoutResult[] | null,
    footerResults: HeaderFooterLayoutResult[] | null,
  ): void {
    this.#headerLayoutResults = headerResults;
    this.#footerLayoutResults = footerResults;
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
      painterHost: this.#options.painterHost,
      visibleHost: this.#options.visibleHost,
      selectionOverlay: this.#options.selectionOverlay,
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
      exitHeaderFooterMode: () => {
        this.exitMode();
      },
      previousCleanups: this.#managerCleanups,
      previousAdapter: this.#headerFooterAdapter,
      previousManager: this.#headerFooterManager,
      previousOverlayManager: this.#overlayManager,
    });

    this.#overlayManager = result.overlayManager;
    this.#headerFooterIdentifier = result.headerFooterIdentifier;
    this.#headerFooterManager = result.headerFooterManager;
    this.#headerFooterAdapter = result.headerFooterAdapter;
    this.#managerCleanups = result.cleanups;
  }

  // ===========================================================================
  // Region Management
  // ===========================================================================

  /**
   * Rebuild header/footer regions from layout.
   */
  rebuildRegions(layout: Layout): void {
    this.#headerRegions.clear();
    this.#footerRegions.clear();

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const pageHeight = layout.pageSize?.h ?? layoutOptions.pageSize?.h ?? this.#options.defaultPageSize.h;
    if (pageHeight <= 0) return;

    // Build section first page numbers map
    const sectionFirstPageNumbers = new Map<number, number>();
    for (const p of layout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
    }

    // Resolve section projections to map sectionIndex → sectionId
    const sectionIdBySectionIndex = this.#buildSectionIdMap();

    const defaultMargins = this.#options.defaultMargins;

    layout.pages.forEach((page, pageIndex) => {
      const margins = page.margins ?? layoutOptions.margins ?? defaultMargins;
      const actualPageHeight = page.size?.h ?? pageHeight;
      const sectionIndex = page.sectionIndex ?? 0;
      const sectionId = sectionIdBySectionIndex.get(sectionIndex) ?? `section-${sectionIndex}`;

      // Header region
      const headerPayload = this.#headerDecorationProvider?.(page.number, margins, page);
      const headerBox = this.#computeDecorationBox('header', margins, actualPageHeight);
      const displayPageNumber = page.numberText ?? String(page.number);

      this.#headerRegions.set(pageIndex, {
        kind: 'header',
        headerFooterRefId: headerPayload?.headerFooterRefId,
        sectionType:
          headerPayload?.sectionType ?? this.#computeExpectedSectionType('header', page, sectionFirstPageNumbers),
        sectionId,
        sectionIndex,
        pageIndex,
        pageNumber: page.number,
        displayPageNumber,
        localX: headerPayload?.hitRegion?.x ?? headerBox.x,
        localY: headerPayload?.hitRegion?.y ?? headerBox.offset,
        width: headerPayload?.hitRegion?.width ?? headerBox.width,
        height: headerPayload?.hitRegion?.height ?? headerBox.height,
      });

      // Footer region
      const footerPayload = this.#footerDecorationProvider?.(page.number, margins, page);
      const footerBoxMargins = this.#stripFootnoteReserveFromBottomMargin(margins, page);
      const footerBox = this.#computeDecorationBox('footer', footerBoxMargins, actualPageHeight);
      this.#footerRegions.set(pageIndex, {
        kind: 'footer',
        headerFooterRefId: footerPayload?.headerFooterRefId,
        sectionType:
          footerPayload?.sectionType ?? this.#computeExpectedSectionType('footer', page, sectionFirstPageNumbers),
        sectionId,
        sectionIndex,
        pageIndex,
        pageNumber: page.number,
        displayPageNumber,
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
  activateRegion(region: HeaderFooterRegion): void {
    const permission = this.#validateEditPermission();
    if (!permission.allowed) {
      this.#callbacks.onEditBlocked?.(permission.reason ?? 'restricted');
      return;
    }
    void this.#enterMode(region);
  }

  /**
   * Exit header/footer editing mode.
   */
  exitMode(): void {
    if (this.#session.mode === 'body') return;

    // Capture headerFooterRefId before clearing session - needed for cache invalidation
    const editedHeaderId = this.#session.headerFooterRefId;

    if (this.#activeEditor) {
      this.#activeEditor.setEditable(false);
      this.#activeEditor.setOptions({ documentMode: 'viewing' });
    }
    this.#teardownActiveEditorEventBridge();

    this.#overlayManager?.hideEditingOverlay();
    this.#overlayManager?.showSelectionOverlay();

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

  async #enterMode(region: HeaderFooterRegion): Promise<void> {
    try {
      if (!this.#headerFooterManager || !this.#overlayManager) {
        this.clearHover();
        return;
      }

      // Clean up previous session if switching between pages while in editing mode
      if (this.#session.mode !== 'body') {
        if (this.#activeEditor) {
          this.#activeEditor.setEditable(false);
          this.#activeEditor.setOptions({ documentMode: 'viewing' });
        }
        this.#teardownActiveEditorEventBridge();
        this.#overlayManager.hideEditingOverlay();
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
        return;
      }
      if (!descriptor.id) {
        console.warn('[HeaderFooterSessionManager] Descriptor missing id:', descriptor);
        this.clearHover();
        return;
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
            return;
          }
          pageElement = this.#deps?.getPageElement(region.pageIndex) ?? null;
        } catch (scrollError) {
          console.error('[HeaderFooterSessionManager] Error mounting page:', scrollError);
          this.clearHover();
          this.#callbacks.onError?.({
            error: scrollError,
            context: 'enterMode.pageMount',
          });
          return;
        }
      }

      if (!pageElement) {
        console.error('[HeaderFooterSessionManager] Page element not found after mount attempt');
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error('Page element not found after mount'),
          context: 'enterMode',
        });
        return;
      }

      const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
      const { success, editorHost, reason } = this.#overlayManager.showEditingOverlay(
        pageElement,
        region,
        layoutOptions.zoom ?? 1,
      );
      if (!success || !editorHost) {
        console.error('[HeaderFooterSessionManager] Failed to create editor host:', reason);
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error(`Failed to create editor host: ${reason}`),
          context: 'enterMode.showOverlay',
        });
        return;
      }

      const bodyPageCount = this.#deps?.getBodyPageCount() ?? 1;
      let editor;
      try {
        editor = await this.#headerFooterManager.ensureEditor(descriptor, {
          editorHost,
          availableWidth: region.width,
          availableHeight: region.height,
          currentPageNumber: region.pageNumber,
          totalPageCount: bodyPageCount,
        });
      } catch (editorError) {
        console.error('[HeaderFooterSessionManager] Error creating editor:', editorError);
        this.#overlayManager.hideEditingOverlay();
        this.clearHover();
        this.#callbacks.onError?.({
          error: editorError,
          context: 'enterMode.ensureEditor',
        });
        return;
      }

      if (!editor) {
        console.warn('[HeaderFooterSessionManager] Failed to ensure editor for descriptor:', descriptor);
        this.#overlayManager.hideEditingOverlay();
        this.clearHover();
        this.#callbacks.onError?.({
          error: new Error('Failed to create editor instance'),
          context: 'enterMode.ensureEditor',
        });
        return;
      }

      // For footers, apply positioning adjustments
      if (region.kind === 'footer') {
        const editorContainer = editorHost.firstElementChild;
        if (editorContainer instanceof HTMLElement) {
          editorContainer.style.overflow = 'visible';
          if (region.minY != null && region.minY < 0) {
            const shiftDown = Math.abs(region.minY);
            editorContainer.style.transform = `translateY(${shiftDown}px)`;
          } else {
            editorContainer.style.transform = '';
          }
        }
      }

      try {
        editor.setEditable(true);
        editor.setOptions({ documentMode: 'editing' });

        // Ensure the header/footer editor receives focus on user interaction.
        // Without this, subsequent clicks in newly-activated editors may not
        // update ProseMirror selection because the view never regains focus.
        try {
          const editorView = editor.view;
          if (editorView && editorHost) {
            const focusHandler = () => {
              try {
                editorView.focus();
              } catch {
                // Ignore focus errors; selection updates will still work when possible.
              }
            };
            editorHost.addEventListener('mousedown', focusHandler);
            this.#managerCleanups.push(() => editorHost.removeEventListener('mousedown', focusHandler));
          }
        } catch {
          // Best-effort: if we can't wire the focus handler, continue without it.
        }

        // Move caret to end of content
        try {
          const doc = editor.state?.doc;
          if (doc) {
            const endPos = doc.content.size - 1;
            const pos = Math.max(1, endPos);
            editor.commands?.setTextSelection?.({ from: pos, to: pos });
          }
        } catch (cursorError) {
          console.warn('[HeaderFooterSessionManager] Could not set cursor to end:', cursorError);
        }
      } catch (editableError) {
        console.error('[HeaderFooterSessionManager] Error setting editor editable:', editableError);
        this.#overlayManager.hideEditingOverlay();
        this.clearHover();
        this.#callbacks.onError?.({
          error: editableError,
          context: 'enterMode.setEditable',
        });
        return;
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

      this.#emitModeChanged();
      this.#emitEditingContext(editor);
      this.#deps?.notifyInputBridgeTargetChanged();
    } catch (error) {
      console.error('[HeaderFooterSessionManager] Unexpected error in enterMode:', error);

      // Attempt cleanup
      try {
        this.#overlayManager?.hideEditingOverlay();
        this.#overlayManager?.showSelectionOverlay();
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
    }
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

  /**
   * Layout per-rId header/footers for multi-section documents.
   */
  async layoutPerRId(
    headerFooterInput: HeaderFooterInput,
    layout: Layout,
    sectionMetadata: SectionMetadata[],
  ): Promise<void> {
    return await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, {
      headerLayoutsByRId: this.#headerLayoutsByRId,
      footerLayoutsByRId: this.#footerLayoutsByRId,
    });
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
    page: Page,
    sectionFirstPageNumbers: Map<number, number>,
  ): string {
    const pageNumber = page.number;
    const sectionIndex = page.sectionIndex ?? 0;
    const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
    const isFirstPageOfSection = firstPageInSection === pageNumber;

    // Check for alternateHeaders in converter
    const converter = (this.#options.editor as EditorWithConverter).converter;
    const hasAlternateHeaders = converter?.pageStyles?.alternateHeaders === true;

    // Only use 'first' variant when titlePg is enabled (w:titlePg element in OOXML).
    // Without titlePg, even the first page of a section uses 'default'.
    const headerIds = converter?.headerIds as { titlePg?: boolean } | undefined;
    const footerIds = converter?.footerIds as { titlePg?: boolean } | undefined;
    const titlePgEnabled = headerIds?.titlePg === true || footerIds?.titlePg === true;

    if (isFirstPageOfSection && titlePgEnabled) {
      return 'first';
    }
    if (hasAlternateHeaders) {
      return page.number % 2 === 0 ? 'even' : 'odd';
    }
    return 'default';
  }

  #stripFootnoteReserveFromBottomMargin(
    margins: HeaderFooterLayoutOptions['margins'],
    page: Page,
  ): HeaderFooterLayoutOptions['margins'] {
    // Note: property is 'footnoteReserved' (with 'd') as defined in @superdoc/contracts
    const footnoteReserved = page.footnoteReserved ?? 0;
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
   * This method intentionally does NOT use layout-engine geometry. Header/footer
   * editing is driven by a dedicated ProseMirror editor instance mounted inside
   * an overlay host. For selection, we rely on the browser's native DOM selection
   * rectangles from that editor and then remap them into layout coordinates using
   * the current region and body page height.
   *
   * Selection rectangles are therefore derived from:
   * - Native ProseMirror selection → DOM Range → client rects
   * - Header/footer region → pageIndex / local offset
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

    // Compute DOM-based rectangles local to the editor host. We intentionally
    // ignore the numeric from/to arguments and any cached ProseMirror
    // selection, and instead rely solely on the live DOM selection inside the
    // active header/footer editor. This avoids stale selection state when
    // switching between multiple header/footer editors.
    const domSelection = view.dom.ownerDocument?.getSelection?.();
    let domRectList: DOMRect[] = [];

    if (domSelection && domSelection.rangeCount > 0) {
      for (let i = 0; i < domSelection.rangeCount; i += 1) {
        const range = domSelection.getRangeAt(i);
        if (!range) continue;
        const rangeRects = Array.from(range.getClientRects()) as unknown as DOMRect[];
        domRectList.push(...rangeRects);
      }

      // Normalize to a minimal set of rects. Browsers often return both a
      // line-box rect and a text-content rect on the same line; without
      // deduplication this produces overlapping highlights that look like
      // intersecting selections.
      domRectList = deduplicateOverlappingRects(domRectList);
    }

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
    const bodyPageHeight = this.#deps?.getBodyPageHeight() ?? this.#options.defaultPageSize.h;
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

    const results = this.#session.mode === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    if (!results || results.length === 0) {
      console.warn('[HeaderFooterSessionManager] Header/footer layout results not available');
      return null;
    }

    const variant = results.find((entry) => entry.type === this.#session.sectionType) ?? results[0] ?? null;
    if (!variant) {
      console.warn(
        '[HeaderFooterSessionManager] Header/footer variant not found for sectionType:',
        this.#session.sectionType,
      );
      return null;
    }

    const pageWidth = Math.max(1, region.width);
    const pageHeight = Math.max(1, variant.layout.height ?? region.height ?? 1);

    const layoutLike: Layout = {
      pageSize: { w: pageWidth, h: pageHeight },
      pages: variant.layout.pages.map((page: Page) => ({
        number: page.number,
        numberText: page.numberText,
        fragments: page.fragments,
      })),
    };

    return {
      layout: layoutLike,
      blocks: variant.blocks,
      measures: variant.measures,
      region,
    };
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
  updateDecorationProviders(layout: Layout): void {
    this.#headerDecorationProvider = this.createDecorationProvider('header', layout);
    this.#footerDecorationProvider = this.createDecorationProvider('footer', layout);
    this.rebuildRegions(layout);
  }

  /**
   * Create a decoration provider for header or footer rendering.
   */
  createDecorationProvider(kind: 'header' | 'footer', layout: Layout): PageDecorationProvider | undefined {
    const results = kind === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    const layoutsByRId = kind === 'header' ? this.#headerLayoutsByRId : this.#footerLayoutsByRId;

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
    for (const p of layout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
    }

    return (pageNumber, pageMargins, page) => {
      const sectionIndex = page?.sectionIndex ?? 0;
      const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
      const sectionPageNumber =
        typeof firstPageInSection === 'number' ? pageNumber - firstPageInSection + 1 : pageNumber;
      const headerFooterType = multiSectionId
        ? getHeaderFooterTypeForSection(pageNumber, sectionIndex, multiSectionId, { kind, sectionPageNumber })
        : getHeaderFooterType(pageNumber, legacyIdentifier, { kind });

      // Resolve section-specific rId using Word's OOXML inheritance model
      let sectionRId: string | undefined;
      if (page?.sectionRefs && kind === 'header') {
        sectionRId = page.sectionRefs.headerRefs?.[headerFooterType as keyof typeof page.sectionRefs.headerRefs];
        if (!sectionRId && headerFooterType && headerFooterType !== 'default' && sectionIndex > 0 && multiSectionId) {
          const prevSectionIds = multiSectionId.sectionHeaderIds.get(sectionIndex - 1);
          sectionRId = prevSectionIds?.[headerFooterType as keyof typeof prevSectionIds] ?? undefined;
        }
        if (!sectionRId && headerFooterType !== 'default') {
          sectionRId = page.sectionRefs.headerRefs?.default;
        }
      } else if (page?.sectionRefs && kind === 'footer') {
        sectionRId = page.sectionRefs.footerRefs?.[headerFooterType as keyof typeof page.sectionRefs.footerRefs];
        if (!sectionRId && headerFooterType && headerFooterType !== 'default' && sectionIndex > 0 && multiSectionId) {
          const prevSectionIds = multiSectionId.sectionFooterIds.get(sectionIndex - 1);
          sectionRId = prevSectionIds?.[headerFooterType as keyof typeof prevSectionIds] ?? undefined;
        }
        if (!sectionRId && headerFooterType !== 'default') {
          sectionRId = page.sectionRefs.footerRefs?.default;
        }
      }

      if (!headerFooterType) {
        return null;
      }

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
            const pageHeight = page?.size?.h ?? layout.pageSize?.h ?? layoutOptions.pageSize?.h ?? defaultPageSize.h;
            const margins = pageMargins ?? layout.pages[0]?.margins ?? layoutOptions.margins ?? defaultMargins;
            const decorationMargins =
              kind === 'footer' ? this.#stripFootnoteReserveFromBottomMargin(margins, page ?? null) : margins;
            const box = this.#computeDecorationBox(kind, decorationMargins, pageHeight);

            // When a table grid width exceeds the section content width, the layout
            // was computed at the wider effectiveWidth. Use it for the container (SD-1837).
            const effectiveWidth = rIdLayout.effectiveWidth ?? box.width;

            const rawLayoutHeight = rIdLayout.layout.height ?? 0;
            const metrics = this.#computeMetrics(kind, rawLayoutHeight, box, pageHeight, margins?.footer ?? 0);

            const layoutMinY = rIdLayout.layout.minY ?? 0;
            const normalizedFragments =
              layoutMinY < 0 ? fragments.map((f) => ({ ...f, y: f.y - layoutMinY })) : fragments;

            return {
              fragments: normalizedFragments,
              height: metrics.containerHeight,
              contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
              offset: metrics.offset,
              marginLeft: box.x,
              contentWidth: effectiveWidth,
              headerFooterRefId: sectionRId,
              sectionType: headerFooterType,
              minY: layoutMinY,
              box: { x: box.x, y: metrics.offset, width: effectiveWidth, height: metrics.containerHeight },
              hitRegion: { x: box.x, y: metrics.offset, width: effectiveWidth, height: metrics.containerHeight },
            };
          }
        }
      }

      // PRIORITY 2: Fall back to variant-based layout
      if (!results || results.length === 0) {
        return null;
      }

      const variant = results.find((entry) => entry.type === headerFooterType);
      if (!variant || !variant.layout?.pages?.length) {
        return null;
      }

      const slotPage = this.#findPageForNumber(variant.layout.pages, pageNumber);
      if (!slotPage) {
        return null;
      }
      const fragments = slotPage.fragments ?? [];

      const pageHeight = page?.size?.h ?? layout.pageSize?.h ?? layoutOptions.pageSize?.h ?? defaultPageSize.h;
      const margins = pageMargins ?? layout.pages[0]?.margins ?? layoutOptions.margins ?? defaultMargins;
      const decorationMargins =
        kind === 'footer' ? this.#stripFootnoteReserveFromBottomMargin(margins, page ?? null) : margins;
      const box = this.#computeDecorationBox(kind, decorationMargins, pageHeight);

      const rawLayoutHeight = variant.layout.height ?? 0;
      const metrics = this.#computeMetrics(kind, rawLayoutHeight, box, pageHeight, margins?.footer ?? 0);
      const fallbackId = this.#headerFooterManager?.getVariantId(kind, headerFooterType);
      const finalHeaderId = sectionRId ?? fallbackId ?? undefined;

      const layoutMinY = variant.layout.minY ?? 0;
      const normalizedFragments = layoutMinY < 0 ? fragments.map((f) => ({ ...f, y: f.y - layoutMinY })) : fragments;

      return {
        fragments: normalizedFragments,
        height: metrics.containerHeight,
        contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
        offset: metrics.offset,
        marginLeft: box.x,
        contentWidth: box.width,
        headerFooterRefId: finalHeaderId,
        sectionType: headerFooterType,
        minY: layoutMinY,
        box: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
        hitRegion: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
      };
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
    this.#hoverOverlay = null;
    this.#hoverTooltip = null;
    this.#modeBanner = null;
    this.#hoverRegion = null;

    // Clear overlay manager
    this.#overlayManager = null;
  }
}
