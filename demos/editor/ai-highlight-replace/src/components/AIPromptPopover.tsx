import { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import type { SelectionCapture, SelectionTarget } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocHost } from 'superdoc/ui/react';

const VIEWPORT_MARGIN = 8;

// Type for the editor handle with replace capability
type EditorHandle = {
  doc?: {
    replace?: (input: { target: SelectionTarget; text: string }) => { success: boolean };
  };
};

export interface AIPromptOpenState {
  x: number;
  y: number;
  captured: SelectionCapture;
}

interface Props {
  openState: AIPromptOpenState | null;
  onClose: () => void;
}

/**
 * Popover for AI-powered text replacement.
 *
 * Controlled component that receives open state from parent. When open,
 * displays a prompt input at the given position. On submit, calls the
 * backend which uses OpenAI to transform the text.
 */
export function AIPromptPopover({ openState, onClose }: Props) {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state when opened
  useEffect(() => {
    if (openState) {
      setPrompt('');
      setError(null);
    }
  }, [openState]);

  // Close on pointer down outside or Escape
  useEffect(() => {
    if (!openState) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest?.('.ai-prompt-popover')) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openState, onClose]);

  // Position the popover and focus the input
  useLayoutEffect(() => {
    if (!openState || !popoverRef.current) {
      setPosition(null);
      return;
    }
    const menu = popoverRef.current;
    const { offsetWidth: w, offsetHeight: h } = menu;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(openState.x, VIEWPORT_MARGIN), vw - w - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(openState.y, VIEWPORT_MARGIN), vh - h - VIEWPORT_MARGIN);
    setPosition({ left, top });
    inputRef.current?.focus();
  }, [openState]);

  const handleSubmit = useCallback(async () => {
    if (!ui || !openState || !prompt.trim() || loading) return;

    const { captured } = openState;
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

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [ui, host, openState, prompt, loading, onClose]);

  if (!openState || !ui) return null;

  const { captured } = openState;

  return (
    <div
      ref={popoverRef}
      className="ai-prompt-popover"
      style={{
        position: 'fixed',
        left: position?.left ?? openState.x,
        top: position?.top ?? openState.y,
        visibility: position ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="ai-prompt-header">
        <span className="ai-prompt-title">AI Replace</span>
        <button
          className="ai-prompt-close"
          onClick={() => onClose()}
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
            onClose();
          }
        }}
        rows={3}
        disabled={loading}
      />

      {error && <div className="ai-prompt-error">{error}</div>}

      <div className="ai-prompt-actions">
        <button onClick={() => onClose()} disabled={loading}>
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
