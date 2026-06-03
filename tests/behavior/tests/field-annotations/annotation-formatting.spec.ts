import { test, expect } from '../../fixtures/superdoc.js';
import { replaceTextWithAnnotation } from '../../helpers/field-annotations.js';

test('field annotations render with bold, italic, underline formatting', async ({ superdoc }) => {
  // Type placeholders
  await superdoc.type('[PLAIN]');
  await superdoc.newLine();
  await superdoc.type('[BOLD]');
  await superdoc.newLine();
  await superdoc.type('[ITALIC]');
  await superdoc.newLine();
  await superdoc.type('[UNDERLINE]');
  await superdoc.newLine();
  await superdoc.type('[BOLD_ITALIC]');
  await superdoc.newLine();
  await superdoc.type('[ALL]');
  await superdoc.waitForStable();

  // Replace each placeholder with a field annotation
  await replaceTextWithAnnotation(superdoc.page, '[PLAIN]', { displayLabel: 'Plain text', fieldId: 'field-plain' });
  await replaceTextWithAnnotation(superdoc.page, '[BOLD]', {
    displayLabel: 'Bold text',
    fieldId: 'field-bold',
    bold: true,
  });
  await replaceTextWithAnnotation(superdoc.page, '[ITALIC]', {
    displayLabel: 'Italic text',
    fieldId: 'field-italic',
    italic: true,
  });
  await replaceTextWithAnnotation(superdoc.page, '[UNDERLINE]', {
    displayLabel: 'Underlined',
    fieldId: 'field-underline',
    underline: true,
  });
  await replaceTextWithAnnotation(superdoc.page, '[BOLD_ITALIC]', {
    displayLabel: 'Bold italic',
    fieldId: 'field-bi',
    bold: true,
    italic: true,
  });
  await replaceTextWithAnnotation(superdoc.page, '[ALL]', {
    displayLabel: 'All formats',
    fieldId: 'field-all',
    bold: true,
    italic: true,
    underline: true,
  });
  await superdoc.waitForStable();

  // Use DomPainter annotations (inside .superdoc-line) to avoid PM DOM duplicates
  const annotation = (fieldId: string) =>
    superdoc.page.locator(`.superdoc-line .annotation[data-field-id="${fieldId}"]`);

  // All 6 annotations should exist with correct display labels
  await expect(annotation('field-plain').locator('.annotation-content')).toHaveText('Plain text');
  await expect(annotation('field-bold').locator('.annotation-content')).toHaveText('Bold text');
  await expect(annotation('field-italic').locator('.annotation-content')).toHaveText('Italic text');
  await expect(annotation('field-underline').locator('.annotation-content')).toHaveText('Underlined');
  await expect(annotation('field-bi').locator('.annotation-content')).toHaveText('Bold italic');
  await expect(annotation('field-all').locator('.annotation-content')).toHaveText('All formats');

  // Plain: no formatting styles
  await expect(annotation('field-plain')).not.toHaveCSS('font-weight', /bold|700/);
  await expect(annotation('field-plain')).not.toHaveCSS('font-style', 'italic');

  // Bold: font-weight bold
  await expect(annotation('field-bold')).toHaveCSS('font-weight', /bold|700/);

  // Italic: font-style italic
  await expect(annotation('field-italic')).toHaveCSS('font-style', 'italic');

  // Underline: text-decoration includes underline
  const underlineDecoration = await annotation('field-underline').evaluate(
    (el: HTMLElement) => getComputedStyle(el).textDecorationLine || getComputedStyle(el).textDecoration,
  );
  expect(underlineDecoration).toContain('underline');

  // Bold+Italic: both
  await expect(annotation('field-bi')).toHaveCSS('font-weight', /bold|700/);
  await expect(annotation('field-bi')).toHaveCSS('font-style', 'italic');

  // All formats: bold + italic + underline
  await expect(annotation('field-all')).toHaveCSS('font-weight', /bold|700/);
  await expect(annotation('field-all')).toHaveCSS('font-style', 'italic');
  const allDecoration = await annotation('field-all').evaluate(
    (el: HTMLElement) => getComputedStyle(el).textDecorationLine || getComputedStyle(el).textDecoration,
  );
  expect(allDecoration).toContain('underline');

  // Verify PM nodes have correct attrs
  const pmNodes = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    const nodes: Array<{ fieldId: string; bold: boolean; italic: boolean; underline: boolean }> = [];
    doc.descendants((node: any) => {
      if (node.type.name === 'fieldAnnotation') {
        nodes.push({
          fieldId: node.attrs.fieldId,
          bold: node.attrs.bold,
          italic: node.attrs.italic,
          underline: node.attrs.underline,
        });
      }
    });
    return nodes;
  });

  expect(pmNodes).toHaveLength(6);
  const byId = Object.fromEntries(pmNodes.map((n) => [n.fieldId, n]));
  expect(byId['field-plain']).toMatchObject({ bold: false, italic: false, underline: false });
  expect(byId['field-bold']).toMatchObject({ bold: true, italic: false, underline: false });
  expect(byId['field-italic']).toMatchObject({ bold: false, italic: true, underline: false });
  expect(byId['field-underline']).toMatchObject({ bold: false, italic: false, underline: true });
  expect(byId['field-bi']).toMatchObject({ bold: true, italic: true, underline: false });
  expect(byId['field-all']).toMatchObject({ bold: true, italic: true, underline: true });

  await superdoc.snapshot('annotation-formatting');
});
