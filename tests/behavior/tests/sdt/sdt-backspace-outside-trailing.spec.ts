import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot, type InlineSdtRange } from '../../helpers/sdt.js';

/**
 * Backspace with the caret just outside an inline SDT's trailing edge.
 *
 * Expected behavior comes from the word-api parity contract
 *   sdt/inline-backspace-outside-trailing, Word 16.0
 * captured via run_behavior_probe (real keyboard). The contract and the guide
 * for translating its axes (caret / selectionScope / contentControlLifecycle /
 * ccRangeChanged / bodyMutation) into PM assertions live in the word-api repo
 * under parity-contracts/. The .docx fixtures here are the exact files the
 * contract pinned by sha256, so SuperDoc runs the same input Word did. No raw
 * Word state is committed - only the .docx fixtures and the behavior assertions.
 *
 * Word story offsets are not comparable to PM positions, so these assert the
 * observable facts (selection scope, control lifecycle, body text change),
 * never raw offsets.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  sdtLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtLocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
  sdtContentLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtContentLocked.docx'),
} as const;

/** Load a fixture, place the caret just outside the SDT trailing edge, return the SDT range. */
async function setupOutsideTrailing(superdoc: SuperDocFixture, fixture: string): Promise<InlineSdtRange> {
  await superdoc.loadDocument(fixture);
  await superdoc.waitForStable();
  const sdt = await getInlineSdtRange(superdoc.page);
  expect(sdt).not.toBeNull();
  await superdoc.setTextSelection(sdt!.nodeEnd); // just after the SDT node
  await superdoc.page.evaluate(() => (window as any).editor.view.focus());
  await superdoc.waitForStable();
  return sdt!;
}

