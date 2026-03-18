import { test, expect } from '../../fixtures/superdoc.js';

const DOC_WITH_PROTECTED_TRAILING_PARAGRAPH = {
  type: 'doc',
  content: [
    {
      type: 'table',
      attrs: {
        tableProperties: {},
        grid: [{ col: 1500 }],
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Cell' }] }] }],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
    },
  ],
};

async function getProtectedTrailingParagraphState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor.state.doc;
    const topLevel = [];
    for (let i = 0; i < doc.childCount; i += 1) {
      const child = doc.child(i);
      topLevel.push({
        type: child.type.name,
        textContent: child.textContent,
      });
    }

    const trailingParagraphPos =
      doc.childCount >= 2 && doc.child(doc.childCount - 1).type.name === 'paragraph'
        ? doc.content.size - doc.child(doc.childCount - 1).nodeSize + 1
        : null;

    return {
      topLevel,
      selection: {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      },
      trailingParagraphPos,
    };
  });
}

test('Backspace and Delete do not remove the protected trailing paragraph after a final table', async ({
  superdoc,
}) => {
  await superdoc.page.evaluate((content) => {
    const editor = (window as any).editor;
    const schema = editor.state.schema;
    const nextDoc = schema.nodeFromJSON(content);
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nextDoc.content));
  }, DOC_WITH_PROTECTED_TRAILING_PARAGRAPH);

  const hiddenEditor = superdoc.page.locator('[contenteditable="true"]').first();
  await hiddenEditor.focus();

  const initial = await getProtectedTrailingParagraphState(superdoc.page);
  expect(initial.topLevel).toEqual([
    { type: 'table', textContent: 'Cell' },
    { type: 'paragraph', textContent: '' },
  ]);
  expect(initial.trailingParagraphPos).not.toBeNull();

  await superdoc.setTextSelection(initial.trailingParagraphPos!);
  await superdoc.waitForStable();
  await superdoc.assertSelection(initial.trailingParagraphPos!);

  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  const afterBackspace = await getProtectedTrailingParagraphState(superdoc.page);
  expect(afterBackspace.topLevel).toEqual(initial.topLevel);
  expect(afterBackspace.selection).toEqual({
    from: initial.trailingParagraphPos,
    to: initial.trailingParagraphPos,
  });

  await superdoc.press('Delete');
  await superdoc.waitForStable();

  const afterDelete = await getProtectedTrailingParagraphState(superdoc.page);
  expect(afterDelete.topLevel).toEqual(initial.topLevel);
  expect(afterDelete.selection).toEqual({
    from: initial.trailingParagraphPos,
    to: initial.trailingParagraphPos,
  });
});
