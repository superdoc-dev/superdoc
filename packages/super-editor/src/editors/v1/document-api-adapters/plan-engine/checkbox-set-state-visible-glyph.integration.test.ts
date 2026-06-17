/* @vitest-environment jsdom */

/**
 * End-to-end coverage for `checkbox.setState`: it must update a block-scope
 * checkbox's VISIBLE glyph, not just the stored `w14:checked` value.
 *
 * A block-scope checkbox is an SDT whose `sdtContent` wraps a `<w:p>` carrying
 * the glyph (e.g. stacked Yes/No checkboxes in a table cell). The inline path
 * swaps the glyph via `updateStructuredContentById`, but that builds inline text
 * JSON the block schema rejects — so for block SDTs the glyph must be rewritten
 * through the content range directly. The unit test in
 * `content-controls-wrappers.test.ts` pins the wrapper-level behavior with a
 * mock; this test drives the real import → mutate → read pipeline against the
 * `block_checkbox_control.docx` fixture to confirm the glyph swaps end-to-end
 * and to guard against regressions.
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const UNCHECKED = '☐'; // U+2610
const CHECKED = '☒'; // U+2612

describe('checkbox.setState updates the visible glyph (block scope)', () => {
  it('swaps the rendered glyph ☐ -> ☒ for a block-scope checkbox', async () => {
    const docData = await loadTestDataForEditorTests('block_checkbox_control.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    // The fixture starts unchecked.
    const before = await Promise.resolve(editor.doc.contentControls.list());
    const checkboxBefore = before.items.find((item) => item.controlType === 'checkbox');
    expect(checkboxBefore).toBeDefined();
    expect(checkboxBefore?.text).toContain(UNCHECKED);

    const result = await Promise.resolve(
      editor.doc.contentControls.checkbox.setState(
        { target: checkboxBefore!.target, checked: true },
        { changeMode: 'direct' },
      ),
    );
    expect(result.success).toBe(true);

    // Re-read: the rendered glyph should now be checked, not the empty box.
    const after = await Promise.resolve(editor.doc.contentControls.list());
    const checkboxAfter = after.items.find((item) => item.controlType === 'checkbox');
    expect(checkboxAfter?.text).toContain(CHECKED);
    expect(checkboxAfter?.text).not.toContain(UNCHECKED);
  });
});
