import type { Editor } from '../core/Editor.js';
import type { PresentationEditor } from '../core/presentation-editor/index.js';
import type { ToolbarContext } from './types.js';

export type ResolvedToolbarSources = {
  activeEditor: Editor | null;
  presentationEditor: PresentationEditor | null;
  context: ToolbarContext | null;
};
