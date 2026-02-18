import { test } from '../../fixtures/superdoc.js';

async function replaceTextWithAnnotation(
  page: any,
  searchText: string,
  annotationType: string,
  displayLabel: string,
  fieldId: string,
  extraAttrs: Record<string, unknown> = {},
) {
  await page.evaluate(
    ({ search, type, label, id, extras }: any) => {
      const editor = (window as any).editor;
      const doc = editor.state.doc;
      let found: { from: number; to: number } | null = null;

      doc.descendants((node: any, pos: number) => {
        if (found) return false;
        if (node.isText && node.text) {
          const index = node.text.indexOf(search);
          if (index !== -1) {
            found = { from: pos + index, to: pos + index + search.length };
            return false;
          }
        }
        return true;
      });

      if (!found) throw new Error(`Text "${search}" not found`);

      editor.commands.replaceWithFieldAnnotation([
        {
          from: (found as any).from,
          to: (found as any).to,
          attrs: {
            type,
            displayLabel: label,
            fieldId: id,
            fieldColor: '#6366f1',
            highlighted: true,
            ...extras,
          },
        },
      ]);
    },
    { search: searchText, type: annotationType, label: displayLabel, id: fieldId, extras: extraAttrs },
  );
}

test('@behavior insert all 6 field annotation types', async ({ superdoc }) => {
  await superdoc.type('Name: [NAME]');
  await superdoc.newLine();
  await superdoc.type('Agree to terms: [CHECKBOX]');
  await superdoc.newLine();
  await superdoc.type('Signature: [SIGNATURE]');
  await superdoc.newLine();
  await superdoc.type('Photo: [IMAGE]');
  await superdoc.newLine();
  await superdoc.type('Website: [LINK]');
  await superdoc.newLine();
  await superdoc.type('Custom content: [HTML]');
  await superdoc.waitForStable();
  await superdoc.screenshot('field-annotations-text');

  await replaceTextWithAnnotation(superdoc.page, '[NAME]', 'text', 'Enter name', 'field-name');
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[CHECKBOX]', 'checkbox', '☐', 'field-checkbox');
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[SIGNATURE]', 'signature', 'Sign here', 'field-signature');
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[IMAGE]', 'image', 'Add photo', 'field-image');
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[LINK]', 'link', 'example.com', 'field-link', {
    linkUrl: 'https://example.com',
  });
  await superdoc.waitForStable();

  await replaceTextWithAnnotation(superdoc.page, '[HTML]', 'html', '<custom>', 'field-html', {
    rawHtml: '<div style="font-family: Arial;"><p style="color: blue; margin: 0;">Custom HTML</p></div>',
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('field-annotations-all-types');
});
