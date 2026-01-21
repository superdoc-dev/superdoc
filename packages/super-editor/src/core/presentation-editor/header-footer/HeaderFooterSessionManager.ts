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
import { selectionToRects } from '@superdoc/layout-bridge';

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
} from '@superdoc/layout-bridge';

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
  constraints: {
    width: number;
    height: number;
    pageWidth: number;
    margins: { left: number; right: number };
    overflowBaseHeight?: number;
  };
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

    const defaultMargins = this.#options.defaultMargins;

    layout.pages.forEach((page, pageIndex) => {
      const margins = page.margins ?? layoutOptions.margins ?? defaultMargins;
      const actualPageHeight = page.size?.h ?? pageHeight;

      // Header region
      const headerPayload = this.#headerDecorationProvider?.(page.number, margins, page);
      const headerBox = this.#computeDecorationBox('header', margins, actualPageHeight);
      this.#headerRegions.set(pageIndex, {
        kind: 'header',
        headerId: headerPayload?.headerId,
        sectionType:
          headerPayload?.sectionType ?? this.#computeExpectedSectionType('header', page, sectionFirstPageNumbers),
        pageIndex,
        pageNumber: page.number,
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
        headerId: footerPayload?.headerId,
        sectionType:
          footerPayload?.sectionType ?? this.#computeExpectedSectionType('footer', page, sectionFirstPageNumbers),
        pageIndex,
        pageNumber: page.number,
        localX: footerPayload?.hitRegion?.x ?? footerBox.x,
        localY: footerPayload?.hitRegion?.y ?? footerBox.offset,
        width: footerPayload?.hitRegion?.width ?? footerBox.width,
        height: footerPayload?.hitRegion?.height ?? footerBox.height,
        contentHeight: footerPayload?.contentHeight,
        minY: footerPayload?.minY,
      });
    });
  }

  /**
   * Hit test for header/footer regions.
   */
  hitTestRegion(x: number, y: number, layout: Layout | null): HeaderFooterRegion | null {
    if (!layout) return null;

    const layoutOptions = this.#deps?.getLayoutOptions() ?? {};
    const pageHeight = layout.pageSize?.h ?? layoutOptions.pageSize?.h ?? this.#options.defaultPageSize.h;
    const pageGap = layout.pageGap ?? 0;
    if (pageHeight <= 0) return null;

    const pageIndex = Math.max(0, Math.floor(y / (pageHeight + pageGap)));
    const pageLocalY = y - pageIndex * (pageHeight + pageGap);

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
   * Looks up by headerId first, then by sectionType, then falls back to first descriptor.
   */
  resolveDescriptorForRegion(region: HeaderFooterRegion): HeaderFooterDescriptor | null {
    const manager = this.#headerFooterManager;
    if (!manager) return null;
    if (region.headerId) {
      const descriptor = manager.getDescriptorById(region.headerId);
      if (descriptor) return descriptor;
    }
    if (region.sectionType) {
      const descriptors = manager.getDescriptors(region.kind);
      const match = descriptors.find((entry) => entry.variant === region.sectionType);
      if (match) return match;
    }
    const descriptors = manager.getDescriptors(region.kind);
    if (!descriptors.length) {
      console.warn('[HeaderFooterSessionManager] No descriptor found for region:', region);
      return null;
    }
    return descriptors[0];
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

    // Capture headerId before clearing session - needed for cache invalidation
    const editedHeaderId = this.#session.headerId;

    if (this.#activeEditor) {
      this.#activeEditor.setEditable(false);
      this.#activeEditor.setOptions({ documentMode: 'viewing' });
    }

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

      const descriptor = this.#resolveDescriptorForRegion(region);
      if (!descriptor) {
        console.warn('[HeaderFooterSessionManager] No descriptor found for region:', region);
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

      const layout = this.#headerLayoutResults?.[0]?.layout;
      let editor;
      try {
        editor = await this.#headerFooterManager.ensureEditor(descriptor, {
          editorHost,
          availableWidth: region.width,
          availableHeight: region.height,
          currentPageNumber: region.pageNumber,
          totalPageCount: layout?.pages?.length ?? 1,
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

      // Hide layout selection overlay
      this.#overlayManager.hideSelectionOverlay();

      this.#activeEditor = editor;
      this.#session = {
        mode: region.kind,
        kind: region.kind,
        headerId: descriptor.id,
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
    if (region.headerId) {
      const descriptor = this.#headerFooterManager.getDescriptorById(region.headerId);
      if (descriptor) return descriptor;
    }
    if (region.sectionType) {
      const descriptors = this.#headerFooterManager.getDescriptors(region.kind);
      const match = descriptors.find((entry) => entry.variant === region.sectionType);
      if (match) return match;
    }
    const descriptors = this.#headerFooterManager.getDescriptors(region.kind);
    if (!descriptors.length) {
      console.warn('[HeaderFooterSessionManager] No descriptor found for region:', region);
      return null;
    }
    return descriptors[0];
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
      headerId: this.#session.headerId,
      sectionType: this.#session.sectionType,
    });

    const message =
      this.#session.mode === 'body'
        ? 'Exited header/footer edit mode.'
        : `Editing ${this.#session.kind === 'header' ? 'Header' : 'Footer'} (${this.#session.sectionType ?? 'default'})`;
    this.#callbacks.onAnnounce?.(message);
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
      margins: { left: marginLeft, right: marginRight },
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
   */
  computeSelectionRects(from: number, to: number): LayoutRect[] {
    const context = this.getContext();
    if (!context) {
      console.warn('[HeaderFooterSessionManager] Header/footer context unavailable for selection rects', {
        mode: this.#session.mode,
        pageIndex: this.#session.pageIndex,
      });
      return [];
    }

    const bodyPageHeight = this.#deps?.getBodyPageHeight() ?? this.#options.defaultPageSize.h;
    const rects = selectionToRects(context.layout, context.blocks, context.measures, from, to, undefined) ?? [];
    const headerPageHeight = context.layout.pageSize?.h ?? context.region.height ?? 1;

    return rects.map((rect: LayoutRect) => {
      const headerLocalY = rect.y - rect.pageIndex * headerPageHeight;
      return {
        pageIndex: context.region.pageIndex,
        x: rect.x + context.region.localX,
        y: context.region.pageIndex * bodyPageHeight + context.region.localY + headerLocalY,
        width: rect.width,
        height: rect.height,
      };
    });
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

  // ===========================================================================
  // Default Creation
  // ===========================================================================

  /**
   * Create a default header/footer when none exists.
   */
  createDefault(region: HeaderFooterRegion): void {
    const converter = (this.#options.editor as EditorWithConverter).converter;

    if (!converter) {
      return;
    }

    const variant = region.sectionType ?? 'default';

    if (region.kind === 'header' && typeof converter.createDefaultHeader === 'function') {
      converter.createDefaultHeader(variant);
    } else if (region.kind === 'footer' && typeof converter.createDefaultFooter === 'function') {
      converter.createDefaultFooter(variant);
    }

    // Update legacy identifier
    this.#headerFooterIdentifier = extractIdentifierFromConverter(converter);
  }

  /**
   * Update the header/footer identifier from converter.
   */
  updateIdentifierFromConverter(): void {
    const converter = (this.#options.editor as Editor & { converter?: unknown }).converter;
    this.#headerFooterIdentifier = extractIdentifierFromConverter(converter);
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

      // PRIORITY 1: Try per-rId layout
      if (sectionRId && layoutsByRId.has(sectionRId)) {
        const rIdLayout = layoutsByRId.get(sectionRId);
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
              contentWidth: box.width,
              headerId: sectionRId,
              sectionType: headerFooterType,
              minY: layoutMinY,
              box: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
              hitRegion: { x: box.x, y: metrics.offset, width: box.width, height: metrics.containerHeight },
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
        headerId: finalHeaderId,
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
