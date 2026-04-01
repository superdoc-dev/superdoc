import type { CreateHeadlessToolbarOptions } from './types.js';
import { resolveToolbarSources } from './resolve-toolbar-sources.js';

const subscribeToSuperdocEvents = (
  superdoc: CreateHeadlessToolbarOptions['superdoc'],
  onChange: () => void,
): (() => void) | null => {
  if (!superdoc?.on || !superdoc?.off) return null;

  superdoc.on('editorCreate', onChange);
  superdoc.on('document-mode-change', onChange);
  superdoc.on('zoomChange', onChange);

  return () => {
    superdoc.off?.('editorCreate', onChange);
    superdoc.off?.('document-mode-change', onChange);
    superdoc.off?.('zoomChange', onChange);
  };
};

const subscribeToEditorEvents = (
  editor: ReturnType<typeof resolveToolbarSources>['activeEditor'],
  onChange: () => void,
): (() => void) | null => {
  if (!editor?.on || !editor?.off) return null;

  editor.on('focus', onChange);
  editor.on('selectionUpdate', onChange);
  editor.on('transaction', onChange);

  return () => {
    editor.off?.('focus', onChange);
    editor.off?.('selectionUpdate', onChange);
    editor.off?.('transaction', onChange);
  };
};

const subscribeToPresentationEvents = (
  presentationEditor: ReturnType<typeof resolveToolbarSources>['presentationEditor'],
  onChange: () => void,
): (() => void) | null => {
  if (!presentationEditor?.on || !presentationEditor?.off) return null;

  presentationEditor.on('headerFooterEditingContext', onChange);
  presentationEditor.on('headerFooterUpdate', onChange);
  presentationEditor.on('headerFooterTransaction', onChange);

  return () => {
    presentationEditor.off?.('headerFooterEditingContext', onChange);
    presentationEditor.off?.('headerFooterUpdate', onChange);
    presentationEditor.off?.('headerFooterTransaction', onChange);
  };
};

// Central event wiring for the headless toolbar pipeline.
export const subscribeToolbarEvents = (options: CreateHeadlessToolbarOptions, onChange: () => void): (() => void) => {
  const { activeEditor: editor, presentationEditor } = resolveToolbarSources(options.superdoc);
  const unbindSuperdocEvents = subscribeToSuperdocEvents(options.superdoc, onChange);
  const unbindEditorEvents = subscribeToEditorEvents(editor, onChange);
  const unbindPresentationEvents = subscribeToPresentationEvents(presentationEditor, onChange);

  return () => {
    unbindEditorEvents?.();
    unbindPresentationEvents?.();
    unbindSuperdocEvents?.();
  };
};
