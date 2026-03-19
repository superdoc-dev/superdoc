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

export type ToolbarSnapshot = {
  context: ToolbarContext | null;
  commands: Partial<Record<PublicToolbarItemId, ToolbarCommandState>>;
};

// Object wrapper keeps the subscription payload extensible.
export type ToolbarSubscriptionEvent = {
  snapshot: ToolbarSnapshot;
};

/**
 * Public controller contract.
 * Direct `context.target` access remains the base path; `execute(...)` is optional built-in behavior.
 */
export type HeadlessToolbarController = {
  getSnapshot(): ToolbarSnapshot;
  subscribe(listener: (event: ToolbarSubscriptionEvent) => void): () => void;
  execute?: (id: PublicToolbarItemId, payload?: unknown) => boolean;
  destroy(): void;
};

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
