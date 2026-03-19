import type { Editor } from '../core/Editor.js';
import type { PresentationEditor } from '../core/presentation-editor/index.js';
import type { HeadlessToolbarSurface, ToolbarContext } from './types.js';
import type { ResolvedToolbarSources } from './internal-types.js';

// Headless toolbar resolution has to bridge two editor-layer shapes:
// - raw Editor instances
// - PresentationEditor, which owns body/header/footer routing
//
// A toolbar consumer should not have to understand that split.
// This module normalizes those sources into one resolved toolbar context.

const resolveSurface = (editor: PresentationEditor): HeadlessToolbarSurface => {
  const activeEditor = editor.getActiveEditor();
  if (activeEditor?.options?.isHeaderOrFooter) {
    const headerFooterType = activeEditor.options?.headerFooterType;
    if (headerFooterType === 'footer') return 'footer';
    if (headerFooterType === 'header') return 'header';
  }

  const mode = editor.getEffectiveSelectionContext?.()?.surface;
  if (mode === 'header' || mode === 'footer') return mode;
  return 'body';
};

const resolveSelectionEmpty = (editor: Editor | PresentationEditor): boolean => {
  const selection = editor.state?.selection;
  return selection?.empty ?? true;
};

const resolvePresentationEditor = (superdoc: {
  activeEditor?: Editor | null;
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
}): PresentationEditor | null => {
  const activeEditor = superdoc.activeEditor;
  const documentId = activeEditor?.options?.documentId;
  if (!documentId) return null;

  const documents = superdoc.superdocStore?.documents ?? [];
  const matchedDoc = documents.find((doc) => doc.getEditor?.()?.options?.documentId === documentId);
  return matchedDoc?.getPresentationEditor?.() ?? null;
};

export const resolveToolbarSources = (superdoc: {
  activeEditor?: Editor | null;
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
}): ResolvedToolbarSources => {
  // Internal resolver for the headless toolbar pipeline.
  // Returns both the raw editor-layer sources and the public toolbar context
  // so controller and snapshot code can share one resolution path.
  const presentationEditor = resolvePresentationEditor(superdoc);
  if (presentationEditor) {
    return {
      activeEditor: superdoc.activeEditor ?? null,
      presentationEditor,
      context: {
        editor: presentationEditor,
        surface: resolveSurface(presentationEditor),
        isEditable: presentationEditor.isEditable,
        selectionEmpty: resolveSelectionEmpty(presentationEditor),
      },
    };
  }

  const activeEditor = superdoc.activeEditor;
  if (!activeEditor) {
    return {
      activeEditor: null,
      presentationEditor: null,
      context: null,
    };
  }

  return {
    activeEditor,
    presentationEditor: null,
    context: {
      editor: activeEditor,
      surface: 'body',
      isEditable: activeEditor.isEditable,
      selectionEmpty: resolveSelectionEmpty(activeEditor),
    },
  };
};

export const resolveToolbarContext = (superdoc: {
  activeEditor?: Editor | null;
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
}): ToolbarContext | null => {
  return resolveToolbarSources(superdoc).context;
};
