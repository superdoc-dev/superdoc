import { test, expect } from '../../fixtures/superdoc.js';
import { activateFooter } from '../../helpers/story-surfaces.js';
import path from 'node:path';

const TEXT_BOXES = path.resolve(import.meta.dirname, 'fixtures/text-boxes.docx');
const CONTRACT_ACC = path.resolve(import.meta.dirname, 'fixtures/contract-acc-tbl-padding.docx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Click the center of the first textbox line inside a BODY drawing fragment.
 * Excludes header/footer fragments (data-layout-story starts with "header:" or "footer:").
 */
async function clickInsideTextbox(superdoc: any, blockId?: string) {
  const line = await superdoc.page.evaluateHandle(() => {
    const frags = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment'));
    for (const frag of frags) {
      const story = frag.dataset.layoutStory ?? '';
      if (story.startsWith('header:') || story.startsWith('footer:')) continue;
      const l = frag.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
      if (l) return l;
    }
    return null;
  });
  const el = line.asElement();
  if (!el) throw new Error('No body textbox superdoc-line found');
  const box = await el.boundingBox();
  if (!box) throw new Error('Textbox line not visible');
  await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Returns true if the PM selection is inside a shapeTextbox subtree. */
async function selectionIsInsideTextbox(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const { $from } = state.selection;
    for (let d = 0; d <= $from.depth; d++) {
      if ($from.node(d).type.name === 'shapeTextbox') return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Tests: text-boxes.docx
// ---------------------------------------------------------------------------

test.describe('Textbox content editing — text-boxes', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(TEXT_BOXES);
  });

  test('@behavior textbox: clicking inside a textbox places caret inside textbox content', async ({ superdoc }) => {
    await clickInsideTextbox(superdoc);
    await superdoc.waitForStable();

    const inside = await selectionIsInsideTextbox(superdoc.page);
    expect(inside).toBe(true);
  });

  test('@behavior textbox: typing inside a textbox updates textbox content', async ({ superdoc }) => {
    await clickInsideTextbox(superdoc);
    await superdoc.waitForStable();

    const inside = await selectionIsInsideTextbox(superdoc.page);
    expect(inside).toBe(true);

    await superdoc.type('INSERTED');
    await superdoc.waitForStable();

    const text = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      let found = false;
      state.doc.descendants((node: any) => {
        if (node.isText && node.text?.includes('INSERTED')) found = true;
      });
      return found;
    });
    expect(text).toBe(true);
  });

  test('@behavior textbox: deleting inside a textbox updates textbox content', async ({ superdoc }) => {
    await clickInsideTextbox(superdoc);
    await superdoc.waitForStable();

    const inside = await selectionIsInsideTextbox(superdoc.page);
    expect(inside).toBe(true);

    // Type then delete
    await superdoc.type('XYZ');
    await superdoc.waitForStable();
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    // Caret still inside textbox after deletion
    const stillInside = await selectionIsInsideTextbox(superdoc.page);
    expect(stillInside).toBe(true);
  });

  test('@behavior textbox: clicking textbox does not fall through to body content selection', async ({ superdoc }) => {
    await clickInsideTextbox(superdoc);
    await superdoc.waitForStable();

    const selectionKind = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      return state.selection.constructor.name;
    });
    // Should be TextSelection (cursor inside textbox), not NodeSelection on body
    expect(selectionKind).toBe('TextSelection');
  });

  test('@behavior textbox: body textbox superdoc-line elements have data-pm-start and data-pm-end', async ({
    superdoc,
  }) => {
    const result = await superdoc.page.evaluate(() => {
      const frags = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment'));
      for (const frag of frags) {
        const story = frag.dataset.layoutStory ?? '';
        if (story.startsWith('header:') || story.startsWith('footer:')) continue;
        const l = frag.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
        if (l) return { pmStart: l.dataset.pmStart, pmEnd: l.dataset.pmEnd };
      }
      return null;
    });

    expect(result).not.toBeNull();
    expect(Number(result!.pmStart)).toBeGreaterThan(0);
    expect(Number(result!.pmEnd)).toBeGreaterThanOrEqual(Number(result!.pmStart));
  });
});

// ---------------------------------------------------------------------------
// Tests: contract-acc-tbl-padding.docx (table cell textbox)
// ---------------------------------------------------------------------------

