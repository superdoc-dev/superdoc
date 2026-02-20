import type { Page } from '@playwright/test';

/** Insert a block SDT with a paragraph of text via the editor command. */
export async function insertBlockSdt(page: Page, alias: string, text: string): Promise<void> {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { alias },
        html: `<p>${text}</p>`,
      });
    },
    { alias, text },
  );
}

/** Insert an inline SDT with text via the editor command. */
export async function insertInlineSdt(page: Page, alias: string, text: string): Promise<void> {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentInline({
        attrs: { alias },
        text,
      });
    },
    { alias, text },
  );
}

/** Get the bounding box center of an element. */
export async function getCenter(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
}

/** Check whether an element has a given CSS class. */
export async function hasClass(page: Page, selector: string, className: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return el ? el.classList.contains(cls) : false;
    },
    { sel: selector, cls: className },
  );
}

/** Check whether the PM selection targets or is inside a structuredContentBlock node. */
export async function isSelectionOnBlockSdt(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const { selection } = state;
    if (selection.node?.type.name === 'structuredContentBlock') return true;
    const $pos = selection.$from;
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === 'structuredContentBlock') return true;
    }
    return false;
  });
}

/**
 * Deselect the SDT by placing the cursor inside the first text node
 * that contains `anchorText`. Falls back to position 1 if not found.
 */
export async function deselectSdt(page: Page, anchorText = 'Before SDT'): Promise<void> {
  await page.evaluate((text) => {
    const editor = (window as any).editor;
    const doc = editor.state.doc;
    let pos = 1; // safe fallback: start of first text node

    doc.descendants((node: any, nodePos: number) => {
      if (pos > 1) return false;
      if (node.isText && node.text?.includes(text)) {
        pos = nodePos + 1;
        return false;
      }
      return true;
    });

    editor.commands.setTextSelection({ from: pos, to: pos });
  }, anchorText);
}
