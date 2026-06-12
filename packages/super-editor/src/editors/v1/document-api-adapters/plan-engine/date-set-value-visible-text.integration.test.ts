/* @vitest-environment jsdom */

/**
 * End-to-end coverage for `date.setValue`: it must update the SDT's VISIBLE
 * text, not just the stored `w:fullDate` value.
 *
 * Writing `w:sdtPr/w:date/@w:fullDate` alone leaves the rendered content
 * untouched, so a date control keeps showing its placeholder
 * ("Click or tap to enter a date.") even though the OOXML value is correct.
 * The unit test in `content-controls-wrappers.test.ts` pins the wrapper-level
 * behavior with a mock; this test drives the real import → mutate → read
 * pipeline against the `date_control.docx` fixture to confirm the behavior
 * holds end-to-end and to guard against regressions.
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const PLACEHOLDER = 'Click or tap to enter a date.';
const NEW_DATE = '2026-05-24';

describe('date.setValue updates visible text', () => {
  it('replaces the placeholder with the new value in the rendered date control', async () => {
    const docData = await loadTestDataForEditorTests('date_control.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    // Sanity check: the fixture starts out showing Word's date placeholder.
    const before = await Promise.resolve(editor.doc.contentControls.list());
    const dateBefore = before.items.find((item) => item.controlType === 'date');
    expect(dateBefore).toBeDefined();
    expect(dateBefore?.text).toContain(PLACEHOLDER);

    const result = await Promise.resolve(
      editor.doc.contentControls.date.setValue(
        { target: dateBefore!.target, value: NEW_DATE },
        { changeMode: 'direct' },
      ),
    );
    expect(result.success).toBe(true);

    // Re-read: the visible text should now be the date value, not the placeholder.
    const after = await Promise.resolve(editor.doc.contentControls.list());
    const dateAfter = after.items.find((item) => item.controlType === 'date');
    expect(dateAfter?.text).toContain(NEW_DATE);
    expect(dateAfter?.text).not.toContain(PLACEHOLDER);
  });
});
