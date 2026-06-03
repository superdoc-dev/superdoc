/* @vitest-environment happy-dom */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Editor,
  PresentationEditor,
  getStarterExtensions,
} from '../../../../packages/superdoc/dist/super-editor.es.js';
import { corpusDoc } from '../harness';

const FIXTURE_PATH = corpusDoc('pagination/longer-header.docx');
const APPEND_MARKER = 'SD2203-DOC-INFO-STORY';
const APPENDED_PARAGRAPH = `${APPEND_MARKER} ${Array.from(
  { length: 320 },
  (_, index) =>
    `This appended sentence verifies doc info word character and page counts after mutation block ${index}.`,
).join(' ')}`;

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;

beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContextStub(contextId: string) {
    if (contextId === '2d') {
      return {
        font: '',
        measureText: (text: string) => ({
          width: text.length * 6,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: text.length * 6,
        }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;

  originalCreateObjectURL = URL.createObjectURL;
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = (() => 'blob:mock-font') as typeof URL.createObjectURL;
  }
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (originalCreateObjectURL) {
    URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete (URL as any).createObjectURL;
  }
});

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPageCount(
  editor: Editor,
  predicate: (pages: number | undefined) => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<number> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const pages = editor.currentTotalPages;
    if (predicate(pages)) {
      return pages as number;
    }
    await sleep(50);
  }

  throw new Error(`Timed out waiting for ${label}. Last page count: ${String(editor.currentTotalPages)}`);
}

async function openPresentationEditor(): Promise<{ host: HTMLDivElement; presentation: PresentationEditor }> {
  const fileSource = await readFile(FIXTURE_PATH);
  const [content, media, mediaFiles, fonts] = await Editor.loadXmlData(fileSource, true);

  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.minHeight = '1200px';
  document.body.appendChild(host);

  const presentation = new PresentationEditor({
    mode: 'docx',
    element: host,
    fileSource,
    extensions: getStarterExtensions(),
    telemetry: { enabled: false },
    documentId: `doc-info-story-${Date.now()}`,
    content,
    media,
    mediaFiles,
    fonts,
    documentMode: 'editing',
    suppressDefaultDocxStyles: true,
  });

  return { host, presentation };
}

function expectInfoToMatchTextProjection(info: ReturnType<Editor['doc']['info']>, text: string): void {
  expect(info.counts.words).toBe(countWords(text));
  expect(info.counts.characters).toBe(text.length);
}

describe('document-api story: doc.info live counts on a multi-page document', () => {
  it('tracks text-derived counts and pages before and after block mutations', async () => {
    const { host, presentation } = await openPresentationEditor();

    try {
      const editor = presentation.editor;

      const initialPages = await waitForPageCount(
        editor,
        (pages) => typeof pages === 'number' && pages > 1,
        'initial multi-page layout',
      );
      const initialInfo = editor.doc.info({});
      const initialText = editor.doc.getText({});

      expectInfoToMatchTextProjection(initialInfo, initialText);
      expect(initialInfo.counts.pages).toBe(initialPages);
      expect(initialInfo.counts.paragraphs).toBeGreaterThan(1);
      expect(initialInfo.capabilities).toEqual({
        canFind: true,
        canGetNode: true,
        canComment: true,
        canReplace: true,
      });

      const created = editor.doc.create.paragraph({
        at: { kind: 'documentEnd' },
        text: APPENDED_PARAGRAPH,
      });

      expect(created.success).toBe(true);
      if (!created.success) {
        throw new Error(`create.paragraph failed: ${created.failure.code}`);
      }

      const grownPages = await waitForPageCount(
        editor,
        (pages) => typeof pages === 'number' && pages > initialPages,
        'page-count growth after appending a large paragraph',
      );
      const afterInsertInfo = editor.doc.info({});
      const afterInsertText = editor.doc.getText({});

      expect(afterInsertText).toContain(APPEND_MARKER);
      expectInfoToMatchTextProjection(afterInsertInfo, afterInsertText);
      expect(afterInsertInfo.counts.pages).toBe(grownPages);
      expect(afterInsertInfo.counts.paragraphs).toBe(initialInfo.counts.paragraphs + 1);
      expect(afterInsertInfo.counts.words).toBeGreaterThan(initialInfo.counts.words);
      expect(afterInsertInfo.counts.characters).toBeGreaterThan(initialInfo.counts.characters);
      expect(afterInsertInfo.revision).not.toBe(initialInfo.revision);

      const deleted = editor.doc.blocks.delete({ target: created.paragraph });

      expect(deleted.success).toBe(true);
      expect(deleted.deleted).toEqual(created.paragraph);

      const restoredPages = await waitForPageCount(
        editor,
        (pages) => pages === initialPages,
        'page-count restoration after deleting the appended paragraph',
      );
      const afterDeleteInfo = editor.doc.info({});
      const afterDeleteText = editor.doc.getText({});

      expect(restoredPages).toBe(initialPages);
      expect(afterDeleteText).toBe(initialText);
      expectInfoToMatchTextProjection(afterDeleteInfo, afterDeleteText);
      expect(afterDeleteInfo.counts).toEqual(initialInfo.counts);
      expect(afterDeleteInfo.revision).not.toBe(afterInsertInfo.revision);
    } finally {
      presentation.destroy();
      host.remove();
    }
  }, 30_000);
});
