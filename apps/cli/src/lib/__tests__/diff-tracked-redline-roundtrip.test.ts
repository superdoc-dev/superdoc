import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportToPath, openDocument } from '../document';

function createIo() {
  return {
    stdout() {},
    stderr() {},
    async readStdinBytes() {
      return new Uint8Array();
    },
    now() {
      return Date.now();
    },
  };
}

describe('diff tracked redline roundtrip', () => {
  it('preserves tracked changes through CLI open/export/reopen flow', async () => {
    const io = createIo();
    const baseText = 'Section 1. Payment is due within thirty days.';
    const targetText = `${baseText}\nRenewal requires written approval.`;

    const base = await openDocument(undefined, io, {
      editorOpenOptions: { plainText: baseText },
      user: { name: 'Review Bot', email: 'bot@example.com' },
    });
    const target = await openDocument(undefined, io, {
      editorOpenOptions: { plainText: targetText },
      user: { name: 'Review Bot', email: 'bot@example.com' },
    });

    let reopened: Awaited<ReturnType<typeof openDocument>> | undefined;

    try {
      const snapshot = target.editor.doc.diff.capture();
      const diff = base.editor.doc.diff.compare({ targetSnapshot: snapshot });

      const result = base.editor.doc.diff.apply(
        { diff },
        {
          changeMode: 'tracked',
        },
      );

      expect(result.appliedOperations).toBeGreaterThan(0);
      expect(base.editor.doc.trackChanges.list().total).toBeGreaterThan(0);

      const tempDir = await mkdtemp(path.join(tmpdir(), 'sd-cli-diff-'));
      const outputPath = path.join(tempDir, 'tracked-redline.docx');
      await exportToPath(base.editor, outputPath, true);

      reopened = await openDocument(outputPath, io, {
        user: { name: 'Review Bot', email: 'bot@example.com' },
      });

      expect(reopened.editor.doc.trackChanges.list().total).toBeGreaterThan(0);
    } finally {
      reopened?.dispose();
      base.dispose();
      target.dispose();
    }
  });
});
