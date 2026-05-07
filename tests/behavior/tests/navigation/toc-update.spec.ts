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

  // The doc stores the heading title as "Conclusion" + "2" in separate runs
  // (no space text node), so the source scanner sees the concatenated text.
  const TARGET_TITLE = 'Conclusion2';

  // Establish a rebuild baseline FIRST. Without this, the post-paste
  // assertion would also reflect any unbookmarked headings the rebuild picks
  // up that weren't yet materialised — making the test fragile to fixture
  // changes. We want to isolate "the pasted heading was preserved".
  const updateAllTocs = async () => {
    await superdoc.page.evaluate(() => {
      const editor = (
        window as unknown as {
          editor?: { state: { doc: any }; doc?: { toc?: { update?: (input: any) => any } } };
        }
      ).editor;
      if (!editor?.doc?.toc?.update) return;
      const ids: string[] = [];
      editor.state.doc.descendants((n: any) => {
        if (n?.type?.name === 'tableOfContents') {
          const id = n.attrs?.sdBlockId as string | null | undefined;
          if (id) ids.push(id);
          return false;
        }
        return true;
      });
      for (const id of ids) {
        editor.doc.toc.update({
          target: { kind: 'block', nodeType: 'tableOfContents', nodeId: id },
          mode: 'all',
        });
      }
    });
    await superdoc.waitForStable(1500);
  };

  await updateAllTocs();
  const titlesBaseline = await readTocTitles(superdoc);
  const baselineCount = titlesBaseline.filter((t: string) => t === TARGET_TITLE).length;

  // Real copy → paste round-trip: select the inline content of the heading,
  // dispatch a copy event so ProseMirrorRenderer's production handler writes
  // the slice, then dispatch a paste event with that same clipboard payload
  // and a cursor inside the body paragraph below the heading.
  await superdoc.page.evaluate((target: string) => {
    const editor = (
      window as unknown as {
        editor?: {
          state: { doc: any; tr: any; selection: any };
          view: { dispatch: (tr: any) => void; dom: HTMLElement; state: any };
        };
      }
    ).editor;
    if (!editor) return;
    const { state, view } = editor;

    let sourceNode: any = null;
    let sourceEnd = 0;
    let nextParagraphInsidePos = 0;
    let foundSource = false;
    state.doc.descendants((n: any, pos: number) => {
      if (foundSource && nextParagraphInsidePos === 0) {
        if (n?.type?.name === 'paragraph' && pos >= sourceEnd) {
          nextParagraphInsidePos = pos + 1;
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

    const TextSelection = state.selection.constructor;
    const sourceStart = sourceEnd - sourceNode.nodeSize;

    // Select the heading's inline content and copy.
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, sourceStart + 1, sourceEnd - 1)));
    const copyData = new DataTransfer();
    view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: copyData, bubbles: true, cancelable: true }));

    // Move cursor into the next paragraph and paste.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextParagraphInsidePos)));
    const pasteData = new DataTransfer();
    for (const type of copyData.types) pasteData.setData(type, copyData.getData(type));
    view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: pasteData, bubbles: true, cancelable: true }));
  }, TARGET_TITLE);

  await superdoc.waitForStable(1000);
  await updateAllTocs();

  const titlesAfter = await readTocTitles(superdoc);
  const afterCount = titlesAfter.filter((t: string) => t === TARGET_TITLE).length;
  // The pasted heading must add exactly one more entry to the rebuild.
  expect(afterCount).toBe(baselineCount + 1);
});

test('@behavior SD-2664 review: F9 rebuilds page numbers for every TOC in a multi-TOC document', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Clone the imported TOC node and insert a copy at the end of the doc, so
  // the doc has two TOCs that should rebuild from the same headings.
  const tocCount = await superdoc.page.evaluate(() => {
    const editor = (
      window as unknown as {
        editor?: { state: { doc: any; tr: any }; view: { dispatch: (tr: any) => void } };
      }
    ).editor;
    if (!editor) return 0;

    let sourceToc: any = null;
    editor.state.doc.descendants((n: any) => {
      if (sourceToc) return false;
      if (n?.type?.name === 'tableOfContents') {
        sourceToc = n;
        return false;
      }
      return true;
    });
    if (!sourceToc) return 0;

    // Fresh sdBlockId so the two TOCs have distinct identities.
    const cleanAttrs = { ...sourceToc.attrs, sdBlockId: null };
    const clone = sourceToc.type.create(cleanAttrs, sourceToc.content, sourceToc.marks);
    const tr = editor.state.tr.insert(editor.state.doc.content.size, clone);
    editor.view.dispatch(tr);

    let count = 0;
    editor.state.doc.descendants((n: any) => {
      if (n?.type?.name === 'tableOfContents') {
        count += 1;
        return false;
      }
      return true;
    });
    return count;
  });
  // Some other plugin may dedupe, so guard the precondition we rely on.
  expect(tocCount).toBeGreaterThanOrEqual(2);

  // Wait for layout to recompute the page map after the insertion.
  await superdoc.waitForStable(2000);

  // F9 → updateFieldsInSelection iterates every TOC. Without the page-map
  // refresh in field-update.js, only the FIRST TOC rebuilds with real page
  // numbers; subsequent TOCs see the stored pageMapDoc as stale (its
  // snapshot was taken before this iteration's transaction) and fall back
  // to '0' placeholders.
  await superdoc.executeCommand('updateFieldsInSelection');
  await superdoc.waitForStable(2000);

  // Pull the page-number text for every entry in every TOC.
  const tocPageNumbers = await superdoc.page.evaluate(() => {
    const editor = (window as unknown as { editor?: { state: { doc: any } } }).editor;
    if (!editor) return [] as string[][];
    const result: string[][] = [];

    editor.state.doc.descendants((toc: any) => {
      if (toc?.type?.name !== 'tableOfContents') return true;

      const numbers: string[] = [];
      toc.descendants((leaf: any) => {
        if (!leaf.isText || !leaf.text) return true;
        const isPageNumber = (leaf.marks ?? []).some((m: any) => m.type?.name === 'tocPageNumber');
        if (isPageNumber) numbers.push(leaf.text);
        return true;
      });
      if (numbers.length > 0) result.push(numbers);
      return false;
    });

    return result;
  });

  expect(tocPageNumbers.length).toBe(tocCount);
  // Every TOC must have at least one entry with a non-zero page number —
  // the bug surfaces as every entry in the second+ TOC reading "0".
  for (const numbers of tocPageNumbers) {
    expect(numbers.length).toBeGreaterThan(0);
    const allZero = numbers.every((n) => n === '0');
    expect(allZero).toBe(false);
  }
});
