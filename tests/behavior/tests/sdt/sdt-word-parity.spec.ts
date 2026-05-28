import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

/**
 * SDT keyboard behavior — parity with real Microsoft Word.
 *
 * Expected values come from a real-keyboard Word oracle: each scenario was run
 * on Windows Word 16 via the word-api `run_behavior_probe` tool (real
 * WScript.Shell.SendKeys, not COM Selection methods), and the resulting state
 * was captured as a golden. The goldens these tests derive from are committed
 * alongside in `word-oracle-goldens/` (see its README); provenance is
 * inputMode="win32-sendkeys-post-tscon".
 *
 * Word story-character offsets are NOT comparable to ProseMirror positions, so
 * these tests assert the observable, ABI-independent facts the goldens
 * establish (did the caret leave the SDT, was the SDT selected vs deleted, did
 * select-all escape the SDT, is shift-selection character-granular) rather than
 * raw offsets.
 *
 * SDTs are built with the insertStructuredContentInline command (same idiom as
 * sdt-lock-modes.spec.ts); for lock-behavior purposes this produces the same PM
 * node a .docx <w:lock> import would.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';

const SDT_ID = '9001';
const SDT_TEXT = 'inline value';

interface SdtRange {
  pos: number;
  start: number;
  end: number;
  nodeEnd: number;
}

/** Build "Before <inline SDT 'inline value'> After" in one paragraph; return the SDT range. */
async function buildInlineSdt(superdoc: SuperDocFixture, lockMode: LockMode): Promise<SdtRange> {
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.commands.selectAll();
    editor.commands.deleteSelection();
  });
  await superdoc.waitForStable();

  await superdoc.type('Before ');
  await superdoc.waitForStable();

  await superdoc.page.evaluate(
    ({ id, text, lockMode }) => {
      (window as any).editor.commands.insertStructuredContentInline({
        attrs: { id, alias: 'Inline Field', tag: 'inline-parity', lockMode },
        text,
      });
    },
    { id: SDT_ID, text: SDT_TEXT, lockMode },
  );
  await superdoc.waitForStable();

  await superdoc.press('End');
  await superdoc.type(' After');
  await superdoc.waitForStable();

  return getSdtRange(superdoc, SDT_ID);
}

async function getSdtRange(superdoc: SuperDocFixture, sdtId: string): Promise<SdtRange> {
  return superdoc.page.evaluate((sdtId) => {
    const { state } = (window as any).editor;
    let result: SdtRange | null = null;
    state.doc.descendants((node: any, pos: number) => {
      if (result) return false;
      if (node.type.name === 'structuredContent' && String(node.attrs?.id ?? node.attrs?.sdtId) === sdtId) {
        result = { pos, start: pos + 1, end: pos + node.nodeSize - 1, nodeEnd: pos + node.nodeSize };
        return false;
      }
      return true;
    });
    if (!result) throw new Error(`inline SDT not found: ${sdtId}`);
    return result;
  }, sdtId);
}

/** Selection state + the text it covers + whether the SDT still exists. */
async function getSel(superdoc: SuperDocFixture, sdtId: string) {
  return superdoc.page.evaluate((sdtId) => {
    const { state } = (window as any).editor;
    const { selection } = state;
    const $from = selection.$from;
    const sdtIds: string[] = [];
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type.name === 'structuredContent' || n.type.name === 'structuredContentBlock') {
        const id = n.attrs?.id ?? n.attrs?.sdtId;
        if (id != null) sdtIds.push(String(id));
      }
    }
    let sdtExists = false;
    let sdtText: string | null = null;
    state.doc.descendants((node: any) => {
      if (node.type.name === 'structuredContent' && String(node.attrs?.id ?? node.attrs?.sdtId) === sdtId) {
        sdtExists = true;
        sdtText = node.textContent;
        return false;
      }
      return true;
    });
    return {
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
      nodeType: selection.node?.type?.name ?? null,
      selectedText: state.doc.textBetween(selection.from, selection.to, ' ', ' '),
      caretSdtIds: sdtIds,
      sdtExists,
      sdtText,
      docText: state.doc.textContent,
    };
  }, sdtId);
}

async function focus(superdoc: SuperDocFixture) {
  await superdoc.page.evaluate(() => (window as any).editor.view.focus());
}

