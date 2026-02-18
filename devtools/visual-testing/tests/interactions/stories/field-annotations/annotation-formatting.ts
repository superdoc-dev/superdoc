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
 * Replace text with a field annotation, optionally with formatting attributes.
 */
async function replaceTextWithFormattedAnnotation(
  page: import('playwright').Page,
  searchText: string,
  displayLabel: string,
  fieldId: string,
  formatting: { bold?: boolean; italic?: boolean; underline?: boolean } = {},
): Promise<void> {
  const position = await findTextPosition(page, searchText);
  if (!position) {
    throw new Error(`Could not find text "${searchText}" in document`);
  }

  await page.evaluate(
    ({ from, to, label, id, format }) => {
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
    {
      from: position.from,
      to: position.to,
      label: displayLabel,
      id: fieldId,
      format: formatting,
    },
  );
}

/**
 * SD-1432: Test that field annotations render correctly with formatting attributes.
 *
 * The fix addressed two issues:
 * 1. Boolean underline values (underline: true) were not being handled
 * 2. Explicit formatting attrs on annotation nodes now properly override metadata formatting
 *
 * This story verifies that bold, italic, and underline formatting renders correctly
 * on field annotations when set via node attributes.
 */
export default defineStory({
  name: 'annotation-formatting',
  description: 'Test that field annotations render with bold, italic, and underline formatting',
  tickets: ['SD-1432'],
  startDocument: null,
  layout: true,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { type, newLine, waitForStable, milestone } = helpers;

    // Type document with placeholder text for each formatting variant
    await type('Plain: [PLAIN]');
    await newLine();
    await type('Bold: [BOLD]');
    await newLine();
    await type('Italic: [ITALIC]');
    await newLine();
    await type('Underline: [UNDERLINE]');
    await newLine();
    await type('Bold+Italic: [BOLD_ITALIC]');
    await newLine();
    await type('All formatting: [ALL]');

    await waitForStable(WAIT_MS);
    await milestone('text-typed', 'Document with placeholder text before annotations');

    // 1. Plain annotation (no formatting) - serves as visual baseline
    await replaceTextWithFormattedAnnotation(page, '[PLAIN]', 'Plain text', 'field-plain');
    await waitForStable(WAIT_MS);
    await milestone('plain-annotation', 'Field annotation with no formatting (baseline)');

    // 2. Bold annotation
    await replaceTextWithFormattedAnnotation(page, '[BOLD]', 'Bold text', 'field-bold', {
      bold: true,
    });
    await waitForStable(WAIT_MS);
    await milestone('bold-annotation', 'Field annotation with bold: true');

    // 3. Italic annotation
    await replaceTextWithFormattedAnnotation(page, '[ITALIC]', 'Italic text', 'field-italic', {
      italic: true,
    });
    await waitForStable(WAIT_MS);
    await milestone('italic-annotation', 'Field annotation with italic: true');

    // 4. Underline annotation (tests the boolean underline fix in SD-1432)
    await replaceTextWithFormattedAnnotation(page, '[UNDERLINE]', 'Underlined text', 'field-underline', {
      underline: true,
    });
    await waitForStable(WAIT_MS);
    await milestone('underline-annotation', 'Field annotation with underline: true');

    // 5. Bold + Italic annotation
    await replaceTextWithFormattedAnnotation(page, '[BOLD_ITALIC]', 'Bold italic text', 'field-bold-italic', {
      bold: true,
      italic: true,
    });
    await waitForStable(WAIT_MS);
    await milestone('bold-italic-annotation', 'Field annotation with bold + italic');

    // 6. All formatting combined
    await replaceTextWithFormattedAnnotation(page, '[ALL]', 'All formats', 'field-all', {
      bold: true,
      italic: true,
      underline: true,
    });
    await waitForStable(WAIT_MS);
    await milestone('all-variants-complete', 'Final state with all formatting variants');
  },
});
