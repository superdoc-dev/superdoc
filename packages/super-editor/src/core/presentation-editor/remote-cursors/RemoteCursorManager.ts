/**
 * RemoteCursorManager - Manages remote cursor rendering for collaborative editing.
 *
 * This class encapsulates all the state and logic for rendering remote collaborator
 * cursors and selections in PresentationEditor. It handles:
 * - Awareness subscription lifecycle (setup/teardown)
 * - Cursor state normalization from Yjs relative positions to PM absolute positions
 * - DOM overlay management for cursor rendering
 * - Throttling and scheduling for performance optimization
 * - Scroll listener for virtualization updates
 *
 * @module remote-cursors/RemoteCursorManager
 */

import type { EditorState } from 'prosemirror-state';
import { absolutePositionToRelativePosition, ySyncPluginKey } from 'y-prosemirror';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { PageGeometryHelper } from '@superdoc/layout-bridge';

import type {
  RemoteCursorState,
  RemoteUserInfo,
  PresenceOptions,
  AwarenessCursorData,
  AwarenessWithSetField,
} from '../types.js';
import { normalizeAwarenessStates } from './RemoteCursorAwareness.js';
import { renderRemoteCursors } from './RemoteCursorRendering.js';

/**
 * Minimal interface for collaboration provider with awareness.
 */
type CollaborationProviderLike = {
  awareness?: AwarenessWithSetField | null;
  disconnect?: () => void;
} | null;

/**
 * Caret geometry in page-local layout space.
 */
type CaretLayout = { pageIndex: number; x: number; y: number; height: number };

/**
 * Configuration options for RemoteCursorManager.
 */
export type RemoteCursorManagerOptions = {
  /** The host element where the editor is mounted (for scroll events) */
  visibleHost: HTMLElement;
  /** The overlay element to render cursors into */
  remoteCursorOverlay: HTMLElement;
  /** Presence configuration options */
  presence?: PresenceOptions;
  /** Collaboration provider with awareness support */
  collaborationProvider?: CollaborationProviderLike;
  /** Fallback color palette for users without custom colors */
  fallbackColors: readonly string[];
  /** Style constants for cursor rendering */
  cursorStyles: CursorStylesLike;
  /** Maximum selection rectangles per user (performance guardrail) */
  maxSelectionRectsPerUser: number;
  /** Default page height for coordinate calculations */
  defaultPageHeight: number;
};

/**
 * Style constants for remote cursor rendering.
 */
type CursorStylesLike = {
  CARET_WIDTH: number;
  LABEL_FONT_SIZE: number;
  LABEL_PADDING: string;
  LABEL_OFFSET: string;
  SELECTION_BORDER_RADIUS: string;
  MAX_LABEL_LENGTH: number;
};

/**
 * Dependencies required for rendering remote cursors.
 * These are passed from PresentationEditor as they change with layout updates.
 */
export type RenderDependencies = {
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  pageGeometryHelper: PageGeometryHelper | null;
  pageHeight: number;
  computeCaretLayoutRect: (pos: number) => CaretLayout | null;
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => { x: number; y: number } | null;
};

/**
 * Telemetry payload for remote cursor render events.
 */
export type RemoteCursorsTelemetry = {
  collaboratorCount: number;
  visibleCount: number;
  renderTimeMs: number;
};

/**
 * Debounce delay for scroll events (milliseconds).
 * Set to 32ms (~31fps) for responsive cursor updates during scrolling.
 */
const SCROLL_DEBOUNCE_MS = 32;

/**
 * Default timeout for stale collaborator cleanup (milliseconds).
 */
const DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Throttle window for remote cursor updates (milliseconds).
 * Set to 16ms to target ~60fps rendering.
 */
const THROTTLE_MS = 16;

/**
 * Manages remote cursor state and rendering for collaborative editing.
 *
 * This class is designed to be instantiated by PresentationEditor and owns all
 * the state related to remote cursor rendering. It delegates actual rendering
 * to the helper functions in RemoteCursorAwareness.ts and RemoteCursorRendering.ts.
 */
