import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SelectionCapture, SelectionTarget } from 'superdoc/ui';
import { useSuperDocSelection, useSuperDocUI, useSuperDocHost } from 'superdoc/ui/react';

const VIEWPORT_MARGIN = 8;

// Type for the editor handle with replace capability
type EditorHandle = {
  doc?: {
    replace?: (input: { target: SelectionTarget; text: string }) => { success: boolean };
  };
};

interface OpenState {
  x: number;
  y: number;
}

/**
 * Right-click popover for AI-powered text replacement.
 *
 * When the user selects text and right-clicks, this popover appears
 * with a prompt input. On submit, it sends the selected text and prompt
 * to the backend, which calls OpenAI and returns replacement text.
 */
export function AIPromptPopover() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const selection = useSuperDocSelection();
  const [state, setState] = useState<OpenState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Capture selection when popover opens so we can restore it after
  // the user types in the textarea (which moves focus away from editor)
  const captured = useMemo<SelectionCapture | null>(() => {
    if (!ui || !state) return null;
    return ui.selection.capture();
  }, [ui, state]);

  // Listen for right-click (contextmenu) events
  useEffect(() => {
    if (!ui) return;

    const onContextMenu = (event: MouseEvent) => {
      // Only show when there's a text selection
      if (selection.empty || !selection.target) return;

      // Scope to the painted host element
      const hostEl = ui.viewport.getHost();
      const target = event.target;
      if (!hostEl || !(target instanceof Node) || !hostEl.contains(target)) {
        return;
      }

      // Check if click is inside the selection
      const context = ui.viewport.contextAt({ x: event.clientX, y: event.clientY });
      if (!context.insideSelection) return;

      // Prevent both the default browser menu and the demo's ContextMenu
      event.preventDefault();
      event.stopImmediatePropagation();
      setState({ x: event.clientX, y: event.clientY });
      setPrompt('');
      setError(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest?.('.ai-prompt-popover')) return;
      setState(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setState(null);
      }
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ui, selection.empty, selection.target]);

  // Position the popover and focus the input
  useLayoutEffect(() => {
    if (!state || !popoverRef.current) {
      setPosition(null);
      return;
    }
    const menu = popoverRef.current;
    const { offsetWidth: w, offsetHeight: h } = menu;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(state.x, VIEWPORT_MARGIN), vw - w - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(state.y, VIEWPORT_MARGIN), vh - h - VIEWPORT_MARGIN);
    setPosition({ left, top });
    inputRef.current?.focus();
  }, [state]);

  const handleSubmit = useCallback(async () => {
    if (!ui || !captured || !prompt.trim() || loading) return;

    const selectedText = captured.quotedText || '';
    if (!selectedText) {
      setError('No text selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/ai-replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText,
          prompt: prompt.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get AI response');
      }

      const data = await response.json();
      const replacementText = data.text;

      if (!replacementText) {
        throw new Error('No replacement text received');
      }

      // Restore the captured selection and replace the text
      ui.selection.restore(captured);

      // Get the active editor and use the document API to replace
      const editor = (host as unknown as { activeEditor?: EditorHandle }).activeEditor;
      if (editor?.doc?.replace && captured.selectionTarget) {
        const receipt = editor.doc.replace({
          target: captured.selectionTarget,
          text: replacementText,
        });
        if (!receipt.success) {
          throw new Error('Failed to replace text');
        }
      } else {
        throw new Error('Editor replace API not available');
      }

      setState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [ui, host, captured, prompt, loading]);

  if (!state || !ui) return null;

  return (
    <div
      ref={popoverRef}
      className="ai-prompt-popover"
      style={{
        position: 'fixed',
        left: position?.left ?? state.x,
        top: position?.top ?? state.y,
        visibility: position ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="ai-prompt-header">
        <span className="ai-prompt-title">AI Replace</span>
        <button
          className="ai-prompt-close"
          onClick={() => setState(null)}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="ai-prompt-quote">
        "{captured?.quotedText?.slice(0, 100)}{captured?.quotedText && captured.quotedText.length > 100 ? '...' : ''}"
      </div>

      <textarea
        ref={inputRef}
        className="ai-prompt-input"
        placeholder="Enter your prompt (e.g., 'make this more formal', 'translate to Spanish', 'fix grammar')"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === 'Escape') {
            setState(null);
          }
        }}
        rows={3}
        disabled={loading}
      />

      {error && <div className="ai-prompt-error">{error}</div>}

      <div className="ai-prompt-actions">
        <button onClick={() => setState(null)} disabled={loading}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={handleSubmit}
          disabled={!prompt.trim() || loading}
        >
          {loading ? 'Processing...' : 'Replace with AI'}
        </button>
      </div>

      <div className="ai-prompt-hint">
        Press <kbd>Cmd</kbd>+<kbd>Enter</kbd> to submit
      </div>
    </div>
  );
}
