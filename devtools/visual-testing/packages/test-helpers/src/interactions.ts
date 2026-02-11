/**
 * Interaction helpers for SuperDoc visual testing.
 * These helpers wrap common editor operations for use in interaction stories.
 */

import type { Page, Locator } from '@playwright/test';
import type { TestEditor, TestSuperdoc } from './types.js';

// Import centralized Window type augmentation
import './types.js';

/** Platform-specific modifier key (Meta on macOS, Control elsewhere) */
const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

export interface TypeOptions {
  /** Delay between keystrokes in ms (default: 0) */
  delay?: number;
}

export interface InteractionHelpers {
  /** Platform-specific modifier key */
  modifierKey: string;
  /** Label and run a story step */
  step<T>(label: string, action: () => Promise<T> | T): Promise<T>;
  /** Type text into the editor at the current cursor position */
  type(text: string, options?: TypeOptions): Promise<void>;
  /** Press a key or key combination */
  press(key: string): Promise<void>;
  /** Press a key combination using the platform modifier */
  pressShortcut(key: string): Promise<void>;
  /** Press a key multiple times */
  pressTimes(key: string, count: number): Promise<void>;
  /** Select all content in the editor */
  selectAll(): Promise<void>;
  /** Apply bold formatting (Cmd/Ctrl+B) */
  bold(): Promise<void>;
  /** Apply italic formatting (Cmd/Ctrl+I) */
  italic(): Promise<void>;
  /** Apply underline formatting (Cmd/Ctrl+U) */
  underline(): Promise<void>;
  /** Undo the last action (Cmd/Ctrl+Z) */
  undo(): Promise<void>;
  /** Redo the last undone action (Cmd/Ctrl+Shift+Z) */
  redo(): Promise<void>;
  /** Click at a specific position relative to the editor */
  clickAt(x: number, y: number): Promise<void>;
  /** Triple-click to select a paragraph */
  tripleClickAt(x: number, y: number): Promise<void>;
  /** Triple-click to select a line by its index (0-based) */
  tripleClickLine(lineIndex: number): Promise<void>;
  /** Focus the editor */
  focus(): Promise<void>;
  /** Clear all content in the editor */
  clear(): Promise<void>;
  /** Insert a new line (Enter key) */
  newLine(): Promise<void>;
  /** Insert a soft line break (Shift+Enter) */
  softBreak(): Promise<void>;
  /** Execute a command on the editor via window.editor */
  executeCommand(commandName: string, args?: Record<string, unknown>): Promise<void>;
  /** Set SuperDoc document mode if supported */
  setDocumentMode(mode: string): Promise<void>;
  /** Wait for the editor to be idle/stable */
  waitForStable(ms?: number): Promise<void>;
  /** Get the current text content of the editor */
  getTextContent(): Promise<string>;
  /** Drag from one point to another */
  drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void>;
  /** Access to raw page for advanced operations */
  page: Page;
}

/**
 * Creates an interaction helpers object bound to a Playwright page.
 * @param page - Playwright page instance to bind helpers to
 * @returns Object containing all interaction helper methods
 */
export function createInteractionHelpers(page: Page): InteractionHelpers {
  const getEditor = (): Locator => page.locator('#editor').first();
  const getEditorContent = (): Locator => page.locator('[contenteditable="true"]').first();
  const selectAll = async (): Promise<void> => {
    await page.keyboard.press(`${MODIFIER}+a`);
  };

  return {
    modifierKey: MODIFIER,

    async step<T>(label: string, action: () => Promise<T> | T): Promise<T> {
      // Log the step label for debugging and test output visibility

      console.log(`[step] ${label}`);
      return await action();
    },

    async type(text: string, options: TypeOptions = {}): Promise<void> {
      const { delay = 0 } = options;
      const editor = getEditorContent();
      await editor.waitFor({ state: 'visible', timeout: 10_000 });
      // Focus via JavaScript since layout engine positions editor outside viewport
      await editor.focus();
      await page.keyboard.type(text, { delay });
    },

    async press(key: string): Promise<void> {
      await page.keyboard.press(key);
    },

    async pressShortcut(key: string): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+${key}`);
    },

    async pressTimes(key: string, count: number): Promise<void> {
      for (let i = 0; i < count; i += 1) {
        await page.keyboard.press(key);
      }
    },

    selectAll,

    async bold(): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+b`);
    },

    async italic(): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+i`);
    },

    async underline(): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+u`);
    },

    async undo(): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+z`);
    },

    async redo(): Promise<void> {
      await page.keyboard.press(`${MODIFIER}+Shift+z`);
    },

    async clickAt(x: number, y: number): Promise<void> {
      const editor = getEditor();
      const box = await editor.boundingBox();
      if (!box) throw new Error('Editor not found or not visible');
      await page.mouse.click(box.x + x, box.y + y);
    },

    async tripleClickAt(x: number, y: number): Promise<void> {
      const editor = getEditor();
      const box = await editor.boundingBox();
      if (!box) throw new Error('Editor not found or not visible');
      await page.mouse.click(box.x + x, box.y + y, { clickCount: 3 });
    },

    async tripleClickLine(lineIndex: number): Promise<void> {
      const lines = page.locator('.superdoc-line');
      const count = await lines.count();
      if (lineIndex < 0 || lineIndex >= count) {
        throw new Error(`Line index ${lineIndex} out of range (0-${count - 1})`);
      }
      const line = lines.nth(lineIndex);
      const box = await line.boundingBox();
      if (!box) throw new Error(`Line ${lineIndex} not visible`);
      // Click in the center of the line
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    },

    async focus(): Promise<void> {
      const editor = getEditorContent();
      await editor.waitFor({ state: 'visible', timeout: 10_000 });
      await editor.focus();
    },

    async clear(): Promise<void> {
      await selectAll();
      await page.keyboard.press('Backspace');
    },

    async newLine(): Promise<void> {
      await page.keyboard.press('Enter');
    },

    async softBreak(): Promise<void> {
      await page.keyboard.press('Shift+Enter');
    },

    async executeCommand(commandName: string, args: Record<string, unknown> = {}): Promise<void> {
      await page.evaluate(
        ({ cmd, cmdArgs }) => {
          const editor = window.editor as TestEditor | null;
          if (editor?.commands?.[cmd]) {
            editor.commands[cmd](cmdArgs);
          }
        },
        { cmd: commandName, cmdArgs: args },
      );
    },

    async setDocumentMode(mode: string): Promise<void> {
      await page.evaluate((value) => {
        const superdoc = window.superdoc as TestSuperdoc | null;
        if (superdoc?.setDocumentMode) {
          superdoc.setDocumentMode(value);
        }
      }, mode);
    },

    async waitForStable(ms = 500): Promise<void> {
      await page.waitForTimeout(ms);
    },

    async getTextContent(): Promise<string> {
      return page.evaluate(() => {
        const editor = document.querySelector('.super-editor .ProseMirror');
        return editor ? editor.textContent || '' : '';
      });
    },

    async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
      const editor = getEditor();
      const box = await editor.boundingBox();
      if (!box) throw new Error('Editor not found or not visible');
      await page.mouse.move(box.x + from.x, box.y + from.y);
      await page.mouse.down();
      await page.mouse.move(box.x + to.x, box.y + to.y);
      await page.mouse.up();
    },

    page,
  };
}