export class RemoteCursorManager {
  #options: RemoteCursorManagerOptions;
  #remoteCursorState: Map<number, RemoteCursorState> = new Map();
  #remoteCursorElements: Map<number, HTMLElement> = new Map();
  #remoteCursorDirty = false;
  #remoteCursorUpdateScheduled = false;
  #lastRemoteCursorRenderTime = 0;
  #remoteCursorThrottleTimeout: number | null = null;
  #awarenessCleanup: (() => void) | null = null;
  #scrollCleanup: (() => void) | null = null;
  #scrollTimeout: number | undefined = undefined;
  #isSetup = false;

  /** Callback for telemetry emission */
  #onTelemetry: ((data: RemoteCursorsTelemetry) => void) | null = null;

  /** Callback for cursor updates (emits cursors to host) */
  #onCursorsUpdate: ((cursors: RemoteCursorState[]) => void) | null = null;

  constructor(options: RemoteCursorManagerOptions) {
    this.#options = options;
  }

  /**
   * Get the current remote cursor state map.
   * Useful for emitting cursor data to host consumers.
   */
  get state(): Map<number, RemoteCursorState> {
    return this.#remoteCursorState;
  }

  /**
   * Get the cursor elements map for testing/debugging.
   */
  get elements(): Map<number, HTMLElement> {
    return this.#remoteCursorElements;
  }

  /**
   * Check if the manager is currently set up.
   */
  get isSetup(): boolean {
    return this.#isSetup;
  }

  /**
   * Set a telemetry callback to receive render metrics.
   */
  setTelemetryCallback(callback: ((data: RemoteCursorsTelemetry) => void) | null): void {
    this.#onTelemetry = callback;
  }

  /**
   * Set a callback to receive cursor update events.
   */
  setCursorsUpdateCallback(callback: ((cursors: RemoteCursorState[]) => void) | null): void {
    this.#onCursorsUpdate = callback;
  }

  /**
   * Setup awareness event subscriptions for remote cursor tracking.
   * Includes scroll listener for virtualization updates.
   * Called after collaborationReady event when ySync plugin is initialized.
   * Prevents double-initialization by cleaning up existing subscriptions first.
   */
  setup(): void {
    const provider = this.#options.collaborationProvider;
    if (!provider?.awareness) return;

    // Prevent double-initialization: cleanup existing subscriptions
    this.#cleanupSubscriptions();

    const handleAwarenessChange = () => {
      this.#remoteCursorDirty = true;
      this.scheduleUpdate();
    };

    provider.awareness.on('change', handleAwarenessChange);
    provider.awareness.on('update', handleAwarenessChange);

    // Store cleanup function for awareness subscriptions
    this.#awarenessCleanup = () => {
      provider.awareness?.off('change', handleAwarenessChange);
      provider.awareness?.off('update', handleAwarenessChange);
    };

    // Setup scroll listener for virtualization updates
    const handleScroll = () => {
      if (this.#remoteCursorState.size > 0) {
        this.#remoteCursorDirty = true;
        this.scheduleUpdate();
      }
    };

    // Debounce scroll updates to avoid excessive re-renders
    const debouncedHandleScroll = () => {
      if (this.#scrollTimeout !== undefined) {
        clearTimeout(this.#scrollTimeout);
      }
      this.#scrollTimeout = window.setTimeout(handleScroll, SCROLL_DEBOUNCE_MS);
    };

    this.#options.visibleHost.addEventListener('scroll', debouncedHandleScroll, { passive: true });

    // Store cleanup function for scroll listener
    this.#scrollCleanup = () => {
      if (this.#scrollTimeout !== undefined) {
        clearTimeout(this.#scrollTimeout);
        this.#scrollTimeout = undefined;
      }
      this.#options.visibleHost.removeEventListener('scroll', debouncedHandleScroll);
    };

    this.#isSetup = true;

    // Trigger initial normalization for existing collaborators
    handleAwarenessChange();
  }

