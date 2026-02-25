import { test, expect } from '../../fixtures/superdoc.js';
import {
  insertBlockSdt,
  insertInlineSdt,
  insertBlockSdtWithHtml,
  insertInlineSdtWithId,
  updateSdtById,
  updateSdtByGroup,
  deleteSdtById,
  deleteSdtAtSelection,
  getSdtIdFromState,
} from '../../helpers/sdt.js';

test.use({ config: { toolbar: 'full' } });

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const BLOCK_SDT = '.superdoc-structured-content-block';
const INLINE_SDT = '.superdoc-structured-content-inline';
const MARKER = '.superdoc-paragraph-marker';

// ==========================================================================
// Inline SDT creation
// ==========================================================================

test.describe('inline SDT creation', () => {
  test('turn selected text into structured content inline', async ({ superdoc }) => {
    await superdoc.type('wrap this text');
    await superdoc.waitForStable();

    // Select "this"
    const pos = await superdoc.findTextPos('this');
    await superdoc.setTextSelection(pos, pos + 4);
    await superdoc.waitForStable();

    await insertInlineSdtWithId(superdoc.page, { id: '1001', alias: 'Wrapped' });
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertTextContains('this');
  });

  test('insert inline with pre-populated text', async ({ superdoc }) => {
    await superdoc.type('before ');
    await superdoc.waitForStable();

    await insertInlineSdtWithId(superdoc.page, { id: '1002', alias: 'Prefilled' }, 'hello world');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertTextContains('hello world');
  });
});

// ==========================================================================
// Block SDT creation
// ==========================================================================

test.describe('block SDT creation', () => {
  test('insert HTML as block', async ({ superdoc }) => {
    await superdoc.type('above');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertBlockSdtWithHtml(superdoc.page, { id: '2001', alias: 'HTML Block' }, '<p>Block paragraph content</p>');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertTextContains('Block paragraph content');
  });

  test('insert block with json content', async ({ superdoc }) => {
    await superdoc.type('above');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { id: '2002', alias: 'JSON Block' },
        json: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'json paragraph content' }],
        },
      });
    });
    await superdoc.waitForStable();

    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertTextContains('json paragraph content');

    // Verify the node exists in PM state within the block SDT
    const hasContent = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      let found = false;
      editor.state.doc.descendants((node: any) => {
        if (found) return false;
        if (node.type.name === 'structuredContentBlock' && String(node.attrs.id) === '2002') {
          found = true;
          return false;
        }
        return true;
      });
      return found;
    });
    expect(hasContent).toBe(true);
  });

  test('insert block with html containing formatted content', async ({ superdoc }) => {
    await superdoc.type('above');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertBlockSdtWithHtml(
      superdoc.page,
      { id: '2003', alias: 'Formatted Block' },
      '<p><strong>bold text</strong> and normal text</p>',
    );
    await superdoc.waitForStable();

    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertTextContains('bold text');
    await superdoc.assertTextContains('normal text');
  });
});

// ==========================================================================
// Update SDT by ID
// ==========================================================================

test.describe('update SDT by ID', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.type('context ');
    await superdoc.newLine();
    await superdoc.waitForStable();
  });

  test('update html → html', async ({ superdoc }) => {
    await insertBlockSdtWithHtml(superdoc.page, { id: '3001', alias: 'Update Target' }, '<p>original html</p>');
    await superdoc.waitForStable();

    await superdoc.assertTextContains('original html');

    await updateSdtById(superdoc.page, '3001', { html: '<p>replaced html</p>' });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('replaced html');
    await superdoc.assertTextNotContains('original html');
  });

  test('update html → json', async ({ superdoc }) => {
    await insertBlockSdtWithHtml(superdoc.page, { id: '3002', alias: 'HTML to JSON' }, '<p>old html</p>');
    await superdoc.waitForStable();

    await updateSdtById(superdoc.page, '3002', {
      json: { type: 'paragraph', content: [{ type: 'text', text: 'new json text' }] },
    });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('new json text');
    await superdoc.assertTextNotContains('old html');
  });

  test('update json → json', async ({ superdoc }) => {
    // Insert via json
    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { id: '3003', alias: 'JSON to JSON' },
        json: { type: 'paragraph', content: [{ type: 'text', text: 'original json' }] },
      });
    });
    await superdoc.waitForStable();

    await updateSdtById(superdoc.page, '3003', {
      json: { type: 'paragraph', content: [{ type: 'text', text: 'updated json' }] },
    });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('updated json');
    await superdoc.assertTextNotContains('original json');
  });

  test('update json → html', async ({ superdoc }) => {
    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { id: '3004', alias: 'JSON to HTML' },
        json: { type: 'paragraph', content: [{ type: 'text', text: 'json content' }] },
      });
    });
    await superdoc.waitForStable();

    await updateSdtById(superdoc.page, '3004', { html: '<p>html replacement</p>' });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('html replacement');
    await superdoc.assertTextNotContains('json content');
  });
});

// ==========================================================================
// Update SDT by group
// ==========================================================================

