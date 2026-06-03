import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../../../test-corpus/permissions/sd-1840-perm-tags.docx');

test.skip(
  !fs.existsSync(DOC_PATH),
  'Test document not available — expected test-corpus/permissions/sd-1840-perm-tags.docx',
);

test('loads block-level permission tags and enforces permission ranges in viewing mode (SD-1840)', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await expect
    .poll(
      () =>
        superdoc.page.evaluate(() => {
          const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;
          const doc = editor?.state?.doc;
          if (!doc) return false;

          let permStartBlockCount = 0;
          let permEndBlockCount = 0;
          doc.descendants((node: any) => {
            if (node.type?.name === 'permStartBlock') permStartBlockCount += 1;
            if (node.type?.name === 'permEndBlock') permEndBlockCount += 1;
            return;
          });

          const ranges = editor.storage?.permissionRanges?.ranges ?? [];
          return permStartBlockCount > 0 && permEndBlockCount > 0 && ranges.length > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  const permissionInfo = await superdoc.page.evaluate(() => {
    const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;
    const doc = editor?.state?.doc;
    if (!doc) {
      throw new Error('Editor state is unavailable.');
    }

    let permStartBlockCount = 0;
    let permEndBlockCount = 0;
    doc.descendants((node: any) => {
      if (node.type?.name === 'permStartBlock') permStartBlockCount += 1;
      if (node.type?.name === 'permEndBlock') permEndBlockCount += 1;
      return;
    });

    const ranges = editor.storage?.permissionRanges?.ranges ?? [];

    let insidePos: number | null = null;
    let outsidePos: number | null = null;
    const isAllowedPos = (pos: number) => ranges.some((range: any) => pos >= range.from && pos <= range.to);

    doc.descendants((node: any, pos: number) => {
      if (!node.isText || typeof node.text !== 'string') return;
      for (let i = 0; i < node.text.length; i += 1) {
        const candidate = pos + i;
        if (insidePos === null && isAllowedPos(candidate)) {
          insidePos = candidate;
        }
        if (outsidePos === null && !isAllowedPos(candidate)) {
          outsidePos = candidate;
        }
        if (insidePos !== null && outsidePos !== null) {
          return false;
        }
      }
      return;
    });

    return {
      permStartBlockCount,
      permEndBlockCount,
      rangeCount: ranges.length,
      insidePos,
      outsidePos,
    };
  });

  expect(permissionInfo.permStartBlockCount).toBeGreaterThan(0);
  expect(permissionInfo.permEndBlockCount).toBeGreaterThan(0);
  expect(permissionInfo.rangeCount).toBeGreaterThan(0);
  expect(permissionInfo.insidePos).not.toBeNull();
  expect(permissionInfo.outsidePos).not.toBeNull();

  await superdoc.setDocumentMode('viewing');
  await superdoc.waitForStable();
  await superdoc.assertDocumentMode('viewing');

  const blockedMarker = `SD1840_BLOCKED_${Date.now()}`;
  const blockedAttempt = await superdoc.page.evaluate((marker) => {
    const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;
    const doc = editor?.state?.doc;
    const ranges = editor?.storage?.permissionRanges?.ranges ?? [];
    if (!doc || !ranges.length) {
      throw new Error('Permission ranges are unavailable.');
    }

    const isAllowedPos = (pos: number) => ranges.some((range: any) => pos >= range.from && pos <= range.to);
    let blockedPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || typeof node.text !== 'string') return;
      for (let i = 0; i < node.text.length; i += 1) {
        const candidate = pos + i;
        if (!isAllowedPos(candidate)) {
          blockedPos = candidate;
          return false;
        }
      }
      return;
    });

    if (blockedPos === null) {
      throw new Error('Could not find a blocked text position.');
    }

    const before = editor.state.doc.textContent;
    editor.view.dispatch(editor.state.tr.insertText(marker, blockedPos, blockedPos));
    const after = editor.state.doc.textContent;
    return {
      blockedPos,
      changed: before !== after,
      inserted: after.includes(marker),
    };
  }, blockedMarker);

  expect(blockedAttempt.inserted).toBe(false);
  expect(blockedAttempt.changed).toBe(false);

  const allowedMarker = `SD1840_ALLOWED_${Date.now()}`;
  const allowedAttempt = await superdoc.page.evaluate((marker) => {
    const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;
    const doc = editor?.state?.doc;
    const ranges = editor?.storage?.permissionRanges?.ranges ?? [];
    if (!doc || !ranges.length) {
      throw new Error('Permission ranges are unavailable.');
    }

    const isAllowedPos = (pos: number) => ranges.some((range: any) => pos >= range.from && pos <= range.to);
    let allowedPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || typeof node.text !== 'string') return;
      for (let i = 0; i < node.text.length; i += 1) {
        const candidate = pos + i;
        if (isAllowedPos(candidate)) {
          allowedPos = candidate;
          return false;
        }
      }
      return;
    });

    if (allowedPos === null) {
      throw new Error('Could not find an allowed text position.');
    }

    const before = editor.state.doc.textContent;
    editor.view.dispatch(editor.state.tr.insertText(marker, allowedPos, allowedPos));
    const after = editor.state.doc.textContent;
    return {
      allowedPos,
      changed: before !== after,
      inserted: after.includes(marker),
    };
  }, allowedMarker);

  expect(allowedAttempt.inserted).toBe(true);
  expect(allowedAttempt.changed).toBe(true);
});