test.describe('SDT Backspace from outside the trailing edge - Word parity', () => {
  // Contract: sdt/inline-backspace-outside-trailing, Word 16.0

  test('unlocked: press 1 selects the content, press 2 empties it, press 3 deletes the wrapper', async ({
    superdoc,
  }) => {
    // unlocked transitions: [cc-content/preserved], [emptied/text-changed], [deleted]
    const sdt = await setupOutsideTrailing(superdoc, FIXTURE.unlocked);

    await superdoc.press('Backspace'); // press 1
    await superdoc.waitForStable();
    let s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true); // preserved
    expect(s.empty).toBe(false); // selected, not deleted
    expect(s.from).toBe(sdt.start); // cc-content: exactly the content range
    expect(s.to).toBe(sdt.end);

    await superdoc.press('Backspace'); // press 2
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true); // wrapper kept
    expect(s.sdtContent).toBe(''); // emptied

    await superdoc.press('Backspace'); // press 3
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(false); // wrapper deleted
  });

  test('sdtLocked: press 2 empties content, press 3 is a no-op (wrapper protected)', async ({ superdoc }) => {
    // sdtLocked transitions: [cc-content/preserved], [emptied], [preserved (no-op)]
    const sdt = await setupOutsideTrailing(superdoc, FIXTURE.sdtLocked);

    await superdoc.press('Backspace'); // press 1: select content
    await superdoc.waitForStable();
    let s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.from).toBe(sdt.start);
    expect(s.to).toBe(sdt.end);

    await superdoc.press('Backspace'); // press 2: empty
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.sdtContent).toBe('');

    await superdoc.press('Backspace'); // press 3: wrapper is protected -> no-op
    await superdoc.waitForStable();
    s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true); // still there: sdtLocked prevents wrapper deletion
    expect(s.sdtContent).toBe('');
  });

  test('contentLocked: the second Backspace deletes the whole wrapper', async ({ superdoc }) => {
    // contentLocked transitions: [.../preserved], [deleted/text-changed], [.../text-changed]
    const sdt = await setupOutsideTrailing(superdoc, FIXTURE.contentLocked);

    await superdoc.press('Backspace'); // press 1: select
    await superdoc.waitForStable();
    expect((await getInlineSdtSnapshot(superdoc.page, sdt.id)).sdtExists).toBe(true);

    await superdoc.press('Backspace'); // press 2: whole wrapper deleted as a unit
    await superdoc.waitForStable();
    expect((await getInlineSdtSnapshot(superdoc.page, sdt.id)).sdtExists).toBe(false);
  });

  test('sdtContentLocked: content edits are blocked; control and content are preserved', async ({ superdoc }) => {
    // sdtContentLocked transitions: [.../preserved], [preserved (blocked)], [preserved + ccRangeChanged + text-changed]
    const sdt = await setupOutsideTrailing(superdoc, FIXTURE.sdtContentLocked);
    const originalContent = sdt.content;

    await superdoc.press('Backspace'); // press 1: select
    await superdoc.waitForStable();
    await superdoc.press('Backspace'); // press 2: blocked
    await superdoc.waitForStable();
    const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
    expect(s.sdtExists).toBe(true);
    expect(s.sdtContent).toBe(originalContent); // content untouched (fully locked)
  });

  test('GUARDRAIL - sdtContentLocked: a Backspace beside a fully-locked control deletes surrounding text and shifts the control (not a no-op)', async ({
    superdoc,
  }) => {
    // Contract step 3, sdtContentLocked: preserved + ccRangeChanged + bodyMutation=text-changed.
    // The protected control survives, but the Backspace removes a surrounding
    // character, so the control moves and the document text changes. A
    // control-only check would wrongly read this as "nothing happened".
    const sdt = await setupOutsideTrailing(superdoc, FIXTURE.sdtContentLocked);

    // Drive the sequence to the collapsed caret just before the locked control.
    await superdoc.press('Backspace'); // press 1: select
    await superdoc.waitForStable();
    await superdoc.press('Backspace'); // press 2: blocked, caret collapses beside the control
    await superdoc.waitForStable();
    const before = await getInlineSdtSnapshot(superdoc.page, sdt.id);

    await superdoc.press('Backspace'); // press 3: deletes a surrounding character
    await superdoc.waitForStable();
    const after = await getInlineSdtSnapshot(superdoc.page, sdt.id);

    expect(after.sdtExists).toBe(true); // lifecycle: preserved
    expect(after.sdtContent).toBe(before.sdtContent); // control content untouched
    expect(after.sdtPos).not.toBe(before.sdtPos); // ccRangeChanged: the control shifted
    expect(after.docText).not.toBe(before.docText); // bodyMutation: text-changed (whole-doc)
  });

  // --- Reported divergence (expected to fail) - tracked as SD-3305 ----------
  // Word selects the WHOLE control as a unit on press 1 for content-locked
  // modes (contract selectionScope=whole-content-control); SuperDoc selects
  // only the content range (cc-content), the same as the editable modes. These
  // tests assert Word's behavior and are marked fail() so the divergence is
  // tracked, not adjusted away. If SuperDoc is changed to match Word, they will
  // start passing and flag that the fail() annotation should be removed.

  test.fail(
    'DIVERGENCE - contentLocked: Word selects the whole control on press 1 (SuperDoc selects content only)',
    async ({ superdoc }) => {
      const sdt = await setupOutsideTrailing(superdoc, FIXTURE.contentLocked);
      await superdoc.press('Backspace');
      await superdoc.waitForStable();
      const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
      // Word: whole-content-control (selection spans the whole node, incl. boundaries).
      expect(s.from).toBe(sdt.pos);
      expect(s.to).toBe(sdt.nodeEnd);
    },
  );

  test.fail(
    'DIVERGENCE - sdtContentLocked: Word selects the whole control on press 1 (SuperDoc selects content only)',
    async ({ superdoc }) => {
      const sdt = await setupOutsideTrailing(superdoc, FIXTURE.sdtContentLocked);
      await superdoc.press('Backspace');
      await superdoc.waitForStable();
      const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
      expect(s.from).toBe(sdt.pos);
      expect(s.to).toBe(sdt.nodeEnd);
    },
  );
});
