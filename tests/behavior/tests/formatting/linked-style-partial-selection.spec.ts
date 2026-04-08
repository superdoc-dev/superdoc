import { test, expect } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function getParagraphStyleId(page: Page, paragraphIndex: number): Promise<string | null> {
  return page.evaluate((idx) => {
    const editor = (window as any).editor;
    let result: string | null = null;
    let i = 0;
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'paragraph') {
        if (i === idx) {
          result = node.attrs?.paragraphProperties?.styleId ?? null;
          return false;
        }
        i++;
      }
      return true;
    });
    return result;
  }, paragraphIndex);
}

async function getTextStyleId(page: Page, text: string): Promise<string | null> {
  return page.evaluate((searchText) => {
    const editor = (window as any).editor;
    let result: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (node.isText && node.text?.includes(searchText)) {
        const ts = node.marks.find((m: any) => m.type.name === 'textStyle');
        result = ts?.attrs?.styleId ?? null;
        return false;
      }
      return true;
    });
    return result;
  }, text);
}

async function applyLinkedStyleToSelection(page: Page, styleId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const editor = (window as any).editor;
    const style = editor.helpers.linkedStyles.getStyleById(id);
    if (!style) return false;
    return editor.commands.setLinkedStyle(style);
  }, styleId);
}

test.describe('SD-2425 linked style partial selection', () => {
  test('partial selection applies linked character style, not paragraph style', async ({ superdoc }) => {
    await superdoc.type('The quick brown fox jumps over the lazy dog');
    await superdoc.waitForStable();

    // Select just "brown fox"
    const pos = await superdoc.findTextPos('brown fox');
    await superdoc.setTextSelection(pos, pos + 'brown fox'.length);
    await superdoc.waitForStable();

    // Apply Heading 1 via command
    const result = await applyLinkedStyleToSelection(superdoc.page, 'Heading1');
    await superdoc.waitForStable();
    expect(result).toBe(true);

    // Paragraph style should NOT change
    const paraStyle = await getParagraphStyleId(superdoc.page, 0);
    expect(paraStyle).toBeNull();

    // "brown fox" should have the linked character style mark
    const charStyle = await getTextStyleId(superdoc.page, 'brown fox');
    expect(charStyle).toBe('Heading1Char');

    // Surrounding text should NOT have the character style mark
    const beforeStyle = await getTextStyleId(superdoc.page, 'quick');
    expect(beforeStyle).toBeNull();
  });

  test('full paragraph selection applies paragraph style', async ({ superdoc }) => {
    await superdoc.type('Apply heading to full paragraph');
    await superdoc.waitForStable();

    // Select all text
    await superdoc.selectAll();
    await superdoc.waitForStable();

    const result = await applyLinkedStyleToSelection(superdoc.page, 'Heading1');
    await superdoc.waitForStable();
    expect(result).toBe(true);

    // Paragraph style should be Heading1
    const paraStyle = await getParagraphStyleId(superdoc.page, 0);
    expect(paraStyle).toBe('Heading1');
  });

  test('partial linked character style clears formatting inside selection only', async ({ superdoc }) => {
    // Type text and bold it all
    await superdoc.bold();
    await superdoc.type('Hello world');
    await superdoc.waitForStable();

    await superdoc.assertTextHasMarks('Hello', ['bold']);

    // Select only "world" and apply Heading 1
    const pos = await superdoc.findTextPos('world');
    await superdoc.setTextSelection(pos, pos + 'world'.length);
    await superdoc.waitForStable();

    const result = await applyLinkedStyleToSelection(superdoc.page, 'Heading1');
    await superdoc.waitForStable();
    expect(result).toBe(true);

    // "Hello" should still be bold (outside selection)
    await superdoc.assertTextHasMarks('Hello', ['bold']);

    // "world" should have the linked character style
    const charStyle = await getTextStyleId(superdoc.page, 'world');
    expect(charStyle).toBe('Heading1Char');
  });

  test('Enter after partial linked style does not carry character style to new paragraph', async ({ superdoc }) => {
    await superdoc.type('Hello world');
    await superdoc.waitForStable();

    // Apply Heading 1 to "world" only
    const pos = await superdoc.findTextPos('world');
    await superdoc.setTextSelection(pos, pos + 'world'.length);
    await superdoc.waitForStable();

    await applyLinkedStyleToSelection(superdoc.page, 'Heading1');
    await superdoc.waitForStable();

    // Move cursor to end and press Enter
    await superdoc.press('End');
    await superdoc.waitForStable();
    await superdoc.newLine();
    await superdoc.type('new text');
    await superdoc.waitForStable();

    // New text should NOT have the linked character style
    const newTextStyle = await getTextStyleId(superdoc.page, 'new text');
    expect(newTextStyle).toBeNull();
  });

  test('cross-paragraph selection with linked style applies paragraph style to both', async ({ superdoc }) => {
    await superdoc.type('First paragraph');
    await superdoc.newLine();
    await superdoc.type('Second paragraph');
    await superdoc.waitForStable();

    // Select from mid-first to mid-second paragraph
    const fromPos = await superdoc.findTextPos('paragraph');
    const toText = await superdoc.findTextPos('Second');
    await superdoc.setTextSelection(fromPos, toText + 'Second'.length);
    await superdoc.waitForStable();

    const result = await applyLinkedStyleToSelection(superdoc.page, 'Heading1');
    await superdoc.waitForStable();
    expect(result).toBe(true);

    // Both paragraphs should have paragraph-level Heading1
    const para0 = await getParagraphStyleId(superdoc.page, 0);
    const para1 = await getParagraphStyleId(superdoc.page, 1);
    expect(para0).toBe('Heading1');
    expect(para1).toBe('Heading1');
  });
});
