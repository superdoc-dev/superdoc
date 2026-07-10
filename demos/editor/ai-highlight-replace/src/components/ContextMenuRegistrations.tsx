import { useEffect } from 'react';
import { useSuperDocUI } from 'superdoc/ui/react';
import type { AIPromptOpenState } from './AIPromptPopover';

interface Props {
  /**
   * Open the AI prompt popover at the given position with the captured
   * selection. The context menu closes and the popover appears in its
   * place.
   */
  onOpenAIPrompt(state: AIPromptOpenState): void;
}

/**
 * Registers the demo's context-menu contributions.
 *
 * For the AI highlight demo, this includes:
 * - Replace with AI (primary feature)
 * - Copy selection
 */
export function ContextMenuRegistrations({ onOpenAIPrompt }: Props) {
  const ui = useSuperDocUI();

  useEffect(() => {
    if (!ui) return;

    // AI Replace - first item in selection context menu
    const aiReplace = ui.commands.register({
      id: 'demo.aiReplace',
      execute: ({ context }) => {
        if (!context) return false;
        // Capture selection at the moment of click
        const captured = ui.selection.capture();
        if (!captured || !captured.quotedText) return false;
        // Use selection rect position as fallback (actual position comes from App.tsx)
        const rect = context.selection.rects?.[0];
        const x = rect ? rect.left + rect.width : 100;
        const y = rect ? rect.top + rect.height : 100;
        onOpenAIPrompt({ x, y, captured });
        return true;
      },
      contextMenu: {
        label: 'Replace with AI',
        group: 'ai',
        order: -100, // Negative to appear first
        when: ({ selection, insideSelection }) =>
          !selection.empty && selection.target !== null && insideSelection === true,
      },
    });

    // Copy selection to clipboard
    const copy = ui.commands.register({
      id: 'demo.copy',
      execute: ({ context }) => {
        const text = context?.selection.quotedText ?? ui.selection.getSnapshot().quotedText;
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        return true;
      },
      contextMenu: {
        label: 'Copy',
        group: 'clipboard',
        when: ({ selection, insideSelection }) => !selection.empty && insideSelection === true,
      },
    });

    return () => {
      aiReplace.unregister();
      copy.unregister();
    };
  }, [ui, onOpenAIPrompt]);

  return null;
}
