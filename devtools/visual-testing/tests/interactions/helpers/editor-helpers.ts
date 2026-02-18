/**
 * Shared helpers for editor interactions (selection, commands, etc.)
 */

import type { Page } from '@playwright/test';

/** Shape of the editor object exposed on window in the test harness. */
interface TestEditorWindow {
  editor?: {
    commands?: {
      setTextSelection?: (pos: { from: number; to: number }) => void;
      focus?: () => void;
    };
    state?: {
      selection?: { from: number; to: number };
      doc?: { textContent?: string };
    };
  };
}

/**
 * Set the text selection/cursor position in the editor.
 * @param page - Playwright page instance
 * @param from - Start position (ProseMirror document position)
 * @param to - End position (defaults to `from` for a cursor without selection)
 * @returns Resolves when the selection has been set
 */
export async function setTextSelection(page: Page, from: number, to?: number): Promise<void> {
  await page.evaluate(
    ({ f, t }) => {
      const editor = (window as TestEditorWindow).editor;
      editor?.commands?.setTextSelection?.({ from: f, to: t ?? f });
    },
    { f: from, t: to },
  );
}

/**
 * Focus the editor element.
 * @param page - Playwright page instance
 * @returns Resolves when the editor has been focused
 */
export async function focusEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as TestEditorWindow).editor;
    editor?.commands?.focus?.();
  });
}

/**
 * Get the current selection positions from the editor.
 * @param page - Playwright page instance
 * @returns The current selection's from/to positions, or null if unavailable
 */
export async function getSelection(page: Page): Promise<{ from: number; to: number } | null> {
  return page.evaluate(() => {
    const editor = (window as TestEditorWindow).editor;
    const selection = editor?.state?.selection;
    if (!selection) return null;
    return { from: selection.from, to: selection.to };
  });
}

/**
 * Get the document text content from the editor.
 * @param page - Playwright page instance
 * @returns The full text content of the document
 */
export async function getDocumentText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = (window as TestEditorWindow).editor;
    return editor?.state?.doc?.textContent ?? '';
  });
}
