import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/layout/toc-with-heading2.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

/**
 * Reads every TOC entry's title text from the document.
 *
 * The rebuilt entries are wrapped in `run` nodes whose first text run holds
 * the title (without the page-number `tocPageNumber` mark).
 */
const readTocTitles = async (superdoc) =>
  superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: unknown } } }).editor;
    if (!editor?.state?.doc) return [];

    const titles: string[] = [];

    (editor.state.doc as { descendants: (cb: (n: any) => boolean | void) => void }).descendants((node) => {
      if (node?.type?.name !== 'tableOfContents') return true;

      node.descendants((child: any) => {
        if (child?.type?.name !== 'paragraph') return true;
        // First non-page-number text run is the entry title.
        let captured = false;

        child.descendants((leaf: any) => {
          if (captured) return false;
          if (!leaf.isText || !leaf.text) return true;

          const isPageNumber = (leaf.marks ?? []).some((m: any) => m.type?.name === 'tocPageNumber');
          if (!isPageNumber) {
            titles.push(leaf.text);
            captured = true;
          }

          return true;
        });

        return false;
      });

      return false;
    });

    return titles;
  });

test('@behavior SD-2664: updateFieldsInSelection (F9) rebuilds every TOC entry from the document headings', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Capture the original TOC entries.
  const titlesBefore = await readTocTitles(superdoc);
  expect(titlesBefore.length).toBeGreaterThan(0);

  // Read the heading texts that should drive the rebuilt TOC. The fixture
  // contains Heading1/Heading2 paragraphs in the body.
  const headingTexts = await superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: unknown } } }).editor;
    if (!editor?.state?.doc) return [];

    const out: string[] = [];

    (editor.state.doc as { descendants: (cb: (n: any) => boolean | void) => void }).descendants((node) => {
      if (node?.type?.name === 'tableOfContents') return false; // skip TOC contents
      if (node?.type?.name !== 'paragraph') return true;

      const styleId = node.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;

      let text = '';

      node.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });

      if (text.trim()) out.push(text.trim());

      return true;
    });
    return out;
  });
  expect(headingTexts.length).toBeGreaterThan(0);

  // Press F9 — the FieldUpdate extension binds it to updateFieldsInSelection,
  // which routes through editor.doc.toc.update for every TOC in the doc.
  await superdoc.executeCommand('updateFieldsInSelection');
  await superdoc.waitForStable(2000);

  const titlesAfter = await readTocTitles(superdoc);
  // Every heading in the doc should now appear as an entry, and every entry
  // should map to a heading text. Order must match document order.
  expect(titlesAfter).toEqual(headingTexts);
});

const PR312_BOLD_DOC = path.resolve(__dirname, '../../test-data/layout/word-fixture-pr-312-bold.docx');

