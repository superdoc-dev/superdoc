import type { Editor } from '../editors/v1/core/Editor.js';
import type { PresentationEditor } from '../editors/v1/core/presentation-editor/index.js';
import type { DocumentApi } from '@superdoc/document-api';

/**
 * Event names the headless toolbar host subscribes to. Narrow union
 * so a real `SuperDoc` instance (with the SD-3213 closed
 * `SuperDocEventMap`-typed `on`) satisfies the structural host
 * contract. Custom host stubs typed with a wider
 * `on?: (event: string, ...) => void` are still assignable.
 *
 * Split from the UI controller's narrower
 * `SuperDocUIHostEvent` (`ui/types.ts`, 3 events) because the toolbar
 * additionally subscribes to `formatting-marks-change`; requiring the
 * UI controller's `SuperDocLike` stub to accept that 4th event would
 * be wider than the UI side actually consumes.
 */
export type HeadlessToolbarSuperdocHostEvent =
  | 'editorCreate'
  | 'document-mode-change'
  | 'formatting-marks-change'
  | 'zoomChange';

/**
 * The editable surface that currently owns the toolbar context.
 *
 * `note` and `endnote` were added in Phase 2 of the unified-history rollout
 * so toolbar consumers can distinguish note-session typing from header/footer
 * typing. Exhaustive switches on this union must handle all five values.
 */
export type HeadlessToolbarSurface = 'body' | 'header' | 'footer' | 'note' | 'endnote';

/**
 * Runtime list of every built-in toolbar command id, single source of
 * truth for both the public {@link PublicToolbarItemId} union and any
 * consumer-side validation. Exported so config-driven toolbars can
 * verify their id arrays against the canonical set without invoking
 * the controller.
 *
 * Order is the historical declaration order; consumers that depend on
 * iteration order (e.g. building a toolbar that mirrors the union)
 * should not assume it is stable across versions.
 */
export const BUILT_IN_COMMAND_IDS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'font-size',
  'font-family',
  'text-color',
  'highlight-color',
  'link',
  'text-align',
  'line-height',
  'linked-style',
  'bullet-list',
  'numbered-list',
  'indent-increase',
  'indent-decrease',
  'direction-ltr',
  'direction-rtl',
  'undo',
  'redo',
  'ruler',
  'formatting-marks',
  'zoom',
  'zoom-fit-width',
  'document-mode',
  'clear-formatting',
  'copy-format',
  'track-changes-accept-selection',
  'track-changes-reject-selection',
  'image',
  'table-of-contents-insert',
  'table-insert',
  'table-add-row-before',
  'table-add-row-after',
  'table-delete-row',
  'table-add-column-before',
  'table-add-column-after',
  'table-delete-column',
  'table-delete',
  'table-merge-cells',
  'table-split-cell',
  'table-remove-borders',
  'table-fix',
] as const satisfies readonly string[];

export type PublicToolbarItemId = (typeof BUILT_IN_COMMAND_IDS)[number];

/**
 * Maps each command ID to its execute() payload type.
 * Commands with `never` take no payload.
 */
export type ToolbarPayloadMap = {
  bold: never;
  italic: never;
  underline: never;
  strikethrough: never;
  'font-size': string;
  'font-family': string;
  'text-color': string;
  'highlight-color': string;
  link: { href: string | null };
  'text-align': 'left' | 'center' | 'right' | 'justify';
  'line-height': number;
  'linked-style': Record<string, unknown>;
  'bullet-list': never;
  'numbered-list': never;
  'indent-increase': never;
  'indent-decrease': never;
  // Direction + alignmentPolicy are baked into createParagraphDirectionExecute
  // (see headless-toolbar/helpers/paragraph.ts). Headless callers can't
  // override either — payload is `never` so TS catches misuse at the call site.
  'direction-ltr': never;
  'direction-rtl': never;
  undo: never;
  redo: never;
  ruler: never;
  'formatting-marks': never;
  zoom: number;
  'zoom-fit-width': never;
  'document-mode': 'editing' | 'suggesting' | 'viewing';
  'clear-formatting': never;
  'copy-format': never;
  'track-changes-accept-selection': never;
  'track-changes-reject-selection': never;
  image: never;
  'table-of-contents-insert': never;
  'table-insert': { rows: number; cols: number };
  'table-add-row-before': never;
  'table-add-row-after': never;
  'table-delete-row': never;
  'table-add-column-before': never;
  'table-add-column-after': never;
  'table-delete-column': never;
  'table-delete': never;
  'table-merge-cells': never;
  'table-split-cell': never;
  'table-remove-borders': never;
  'table-fix': never;
};