test.describe('update SDT by group', () => {
  test('update all fields in a group', async ({ superdoc }) => {
    await superdoc.type('context ');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertBlockSdtWithHtml(
      superdoc.page,
      { id: '4001', alias: 'Grouped Block', group: 'test-group' },
      '<p>group original</p>',
    );
    await superdoc.waitForStable();

    await superdoc.assertTextContains('group original');

    await updateSdtByGroup(superdoc.page, 'test-group', { html: '<p>group updated</p>' });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('group updated');
    await superdoc.assertTextNotContains('group original');
  });
});

// ==========================================================================
// Delete SDT
// ==========================================================================

test.describe('delete SDT', () => {
  test('delete inline by ID', async ({ superdoc }) => {
    await superdoc.type('before ');
    await superdoc.waitForStable();

    await insertInlineSdtWithId(superdoc.page, { id: '5001', alias: 'Delete Me' }, 'doomed');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);

    await deleteSdtById(superdoc.page, '5001');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(INLINE_SDT, 0);
  });

  test('delete inline preserving content in PM state', async ({ superdoc }) => {
    await superdoc.type('before ');
    await superdoc.waitForStable();

    await insertInlineSdtWithId(superdoc.page, { id: '5002', alias: 'Unwrap Me' }, 'kept text');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);

    // Set cursor inside the SDT then call deleteStructuredContentAtSelection
    const result = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      let sdtPos: number | null = null;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (sdtPos !== null) return false;
        if (node.type.name === 'structuredContent' && String(node.attrs.id) === '5002') {
          sdtPos = pos;
          return false;
        }
        return true;
      });
      if (sdtPos === null) return { error: 'sdt not found' };
      const innerPos = sdtPos + 1;
      editor.chain().setTextSelection({ from: innerPos, to: innerPos }).deleteStructuredContentAtSelection().run();
      // Check PM state after the command
      let sdtCount = 0;
      let textFound = false;
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === 'structuredContent') sdtCount++;
        if (node.isText && node.text?.includes('kept text')) textFound = true;
        return true;
      });
      return { sdtCount, textFound };
    });
    expect(result).toEqual({ sdtCount: 0, textFound: true });

    // The text content should still be accessible via document API
    await superdoc.assertTextContains('kept text');
  });

  test('delete multiple inlines at once', async ({ superdoc }) => {
    await superdoc.type('a ');
    await superdoc.waitForStable();
    await insertInlineSdtWithId(superdoc.page, { id: '5003', alias: 'Multi A' }, 'sdt-a');
    await superdoc.waitForStable();

    await superdoc.type(' b ');
    await superdoc.waitForStable();
    await insertInlineSdtWithId(superdoc.page, { id: '5004', alias: 'Multi B' }, 'sdt-b');
    await superdoc.waitForStable();

    await superdoc.type(' c ');
    await superdoc.waitForStable();
    await insertInlineSdtWithId(superdoc.page, { id: '5005', alias: 'Multi C' }, 'sdt-c');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(INLINE_SDT, 3);

    await deleteSdtById(superdoc.page, ['5003', '5004', '5005']);
    await superdoc.waitForStable();

    await superdoc.assertElementCount(INLINE_SDT, 0);
  });
});

// ==========================================================================
// SDT in complex contexts
// ==========================================================================

test.describe('SDT in complex contexts', () => {
  test('insert inline SDT inside a list', async ({ superdoc }) => {
    // Create a bullet list item
    await superdoc.type('- list item ');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 1);

    // Insert inline SDT within the list item
    await insertInlineSdtWithId(superdoc.page, { id: '6001', alias: 'List SDT' }, 'sdt in list');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertElementCount(MARKER, 1);
    await superdoc.assertTextContains('sdt in list');
  });

  test('insert multiple inlines in nested list', async ({ superdoc }) => {
    // Create a nested list
    await superdoc.type('- parent ');
    await superdoc.waitForStable();
    await insertInlineSdtWithId(superdoc.page, { id: '6002', alias: 'Parent SDT' }, 'sdt-parent');
    await superdoc.waitForStable();

    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('child ');
    await superdoc.waitForStable();
    await insertInlineSdtWithId(superdoc.page, { id: '6003', alias: 'Child SDT' }, 'sdt-child');
    await superdoc.waitForStable();

    await superdoc.assertElementCount(MARKER, 2);
    await superdoc.assertElementCount(INLINE_SDT, 2);
  });

  test('insert inline SDT inside a table cell', async ({ superdoc }) => {
    // Insert a table
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Type some text in the first cell (cursor is already there)
    await superdoc.type('cell ');
    await superdoc.waitForStable();

    // Insert inline SDT
    await insertInlineSdtWithId(superdoc.page, { id: '6004', alias: 'Table SDT' }, 'sdt in cell');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertTextContains('sdt in cell');
  });

  test('insert block SDT inside a table cell', async ({ superdoc }) => {
    // Insert a table
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Insert block SDT in the first cell
    await insertBlockSdtWithHtml(superdoc.page, { id: '6005', alias: 'Table Block SDT' }, '<p>block in cell</p>');
    await superdoc.waitForStable();

    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertTextContains('block in cell');
  });
});
