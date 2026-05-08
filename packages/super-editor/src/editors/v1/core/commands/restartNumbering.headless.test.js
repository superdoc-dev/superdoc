// @ts-check
/**
 * Headless dispatch regression for `restartNumbering` (first-item branch).
 *
 * Bug: when `restartNumbering` runs on the first list item, it calls
 * `setLvlOverride` (which fires `partChanged` -> `handleNumberingInvalidation`)
 * then sets `preventDispatch: true` on the captured tr.
 *
 * Same chain as `continueNumbering`:
 * - `handleNumberingInvalidation` only dispatches through `editor.view?.dispatch`,
 *   silent no-op without a view.
 * - `preventDispatch: true` blocks `CommandService`'s `editor.dispatch` fallback.
 *
 * Net: in headless mode no transaction flows. `listRendering` stays stale and
 * `update` / `transaction` listeners do not fire. The mid-list branch (which
 * remaps paragraphs onto a brand-new numId) is unaffected because it does not
 * set `preventDispatch`.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { TextSelection } from 'prosemirror-state';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('restart-numbering-sub-list.docx');
});

describe('restartNumbering — headless dispatch (first-item branch)', () => {
  it('dispatches a transaction when the editor has no view', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    expect(editor.view).toBeFalsy();

    let firstListPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (firstListPos != null) return false;
      if (node.type.name !== 'paragraph') return true;
      const np = node.attrs?.paragraphProperties?.numberingProperties;
      if (np && np.numId != null) {
        firstListPos = pos;
        return false;
      }
      return true;
    });
    expect(firstListPos).not.toBeNull();

    editor.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(firstListPos + 1))));

    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    editor.commands.restartNumbering();

    expect(
      dispatchSpy,
      'restartNumbering must dispatch a transaction in headless mode so listRendering can recompute',
    ).toHaveBeenCalled();
  });
});
