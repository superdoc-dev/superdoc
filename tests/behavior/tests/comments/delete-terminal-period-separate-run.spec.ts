import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'off', trackChanges: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/redline-full-paragraph.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

const snapshotTrackDeletesAndBookmarks = async (superdoc: any) =>
  superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const deleteById: Record<string, string> = {};
    let bookmarkStartCount = 0;
    let bookmarkEndCount = 0;

    editor.state.doc.descendants((node: any) => {
      if (node.type?.name === 'bookmarkStart') bookmarkStartCount += 1;
      if (node.type?.name === 'bookmarkEnd') bookmarkEndCount += 1;
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        const id = String(mark.attrs?.id ?? '');
        if (!id) continue;
        deleteById[id] = (deleteById[id] ?? '') + node.text;
      }
    });

    return { deleteById, bookmarkStartCount, bookmarkEndCount };
  });

test('two backspaces track period and l for bookmark-wrapped runs', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.setOptions({ user: { name: 'Guest Reviewer', email: 'track@example.com' } });
  });

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const before = await snapshotTrackDeletesAndBookmarks(superdoc);
  const targetMarker = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let marker: string | null = null;

    doc.descendants((node: any) => {
      if (node.type?.name !== 'paragraph') return;
      const normalized = String(node.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized.includes('any and all such Confidential Material.')) return;
      marker = String(node.attrs?.listRendering?.markerText ?? '').trim();
      return false;
    });

    if (!marker) {
      throw new Error('Target numbered paragraph not found');
    }
    return marker;
  });
  expect(targetMarker).toBe('1.');

  const periodPos = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let matchPos = -1;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText || node.text !== '.') return;
      const left = doc.textBetween(Math.max(0, pos - 80), pos, '', '');
      if (left.endsWith('any and all such Confidential Material')) {
        matchPos = pos;
        return false;
      }
      return;
    });

    if (matchPos === -1) {
      throw new Error('Terminal period for Confidential Material sentence not found');
    }
    return matchPos;
  });
  await superdoc.setTextSelection(periodPos + 1);
  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  const snapshot = await snapshotTrackDeletesAndBookmarks(superdoc);

  const newDeletedCombined = Object.entries(snapshot.deleteById)
    .filter(([id]) => !before.deleteById[id])
    .map(([, text]) => text)
    .join('');

  expect(newDeletedCombined).toBe('l.');
  expect(snapshot.bookmarkStartCount).toBe(before.bookmarkStartCount);
  expect(snapshot.bookmarkEndCount).toBe(before.bookmarkEndCount);

  // SD-2061: Verify numbered list marker is preserved after backspace.
  // Before the fix, ReplaceAroundStep was applied untracked, which removed
  // paragraph properties (numbering, font, alignment).
  const markerAfter = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let marker: string | null = null;

    doc.descendants((node: any) => {
      if (node.type?.name !== 'paragraph') return;
      const normalized = String(node.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized.includes('any and all such Confidential Material')) return;
      marker = String(node.attrs?.listRendering?.markerText ?? '').trim();
      return false;
    });

    return marker;
  });
  expect(markerAfter).toBe('1.');
});
