import type { Editor } from '../editors/v1/core/Editor.js';
import type { PresentationEditor } from '../editors/v1/core/presentation-editor/index.js';
import type { HeadlessToolbarSuperdocHost, PublicToolbarItemId, ToolbarCommandState, ToolbarContext } from './types.js';

export type ResolvedToolbarSources = {
  activeEditor: Editor | null;
  presentationEditor: PresentationEditor | null;
  context: ToolbarContext | null;
};

export type RegistryStateDeriver = (params: {
  context: ToolbarContext | null;
  superdoc: HeadlessToolbarSuperdocHost;
}) => ToolbarCommandState;

export type RegistryExecutor = (params: {
  context: ToolbarContext | null;
  superdoc: HeadlessToolbarSuperdocHost;
  payload?: unknown;
}) => boolean;

export type BuiltInToolbarRegistryEntry = {
  id: PublicToolbarItemId;
  state: RegistryStateDeriver;
  directCommandName?: string;
  execute?: RegistryExecutor;
};
