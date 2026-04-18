import { test, expect } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';

async function getFirstParagraphStyleId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    let result: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'paragraph') {
        result = node.attrs?.paragraphProperties?.styleId ?? null;
        return false;
      }
      return true;
    });
    return result;
  });
}

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test.describe('SD-2182 heading style changes in suggesting mode', () => {
  test('applying heading style via setStyleById works in suggesting mode', async ({ superdoc }) => {
    // Type text in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Select all and apply Heading1 style
    await superdoc.selectAll();
    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.setStyleById('Heading1');
    });
    await superdoc.waitForStable();

    const styleId = await getFirstParagraphStyleId(superdoc.page);
    expect(styleId).toBe('Heading1');
  });

  test('toggling heading style with cursor works in suggesting mode', async ({ superdoc }) => {
    // Type text in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();

    // Switch to suggesting mode (cursor is at end of text — empty selection)
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Apply Heading1 via toggleLinkedStyle with cursor (no selection)
    const result = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const style = editor.helpers.linkedStyles.getStyleById('Heading1');
      return editor.commands.toggleLinkedStyle(style);
    });
    await superdoc.waitForStable();

    expect(result).toBe(true);

    const styleId = await getFirstParagraphStyleId(superdoc.page);
    expect(styleId).toBe('Heading1');
  });

  test('toggling heading style off with cursor works in suggesting mode', async ({ superdoc }) => {
    // Type text and apply heading in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();
    await superdoc.selectAll();
    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.setStyleById('Heading1');
    });
    await superdoc.waitForStable();

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Toggle off Heading1 with cursor (no selection)
    const result = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const style = editor.helpers.linkedStyles.getStyleById('Heading1');
      return editor.commands.toggleLinkedStyle(style);
    });
    await superdoc.waitForStable();

    expect(result).toBe(true);

    const styleId = await getFirstParagraphStyleId(superdoc.page);
    expect(styleId).toBeNull();
  });
});