/**
 * Maps each command ID to its snapshot value type.
 * Commands with `undefined` have no value.
 */
export type ToolbarValueMap = {
  bold: undefined;
  italic: undefined;
  underline: undefined;
  strikethrough: undefined;
  'font-size': string;
  'font-family': string;
  'text-color': string | null;
  'highlight-color': string | null;
  link: string | null;
  'text-align': string;
  'line-height': number;
  'linked-style': string;
  'bullet-list': undefined;
  'numbered-list': undefined;
  'indent-increase': undefined;
  'indent-decrease': undefined;
  'direction-ltr': 'ltr' | 'rtl';
  'direction-rtl': 'ltr' | 'rtl';
  undo: undefined;
  redo: undefined;
  ruler: undefined;
  'formatting-marks': undefined;
  zoom: number;
  'zoom-fit-width': undefined;
  'document-mode': string;
  'clear-formatting': undefined;
  'copy-format': undefined;
  'track-changes-accept-selection': undefined;
  'track-changes-reject-selection': undefined;
  image: undefined;
  'table-of-contents-insert': undefined;
  'table-insert': undefined;
  'table-add-row-before': undefined;
  'table-add-row-after': undefined;
  'table-delete-row': undefined;
  'table-add-column-before': undefined;
  'table-add-column-after': undefined;
  'table-delete-column': undefined;
  'table-delete': undefined;
  'table-merge-cells': undefined;
  'table-split-cell': undefined;
  'table-remove-borders': undefined;
  'table-fix': undefined;
};

export type ToolbarCommandState = {
  active: boolean;
  disabled: boolean;
  value?: unknown;
};

// Minimal execution surface for headless toolbar consumers.
//
// `commands` is the heterogeneous registry of editor commands documented
// as an escape hatch for direct access when `execute()` doesn't cover
// the use case (see headless-toolbar/README.md and apps/docs/advanced/
// headless-toolbar.mdx). Each command has its own arg shape, so the
// index-signature value is `(...args: unknown[]) => unknown` instead
// of the previous `any[] => any`. This mirrors the established
// `AnyCommand` pattern used by `EditorCommands` (ChainedCommands.ts:31)
// and drains 3 SD-3213 supported-root any-leak findings. Consumers
// narrow at the call site for the specific command they're invoking.
export type ToolbarTarget = {
  commands: Record<string, (...args: unknown[]) => unknown>;
  doc?: DocumentApi;
};

/**
 * Main public toolbar context.
 * `target` is the primary surface; raw editor-layer objects are advanced escape hatches.
 */
export type ToolbarContext = {
  /**
   * Main public execution surface for toolbar consumers.
   */
  target: ToolbarTarget;
  surface: HeadlessToolbarSurface;
  isEditable: boolean;
  selectionEmpty: boolean;
  /**
   * Advanced escape hatch for raw editor access.
   * Consumers should prefer `target` unless they explicitly need editor internals.
   */
  editor?: Editor;
  /**
   * Advanced escape hatch for presentation-layer access.
   * Consumers should prefer `target` unless they explicitly need presentation internals.
   */
  presentationEditor?: PresentationEditor;
};

/**
 * Active-editor shape accepted at the SuperDoc host boundary.
 *
 * A real SuperDoc exposes the v1 Editor projection through `activeEditor`.
 * The toolbar resolver only builds a command context for command-capable
 * editors.
 */
export type HeadlessToolbarActiveEditor = {
  editorVersion?: 1;
  options?: {
    isHeaderOrFooter?: boolean;
    headerFooterType?: string;
    documentId?: string | null;
    documentMode?: string;
  };
  commands?: Record<string, (...args: unknown[]) => unknown> | null;
  doc?: DocumentApi;
  state?: {
    selection?: {
      empty?: boolean;
    };
  } | null;
  isEditable?: boolean;
  focus?: () => unknown;
  setHighContrastMode?: (isHighContrast: boolean) => unknown;
  presentationEditor?: PresentationEditor | null;
  _presentationEditor?: PresentationEditor | null;
};

