// @ts-check
/**
 * Headless dispatch regression for `continueNumbering`.
 *
 * Bug: `continueNumbering` removes the `lvlOverride` (which fires
 * `partChanged` -> `handleNumberingInvalidation`), then sets
 * `preventDispatch: true` on the captured transaction.
 *
 * - `handleNumberingInvalidation` only dispatches via
 *   `editor.view?.dispatch?.(...)`, so it is a silent no-op when there is
 *   no view.
 * - `preventDispatch: true` makes `CommandService` skip its own
 *   `dispatchWithFallback`, which is the path that would otherwise call
 *   `editor.dispatch(tr)` in headless mode.
 *
 * Net: in headless mode no transaction flows after `continueNumbering()`,
 * so `numberingPlugin.appendTransaction` never runs and consumer-visible
 * events (`update`, `transaction`) never fire even though the underlying
 * numbering XML did mutate. Headless consumers see stale state.
 *
 * Expected fix shape: only skip the captured tr when a view-side
 * invalidation actually dispatched. In headless mode, the captured tr (or
 * an equivalent empty tr) should still dispatch.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { TextSelection } from 'prosemirror-state';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('restart-numbering-sub-list.docx');
});

describe('continueNumbering — headless dispatch', () => {
  it('dispatches a transaction when the editor has no view', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    expect(editor.view).toBeFalsy();

    let listParaPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (listParaPos != null) return false;
      if (node.type.name !== 'paragraph') return true;
      const np = node.attrs?.paragraphProperties?.numberingProperties;
      if (np && np.numId != null) {
        listParaPos = pos;
        return false;
      }
      return true;
    });
    expect(listParaPos).not.toBeNull();

    editor.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(listParaPos + 1))));

    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    editor.commands.continueNumbering();

    expect(
      dispatchSpy,
      'continueNumbering must dispatch a transaction in headless mode so listRendering can recompute',
    ).toHaveBeenCalled();
  });
});
