import type { Editor } from '../editors/v1/core/Editor.js';
import type { PresentationEditor } from '../editors/v1/core/presentation-editor/index.js';
import type { HeadlessToolbarSurface, ToolbarContext, ToolbarTarget } from './types.js';
import type { ResolvedToolbarSources } from './internal-types.js';

// Normalize raw Editor and PresentationEditor into one toolbar-facing shape.
// PresentationEditor remains the routing authority whenever it is available.

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

const createEditorToolbarTarget = (editor: Editor): ToolbarTarget => {
  return {
    commands: editor.commands ?? {},
    doc: editor.doc,
  };
};

const createPresentationToolbarTarget = (editor: PresentationEditor): ToolbarTarget => {
  return {
    commands: editor.commands ?? {},
    // Keep doc access aligned with the currently routed body/header/footer editor.
    doc: editor.getActiveEditor()?.doc,
  };
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

  // Resolve the PresentationEditor for the same document as the current raw editor.
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
  const presentationEditor = resolvePresentationEditor(superdoc);

  if (presentationEditor) {
    // Follow PresentationEditor routing instead of superdoc.activeEditor so
    // toolbar state stays aligned with the active body/header/footer surface.
    const routedEditor = presentationEditor.getActiveEditor();

    return {
      activeEditor: routedEditor ?? null,
      presentationEditor,
      context: {
        target: createPresentationToolbarTarget(presentationEditor),
        surface: resolveSurface(presentationEditor),
        isEditable: presentationEditor.isEditable,
        selectionEmpty: resolveSelectionEmpty(presentationEditor),
        editor: routedEditor ?? undefined,
        presentationEditor,
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
      target: createEditorToolbarTarget(activeEditor),
      surface: 'body',
      isEditable: activeEditor.isEditable,
      selectionEmpty: resolveSelectionEmpty(activeEditor),
      editor: activeEditor,
    },
  };
};