test('@behavior SD-2664 review: pasting "Conclusion 2" below itself produces a duplicate TOC entry on context-menu update', async ({
  superdoc,
}) => {
  test.skip(!fs.existsSync(PR312_BOLD_DOC), 'word-fixture-pr-312-bold.docx not available');

  await superdoc.loadDocument(PR312_BOLD_DOC);
  await superdoc.waitForStable(2000);

  // Locate the "Conclusion 2" heading paragraph and clone it directly below
  // through the SuperDoc slice paste path. This is the same path the
  // clipboard handler uses in InputRule.handlePaste — the JSON slice goes
  // through Slice.fromJSON and SUPERDOC_SLICE_PASTE_IDENTITY_RESETS.
  // The doc stores the title as "Conclusion" + "2" in separate runs (no
  // explicit space text node), but the visual rendering shows "Conclusion 2".
  // Match on the concatenated text the source scanner sees.
  const TARGET_TITLE = 'Conclusion2';

  const beforeCount = await superdoc.page.evaluate((target: string) => {
    const editor = (window as unknown as { editor?: { state: { doc: any } } }).editor;
    if (!editor) return 0;
    let n = 0;
    editor.state.doc.descendants((p: any) => {
      if (p?.type?.name === 'tableOfContents') return false;
      if (p?.type?.name !== 'paragraph') return true;
      const styleId = p.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;
      let text = '';
      p.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });
      if (text.trim() === target) n += 1;
      return true;
    });
    return n;
  }, TARGET_TITLE);
  expect(beforeCount).toBe(1);

  // Reproduce the user-reported bug: real Cmd+C → Cmd+V where the
  // cursor lands INSIDE an existing paragraph after the heading. The slice
  // MIME survives the round-trip but ProseMirror's replaceSelection still
  // merges single-paragraph slices into the cursor's paragraph when openStart=0
  // openEnd=0 — losing the heading styleId.
  await superdoc.page.evaluate((target: string) => {
    const editor = (
      window as unknown as {
        editor?: {
          state: { doc: any; tr: any; schema: any };
          view: { dispatch: (tr: any) => void; dom: HTMLElement; state: any };
        };
      }
    ).editor;
    if (!editor) return;
    const { state, view } = editor;

    // Find the source heading and the next non-heading paragraph after it.
    let sourceNode: any = null;
    let nextParagraphInsidePos = 0;
    let sourceEnd = 0;
    let foundSource = false;
    state.doc.descendants((n: any, pos: number) => {
      if (foundSource && nextParagraphInsidePos === 0) {
        if (n?.type?.name === 'paragraph' && pos >= sourceEnd) {
          // First paragraph that starts at/after the heading's end.
          nextParagraphInsidePos = pos + 1; // +1 = inside the paragraph
          return false;
        }
      }
      if (n?.type?.name !== 'paragraph') return true;
      const styleId = n.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;
      let text = '';
      n.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });
      if (text.trim() === target) {
        sourceNode = n;
        sourceEnd = pos + n.nodeSize;
        foundSource = true;
      }
      return true;
    });
    if (!sourceNode || !nextParagraphInsidePos) return;

    // Use whatever Selection constructor is in play — get it from the
    // current state's selection class so we don't have to depend on PM
    // being exposed on `window`.
    const TextSelection = (state.selection.constructor.prototype.constructor as any)?.create
      ? state.selection.constructor
      : null;
    if (TextSelection) {
      const tr = state.tr.setSelection(TextSelection.create(state.doc, nextParagraphInsidePos));
      view.dispatch(tr);
    }

    // Reproduce the user's flow: copy "Conclusion 2" via an inline-only
    // selection (the slice the browser emits when the user selects across the
    // line and copies — openStart=1/openEnd=1) and paste into the body
    // paragraph below.
    //
    // The browser strips the SUPERDOC_SLICE_MIME for many cross-context paste
    // scenarios, so the receiver falls through to handleHtmlPaste. The HTML
    // paste path used to drop the paragraph wrapper for any single-paragraph
    // slice — that lost the Heading1 styleId on the rebuilt paragraph and
    // the F9 rebuild missed the new entry. The fix preserves the wrapper
    // when it carries a Heading[1-9] styleId.
    if (TextSelection) {
      const sourceStart = sourceEnd - sourceNode.nodeSize;
      const tr = state.tr.setSelection(TextSelection.create(state.doc, sourceStart + 1, sourceEnd - 1));
      view.dispatch(tr);

      // Reset cursor to inside the next paragraph (body text after Conclusion 2).
      const tr2 = view.state.tr.setSelection(TextSelection.create(view.state.doc, nextParagraphInsidePos));
      view.dispatch(tr2);
    }

    // Drive a real copy → paste round-trip: select the inline content of the
    // heading and dispatch a copy event so the production copy handler in
    // ProseMirrorRenderer writes the slice. Without the heading wrapper fix,
    // the slice goes onto the clipboard as inline-only (bookmarkStart + 2
    // runs + bookmarkEnd) and the paste lands in the cursor's Normal
    // paragraph — TOC misses the new entry.
    if (TextSelection) {
      const sourceStart = sourceEnd - sourceNode.nodeSize;
      const tr = state.tr.setSelection(TextSelection.create(state.doc, sourceStart + 1, sourceEnd - 1));
      view.dispatch(tr);
    }

    const copyData = new DataTransfer();
    const copyEvent = new ClipboardEvent('copy', { clipboardData: copyData, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(copyEvent);

    // Reset cursor to inside the next paragraph (body text after Conclusion 2).
    if (TextSelection) {
      const tr2 = view.state.tr.setSelection(TextSelection.create(view.state.doc, nextParagraphInsidePos));
      view.dispatch(tr2);
    }

    // Replay the copied clipboard into a paste event.
    const pasteData = new DataTransfer();
    for (const type of copyData.types) {
      pasteData.setData(type, copyData.getData(type));
    }
    const pasteEvent = new ClipboardEvent('paste', { clipboardData: pasteData, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(pasteEvent);
  }, TARGET_TITLE);

  await superdoc.waitForStable(1000);

  // Drive the rebuild via the context-menu code path (editor.doc.toc.update
  // with mode 'all'), not F9. The user reported they trigger the rebuild
  // through the right-click "Update table of contents" item — which goes
  // through tocUpdateWrapper just like F9 but on a per-TOC target.
  await superdoc.page.evaluate(() => {
    const editor = (
      window as unknown as {
        editor?: { state: { doc: any }; doc?: { toc?: { update?: (input: any) => any } } };
      }
    ).editor;
    if (!editor?.doc?.toc?.update) return;
    let sdBlockId: string | null = null;
    editor.state.doc.descendants((n: any) => {
      if (sdBlockId) return false;
      if (n?.type?.name === 'tableOfContents') {
        sdBlockId = (n.attrs?.sdBlockId as string) ?? null;
        return false;
      }
      return true;
    });
    if (!sdBlockId) return;
    editor.doc.toc.update({
      target: { kind: 'block', nodeType: 'tableOfContents', nodeId: sdBlockId },
      mode: 'all',
    });
  });
  await superdoc.waitForStable(2000);

  const titlesAfter = await readTocTitles(superdoc);
  // After the context-menu "Update table of contents" rebuild, the pasted
  // heading should appear as a second TOC entry.
  const occurrences = titlesAfter.filter((t) => t === TARGET_TITLE).length;
  expect(occurrences).toBe(2);
});

