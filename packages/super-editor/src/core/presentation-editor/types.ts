/**
 * Type definitions for PresentationEditor
 *
 * This module contains all type definitions used by PresentationEditor,
 * both public (exported) and internal types.
 */

import type { Editor } from '../Editor.js';
import type { TrackedChangesMode, FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { LayoutMode, RulerOptions } from '@superdoc/painter-dom';
import type * as Y from 'yjs';

// =============================================================================
// Public Types (exported from index.ts)
// =============================================================================

export type PageSize = {
  w: number;
  h: number;
};

export type PageMargins = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  header?: number;
  footer?: number;
};

export type VirtualizationOptions = {
  enabled?: boolean;
  window?: number;
  overscan?: number;
  gap?: number;
  paddingTop?: number;
};

/**
 * User metadata for remote collaborators.
 * Exported as a standalone type for external consumers building custom presence UI.
 */
export type RemoteUserInfo = {
  /** User's display name (optional) */
  name?: string;
  /** User's email address (optional) */
  email?: string;
  /** Hex color code for this user's cursor/selection */
  color: string;
};

/**
 * Normalized remote cursor state for a single collaborator.
 * Contains absolute ProseMirror positions and user metadata.
 */
export type RemoteCursorState = {
  /** Yjs client ID for this collaborator */
  clientId: number;
  /** User metadata (name, email, color) */
  user: RemoteUserInfo;
  /** Selection anchor (absolute PM position) */
  anchor: number;
  /** Selection head/caret position (absolute PM position) */
  head: number;
  /** Timestamp of last update (for recency-based rendering limits) */
  updatedAt: number;
};

/**
 * Configuration options for remote cursor presence rendering.
 * Controls how collaborator cursors and selections appear in the layout.
 */
export type PresenceOptions = {
  /** Enable remote cursor rendering. Default: true */
  enabled?: boolean;
  /** Show name labels above remote cursors. Default: true */
  showLabels?: boolean;
  /** Maximum number of remote cursors to render (performance guardrail). Default: 20 */
  maxVisible?: number;
  /** Custom formatter for user labels. Default: user.name ?? user.email */
  labelFormatter?: (user: RemoteUserInfo) => string;
  /** Opacity for remote selection highlights (0-1). Default: 0.35 */
  highlightOpacity?: number;
  /** Time in milliseconds before removing inactive cursors. Default: 300000 (5 minutes) */
  staleTimeout?: number;
};

export type TrackedChangesOverrides = {
  mode?: TrackedChangesMode;
  enabled?: boolean;
};

export type LayoutEngineOptions = {
  pageSize?: PageSize;
  margins?: PageMargins;
  zoom?: number;
  virtualization?: VirtualizationOptions;
  pageStyles?: Record<string, unknown>;
  debugLabel?: string;
  layoutMode?: LayoutMode;
  trackedChanges?: TrackedChangesOverrides;
  /** Emit comment positions while in viewing mode (used to render comment highlights). */
  emitCommentPositionsInViewing?: boolean;
  /** Render comment highlights while in viewing mode. */
  enableCommentsInViewing?: boolean;
  /** Collaboration cursor/presence configuration */
  presence?: PresenceOptions;
  /**
   * Per-page ruler options.
   * When enabled, renders a horizontal ruler at the top of each page showing
   * inch marks and optionally margin handles for interactive margin adjustment.
   */
  ruler?: RulerOptions;
};

export type PresentationEditorOptions = ConstructorParameters<typeof Editor>[0] & {
  /**
   * Host element where the layout-engine powered UI should render.
   */
  element: HTMLElement;
  /**
   * Layout-specific configuration consumed by PresentationEditor.
   */
  layoutEngineOptions?: LayoutEngineOptions;
  /**
   * Document mode for the editor. Determines editability and tracked changes behavior.
   * @default 'editing'
   */
  documentMode?: 'editing' | 'viewing' | 'suggesting';
  /**
   * Collaboration provider with awareness support (e.g., WebsocketProvider from y-websocket).
   * Required for remote cursor rendering.
   */
  collaborationProvider?: {
    awareness?: AwarenessWithSetField;
    disconnect?: () => void;
  } | null;
  /**
   * Whether to disable the context menu.
   * @default false
   */
  disableContextMenu?: boolean;
};

/**
 * Telemetry payload for remote cursor render events.
 * Provides performance metrics for monitoring collaboration cursor rendering.
 */
export type RemoteCursorsRenderPayload = {
  /** Total number of collaborators with cursors */
  collaboratorCount: number;
  /** Number of cursors actually rendered (after maxVisible limit) */
  visibleCount: number;
  /** Time taken to render all cursors in milliseconds */
  renderTimeMs: number;
};

/**
 * Telemetry payload for layout updates.
 */
export type LayoutUpdatePayload = {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  metrics: LayoutMetrics;
};

/**
 * Event payload emitted when an image is selected in the editor.
 */
export type ImageSelectedEvent = {
  /** The DOM element representing the selected image */
  element: HTMLElement;
  /** The layout-engine block ID for the image (null for inline images) */
  blockId: string | null;
  /** The ProseMirror document position where the image node starts */
  pmStart: number;
};

/**
 * Event payload emitted when an image is deselected in the editor.
 */
export type ImageDeselectedEvent = {
  /** The block ID of the previously selected image (may be a synthetic ID like "inline-{position}") */
  blockId: string;
};

/**
 * Discriminated union for all telemetry events.
 * Use TypeScript's type narrowing to handle each event type safely.
 */
