import { describe, expect, it } from 'vitest';

import { Editor } from '@core/Editor.js';
import { BLANK_DOCX_BASE64 } from '@core/blank-docx.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import type { CommentInput } from '../algorithm/comment-diffing.ts';
import { applyDiffPayload, captureSnapshot, compareToSnapshot } from './index.ts';

const TEST_USER = { name: 'Test User', email: 'test@example.com' };

type MutableCommentPayload = {
  commentText: string;
  textJson: {
    content: Array<{ text: string }>;
  };
};

type ModifiedCommentDiffPayload = {
  action: string;
  oldCommentJSON: MutableCommentPayload;
  newCommentJSON: MutableCommentPayload;
};

function buildCommentTextJson(text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function setEditorComments(editor: Editor, comments: CommentInput[]): void {
  if (!editor.converter) {
    throw new Error('Expected editor converter to be initialized.');
  }
  editor.converter.comments = comments;
}

async function openBlankDocxWithText(text: string): Promise<Editor> {
  const editor = await Editor.open(Buffer.from(BLANK_DOCX_BASE64, 'base64'), {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
  editor.dispatch(editor.state.tr.insertText(text, 1));
  return editor;
}

async function reopenExportedDocument(exported: Blob | Buffer): Promise<Editor> {
  const buffer = Buffer.isBuffer(exported) ? exported : Buffer.from(await exported.arrayBuffer());
  return Editor.open(buffer, {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
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

  it('applies added paragraph content as tracked changes', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days.\nRenewal requires written approval.',
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

  it('preserves tracked diff changes through export and reopen', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days.\nRenewal requires written approval.',
    );

    let reopenedEditor: Editor | undefined;

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'tracked' });

      baseEditor.dispatch(tr);

      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);

      const exported = await baseEditor.exportDocument();
      reopenedEditor = await reopenExportedDocument(exported);

      expect(getTrackChanges(reopenedEditor.state).length).toBeGreaterThan(0);
    } finally {
      reopenedEditor?.destroy?.();
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('rejects snapshots whose comment identity was tampered after capture', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      setEditorComments(targetEditor, [
        {
          commentId: 'c-1',
          commentText: 'Identity comment',
          textJson: buildCommentTextJson('Identity comment'),
        },
      ]);

      const snapshot = captureSnapshot(targetEditor);
      const snapshotComments = snapshot.payload.comments as Array<Record<string, unknown>>;
      snapshotComments[0]!.commentId = 'c-2';

      expect(() => compareToSnapshot(baseEditor, snapshot)).toThrowError(
        /fingerprint does not match re-derived value/i,
      );
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('returns comment diffs detached from base comments and target snapshot payloads', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      setEditorComments(baseEditor, [
        {
          commentId: 'c-1',
          commentText: 'Old comment',
          textJson: buildCommentTextJson('Old nested'),
        },
      ]);
      setEditorComments(targetEditor, [
        {
          commentId: 'c-1',
          commentText: 'New comment',
          textJson: buildCommentTextJson('New nested'),
        },
      ]);

      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const commentDiffs = (diff.payload.commentDiffs ?? []) as ModifiedCommentDiffPayload[];

      expect(commentDiffs).toHaveLength(1);
      expect(commentDiffs[0]?.action).toBe('modified');

      const modifiedDiff = commentDiffs[0]!;
      modifiedDiff.oldCommentJSON.commentText = 'Tampered old';
      modifiedDiff.oldCommentJSON.textJson.content[0].text = 'Tampered old nested';
      modifiedDiff.newCommentJSON.commentText = 'Tampered new';
      modifiedDiff.newCommentJSON.textJson.content[0].text = 'Tampered new nested';

      expect(baseEditor.converter?.comments?.[0]).toMatchObject({
        commentId: 'c-1',
        commentText: 'Old comment',
        textJson: buildCommentTextJson('Old nested'),
      });
      expect((snapshot.payload.comments as Array<Record<string, unknown>>)[0]).toMatchObject({
        commentId: 'c-1',
        commentText: 'New comment',
        textJson: buildCommentTextJson('New nested'),
      });
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });
});
