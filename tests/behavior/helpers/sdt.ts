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

// ---------------------------------------------------------------------------
// CRUD helpers for structured content tests
// ---------------------------------------------------------------------------

interface SdtAttrs {
  id?: string;
  alias?: string;
  group?: string;
  tag?: string;
  lockMode?: string;
  [key: string]: unknown;
}

/** Insert a block SDT with full attrs + HTML content. */
export async function insertBlockSdtWithHtml(page: Page, attrs: SdtAttrs, html: string): Promise<void> {
  await page.evaluate(
    ({ attrs, html }) => {
      (window as any).editor.commands.insertStructuredContentBlock({ attrs, html });
    },
    { attrs, html },
  );
}

/** Insert an inline SDT with full attrs (id, alias, group) and optional text. */
export async function insertInlineSdtWithId(page: Page, attrs: SdtAttrs, text?: string): Promise<void> {
  await page.evaluate(
    ({ attrs, text }) => {
      (window as any).editor.commands.insertStructuredContentInline({ attrs, text });
    },
    { attrs, text },
  );
}

/** Update a structured content field by its unique ID. */
export async function updateSdtById(page: Page, id: string, options: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ id, options }) => {
      (window as any).editor.commands.updateStructuredContentById(id, options);
    },
    { id, options },
  );
}

/** Update all structured content fields that share a group identifier. */
export async function updateSdtByGroup(page: Page, group: string, options: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ group, options }) => {
      (window as any).editor.commands.updateStructuredContentByGroup(group, options);
    },
    { group, options },
  );
}

/** Delete structured content by ID (single or array). */
export async function deleteSdtById(page: Page, idOrIds: string | string[]): Promise<void> {
  await page.evaluate((ids) => {
    (window as any).editor.commands.deleteStructuredContentById(ids);
  }, idOrIds);
}

/** Delete the structured content at the current selection, preserving its content. */
export async function deleteSdtAtSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).editor.commands.deleteStructuredContentAtSelection();
  });
}

/** Read the data-id attribute from the first DOM element matching [data-alias="<alias>"]. */
export async function getSdtIdByAlias(page: Page, alias: string): Promise<string> {
  return page.evaluate((alias) => {
    const el = document.querySelector(`[data-alias="${alias}"]`);
    if (!el) throw new Error(`No SDT element found with alias "${alias}"`);
    return (el as HTMLElement).dataset.id ?? '';
  }, alias);
}

/** Get the data-id by reading ProseMirror state (more reliable than DOM). */
export async function getSdtIdFromState(page: Page, alias: string): Promise<string> {
  return page.evaluate((alias) => {
    const editor = (window as any).editor;
    let foundId: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (foundId) return false;
      if (
        (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
        node.attrs.alias === alias
      ) {
        foundId = String(node.attrs.id);
        return false;
      }
      return true;
    });
    if (!foundId) throw new Error(`No SDT node found with alias "${alias}"`);
    return foundId;
  }, alias);
}
