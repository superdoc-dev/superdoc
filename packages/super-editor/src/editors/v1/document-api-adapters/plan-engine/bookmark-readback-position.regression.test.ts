/* @vitest-environment jsdom */

/**
 * Regression coverage for `editor.doc.bookmarks.list()` Position
 * readback offsets.
 *
 * Locks in the round-trip invariant: bookmarks written at flattened
 * text offsets must read back at the same offsets. The write side
 * (`bookmarks.insert`) takes a `TextTarget` with `range.start`/`end`
 * in the flattened text-offset model; the read side must return the
 * same model.
 *
 * Originated from SD-3109, where readback used raw PM arithmetic and
 * drifted by the number of inline wrapper tokens (`run` etc.) in the
 * targeted block.
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const HOST = 'The court ruled in Alpha Corp v. SEC today.';
const PHRASE = 'Alpha Corp v. SEC';

function resolveBlockId(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return null;
  const v = receipt as {
    target?: { blockId?: unknown };
    resolution?: { target?: { blockId?: unknown } };
  };
  if (typeof v.target?.blockId === 'string' && v.target.blockId) return v.target.blockId;
  if (typeof v.resolution?.target?.blockId === 'string' && v.resolution.target.blockId) {
    return v.resolution.target.blockId;
  }
  return null;
}

describe('bookmark readback position (regression — SD-3109)', () => {
  it('returns offsets that round-trip to the write-side offset model', async () => {
    const docData = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    const seed = await Promise.resolve(editor.doc.insert({ value: HOST }));
    const blockId = resolveBlockId(seed);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const phraseStart = HOST.indexOf(PHRASE);
    const phraseEnd = phraseStart + PHRASE.length;

    // Write the bookmark at the flattened text offsets we expect.
    const insertResult = await Promise.resolve(
      editor.doc.bookmarks.insert({
        name: 'sd3109_marker',
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: phraseStart, end: phraseEnd } }],
        },
      }),
    );
    expect((insertResult as { success?: boolean }).success ?? true).not.toBe(false);

    // Read the bookmark back.
    const list = editor.doc.bookmarks.list();
    const recovered = list.items.find((b: { name: string }) => b.name === 'sd3109_marker') as
      | { range: { from: { blockId: string; offset: number }; to: { blockId: string; offset: number } } }
      | undefined;
    expect(recovered).toBeTruthy();
    if (!recovered) return;

    // Round-trip invariant: readback offsets equal the offsets written.
    expect(recovered.range.from.offset, 'from.offset').toBe(phraseStart);
    expect(recovered.range.to.offset, 'to.offset').toBe(phraseEnd);

    editor.destroy();
  });
});
