import type { Editor } from '../editors/v1/core/Editor.js';
import type { PresentationEditor } from '../editors/v1/core/presentation-editor/index.js';
import type { DocumentApi } from '@superdoc/document-api';

export type HeadlessToolbarSurface = 'body' | 'header' | 'footer';

export type PublicToolbarItemId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'font-size'
  | 'font-family'
  | 'text-color'
  | 'highlight-color'
  | 'link'
  | 'text-align'
  | 'line-height'
  | 'linked-style'
  | 'bullet-list'
  | 'numbered-list'
  | 'indent-increase'
  | 'indent-decrease'
  | 'undo'
  | 'redo'
  | 'ruler'
  | 'zoom'
  | 'document-mode'
  | 'clear-formatting'
  | 'copy-format'
  | 'track-changes-accept-selection'
  | 'track-changes-reject-selection'
  | 'image'
  | 'table-insert'
  | 'table-add-row-before'
  | 'table-add-row-after'
  | 'table-delete-row'
  | 'table-add-column-before'
  | 'table-add-column-after'
  | 'table-delete-column'
  | 'table-delete'
  | 'table-merge-cells'
  | 'table-split-cell'
  | 'table-remove-borders'
  | 'table-fix';

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
  undo: never;
  redo: never;
  ruler: never;
  zoom: number;
  'document-mode': 'editing' | 'suggesting' | 'viewing';
  'clear-formatting': never;
  'copy-format': never;
  'track-changes-accept-selection': never;
  'track-changes-reject-selection': never;
  image: never;
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
  undo: undefined;
  redo: undefined;
  ruler: undefined;
  zoom: number;
  'document-mode': string;
  'clear-formatting': undefined;
  'copy-format': undefined;
  'track-changes-accept-selection': undefined;
  'track-changes-reject-selection': undefined;
  image: undefined;
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
export type ToolbarTarget = {
  commands: Record<string, (...args: any[]) => any>;
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

export type HeadlessToolbarSuperdocHost = {
  activeEditor?: Editor | null;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  off?: (event: string, listener: (...args: any[]) => void) => void;
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
};

export type CreateHeadlessToolbarOptions = {
  superdoc: HeadlessToolbarSuperdocHost;
  commands?: PublicToolbarItemId[];
};