test('@behavior SD-2664: pasting an existing heading produces a new TOC entry after F9', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Capture the original heading texts (anchor for assertion).
  const headingsBefore = await superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: unknown } } }).editor;
    if (!editor?.state?.doc) return [];
    const out: string[] = [];
    (editor.state.doc as { descendants: (cb: (n: any) => boolean | void) => void }).descendants((node: any) => {
      if (node?.type?.name === 'tableOfContents') return false;
      if (node?.type?.name !== 'paragraph') return true;
      const styleId = node.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;
      let text = '';
      node.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });
      if (text.trim()) out.push(text.trim());
      return true;
    });
    return out;
  });
  expect(headingsBefore.length).toBeGreaterThan(0);
  const targetHeading = headingsBefore[0]!;

  // Drive an actual SuperDoc slice paste — this is the exact path the
  // clipboard handler hits when a user copies a heading inside the editor:
  // it replays the JSON slice through Slice.fromJSON and goes through the
  // SUPERDOC_SLICE_PASTE_IDENTITY_RESETS reset.
  await superdoc.page.evaluate((target: string) => {
    const editor = (
      window as unknown as {
        editor?: {
          state: { doc: any; schema: any; tr: any };
          view: { dispatch: (tr: any) => void; state: any };
        };
      }
    ).editor;
    if (!editor) return;
    const { state, view } = editor;

    // Find the source heading paragraph node.
    let sourceNode: any = null;
    let sourcePos = 0;
    state.doc.descendants((n: any, pos: number) => {
      if (sourceNode) return false;
      if (n?.type?.name !== 'paragraph') return true;
      const styleId = n.attrs?.paragraphProperties?.styleId;
      if (!styleId || !/^Heading[1-9]$/.test(styleId)) return true;
      let text = '';
      n.descendants((c: any) => {
        if (c.isText && c.text) text += c.text;
        return true;
      });
      if (text.trim() === target) {
        sourceNode = n;
        sourcePos = pos;
      }
      return true;
    });
    if (!sourceNode) return;

    // Serialize the source paragraph as the clipboard slice does.
    const sliceJson = { content: [sourceNode.toJSON()], openStart: 0, openEnd: 0 };
    const sliceData = JSON.stringify(sliceJson);

    // Position cursor at end of doc (where we'll paste).
    const tr1 = state.tr;
    const TextSelection = (window as any).PMS?.TextSelection;
    if (TextSelection) {
      tr1.setSelection(TextSelection.create(state.doc, state.doc.content.size));
      view.dispatch(tr1);
    }

    // Synthesize a paste event through the editor's handlePaste so we go
    // through stripSuperdocSliceBlockIdentities (paraId/sdBlockId reset).
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/x-superdoc-slice', sliceData);
    const pasteEvent = new ClipboardEvent('paste', { clipboardData: dataTransfer });
    view.dom.dispatchEvent(pasteEvent);

    // Mark sourcePos as used so the linter doesn't complain.
    void sourcePos;
  }, targetHeading);

  // Let block-node's appendTransaction stamp a fresh sdBlockId.
  await superdoc.waitForStable(1000);

  // Run F9 → toc.update for every TOC.
  await superdoc.executeCommand('updateFieldsInSelection');
  await superdoc.waitForStable(2000);

  const titlesAfter = await readTocTitles(superdoc);
  // The target heading should now appear twice — once for the original, once
  // for the pasted clone.
  const occurrences = titlesAfter.filter((t) => t === targetHeading).length;
  expect(occurrences).toBe(2);
});