export type TelemetryEvent =
  | { type: 'layout'; data: LayoutUpdatePayload }
  | { type: 'error'; data: LayoutError }
  | { type: 'remoteCursorsRender'; data: RemoteCursorsRenderPayload };

// =============================================================================
// Internal Types (used within PresentationEditor implementation)
// =============================================================================

/**
 * Awareness state structure from y-protocols.
 * Represents the state stored for each collaborator in the awareness protocol.
 */
export type AwarenessState = {
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
  user?: {
    name?: string;
    email?: string;
    color?: string;
  };
  [key: string]: unknown;
};

/**
 * Cursor position data stored in awareness state.
 * Contains relative Yjs positions for anchor and head.
 */
export type AwarenessCursorData = {
  /** Relative Yjs position for selection anchor */
  anchor: Y.RelativePosition;
  /** Relative Yjs position for selection head (caret) */
  head: Y.RelativePosition;
};

/**
 * Extended awareness interface that includes the setLocalStateField method.
 * The base Awareness type from y-protocols has this method but it's not always
 * included in type definitions, so we extend it here for type safety.
 */
export interface AwarenessWithSetField {
  clientID: number;
  getStates: () => Map<number, AwarenessState>;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  /**
   * Update a specific field in the local awareness state.
   * @param field - The field name to update (e.g., 'cursor', 'user')
   * @param value - The value to set for the field
   */
  setLocalStateField: (field: string, value: unknown) => void;
}

/**
 * Cell anchor state for table cell drag selection.
 *
 * Lifecycle:
 * - Created when a drag operation starts inside a table cell (#setCellAnchor)
 * - Persists throughout the drag to track the anchor cell
 * - Cleared when drag ends (#clearCellAnchor) or document changes
 *
 * Used by the cell selection state machine to determine when to transition
 * from text selection to cell selection mode during table drag operations.
 */
export type CellAnchorState = {
  /** PM position of the table node */
  tablePos: number;
  /** PM position at the start of the anchor cell */
  cellPos: number;
  /** Row index of the anchor cell (0-based) */
  cellRowIndex: number;
  /** Column index of the anchor cell (0-based) */
  cellColIndex: number;
  /** Cached reference to table block ID for performance */
  tableBlockId: string;
};

/**
 * Type-safe interface for Editor instances with SuperConverter attached.
 * Used to access converter-specific properties for header/footer management
 * without resorting to type assertions throughout the codebase.
 */
export interface EditorWithConverter extends Editor {
  converter: Editor['converter'] & {
    pageStyles?: { alternateHeaders?: boolean };
    headerIds?: { default?: string; first?: string; even?: string; odd?: string };
    footerIds?: { default?: string; first?: string; even?: string; odd?: string };
    createDefaultHeader?: (variant: string) => string;
    createDefaultFooter?: (variant: string) => string;
    footnotes?: Array<{
      id: string;
      content?: unknown[];
    }>;
  };
}

export type LayoutState = {
  blocks: FlowBlock[];
  measures: Measure[];
  layout: Layout | null;
  bookmarks: Map<string, number>;
  anchorMap?: Map<string, number>;
};

export type FootnoteReference = { id: string; pos: number };

export type FootnotesLayoutInput = {
  refs: FootnoteReference[];
  blocksById: Map<string, FlowBlock[]>;
  gap?: number;
  topPadding?: number;
  dividerHeight?: number;
  separatorSpacingBefore?: number;
};

export type LayoutMetrics = {
  durationMs: number;
  blockCount: number;
  pageCount: number;
};

export type LayoutError = {
  phase: 'initialization' | 'render';
  error: Error;
  timestamp: number;
};

export type LayoutRect = { x: number; y: number; width: number; height: number; pageIndex: number };

export type RangeRect = {
  pageIndex: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type HeaderFooterMode = 'body' | 'header' | 'footer';

export type HeaderFooterSession = {
  mode: HeaderFooterMode;
  kind?: 'header' | 'footer';
  headerId?: string | null;
  sectionType?: string | null;
  pageIndex?: number;
  pageNumber?: number;
};

export type HeaderFooterRegion = {
  kind: 'header' | 'footer';
  headerId?: string;
  sectionType?: string;
  pageIndex: number;
  pageNumber: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
  contentHeight?: number;
  /** Minimum Y coordinate from layout (can be negative if content extends above y=0) */
  minY?: number;
};

export type HeaderFooterLayoutContext = {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  region: HeaderFooterRegion;
};

export type PendingMarginClick =
  | { pointerId: number; kind: 'aboveFirstLine' }
  | { pointerId: number; kind: 'left' | 'right'; layoutEpoch: number; pmStart: number; pmEnd: number };

/**
 * Extended editor view type with a flag indicating the focus method has been wrapped
 * to prevent unwanted scroll behavior when the hidden editor receives focus.
 *
 * @remarks
 * This flag is set by {@link PresentationEditor#wrapHiddenEditorFocus} to ensure
 * the wrapping is idempotent (applied only once per view instance).
 */
export interface EditorViewWithScrollFlag {
  /** Flag indicating focus wrapping has been applied to prevent scroll on focus */
  __sdPreventScrollFocus?: boolean;
}

/**
 * Extended function type that may have a mock property, used to detect test mocks.
 *
 * @remarks
 * During testing, mocking libraries like Vitest often attach a `mock` property to
 * mocked functions. We check for this property to avoid wrapping already-mocked
 * focus functions, which could interfere with test assertions or cause test failures.
 */
export interface PotentiallyMockedFunction {
  /** Property present on mocked functions in test environments */
  mock?: unknown;
}