test.describe('SDT keyboard behavior parity with Word', () => {
  // --- Right-arrow at trailing edge: one press exits the SDT ---
  // Golden: sd3237-inline-unlocked.right-arrow-trailing.real-key.json
  // Word: from the last position inside the content control, one Right-arrow
  // flips wdInContentControl true -> false (caret leaves the SDT in one press).
  test('Right-arrow at trailing edge exits the SDT in one press (unlocked)', async ({ superdoc }) => {
    const sdt = await buildInlineSdt(superdoc, 'unlocked');

    await superdoc.setTextSelection(sdt.end); // last position inside content
    await focus(superdoc);
    const before = await getSel(superdoc, SDT_ID);
    expect(before.caretSdtIds).toContain(SDT_ID); // caret starts inside

    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();

    const after = await getSel(superdoc, SDT_ID);
    expect(after.caretSdtIds).not.toContain(SDT_ID); // one press -> outside
    expect(after.sdtExists).toBe(true); // navigation does not mutate
  });

  // --- Backspace from just outside the trailing edge: first press selects the
  // SDT content, it does NOT immediately delete. Golden:
  // *.backspace-from-outside.real-key.json (step1 selType=2, selText='inline value'). ---
  for (const lockMode of ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'] as LockMode[]) {
    test(`Backspace from outside trailing edge selects the SDT first (${lockMode})`, async ({ superdoc }) => {
      const sdt = await buildInlineSdt(superdoc, lockMode);

      await superdoc.setTextSelection(sdt.nodeEnd); // just outside, after the SDT
      await focus(superdoc);

      await superdoc.press('Backspace');
      await superdoc.waitForStable();

      const after = await getSel(superdoc, SDT_ID);
      // Word's press 1 is non-destructive: the SDT still exists and its content
      // is now selected (not collapsed).
      expect(after.sdtExists).toBe(true);
      expect(after.empty).toBe(false);
      expect(after.selectedText).toContain(SDT_TEXT);
    });
  }

  // --- Delete from just outside the leading edge: symmetric mirror of the
  // Backspace case — first press selects the SDT content across all four lock
  // modes. Goldens: *.delete-from-outside.real-key.json (step1 selType=2,
  // selText is the SDT content in every mode). ---
  for (const lockMode of ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'] as LockMode[]) {
    test(`Delete from outside leading edge selects the SDT first (${lockMode})`, async ({ superdoc }) => {
      const sdt = await buildInlineSdt(superdoc, lockMode);

      await superdoc.setTextSelection(sdt.pos); // just before the SDT, end of "Before "
      await focus(superdoc);

      await superdoc.press('Delete');
      await superdoc.waitForStable();

      const after = await getSel(superdoc, SDT_ID);
      expect(after.sdtExists).toBe(true);
      expect(after.empty).toBe(false);
      expect(after.selectedText).toContain(SDT_TEXT);
    });
  }

  // --- Ctrl/Cmd+A with the caret inside the SDT selects the WHOLE document,
  // not just the SDT content. Golden: sd3237-inline-unlocked.ctrl-a-inside-sdt.real-key.json
  // (selText='Lead inline value trail.\r' — the entire body). ---
  test('Select-all inside the SDT selects the whole document, not just the SDT', async ({ superdoc }) => {
    const sdt = await buildInlineSdt(superdoc, 'unlocked');

    await superdoc.setTextSelection(sdt.start + 1); // inside content
    await focus(superdoc);

    await superdoc.press('ControlOrMeta+a');
    await superdoc.waitForStable();

    const after = await getSel(superdoc, SDT_ID);
    expect(after.empty).toBe(false);
    // The selection escaped the SDT to the whole body: it spans the
    // outside-the-SDT text on both sides plus the SDT content.
    expect(after.selectedText).toContain('Before');
    expect(after.selectedText).toContain('After');
    expect(after.selectedText).toContain(SDT_TEXT);
  });

  // --- Shift+Arrow selecting into the SDT is character-granular: a single
  // Shift+Right from just before the SDT does NOT atomically select the whole
  // control. Golden: sd3237-inline-unlocked.shift-right-into-sdt.real-key.json
  // (selEnd grows 6,7,8,... one position per press). ---
  test('Shift+Right into the SDT extends selection character-by-character (not atomic)', async ({ superdoc }) => {
    const sdt = await buildInlineSdt(superdoc, 'unlocked');

    // Anchor in the text just before the SDT (Word's golden anchored at
    // cc.Range.Start - 1, i.e. in the run before the control), not exactly on
    // the node boundary — a collapsed caret placed precisely at sdt.pos steps
    // into the node on the first Shift+Right instead of extending.
    await superdoc.setTextSelection(sdt.pos - 2);
    await focus(superdoc);

    // Enough presses to cross the boundary and select a few characters of content.
    for (let i = 0; i < 5; i++) {
      await superdoc.press('Shift+ArrowRight');
      await superdoc.waitForStable();
    }

    const after = await getSel(superdoc, SDT_ID);
    expect(after.empty).toBe(false);
    // Selection has entered the content a few characters deep ...
    expect(after.selectedText).toContain('inl');
    // ... but did NOT snap to the whole control — character-granular, like Word.
    expect(after.selectedText).not.toContain(SDT_TEXT);
  });
});
