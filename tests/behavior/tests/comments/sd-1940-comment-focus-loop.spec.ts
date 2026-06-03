import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('SD-1940: programmatic selection + addComment does not enter a dispatch loop', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  const initialComments = await listComments(superdoc.page, { includeResolved: true });

  const result = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    if (!editor?.view?.dispatch) {
      throw new Error('Expected editor.view.dispatch to be available.');
    }
    if (!editor?.commands?.addComment) {
      throw new Error('Expected editor.commands.addComment to be available.');
    }

    const originalDispatch = editor.view.dispatch.bind(editor.view);
    let dispatchCount = 0;

    editor.view.dispatch = (tr: unknown) => {
      dispatchCount += 1;
      if (dispatchCount > 25) {
        throw new Error('Dispatch loop detected while adding a programmatic comment.');
      }
      return originalDispatch(tr);
    };

    try {
      const state = editor.view.state;
      const SelectionCtor = state.selection?.constructor;
      if (!SelectionCtor || typeof SelectionCtor.create !== 'function') {
        throw new Error('Unable to construct a text selection from editor state.');
      }

      const selectionTr = state.tr.setSelection(SelectionCtor.create(state.doc, 1, 6));
      editor.view.focus();
      editor.view.dispatch(selectionTr);

      const addCommentResult = editor.commands.addComment({
        content: 'Programmatic comment from SD-1940 behavior test',
      });

      return {
        addCommentResult: addCommentResult === true,
        dispatchCount,
      };
    } finally {
      editor.view.dispatch = originalDispatch;
    }
  });

  await superdoc.waitForStable();

  expect(result.addCommentResult).toBe(true);
  expect(result.dispatchCount).toBeLessThanOrEqual(25);

  await expect
    .poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total)
    .toBe(initialComments.total + 1);

  const secondAddCommentResult = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const state = editor.view.state;
    const SelectionCtor = state.selection?.constructor;
    if (!SelectionCtor || typeof SelectionCtor.create !== 'function') {
      throw new Error('Unable to construct a follow-up text selection from editor state.');
    }

    // Select "world" and add a second comment to verify the editor remains usable.
    const secondSelectionTr = state.tr.setSelection(SelectionCtor.create(state.doc, 7, 12));
    editor.view.dispatch(secondSelectionTr);

    return (
      editor.commands.addComment({
        content: 'Second programmatic comment after SD-1940 sequence',
      }) === true
    );
  });
  await superdoc.waitForStable();

  expect(secondAddCommentResult).toBe(true);
  await expect
    .poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total)
    .toBe(initialComments.total + 2);
});
