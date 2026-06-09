import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot, type InlineSdtRange } from '../../helpers/sdt.js';

/**
 * Delete with the caret just outside an inline SDT's leading edge - the
 * symmetric mirror of sdt-backspace-outside-trailing.
 *
 * Expected behavior from the word-api parity contract
 *   sdt/inline-delete-outside-leading, Word 16.0
 * (captured via run_behavior_probe). Loads the exact .docx fixtures the
 * contract pinned by sha256. No raw Word state committed.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  sdtLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtLocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
  sdtContentLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtContentLocked.docx'),
} as const;

/** Load a fixture, place the caret just outside the SDT leading edge, return the SDT range. */
async function setupOutsideLeading(superdoc: SuperDocFixture, fixture: string): Promise<InlineSdtRange> {
  await superdoc.loadDocument(fixture);
  await superdoc.waitForStable();
  const sdt = await getInlineSdtRange(superdoc.page);
  expect(sdt).not.toBeNull();
  await superdoc.setTextSelection(sdt!.pos); // just before the SDT node
  await superdoc.page.evaluate(() => (window as any).editor.view.focus());
  await superdoc.waitForStable();
  return sdt!;
}

test.describe('SDT Delete from outside the leading edge - Word parity', () => {
  // Contract: sdt/inline-delete-outside-leading, Word 16.0

  test('unlocked: press 1 selects the content, press 2 empties it, press 3 deletes the wrapper', async ({
    superdoc,
  }) => {
    const sdt = await setupOutsideLeading(superdoc, FIXTURE.unlocked);

    await superdoc.press('Delete'); // press 1
    await superdoc.waitForStable();
    let s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.empty).toBe(false);
    expect(s.from).toBe(sdt.start); // cc-content
    expect(s.to).toBe(sdt.end);

    await superdoc.press('Delete'); // press 2
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.sdtContent).toBe(''); // emptied

    await superdoc.press('Delete'); // press 3
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(false); // wrapper deleted
  });

  test('sdtLocked: press 2 empties content, press 3 is a no-op (wrapper protected)', async ({ superdoc }) => {
    const sdt = await setupOutsideLeading(superdoc, FIXTURE.sdtLocked);

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    let s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.from).toBe(sdt.start);
    expect(s.to).toBe(sdt.end);

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.sdtContent).toBe('');

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true); // sdtLocked protects the wrapper
    expect(s.sdtContent).toBe('');
  });

  test('contentLocked: the second Delete deletes the whole wrapper', async ({ superdoc }) => {
    const sdt = await setupOutsideLeading(superdoc, FIXTURE.contentLocked);

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    expect((await getInlineSdtSnapshot(superdoc.page, sdt.id)).sdtExists).toBe(true);

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    expect((await getInlineSdtSnapshot(superdoc.page, sdt.id)).sdtExists).toBe(false);
  });

  test('sdtContentLocked: edits are blocked; control and content are preserved', async ({ superdoc }) => {
    const sdt = await setupOutsideLeading(superdoc, FIXTURE.sdtContentLocked);
    const originalContent = sdt.content;

    await superdoc.press('Delete');
    await superdoc.waitForStable();
    await superdoc.press('Delete');
    await superdoc.waitForStable();
    const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.sdtContent).toBe(originalContent); // fully locked
  });

  // --- Reported divergence (expected to fail) - tracked as SD-3305 ----------
  // Same as the trailing-edge Backspace case: Word selects the whole control as
  // a unit on press 1 for content-locked modes; SuperDoc selects content only.
  test.fail(
    'DIVERGENCE - contentLocked: Word selects the whole control on press 1 (SuperDoc selects content only)',
    async ({ superdoc }) => {
      const sdt = await setupOutsideLeading(superdoc, FIXTURE.contentLocked);
      await superdoc.press('Delete');
      await superdoc.waitForStable();
      const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
      expect(s.from).toBe(sdt.pos);
      expect(s.to).toBe(sdt.nodeEnd);
    },
  );

  test.fail(
    'DIVERGENCE - sdtContentLocked: Word selects the whole control on press 1 (SuperDoc selects content only)',
    async ({ superdoc }) => {
      const sdt = await setupOutsideLeading(superdoc, FIXTURE.sdtContentLocked);
      await superdoc.press('Delete');
      await superdoc.waitForStable();
      const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
      expect(s.from).toBe(sdt.pos);
      expect(s.to).toBe(sdt.nodeEnd);
    },
  );
});
