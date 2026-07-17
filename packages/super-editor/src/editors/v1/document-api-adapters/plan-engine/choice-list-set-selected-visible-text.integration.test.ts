/* @vitest-environment jsdom */

/**
 * End-to-end coverage for `choiceList.setSelected`: it must update a block-scope
 * dropdown's VISIBLE text, not just the stored `w:lastValue`.
 *
 * A block-scope dropdown is an SDT whose `sdtContent` wraps a `<w:p>` carrying
 * the currently displayed option (e.g. a "Yes/No" dropdown sitting on its own
 * line).
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const PLACEHOLDER = 'Select an item.';
const SELECTED = 'Yes';

describe('choiceList.setSelected updates the visible text (block scope)', () => {
  it('replaces the placeholder text with the selected option display text', async () => {
    const docData = await loadTestDataForEditorTests('block_dropdown_control.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    // The fixture starts on the placeholder option.
    const before = await Promise.resolve(editor.doc.contentControls.list());
    const dropdownBefore = before.items.find((item) => item.controlType === 'dropDownList');
    expect(dropdownBefore).toBeDefined();
    expect(dropdownBefore?.text).toContain(PLACEHOLDER);

    const result = await Promise.resolve(
      editor.doc.contentControls.choiceList.setSelected(
        { target: dropdownBefore!.target, value: SELECTED },
        { changeMode: 'direct' },
      ),
    );
    expect(result.success).toBe(true);

    // Re-read: the rendered text should now be the selected option, not the placeholder.
    const after = await Promise.resolve(editor.doc.contentControls.list());
    const dropdownAfter = after.items.find((item) => item.controlType === 'dropDownList');
    expect(dropdownAfter?.text).toContain(SELECTED);
    expect(dropdownAfter?.text).not.toContain(PLACEHOLDER);
  });
});
