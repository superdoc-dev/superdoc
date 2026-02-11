import { test } from '../../fixtures/superdoc.js';

async function replaceTextWithFormattedAnnotation(
  page: any,
  searchText: string,
  displayLabel: string,
  fieldId: string,
  formatting: { bold?: boolean; italic?: boolean; underline?: boolean } = {},
) {
  await page.evaluate(
    ({ search, label, id, format }: any) => {
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
            type: 'text',
            displayLabel: label,
            fieldId: id,
            fieldColor: '#6366f1',
            highlighted: true,
            ...format,
          },
        },
      ]);
    },
    { search: searchText, label: displayLabel, id: fieldId, format: formatting },
  );
}

test('@behavior field annotations render with bold, italic, underline formatting', async ({ superdoc }) => {
  await superdoc.type('Plain: [PLAIN]');
  await superdoc.newLine();
  await superdoc.type('Bold: [BOLD]');
  await superdoc.newLine();
  await superdoc.type('Italic: [ITALIC]');
  await superdoc.newLine();
  await superdoc.type('Underline: [UNDERLINE]');
  await superdoc.newLine();
  await superdoc.type('Bold+Italic: [BOLD_ITALIC]');
  await superdoc.newLine();
  await superdoc.type('All formatting: [ALL]');
  await superdoc.waitForStable();
  await superdoc.screenshot('annotation-format-text');

  await replaceTextWithFormattedAnnotation(superdoc.page, '[PLAIN]', 'Plain text', 'field-plain');
  await replaceTextWithFormattedAnnotation(superdoc.page, '[BOLD]', 'Bold text', 'field-bold', { bold: true });
  await replaceTextWithFormattedAnnotation(superdoc.page, '[ITALIC]', 'Italic text', 'field-italic', { italic: true });
  await replaceTextWithFormattedAnnotation(superdoc.page, '[UNDERLINE]', 'Underlined', 'field-underline', {
    underline: true,
  });
  await replaceTextWithFormattedAnnotation(superdoc.page, '[BOLD_ITALIC]', 'Bold italic', 'field-bi', {
    bold: true,
    italic: true,
  });
  await replaceTextWithFormattedAnnotation(superdoc.page, '[ALL]', 'All formats', 'field-all', {
    bold: true,
    italic: true,
    underline: true,
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('annotation-format-all-variants');
});
