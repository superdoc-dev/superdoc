import type { Editor } from '../core/Editor.js';
import type { PresentationEditor } from '../core/presentation-editor/index.js';

export type HeadlessToolbarSurface = 'body' | 'header' | 'footer';

export type ToolbarCommandState = {
  active: boolean;
  disabled: boolean;
};

/**
 * Minimal public toolbar context for the current POC.
 * This intentionally exposes only normalized toolbar-facing state.
 *
 * Future refinement:
 * - replace `selectionEmpty` with a richer normalized selection shape if needed
 * - consider replacing `Editor | PresentationEditor` with a narrower public target interface
 */
export type ToolbarContext = {
  /**
   * Public command target for the current toolbar context.
   * This may be either the raw Editor or the PresentationEditor wrapper.
   * Consumers should use it for commands/doc access; internal low-level helpers
   * should resolve the active raw editor separately when needed.
   */
  editor: Editor | PresentationEditor;
  surface: HeadlessToolbarSurface;
  isEditable: boolean;
  selectionEmpty: boolean;
};

export type ToolbarSnapshot = {
  context: ToolbarContext | null;
  commands: Record<string, ToolbarCommandState>;
};

/**
 * Minimal controller contract for the current POC.
 *
 * Future refinement:
 * - production-ready built-in toolbar semantics may add optional `execute(...)`
 * - direct `context.editor.commands` / `context.editor.doc` should remain the base path
 */
export type HeadlessToolbarController = {
  getSnapshot(): ToolbarSnapshot;
  subscribe(listener: (snapshot: ToolbarSnapshot) => void): () => void;
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
  commands?: string[];
};