  /**
   * Clean up awareness and scroll subscriptions.
   */
  #cleanupSubscriptions(): void {
    if (this.#awarenessCleanup) {
      this.#awarenessCleanup();
      this.#awarenessCleanup = null;
    }
    if (this.#scrollCleanup) {
      this.#scrollCleanup();
      this.#scrollCleanup = null;
    }
  }

  /**
   * Mark the cursor state as dirty, requiring a re-render.
   */
  markDirty(): void {
    this.#remoteCursorDirty = true;
  }

  /**
   * Schedule a remote cursor update using microtask + throttle-based rendering.
   *
   * Uses queueMicrotask to defer cursor normalization until after all
   * synchronous code completes. This fixes a race condition where awareness events
   * fire before the ProseMirror state is updated with Yjs document changes.
   */
  scheduleUpdate(): void {
    // Skip scheduling entirely when presence is disabled
    if (this.#options.presence?.enabled === false) return;

    // Already have a pending update scheduled
    if (this.#remoteCursorUpdateScheduled) return;
    this.#remoteCursorUpdateScheduled = true;

    // Use microtask to defer until after PM state is synced with Yjs
    queueMicrotask(() => {
      if (!this.#remoteCursorUpdateScheduled) return; // Was cancelled

      const now = performance.now();
      const elapsed = now - this.#lastRemoteCursorRenderTime;

      // If enough time has passed, render now
      if (elapsed >= THROTTLE_MS) {
        // Clear any pending trailing edge timeout
        if (this.#remoteCursorThrottleTimeout !== null) {
          clearTimeout(this.#remoteCursorThrottleTimeout);
          this.#remoteCursorThrottleTimeout = null;
        }
        this.#remoteCursorUpdateScheduled = false;
        this.#lastRemoteCursorRenderTime = now;
        this.#pendingUpdateCallback?.();
        return;
      }

      // Within throttle window: schedule trailing edge render
      const remaining = THROTTLE_MS - elapsed;
      this.#remoteCursorThrottleTimeout = window.setTimeout(() => {
        this.#remoteCursorUpdateScheduled = false;
        this.#remoteCursorThrottleTimeout = null;
        this.#lastRemoteCursorRenderTime = performance.now();
        this.#pendingUpdateCallback?.();
      }, remaining) as unknown as number;
    });
  }

  /** Callback to invoke when scheduled update fires */
  #pendingUpdateCallback: (() => void) | null = null;

  /**
   * Set the callback to invoke when a scheduled update fires.
   * This allows PresentationEditor to provide the update logic with current state.
   */
  setUpdateCallback(callback: (() => void) | null): void {
    this.#pendingUpdateCallback = callback;
  }

  /**
   * Update remote cursor state by normalizing awareness states and rendering.
   * Call this when awareness state has changed.
   */
  update(editorState: EditorState | null, deps: RenderDependencies): void {
    // Gate behind presence.enabled check
    if (this.#options.presence?.enabled === false) {
      this.#clearState();
      return;
    }

    if (!this.#remoteCursorDirty) return;
    this.#remoteCursorDirty = false;

    // Track render start time for telemetry
    const startTime = performance.now();

    // Normalize awareness states to PM positions
    this.#remoteCursorState = normalizeAwarenessStates({
      provider: this.#options.collaborationProvider ?? null,
      editorState,
      previousState: this.#remoteCursorState,
      fallbackColors: this.#options.fallbackColors,
      staleTimeoutMs: this.#options.presence?.staleTimeout ?? DEFAULT_STALE_TIMEOUT_MS,
    });

    // Render cursors with existing state
    this.render(deps);

    // Emit event for host consumption
    if (this.#onCursorsUpdate) {
      this.#onCursorsUpdate(Array.from(this.#remoteCursorState.values()));
    }

    // Optional telemetry for monitoring performance
    if (this.#onTelemetry) {
      const renderTime = performance.now() - startTime;
      const maxVisible = this.#options.presence?.maxVisible ?? 20;
      const visibleCount = Math.min(this.#remoteCursorState.size, maxVisible);
      this.#onTelemetry({
        collaboratorCount: this.#remoteCursorState.size,
        visibleCount,
        renderTimeMs: renderTime,
      });
    }
  }

  /**
   * Render remote cursors from existing state without normalization.
   * Use this when only layout geometry has changed, not cursor positions.
   */
  render(deps: RenderDependencies): void {
    const { layout, blocks, measures } = deps;

    if (!layout || !blocks || !measures) {
      // Layout not ready, skip rendering
      return;
    }

    const doc = this.#options.visibleHost.ownerDocument ?? document;

    renderRemoteCursors({
      layout,
      blocks,
      measures,
      pageGeometryHelper: deps.pageGeometryHelper,
      presence: this.#options.presence,
      remoteCursorState: this.#remoteCursorState,
      remoteCursorElements: this.#remoteCursorElements,
      remoteCursorOverlay: this.#options.remoteCursorOverlay,
      doc,
      computeCaretLayoutRect: deps.computeCaretLayoutRect,
      convertPageLocalToOverlayCoords: deps.convertPageLocalToOverlayCoords,
      fallbackColors: this.#options.fallbackColors,
      cursorStyles: this.#options.cursorStyles,
      maxSelectionRectsPerUser: this.#options.maxSelectionRectsPerUser,
      defaultPageHeight: this.#options.defaultPageHeight,
      fallbackPageHeight: deps.pageHeight,
    });
  }

  /**
   * Update local cursor position in awareness.
   *
   * CRITICAL FIX: The y-prosemirror cursor plugin only updates awareness when
   * view.hasFocus() returns true. In PresentationEditor, the hidden PM EditorView
   * may not have DOM focus. This method bypasses the focus check and manually
   * updates awareness with the current selection position.
   */
  updateLocalCursor(editorState: EditorState | null): void {
    const provider = this.#options.collaborationProvider;
    if (!provider?.awareness) return;

    // Runtime validation: ensure setLocalStateField method exists
    if (typeof provider.awareness.setLocalStateField !== 'function') {
      return;
    }

    if (!editorState) return;

    const ystate = ySyncPluginKey.getState(editorState);
    if (!ystate?.binding?.mapping) return;

    const { selection } = editorState;
    const { anchor, head } = selection;

    try {
      // Convert PM positions to Yjs relative positions
      const relAnchor = absolutePositionToRelativePosition(anchor, ystate.type, ystate.binding.mapping);
      const relHead = absolutePositionToRelativePosition(head, ystate.type, ystate.binding.mapping);

      if (relAnchor && relHead) {
        // Update awareness with cursor position
        const cursorData: AwarenessCursorData = {
          anchor: relAnchor,
          head: relHead,
        };
        provider.awareness.setLocalStateField('cursor', cursorData);
      }
    } catch {
      // Silently ignore conversion errors - can happen during document restructuring
    }
  }

  /**
   * Clear all cursor state and DOM elements.
   */
  #clearState(): void {
    this.#remoteCursorState.clear();
    this.#remoteCursorElements.clear();
    if (this.#options.remoteCursorOverlay) {
      this.#options.remoteCursorOverlay.innerHTML = '';
    }
  }

  /**
   * Update presence options at runtime.
   */
  updatePresenceOptions(presence: PresenceOptions | undefined): void {
    this.#options.presence = presence;
  }

  /**
   * Check if there are any remote cursors to render.
   */
  hasRemoteCursors(): boolean {
    return this.#remoteCursorState.size > 0;
  }

  /**
   * Clean up all resources.
   * Call this when destroying the PresentationEditor.
   */
  destroy(): void {
    // Cancel pending throttle timeout
    if (this.#remoteCursorThrottleTimeout !== null) {
      clearTimeout(this.#remoteCursorThrottleTimeout);
      this.#remoteCursorThrottleTimeout = null;
    }

    // Clean up subscriptions
    this.#cleanupSubscriptions();

    // Clear state
    this.#remoteCursorState.clear();
    this.#remoteCursorElements.clear();

    // Clear callbacks
    this.#pendingUpdateCallback = null;
    this.#onTelemetry = null;
    this.#onCursorsUpdate = null;

    this.#isSetup = false;
  }
}
