import { test, expect } from '../../fixtures/superdoc.js';
import { activateFooter, activateHeader } from '../../helpers/story-surfaces.js';
import path from 'node:path';

const FOOTER_TEXTBOX = path.resolve(import.meta.dirname, 'fixtures/footer_textbox.docx');
const HEADER_FOOTER_TEXTBOX = path.resolve(import.meta.dirname, 'fixtures/header_footer_textbox.docx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the center of the first superdoc-line inside a behindDoc fragment for the given story kind. */
async function clickInsideBehindDocTextbox(page: any, kind: 'header' | 'footer') {
  const line = await page.evaluateHandle((k: string) => {
    const frags = Array.from(document.querySelectorAll<HTMLElement>(`[data-behind-doc-section="${k}"]`));
    for (const frag of frags) {
      const l = frag.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
      if (l) return l;
    }
    return null;
  }, kind);
  const el = line.asElement();
  if (!el) throw new Error(`No behindDoc ${kind} textbox superdoc-line found`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`behindDoc ${kind} textbox line not visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Returns true if the active H/F editor's selection is inside a shapeTextbox. */
async function activeEditorSelectionIsInsideTextbox(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    if (!activeEditor) return false;
    const { $from } = activeEditor.state.selection;
    for (let d = 0; d <= $from.depth; d++) {
      if ($from.node(d).type.name === 'shapeTextbox') return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Tests: footer_textbox.docx — behindDoc footer textbox
// ---------------------------------------------------------------------------

test.describe('behindDoc textbox — footer (footer_textbox.docx)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(FOOTER_TEXTBOX);
  });

  test('@behavior behindDoc textbox: clicking inside a footer behindDoc textbox places caret inside it', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();

    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);
  });

  test('@behavior behindDoc textbox: repeated clicks reposition caret inside footer behindDoc textbox', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);

    // First click
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();
    const pos1 = await superdoc.page.evaluate(() => {
      const ed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      return ed?.state?.selection?.from ?? -1;
    });

    // Second click at different x position
    const line = await superdoc.page.evaluateHandle(() => {
      const frag = document.querySelector<HTMLElement>('[data-behind-doc-section="footer"]');
      return frag?.querySelector<HTMLElement>('.superdoc-line[data-pm-start]') ?? null;
    });
    const el = line.asElement();
    if (!el) throw new Error('No line element');
    const box = await el.boundingBox();
    if (!box) throw new Error('Line not visible');
    await superdoc.page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
    await superdoc.waitForStable();

    const pos2 = await superdoc.page.evaluate(() => {
      const ed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      return ed?.state?.selection?.from ?? -1;
    });

    // Caret is still inside textbox and positions are valid
    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);
    expect(pos1).toBeGreaterThan(0);
    expect(pos2).toBeGreaterThan(0);
  });

  test('@behavior behindDoc textbox: typing inside a footer behindDoc textbox updates content', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();
    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);

    await superdoc.type('BEHINDINSERT');
    await superdoc.waitForStable();

    const found = await superdoc.page.evaluate(() => {
      const ed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!ed) return false;
      return ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n').includes('BEHINDINSERT');
    });
    expect(found).toBe(true);
  });

  test('@behavior behindDoc textbox: deleting inside a footer behindDoc textbox keeps caret inside', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();
    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);

    await superdoc.type('XYZ');
    await superdoc.waitForStable();
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);
  });

  test('@behavior behindDoc textbox: footer behindDoc fragment has data-pm-start and data-pm-end', async ({
    superdoc,
  }) => {
    const result = await superdoc.page.evaluate(() => {
      const frag = document.querySelector<HTMLElement>('[data-behind-doc-section="footer"]');
      const line = frag?.querySelector<HTMLElement>('.superdoc-line[data-pm-start]');
      if (!line) return null;
      return { pmStart: line.dataset.pmStart, pmEnd: line.dataset.pmEnd };
    });

    expect(result).not.toBeNull();
    expect(Number(result!.pmStart)).toBeGreaterThan(0);
    expect(Number(result!.pmEnd)).toBeGreaterThanOrEqual(Number(result!.pmStart));
  });
});

// ---------------------------------------------------------------------------
// Tests: header_footer_textbox.docx — behindDoc header + footer textboxes
// ---------------------------------------------------------------------------

test.describe('behindDoc textbox — header (header_footer_textbox.docx)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(HEADER_FOOTER_TEXTBOX);
  });

  test('@behavior behindDoc textbox: clicking inside a header behindDoc textbox places caret inside it', async ({
    superdoc,
  }) => {
    await activateHeader(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'header');
    await superdoc.waitForStable();

    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);
  });

  test('@behavior behindDoc textbox: typing inside a header behindDoc textbox updates content', async ({
    superdoc,
  }) => {
    await activateHeader(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'header');
    await superdoc.waitForStable();
    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);

    await superdoc.type('HEADERINSERT');
    await superdoc.waitForStable();

    const found = await superdoc.page.evaluate(() => {
      const ed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!ed) return false;
      const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n');
      return text.includes('HEADERINSERT');
    });
    expect(found).toBe(true);
  });
});

test.describe('behindDoc textbox — footer (header_footer_textbox.docx)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(HEADER_FOOTER_TEXTBOX);
  });

  test('@behavior behindDoc textbox: clicking inside a footer behindDoc textbox places caret inside it', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();

    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);
  });

  test('@behavior behindDoc textbox: typing inside a footer behindDoc textbox updates content', async ({
    superdoc,
  }) => {
    await activateFooter(superdoc);
    await clickInsideBehindDocTextbox(superdoc.page, 'footer');
    await superdoc.waitForStable();
    expect(await activeEditorSelectionIsInsideTextbox(superdoc.page)).toBe(true);

    await superdoc.type('FOOTERINSERT');
    await superdoc.waitForStable();

    const found = await superdoc.page.evaluate(() => {
      const ed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      if (!ed) return false;
      return ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n').includes('FOOTERINSERT');
    });
    expect(found).toBe(true);
  });
});
