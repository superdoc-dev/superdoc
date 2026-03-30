import { describe, expect, it, vi } from 'vitest';

import { Editor } from '@core/Editor.js';
import { BLANK_DOCX_BASE64 } from '@core/blank-docx.js';
import { getStarterExtensions } from '@extensions/index.js';
import { captureSnapshot, compareToSnapshot } from '@extensions/diffing/service/index.ts';
import { createDiffAdapter } from './diff-adapter.ts';

const TEST_USER = { name: 'Test User', email: 'test@example.com' };

async function openBlankEditor(text: string): Promise<Editor> {
  const editor = await Editor.open(Buffer.from(BLANK_DOCX_BASE64, 'base64'), {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
  editor.dispatch(editor.state.tr.insertText(text, 1));
  return editor;
}

function createHeaderFooterDoc(editor: Editor, text: string): Record<string, unknown> {
  const paragraph = editor.schema.nodes.paragraph.create(
    undefined,
    editor.schema.nodes.run.create(undefined, text ? [editor.schema.text(text)] : []),
  );
  return editor.schema.nodes.doc.create(undefined, [paragraph]).toJSON() as Record<string, unknown>;
}

function seedHeader(editor: Editor, refId: string, partPath: string, text: string): void {
  const converter = editor.converter!;
  const headers = (converter.headers ??= {});
  headers[refId] = createHeaderFooterDoc(editor, text);

  const headerIds = (converter.headerIds ??= {}) as { ids?: string[]; default?: string | null };
  if (!Array.isArray(headerIds.ids)) headerIds.ids = [];
  if (!headerIds.ids.includes(refId)) headerIds.ids.push(refId);

  const relsPart = (converter.convertedXml!['word/_rels/document.xml.rels'] ??= {
    type: 'element',
    name: 'document',
    elements: [],
  }) as { elements?: Array<{ name?: string; attributes?: Record<string, string>; elements?: unknown[] }> };
  if (!relsPart.elements) relsPart.elements = [];

  let relsRoot = relsPart.elements.find((e) => e.name === 'Relationships');
  if (!relsRoot) {
    relsRoot = {
      name: 'Relationships',
      attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
      elements: [],
    };
    relsPart.elements.push(relsRoot);
  }
  if (!relsRoot.elements) relsRoot.elements = [];

  relsRoot.elements.push({
    name: 'Relationship',
    attributes: {
      Id: refId,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
      Target: partPath.replace(/^word\//, ''),
    },
    elements: [],
  });

  const sectPrElements: Array<Record<string, unknown>> = [
    { type: 'element', name: 'w:pgSz', attributes: { 'w:w': '12240', 'w:h': '15840' } },
    {
      type: 'element',
      name: 'w:pgMar',
      attributes: {
        'w:top': '1440',
        'w:right': '1440',
        'w:bottom': '1440',
        'w:left': '1440',
        'w:header': '708',
        'w:footer': '708',
        'w:gutter': '0',
      },
    },
    { type: 'element', name: 'w:headerReference', attributes: { 'w:type': 'default', 'r:id': refId }, elements: [] },
  ];
  converter.bodySectPr = { type: 'element', name: 'w:sectPr', elements: sectPrElements };
}

describe('createDiffAdapter', () => {
  it('dispatches transaction for header-only diffs when document body is unchanged', async () => {
    const baseEditor = await openBlankEditor('Same body text.');
    const targetEditor = await openBlankEditor('Same body text.');

    try {
      seedHeader(targetEditor, 'rIdHeader1', 'word/header1.xml', 'New header content');

      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);

      expect(diff.summary.body.hasChanges).toBe(false);
      expect(diff.summary.headerFooters.hasChanges).toBe(true);

      const dispatchSpy = vi.spyOn(baseEditor, 'dispatch');
      const adapter = createDiffAdapter(baseEditor);
      const result = adapter.apply({ diff }, { changeMode: 'direct' });

      expect(result.appliedOperations).toBeGreaterThan(0);
      expect(dispatchSpy).toHaveBeenCalledOnce();
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('does not dispatch when there are no changes', async () => {
    const baseEditor = await openBlankEditor('Identical content.');
    const targetEditor = await openBlankEditor('Identical content.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);

      expect(diff.summary.hasChanges).toBe(false);

      const dispatchSpy = vi.spyOn(baseEditor, 'dispatch');
      const adapter = createDiffAdapter(baseEditor);
      const result = adapter.apply({ diff }, { changeMode: 'direct' });

      expect(result.appliedOperations).toBe(0);
      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });
});
