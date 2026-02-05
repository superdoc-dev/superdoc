import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

/**
 * Helper to find text position in the editor document.
 * Returns { from, to } positions for the first occurrence of the search text.
 */
async function findTextPosition(
  page: import('playwright').Page,
  searchText: string,
): Promise<{ from: number; to: number } | null> {
  return page.evaluate((text) => {
    const editor = (window as unknown as { editor?: { state?: { doc?: { textContent?: string } } } }).editor;
    if (!editor?.state?.doc) return null;

    const doc = editor.state.doc;
    let found: { from: number; to: number } | null = null;

    doc.descendants((node: { isText?: boolean; text?: string }, pos: number) => {
      if (found) return false;
      if (node.isText && node.text) {
        const index = node.text.indexOf(text);
        if (index !== -1) {
          found = { from: pos + index, to: pos + index + text.length };
          return false;
        }
      }
      return true;
    });

    return found;
  }, searchText);
}

/**
 * Replace text with a field annotation of the specified type.
 */
async function replaceTextWithAnnotation(
  page: import('playwright').Page,
  searchText: string,
  annotationType: string,
  displayLabel: string,
  fieldId: string,
  extraAttrs: Record<string, unknown> = {},
): Promise<void> {
  const position = await findTextPosition(page, searchText);
  if (!position) {
    throw new Error(`Could not find text "${searchText}" in document`);
  }

  await page.evaluate(
    ({ from, to, type, label, id, extras }) => {
      const editor = (
        window as unknown as { editor?: { commands?: { replaceWithFieldAnnotation?: (args: unknown[]) => void } } }
      ).editor;
      if (!editor?.commands?.replaceWithFieldAnnotation) {
        throw new Error('replaceWithFieldAnnotation command not available');
      }

      editor.commands.replaceWithFieldAnnotation([
        {
          from,
          to,
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
    {
      from: position.from,
      to: position.to,
      type: annotationType,
      label: displayLabel,
      id: fieldId,
      extras: extraAttrs,
    },
  );
}

export default defineStory({
  name: 'insert-all-types',
  description: 'Insert all 6 field annotation types into a document',
  startDocument: null,
  layout: true,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { type, newLine, waitForStable, milestone } = helpers;

    // Type document with placeholder text for each annotation type
    await type('Name: [NAME]');
    await newLine();
    await type('Agree to terms: [CHECKBOX]');
    await newLine();
    await type('Signature: [SIGNATURE]');
    await newLine();
    await type('Photo: [IMAGE]');
    await newLine();
    await type('Website: [LINK]');
    await newLine();
    await type('Custom content: [HTML]');

    await waitForStable(WAIT_MS);
    await milestone('text-typed', 'Document with placeholder text before any annotations');

    // Replace each placeholder with its corresponding annotation type

    // 1. Text annotation (default type for form fields)
    await replaceTextWithAnnotation(page, '[NAME]', 'text', 'Enter name', 'field-name');
    await waitForStable(WAIT_MS);
    await milestone('text-annotation', 'After inserting text-type field annotation');

    // 2. Checkbox annotation
    await replaceTextWithAnnotation(page, '[CHECKBOX]', 'checkbox', '☐', 'field-checkbox');
    await waitForStable(WAIT_MS);
    await milestone('checkbox-annotation', 'After inserting checkbox-type annotation');

    // 3. Signature annotation
    await replaceTextWithAnnotation(page, '[SIGNATURE]', 'signature', 'Sign here', 'field-signature');
    await waitForStable(WAIT_MS);
    await milestone('signature-annotation', 'After inserting signature-type annotation');

    // 4. Image annotation
    await replaceTextWithAnnotation(page, '[IMAGE]', 'image', 'Add photo', 'field-image');
    await waitForStable(WAIT_MS);
    await milestone('image-annotation', 'After inserting image-type annotation');

    // 5. Link annotation
    await replaceTextWithAnnotation(page, '[LINK]', 'link', 'example.com', 'field-link', {
      linkUrl: 'https://example.com',
    });
    await waitForStable(WAIT_MS);
    await milestone('link-annotation', 'After inserting link-type annotation');

    // 6. HTML annotation
    await replaceTextWithAnnotation(page, '[HTML]', 'html', '<custom>', 'field-html', {
      rawHtml: `<div style="font-family: Arial, sans-serif;">
  <p style="color: blue; margin: 0;">Line one of custom HTML</p>
  <p style="color: green; margin: 0;">Line two with different color</p>
  <p style="color: purple; margin: 0;">Line three completes the block</p>
</div>`,
    });
    await waitForStable(WAIT_MS);
    await milestone('all-types-complete', 'Final state with all 6 field annotation types');
  },
});
