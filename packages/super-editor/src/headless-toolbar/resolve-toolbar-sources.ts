import type { Editor } from '../editors/v1/core/Editor.js';
import type { PresentationEditor } from '../editors/v1/core/presentation-editor/index.js';
import type { HeadlessToolbarActiveEditor, HeadlessToolbarSurface, ToolbarContext, ToolbarTarget } from './types.js';
import type { ResolvedToolbarSources } from './internal-types.js';

// Normalize raw Editor and PresentationEditor into one toolbar-facing shape.
// PresentationEditor remains the routing authority whenever it is available.

const resolveSurfaceFromDocumentId = (documentId: string | null | undefined): HeadlessToolbarSurface => {
  if (typeof documentId !== 'string' || documentId.length === 0) return 'body';
  if (documentId.startsWith('footnote:') || documentId.startsWith('fn:')) return 'note';
  if (documentId.startsWith('endnote:') || documentId.startsWith('en:')) return 'endnote';
  return 'body';
};

const resolveSurface = (activeEditor: HeadlessToolbarActiveEditor | null | undefined): HeadlessToolbarSurface => {
  if (activeEditor?.options?.isHeaderOrFooter) {
    const headerFooterType = activeEditor.options?.headerFooterType;
    if (headerFooterType === 'footer') return 'footer';
    if (headerFooterType === 'header') return 'header';
  }
  return resolveSurfaceFromDocumentId(activeEditor?.options?.documentId);
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

type EditorWithPresentationOwner = Editor & {
  presentationEditor?: PresentationEditor | null;
  _presentationEditor?: PresentationEditor | null;
};

const isV1ToolbarEditor = (editor: HeadlessToolbarActiveEditor | null | undefined): editor is Editor => {
  return Boolean(editor && (editor.editorVersion == null || editor.editorVersion === 1) && editor.commands !== null);
};

// SD-3213f: accept both the narrow SuperDoc method
// (`getPresentationEditorForDocument`) and the legacy `superdocStore`
// shape. The narrow method is preferred when present (SuperDoc
// instances and host stubs that adopt the new API). The legacy fallback
// keeps existing custom host stubs working without forcing a churn.
type ToolbarHostShape = {
  activeEditor?: HeadlessToolbarActiveEditor | null;
  getPresentationEditorForDocument?: (documentId: string) => PresentationEditor | null;
  superdocStore?: {
    documents?: Array<{
      getPresentationEditor?: () => PresentationEditor | null | undefined;
      getEditor?: () => Editor | null | undefined;
    }>;
  };
};

const resolvePresentationEditor = (superdoc: ToolbarHostShape): PresentationEditor | null => {
  const activeEditor = superdoc.activeEditor ?? null;
  const activeEditorWithPresentation = activeEditor as unknown as EditorWithPresentationOwner | null;
  const directPresentationEditor =
    activeEditorWithPresentation?.presentationEditor ?? activeEditorWithPresentation?._presentationEditor ?? null;
  if (directPresentationEditor) {
    return directPresentationEditor;
  }

  const documentId = activeEditor?.options?.documentId;
  if (!documentId) return null;

  // Prefer the narrow public method (SD-3213f) when the host provides it.
  if (typeof superdoc.getPresentationEditorForDocument === 'function') {
    return superdoc.getPresentationEditorForDocument(documentId);
  }

  // Legacy fallback: resolve the PresentationEditor for the same document
  // as the current raw editor by walking `superdocStore.documents[]`.
  // Kept for custom host stubs that pre-date the narrow method.
  const documents = superdoc.superdocStore?.documents ?? [];
  const matchedDoc = documents.find((doc) => doc.getEditor?.()?.options?.documentId === documentId);
  return matchedDoc?.getPresentationEditor?.() ?? null;
};

export const resolveToolbarSources = (superdoc: ToolbarHostShape): ResolvedToolbarSources => {
  const presentationEditor = resolvePresentationEditor(superdoc);

  if (presentationEditor) {
    // Follow PresentationEditor routing instead of superdoc.activeEditor so
    // toolbar state stays aligned with the active body/header/footer editor.
    // Surface is derived from the routed editor directly to avoid selection-range
    // resolution during snapshot rebuilds (for example, CellSelection).
    const routedEditor = presentationEditor.getActiveEditor();
    return {
      activeEditor: routedEditor ?? null,
      presentationEditor,
      context: {
        target: createPresentationToolbarTarget(presentationEditor),
        surface: resolveSurface(routedEditor),
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

  if (!isV1ToolbarEditor(activeEditor)) {
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
