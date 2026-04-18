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

describe('citations bibliography roundtrip', () => {
  it('preserves bibliography targets across export and reopen', async () => {
    const io = createIo();
    const opened = await openDocument(undefined, io, {
      editorOpenOptions: { plainText: 'Bibliography host paragraph.' },
      user: { name: 'Review Bot', email: 'bot@example.com' },
    });

    let reopened: Awaited<ReturnType<typeof openDocument>> | undefined;

    try {
      const insertResult = opened.editor.doc.citations.bibliography.insert({ at: { kind: 'documentEnd' } });

      expect(insertResult.success).toBe(true);
      if (!insertResult.success) return;

      expect(insertResult.bibliography.nodeId).toMatch(/^bibliography-auto-[0-9a-f]{8}$/);

      const tempDir = await mkdtemp(path.join(tmpdir(), 'sd-cli-bibliography-'));
      const outputPath = path.join(tempDir, 'bibliography-roundtrip.docx');
      await exportToPath(opened.editor, outputPath, true);

      reopened = await openDocument(outputPath, io, {
        user: { name: 'Review Bot', email: 'bot@example.com' },
      });

      const info = reopened.editor.doc.citations.bibliography.get({
        target: insertResult.bibliography,
      });
      expect(info.address).toEqual(insertResult.bibliography);

      const configureResult = reopened.editor.doc.citations.bibliography.configure({
        target: insertResult.bibliography,
        style: 'APA',
      });
      expect(configureResult.success).toBe(true);

      const updated = reopened.editor.doc.citations.bibliography.get({
        target: insertResult.bibliography,
      });
      expect(updated.style).toBe('APA');
    } finally {
      reopened?.dispose();
      opened.dispose();
    }
  });
});
