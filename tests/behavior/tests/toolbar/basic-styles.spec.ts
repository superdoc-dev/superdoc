import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Select "is a sentence" from the typed text.
 */
async function typeAndSelect(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.type('This is a sentence');
  await superdoc.newLine();
  await superdoc.type('Hello tests');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('is a sentence');
  await superdoc.setTextSelection(pos, pos + 'is a sentence'.length);
  await superdoc.waitForStable();

  // Verify selection rectangles are visible
  const selectionRect = superdoc.page.locator('.presentation-editor__selection-rect');
  await expect(selectionRect.first()).toBeVisible();
}

test('bold button applies bold', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  const boldButton = superdoc.page.locator('[data-item="btn-bold"]');
  await boldButton.click();
  await superdoc.waitForStable();

  await expect(boldButton).toHaveClass(/active/);
  await superdoc.snapshot('bold applied');

  await superdoc.assertTextHasMarks('is a sentence', ['bold']);
});

test('italic button applies italic', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  const italicButton = superdoc.page.locator('[data-item="btn-italic"]');
  await italicButton.click();
  await superdoc.waitForStable();

  await expect(italicButton).toHaveClass(/active/);
  await superdoc.snapshot('italic applied');

  await superdoc.assertTextHasMarks('is a sentence', ['italic']);
});

test('underline button applies underline', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  const underlineButton = superdoc.page.locator('[data-item="btn-underline"]');
  await underlineButton.click();
  await superdoc.waitForStable();

  await expect(underlineButton).toHaveClass(/active/);
  await superdoc.snapshot('underline applied');

  await superdoc.assertTextHasMarks('is a sentence', ['underline']);
});

test('strikethrough button applies strike', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  const strikeButton = superdoc.page.locator('[data-item="btn-strike"]');
  await strikeButton.click();
  await superdoc.waitForStable();

  await expect(strikeButton).toHaveClass(/active/);
  await superdoc.snapshot('strikethrough applied');

  await superdoc.assertTextHasMarks('is a sentence', ['strike']);
});

test('font family dropdown changes font', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  // Open the font family dropdown
  const fontButton = superdoc.page.locator('[data-item="btn-fontFamily"]');
  await fontButton.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('font family dropdown open');

  // Select "Georgia" from the dropdown
  const georgiaOption = superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Georgia' });
  await georgiaOption.click();
  await superdoc.waitForStable();

  // Assert the toolbar displays "Georgia"
  await expect(fontButton.locator('.button-label')).toHaveText('Georgia');
  await superdoc.snapshot('Georgia font applied');

  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontFamily: 'Georgia' });
});

test('font size dropdown changes size', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  // Open the font size dropdown
  const sizeButton = superdoc.page.locator('[data-item="btn-fontSize"]');
  await sizeButton.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('font size dropdown open');

  // Select "18" from the dropdown
  const sizeOption = superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '18' });
  await sizeOption.click();
  await superdoc.waitForStable();

  // Assert the toolbar displays "18"
  const sizeInput = superdoc.page.locator('#inlineTextInput-fontSize');
  await expect(sizeInput).toHaveValue('18');
  await superdoc.snapshot('font size 18 applied');

  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { fontSize: '18pt' });
});

test('color dropdown changes text color', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  // Open the color dropdown
  const colorButton = superdoc.page.locator('[data-item="btn-color"]');
  await colorButton.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('color dropdown open');

  // Click the red color swatch (#D2003F)
  const redSwatch = superdoc.page.locator('.option[aria-label="red"]').first();
  await redSwatch.click();
  await superdoc.waitForStable();

  // Assert the color bar on the toolbar icon changed to red
  const colorBar = colorButton.locator('.color-bar');
  await expect(colorBar).toHaveCSS('background-color', 'rgb(210, 0, 63)');
  await superdoc.snapshot('red color applied');

  await superdoc.assertTextMarkAttrs('is a sentence', 'textStyle', { color: '#D2003F' });
});

test('highlight dropdown changes background color', async ({ superdoc }) => {
  await typeAndSelect(superdoc);
  await superdoc.snapshot('text selected');

  // Open the highlight dropdown
  const highlightButton = superdoc.page.locator('[data-item="btn-highlight"]');
  await highlightButton.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('highlight dropdown open');

  // Click a highlight color swatch (#ECCF35)
  const yellowSwatch = superdoc.page.locator('.option[aria-label="yellow"]').first();
  await yellowSwatch.click();
  await superdoc.waitForStable();

  // Assert the color bar on the toolbar icon changed to yellow
  const highlightBar = highlightButton.locator('.color-bar');
  await expect(highlightBar).toHaveCSS('background-color', 'rgb(236, 207, 53)');
  await superdoc.snapshot('yellow highlight applied');

  await superdoc.assertTextHasMarks('is a sentence', ['highlight']);
});
