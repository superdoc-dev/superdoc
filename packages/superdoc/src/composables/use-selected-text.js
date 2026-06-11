import { computed } from 'vue';

/**
 * Composable to get the currently selected text from an editor.
 *
 * When a mounted editor runtime is active and can read selected text, route the
 * synchronous read through the runtime boundary. The legacy direct editor-state
 * read remains as a fallback for startup and bare-editor callers.
 *
 * @param {Object} editorRef - Ref to the editor instance
 * @param {Object} [options]
 * @param {() => (import('../core/editor-runtime/index.js').EditorRuntime | null | undefined)} [options.getActiveRuntime]
 *   Accessor for the active editor runtime.
 * @returns {Object} - Object containing the selected text as a computed property
 */
export function useSelectedText(editorRef, options = {}) {
  const getActiveRuntime = typeof options.getActiveRuntime === 'function' ? options.getActiveRuntime : null;

  // Create a computed property that will update when the editor selection changes
  const selectedText = computed(() => {
    const editor = editorRef.value;

    const runtime = getActiveRuntime?.();
    if (runtime?.getCapabilities?.().selection?.canReadSelectedText) {
      return runtime.getSelectedText();
    }

    if (!editor?.state) return ''; // reach-in-allow: legacy selected-text fallback guard
    return editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' '); // reach-in-allow: legacy selected-text fallback
  });

  return {
    selectedText,
  };
}
