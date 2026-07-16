/* @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { executePlan } from './plan-engine/executor.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

async function exportDocumentXml(editor: Editor): Promise<string> {
  const zipper = new DocxZipper();
  const buf = await editor.exportDocx();
  const files = await zipper.getDocxData(buf, true);
  const byName: Record<string, string> = {};
  for (const f of files as Array<{ name: string; content: string }>) byName[f.name] = f.content;
  return byName['word/document.xml'] || '';
}

describe('pPrChange export path (proves the representation)', () => {
  let docData: LoadedDocData;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-format-paragraph-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  it('apply path: format.apply alignment in tracked mode emits w:jc + w:pPrChange', async () => {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      user: { name: 'Agent', email: 'agent@example.com' },
    } as any);

    // Find the target paragraph's sdBlockId/nodeId.
    let nodeId: string | null = null;
    (editor as any).state.doc.descendants((node: any) => {
      if (nodeId || !node.isTextblock) return true;
      if (typeof node.textContent === 'string' && node.textContent.includes('shall be centered')) {
        nodeId = node.attrs.sdBlockId ?? null;
      }
      return true;
    });
    expect(nodeId, 'target nodeId resolved').toBeTruthy();

    executePlan(
      editor as any,
      {
        changeMode: 'tracked',
        steps: [
          {
            id: 's1',
            op: 'format.apply',
            where: { by: 'block', nodeType: 'paragraph', nodeId },
            args: { alignment: 'center', scope: 'block' },
          },
        ],
      } as any,
    );

    const xml = await exportDocumentXml(editor);
    // eslint-disable-next-line no-console
    console.log(
      '[ppr-apply] has w:jc center =',
      /<w:jc w:val="center"/.test(xml),
      '| has w:pPrChange =',
      xml.includes('<w:pPrChange'),
    );
    expect(/<w:jc w:val="center"/.test(xml)).toBe(true);
    expect(xml).toContain('<w:pPrChange');
    editor.destroy();
  });

  it('emits w:jc + w:pPrChange when a paragraph carries justification + a change record', async () => {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });

    // Find the target paragraph and stamp justification + a pPrChange record.
    const tr = (editor as any).state.tr;
    let found = false;
    (editor as any).state.doc.descendants((node: any, pos: number) => {
      if (found || !node.isTextblock) return true;
      if (typeof node.textContent === 'string' && node.textContent.includes('shall be centered')) {
        const existing = (node.attrs.paragraphProperties ?? {}) as Record<string, unknown>;
        const updated = {
          ...existing,
          justification: 'center',
          change: {
            id: '900',
            author: 'Agent',
            date: '2026-06-25T00:00:00Z',
            paragraphProperties: {}, // former state: no explicit justification (left)
          },
        };
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, paragraphProperties: updated });
        found = true;
      }
      return true;
    });
    expect(found, 'target paragraph found').toBe(true);
    (editor as any).view.dispatch(tr);

    const xml = await exportDocumentXml(editor);
    // eslint-disable-next-line no-console
    console.log(
      '[ppr-export] has w:jc center =',
      /<w:jc w:val="center"/.test(xml),
      '| has w:pPrChange =',
      xml.includes('<w:pPrChange'),
    );

    expect(/<w:jc w:val="center"/.test(xml)).toBe(true);
    expect(xml).toContain('<w:pPrChange');
    editor.destroy();
  });
});
