import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/superdoc.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'off',
    trackChanges: true,
    hideCaret: true,
    hideSelection: true,
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../test-data/comments-tcs/redline-full-paragraph.docx'),
  path.resolve(__dirname, '../../../../test-corpus/comments-tcs/redline-full-paragraph.docx'),
];
const DOC_PATH = DOC_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? DOC_PATH_CANDIDATES[0];

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

const snapshotTrackDeletes = async (superdoc: any) =>
  superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const deleteById: Record<string, string> = {};

    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        const id = String(mark.attrs?.id ?? '');
        if (!id) continue;
        deleteById[id] = (deleteById[id] ?? '') + node.text;
      }
    });
    return { deleteById };
  });

test('suggesting double backspace with bookmark-wrapped runs tracks period and preceding character', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.setOptions({ user: { name: 'Guest Reviewer', email: 'track@example.com' } });
  });

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const before = await snapshotTrackDeletes(superdoc);
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

  const after = await snapshotTrackDeletes(superdoc);
  const newDeletedCombined = Object.entries(after.deleteById)
    .filter(([id]) => !before.deleteById[id])
    .map(([, text]) => text)
    .join('');

  expect(newDeletedCombined).toBe('l.');
});