/**
 * Typed command states — each command ID maps to its specific value type.
 * Use this instead of `Record<PublicToolbarItemId, ToolbarCommandState>`
 * for type-safe access to snapshot values.
 */
export type ToolbarCommandStates = {
  [Id in PublicToolbarItemId]?: {
    active: boolean;
    disabled: boolean;
    value?: ToolbarValueMap[Id];
  };
};

export type ToolbarSnapshot = {
  context: ToolbarContext | null;
  commands: ToolbarCommandStates;
};

// Object wrapper keeps the subscription payload extensible.
export type ToolbarSubscriptionEvent = {
  snapshot: ToolbarSnapshot;
};

/**
 * Public controller contract.
 */
export type HeadlessToolbarController = {
  getSnapshot(): ToolbarSnapshot;
  subscribe(listener: (event: ToolbarSubscriptionEvent) => void): () => void;
  execute<Id extends PublicToolbarItemId>(
    ...args: ToolbarPayloadMap[Id] extends never ? [id: Id] : [id: Id, payload: ToolbarPayloadMap[Id]]
  ): boolean;
  destroy(): void;
};

/**
 * Loose execute function type for passing as a callback prop to child components.
 * Use `HeadlessToolbarController['execute']` for type-safe direct calls.
 */
export type ToolbarExecuteFn = (id: PublicToolbarItemId, payload?: unknown) => boolean;

/**
 * Common fields shared by every accepted `createHeadlessToolbar` host
 * shape. Pulled out so the two host branches below stay aligned without
 * duplication.
 */
type HeadlessToolbarSuperdocHostBase = {
  activeEditor?: HeadlessToolbarActiveEditor | null;
  config?: {
    layoutEngineOptions?: {
      showFormattingMarks?: boolean;
    };
  };
  toggleFormattingMarks?: () => void;
  // The toolbar only subscribes to these SuperDoc events; keeping the
  // host event names narrow lets strict event maps satisfy this
  // structural host contract. See `HeadlessToolbarSuperdocHostEvent` above.
  on?: (event: HeadlessToolbarSuperdocHostEvent, listener: (...args: any[]) => void) => void;
  off?: (event: HeadlessToolbarSuperdocHostEvent, listener: (...args: any[]) => void) => void;
};

/**
 * Narrow host shape introduced in SD-3213f. `SuperDoc` instances satisfy
 * this branch directly: the two narrow methods replace the raw-store
 * reach that `resolveToolbarSources` and `track-changes.ts` used before.
 */
type HeadlessToolbarSuperdocHostNarrow = HeadlessToolbarSuperdocHostBase & {
  getPresentationEditorForDocument?: (documentId: string) => PresentationEditor | null;
  getComment?: (commentId: string) => Record<string, unknown> | null;
};

/**
 * Legacy host shape kept for pre-SD-3213f typed custom host stubs that
 * pass `superdocStore.documents[]` directly. The runtime still accepts
 * this path; the type is retained so inline object-literal custom hosts
 * compile without `any` casts.
 *
 * `commentsStore` was never advertised on this type pre-SD-3213f, so it
 * is intentionally not added here even though `track-changes.ts`
 * accepts the field at runtime. Adding it now would be public-surface
 * growth, not backward-compat.
 *
 * @deprecated Prefer the narrow host methods on
 *   `HeadlessToolbarSuperdocHostNarrow` (SD-3213f). Will be removed in
 *   a future major after custom host stubs adopt the narrow methods.
 */
type HeadlessToolbarSuperdocHostLegacy = HeadlessToolbarSuperdocHostBase & {
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
};

/**
 * Host accepted by `createHeadlessToolbar({ superdoc })`. Union of the
 * narrow SD-3213f shape (preferred; SuperDoc satisfies it) and the
 * legacy `superdocStore` shape (deprecated; kept so inline custom host
 * stubs from before SD-3213f keep compiling without `any` casts).
 */
export type HeadlessToolbarSuperdocHost = HeadlessToolbarSuperdocHostNarrow | HeadlessToolbarSuperdocHostLegacy;

export type CreateHeadlessToolbarOptions = {
  superdoc: HeadlessToolbarSuperdocHost;
  commands?: PublicToolbarItemId[];
};
