import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

const MARKER = '.superdoc-paragraph-marker';

test.describe('list type switching and nesting', () => {
  test('change ordered list to unordered', async ({ superdoc }) => {
    // Create a 2-item ordered list
    await superdoc.type('1. first');
    await superdoc.newLine();
    await superdoc.type('second');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);

    // Select all and click bullet list button to switch type
    await superdoc.selectAll();
    await superdoc.waitForStable();
    await superdoc.page.locator('[data-item="btn-list"]').click();
    await superdoc.waitForStable();

    // Markers should still exist
    await superdoc.assertElementCount(MARKER, 2);

    // Verify the list is now unordered by checking listRendering attrs on paragraphs
    const numberingType = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      let type: string | null = null;
      editor.state.doc.descendants((node: any) => {
        if (type) return false;
        if (node.type.name === 'paragraph' && node.attrs.listRendering) {
          type = node.attrs.listRendering.numberingType ?? null;
          return false;
        }
        return true;
      });
      return type;
    });
    expect(numberingType).toBe('bullet');
  });

  test('change sublist type independently of parent', async ({ superdoc }) => {
    // Create ordered list with a nested item
    await superdoc.type('1. parent');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('child');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);

    // Cursor is already on the child item — click bullet list to change sublist type
    await superdoc.page.locator('[data-item="btn-list"]').click();
    await superdoc.waitForStable();

    // Verify paragraphs have different numbering types
    const numberingTypes = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const types: string[] = [];
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === 'paragraph' && node.attrs.listRendering) {
          types.push(node.attrs.listRendering.numberingType ?? 'unknown');
        }
        return true;
      });
      return types;
    });

    // Parent should remain ordered (not 'bullet'), child should be 'bullet'
    expect(numberingTypes.length).toBe(2);
    expect(numberingTypes).toContain('bullet');
    // At least one item should NOT be bullet (the parent)
    expect(numberingTypes.some((t) => t !== 'bullet')).toBe(true);
  });

  test('create deeply nested list with 3+ levels', async ({ superdoc }) => {
    // Create 4-level nested list
    await superdoc.type('- level 0');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('level 1');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('level 2');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('level 3');
    await superdoc.waitForStable();

    // Should have 4 markers total
    await superdoc.assertElementCount(MARKER, 4);

    // Verify content at all levels
    await superdoc.assertTextContains('level 0');
    await superdoc.assertTextContains('level 1');
    await superdoc.assertTextContains('level 2');
    await superdoc.assertTextContains('level 3');
  });
});
