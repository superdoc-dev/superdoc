import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Editor } from '@core/Editor.js';
import { PresentationEditor } from '@core/presentation-editor/PresentationEditor.ts';
import { getStarterExtensions } from '@extensions/index.js';
import { initTestEditor } from '../helpers/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../../../tests/behavior/tests/comments/fixtures/sd-1960-word-replacement-no-comments.docx',
);

const collectTrackedSegments = (doc) => {
  const segments = [];

  doc.descendants((node, pos) => {
    if (!node?.isText || !node.text) return;

    const trackedMark = node.marks?.find(
      (mark) => mark.type.name === 'trackInsert' || mark.type.name === 'trackDelete',
    );
    if (!trackedMark) return;

    segments.push({
      from: pos,
      id: String(trackedMark.attrs.id ?? ''),
      sourceId: String(trackedMark.attrs.sourceId ?? ''),
      text: String(node.text),
      to: pos + node.nodeSize,
      type: trackedMark.type.name === 'trackDelete' ? 'delete' : 'insert',
    });
  });

  return segments;
};

describe('SD-1960 Word replacement import without comments.xml', () => {
  it('loads the imported replacement under one internal tracked-change id', async () => {
    const buffer = await readFile(FIXTURE_PATH);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    try {
      const segments = collectTrackedSegments(editor.state.doc);
      const inserts = segments.filter((segment) => segment.type === 'insert');
      const deletes = segments.filter((segment) => segment.type === 'delete');

      expect(inserts.length).toBeGreaterThan(0);
      expect(deletes.length).toBeGreaterThan(0);
      expect(new Set(inserts.map((segment) => segment.id)).size).toBe(1);
      expect(new Set(deletes.map((segment) => segment.id)).size).toBe(1);
      expect(inserts[0].id).toBe(deletes[0].id);
      expect(inserts[0].sourceId).not.toBe(deletes[0].sourceId);
      expect(inserts.map((segment) => segment.text).join('')).toBe('abc ');
      expect(deletes.map((segment) => segment.text).join('')).toBe('test ');
    } finally {
      editor.destroy();
    }
  });

  it('keeps the shared internal id when booted through PresentationEditor with a Blob fileSource', async () => {
    const buffer = await readFile(FIXTURE_PATH);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(blob);
    const host = document.createElement('div');
    document.body.appendChild(host);

    const editor = new PresentationEditor({
      mode: 'docx',
      element: host,
      fileSource: blob,
      extensions: getStarterExtensions(),
      documentId: 'sd-1960-browser-path',
      content: docx,
      media,
      mediaFiles,
      fonts,
      isCommentsEnabled: true,
      documentMode: 'editing',
      suppressDefaultDocxStyles: true,
    });

    try {
      const segments = collectTrackedSegments(editor.editor.state.doc);
      const inserts = segments.filter((segment) => segment.type === 'insert');
      const deletes = segments.filter((segment) => segment.type === 'delete');

      expect(inserts.length).toBeGreaterThan(0);
      expect(deletes.length).toBeGreaterThan(0);
      expect(inserts[0].id).toBe(deletes[0].id);
      expect(inserts[0].sourceId).not.toBe(deletes[0].sourceId);
    } finally {
      editor.destroy();
      host.remove();
    }
  });
});
