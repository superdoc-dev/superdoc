import { describe, expect, it } from 'vitest';

import { Editor } from '@core/Editor.js';
import { BLANK_DOCX_BASE64 } from '@core/blank-docx.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { applyDiffPayload, captureSnapshot, compareToSnapshot } from './index.ts';

const TEST_USER = { name: 'Test User', email: 'test@example.com' };

async function openBlankDocxWithText(text: string): Promise<Editor> {
  const editor = await Editor.open(Buffer.from(BLANK_DOCX_BASE64, 'base64'), {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
  editor.dispatch(editor.state.tr.insertText(text, 1));
  return editor;
}

describe('diff-service tracked apply', () => {
  it('applies appended text as tracked changes', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days. Renewal requires written approval.',
    );

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'tracked' });

      baseEditor.dispatch(tr);

      expect(baseEditor.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });
});