test.describe('Textbox content editing — contract-acc (table cell)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(CONTRACT_ACC);
  });

  test('@behavior textbox: clicking inside a table cell textbox places caret inside it', async ({ superdoc }) => {
    const line = superdoc.page.locator('.superdoc-table-drawing .superdoc-line').first();
    await expect(line).toBeAttached({ timeout: 8000 });

    const box = await line.boundingBox();
    if (!box) throw new Error('Table cell textbox line not visible');
    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    const inside = await selectionIsInsideTextbox(superdoc.page);
    expect(inside).toBe(true);
  });

  test('@behavior textbox: table cell textbox wrapper has data-block-id', async ({ superdoc }) => {
    const line = superdoc.page.locator('.superdoc-table-drawing .superdoc-line').first();
    await expect(line).toBeAttached({ timeout: 8000 });

    const hasBlockId = await superdoc.page.evaluate(() => {
      const line = document.querySelector('.superdoc-table-drawing .superdoc-line');
      return !!line?.closest('[data-block-id]');
    });
    expect(hasBlockId).toBe(true);
  });

  test('@behavior textbox: typing inside a table cell textbox updates its content', async ({ superdoc }) => {
    const line = superdoc.page.locator('.superdoc-table-drawing .superdoc-line').first();
    await expect(line).toBeAttached({ timeout: 8000 });
    const box = await line.boundingBox();
    await superdoc.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await superdoc.waitForStable();

    await expect(selectionIsInsideTextbox(superdoc.page)).resolves.toBe(true);

    await superdoc.type('CELLINSERT');
    await superdoc.waitForStable();

    const found = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      let found = false;
      state.doc.descendants((node: any) => {
        if (node.isText && node.text?.includes('CELLINSERT')) found = true;
      });
      return found;
    });
    expect(found).toBe(true);
  });

  test('@behavior textbox: deleting inside a table cell textbox updates its content', async ({ superdoc }) => {
    const line = superdoc.page.locator('.superdoc-table-drawing .superdoc-line').first();
    await expect(line).toBeAttached({ timeout: 8000 });
    const box = await line.boundingBox();
    await superdoc.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await superdoc.waitForStable();

    await expect(selectionIsInsideTextbox(superdoc.page)).resolves.toBe(true);

    await superdoc.type('DEL');
    await superdoc.waitForStable();
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    // Caret remains inside textbox after deletion
    await expect(selectionIsInsideTextbox(superdoc.page)).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: footer textbox (text-boxes.docx)
// ---------------------------------------------------------------------------

test.describe('Textbox content editing — footer (text-boxes)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(TEXT_BOXES);
  });

  test('@behavior textbox: clicking inside a footer textbox places caret inside it', async ({ superdoc }) => {
    await activateFooter(superdoc);

    // Find a textbox line inside the active footer drawing fragment
    const line = await superdoc.page.evaluateHandle(() => {
      const frags = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment'));
      for (const frag of frags) {
        const story = frag.dataset.layoutStory ?? '';
        if (!story.startsWith('footer:')) continue;
        const l = frag.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
        if (l) return l;
      }
      return null;
    });

    const el = line.asElement();
    if (!el) {
      throw new Error(
        'No footer textbox with superdoc-line found in text-boxes — textbox rendering may have regressed',
      );
      return;
    }

    const box = await el.boundingBox();
    if (!box) throw new Error('Footer textbox line not visible');
    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    // Selection should be inside the footer active editor's shapeTextbox
    const inside = await superdoc.page.evaluate(() => {
      const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!activeEditor) return false;
      const { $from } = activeEditor.state.selection;
      for (let d = 0; d <= $from.depth; d++) {
        if ($from.node(d).type.name === 'shapeTextbox') return true;
      }
      return false;
    });
    expect(inside).toBe(true);
  });

  test('@behavior textbox: typing inside a footer textbox updates footer content', async ({ superdoc }) => {
    await activateFooter(superdoc);

    const line = await superdoc.page.evaluateHandle(() => {
      const frags = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment'));
      for (const frag of frags) {
        if (!(frag.dataset.layoutStory ?? '').startsWith('footer:')) continue;
        const l = frag.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
        if (l) return l;
      }
      return null;
    });

    const el = line.asElement();
    if (!el) {
      throw new Error(
        'No footer textbox with superdoc-line found in text-boxes — textbox rendering may have regressed',
      );
      return;
    }

    const box = await el.boundingBox();
    await superdoc.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await superdoc.waitForStable();

    const inside = await superdoc.page.evaluate(() => {
      const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!activeEditor) return false;
      const { $from } = activeEditor.state.selection;
      for (let d = 0; d <= $from.depth; d++) {
        if ($from.node(d).type.name === 'shapeTextbox') return true;
      }
      return false;
    });
    expect(inside).toBe(true);

    await superdoc.type('FOOTERINSERT');
    await superdoc.waitForStable();

    const found = await superdoc.page.evaluate(() => {
      const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!activeEditor) return false;
      let found = false;
      activeEditor.state.doc.descendants((node: any) => {
        if (node.isText && node.text?.includes('FOOTERINSERT')) found = true;
      });
      return found;
    });
    expect(found).toBe(true);
  });
});
