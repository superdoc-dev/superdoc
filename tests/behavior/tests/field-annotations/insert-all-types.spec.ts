import { test, expect } from '../../fixtures/superdoc.js';
import { replaceTextWithAnnotation } from '../../helpers/field-annotations.js';

test('insert all 6 field annotation types', async ({ superdoc }) => {
  await superdoc.type('[NAME]');
  await superdoc.newLine();
  await superdoc.type('[CHECKBOX]');
  await superdoc.newLine();
  await superdoc.type('[SIGNATURE]');
  await superdoc.newLine();
  await superdoc.type('[IMAGE]');
  await superdoc.newLine();
  await superdoc.type('[LINK]');
  await superdoc.newLine();
  await superdoc.type('[HTML]');
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[NAME]', {
    type: 'text',
    displayLabel: 'Enter name',
    fieldId: 'field-name',
  });
  await replaceTextWithAnnotation(superdoc.page, '[CHECKBOX]', {
    type: 'checkbox',
    displayLabel: '☐',
    fieldId: 'field-checkbox',
  });
  await replaceTextWithAnnotation(superdoc.page, '[SIGNATURE]', {
    type: 'signature',
    displayLabel: 'Sign here',
    fieldId: 'field-signature',
  });
  await replaceTextWithAnnotation(superdoc.page, '[IMAGE]', {
    type: 'image',
    displayLabel: 'Add photo',
    fieldId: 'field-image',
  });
  await replaceTextWithAnnotation(superdoc.page, '[LINK]', {
    type: 'link',
    displayLabel: 'example.com',
    fieldId: 'field-link',
    linkUrl: 'https://example.com',
  });
  await replaceTextWithAnnotation(superdoc.page, '[HTML]', {
    type: 'html',
    displayLabel: '<custom>',
    fieldId: 'field-html',
    rawHtml: '<div style="font-family: Arial;"><p style="color: blue; margin: 0;">Custom HTML</p></div>',
  });
  await superdoc.waitForStable();

  // All 6 annotations should exist in the rendered DOM
  const annotation = (fieldId: string) =>
    superdoc.page.locator(`.superdoc-line .annotation[data-field-id="${fieldId}"]`);

  await expect(annotation('field-name')).toBeVisible();
  await expect(annotation('field-checkbox')).toBeVisible();
  await expect(annotation('field-signature')).toBeVisible();
  await expect(annotation('field-image')).toBeVisible();
  await expect(annotation('field-link')).toBeVisible();
  await expect(annotation('field-html')).toBeVisible();

  // Each annotation should have the correct data-type attribute
  await expect(annotation('field-name')).toHaveAttribute('data-type', 'text');
  await expect(annotation('field-checkbox')).toHaveAttribute('data-type', 'checkbox');
  await expect(annotation('field-signature')).toHaveAttribute('data-type', 'signature');
  await expect(annotation('field-image')).toHaveAttribute('data-type', 'image');
  await expect(annotation('field-link')).toHaveAttribute('data-type', 'link');
  await expect(annotation('field-html')).toHaveAttribute('data-type', 'html');

  // Display labels should match
  await expect(annotation('field-name')).toHaveAttribute('data-display-label', 'Enter name');
  await expect(annotation('field-checkbox')).toHaveAttribute('data-display-label', '☐');
  await expect(annotation('field-signature')).toHaveAttribute('data-display-label', 'Sign here');
  await expect(annotation('field-image')).toHaveAttribute('data-display-label', 'Add photo');
  await expect(annotation('field-link')).toHaveAttribute('data-display-label', 'example.com');
  await expect(annotation('field-html')).toHaveAttribute('data-display-label', '<custom>');

  // Verify PM nodes have correct types and attrs
  const pmNodes = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    const nodes: Array<{ fieldId: string; type: string; linkUrl: string | null; rawHtml: string | null }> = [];
    doc.descendants((node: any) => {
      if (node.type.name === 'fieldAnnotation') {
        nodes.push({
          fieldId: node.attrs.fieldId,
          type: node.attrs.type,
          linkUrl: node.attrs.linkUrl,
          rawHtml: node.attrs.rawHtml,
        });
      }
    });
    return nodes;
  });

  expect(pmNodes).toHaveLength(6);
  const byId = Object.fromEntries(pmNodes.map((n) => [n.fieldId, n]));
  expect(byId['field-name'].type).toBe('text');
  expect(byId['field-checkbox'].type).toBe('checkbox');
  expect(byId['field-signature'].type).toBe('signature');
  expect(byId['field-image'].type).toBe('image');
  expect(byId['field-link'].type).toBe('link');
  expect(byId['field-link'].linkUrl).toBe('https://example.com');
  expect(byId['field-html'].type).toBe('html');
  expect(byId['field-html'].rawHtml).toContain('Custom HTML');

  await superdoc.snapshot('insert-all-types');
});
