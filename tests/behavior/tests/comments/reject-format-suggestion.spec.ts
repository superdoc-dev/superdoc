import { test, expect } from '../../fixtures/superdoc.js';
import { rejectAllTrackedChanges } from '../../helpers/tracked-changes.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

const TEXT = 'Agreement signed by both parties';

// ---------------------------------------------------------------------------
// Single mark rejections
// ---------------------------------------------------------------------------

test('reject tracked bold suggestion removes bold', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('Agreement', ['bold']);
  await superdoc.assertTextContent(TEXT);
});

test('reject tracked italic suggestion removes italic', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleItalic');
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('Agreement', ['italic']);
  await superdoc.assertTextContent(TEXT);
});

test('reject tracked underline suggestion removes underline', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('Agreement', ['underline']);
  await superdoc.assertTextContent(TEXT);
});

test('reject tracked strikethrough suggestion removes strike', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleStrike');
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextContent(TEXT);
});

// ---------------------------------------------------------------------------
// TextStyle rejections
// ---------------------------------------------------------------------------

test('reject tracked color suggestion restores original color', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  // Set initial styling
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Suggest a color change
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setColor('#FF0000');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  // Original color should be restored
  await superdoc.assertTextMarkAttrs('Agreement', 'textStyle', { color: '#112233' });
  await superdoc.assertTextContent(TEXT);
});

test('reject tracked font family suggestion restores original font', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  // Set initial styling
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Suggest a font family change
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontFamily('Arial, sans-serif');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.selectAll();
  await superdoc.waitForStable();
  // Original font should be restored
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Times New Roman');
  await superdoc.assertTextContent(TEXT);
});

test('reject tracked font size suggestion restores original size', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  // Set initial size
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontSize('16pt');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Suggest a size change
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontSize('24pt');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.selectAll();
  await superdoc.waitForStable();
  // Original size should be restored
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('16');
  await superdoc.assertTextContent(TEXT);
});

// ---------------------------------------------------------------------------
// Combination rejections
// ---------------------------------------------------------------------------

test('reject multiple mark suggestions restores all marks', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.executeCommand('toggleItalic');
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('Agreement', ['bold', 'italic', 'underline']);
  await superdoc.assertTextContent(TEXT);
});

test('reject multiple textStyle suggestions restores all styles', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  // Set initial styles
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Arial, sans-serif');
    e.commands.setColor('#112233');
    e.commands.setFontSize('16pt');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Suggest multiple style changes
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setColor('#FF00AA');
    e.commands.setFontFamily('Courier New');
    e.commands.setFontSize('18pt');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Arial');
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('16');
  await superdoc.assertTextMarkAttrs('Agreement', 'textStyle', { color: '#112233' });
  await superdoc.assertTextContent(TEXT);
});

test('reject mixed marks and textStyle suggestions restores everything', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();

  // Set initial styles
  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Arial, sans-serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Suggest marks + style changes
  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setColor('#FF00AA');
    e.commands.setFontFamily('Times New Roman, serif');
  });
  await superdoc.waitForStable();

  await superdoc.assertTrackedChangeExists('format');

  await rejectAllTrackedChanges(superdoc.page);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await superdoc.assertTextLacksMarks('Agreement', ['bold', 'underline']);
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Arial');
  await superdoc.assertTextMarkAttrs('Agreement', 'textStyle', { color: '#112233' });
  await superdoc.assertTextContent(TEXT);
});
