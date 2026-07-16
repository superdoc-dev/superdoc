/* @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { listsAttachWrapper } from './plan-engine/lists-wrappers.js';
import { updateNumberingProperties } from '@core/commands/changeListLevel.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

async function exportDocumentXml(editor: Editor, opts?: { isFinalDoc?: boolean }): Promise<string> {
  const zipper = new DocxZipper();
  const buf = await editor.exportDocx(opts);
  const files = await zipper.getDocxData(buf, true);
  const byName: Record<string, string> = {};
  for (const f of files as Array<{ name: string; content: string }>) byName[f.name] = f.content;
  return byName['word/document.xml'] || '';
}

function blockIdByText(editor: Editor, needle: string): string | null {
  let id: string | null = null;
  (editor as any).state.doc.descendants((node: any) => {
    if (id || !node.isTextblock) return true;
    if (typeof node.textContent === 'string' && node.textContent.includes(needle)) {
      id = node.attrs.sdBlockId ?? null;
    }
    return true;
  });
  return id;
}

describe('tracked numbering (numbering-001 repro)', () => {
  let docData: LoadedDocData;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-numbering-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  it('attaching numbering in tracked mode emits numPr + w:pPrChange', async () => {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      user: { name: 'Agent', email: 'agent@example.com' },
    } as any);

    const nodes: any[] = [];
    (editor as any).state.doc.descendants((node: any, pos: number) => {
      if (node.isTextblock) {
        nodes.push({
          pos,
          type: node.type.name,
          id: node.attrs.sdBlockId,
          numId: node.attrs.numberingProperties?.numId ?? node.attrs.paragraphProperties?.numberingProperties?.numId,
          text: (node.textContent || '').slice(0, 30),
        });
      }
      return true;
    });
    // eslint-disable-next-line no-console
    console.log('[numbering] nodes:', JSON.stringify(nodes));

    // Apply tracked numbering directly through the unit the attach wrapper uses.
    const tr = (editor as any).state.tr;
    let applied = false;
    (editor as any).state.doc.descendants((node: any, pos: number) => {
      if (applied || !node.isTextblock) return true;
      if (typeof node.textContent === 'string' && node.textContent.includes('Third obligation')) {
        updateNumberingProperties({ numId: 1, ilvl: 0 }, node, pos, editor as any, tr, { trackChange: true });
        applied = true;
      }
      return true;
    });
    expect(applied, 'numbering applied to Third obligation').toBe(true);
    (editor as any).view.dispatch(tr);

    const xml = await exportDocumentXml(editor);
    const pPrChangeCount = (xml.match(/<w:pPrChange/g) || []).length;
    // eslint-disable-next-line no-console
    console.log('[numbering] pPrChange count =', pPrChangeCount, '| has numPr =', xml.includes('<w:numPr'));

    expect(xml).toContain('<w:numPr');
    expect(pPrChangeCount).toBeGreaterThanOrEqual(1);

    // The exported w:pPrChange w:id must be a decimal integer (OOXML CT_TrackChange),
    // not the internal uuidv4 change id — otherwise Word repairs/drops it and
    // re-import can't match. See resolveExportWordId routing in pPrChange-translator.
    const pPrChangeId = xml.match(/<w:pPrChange[^>]*\bw:id="([^"]*)"/)?.[1];
    expect(pPrChangeId, 'w:pPrChange carries a w:id').toBeTruthy();
    expect(pPrChangeId, `w:pPrChange w:id must be decimal, got "${pPrChangeId}"`).toMatch(/^\d+$/);
    editor.destroy();
  });

  // pPrChange w:ids must be unique across the document.
  // The old per-uuid hash had no reservation, so two changes could collide.
  // Routing through the shared Word revision-id allocator guarantees uniqueness.
  it('multiple tracked pPrChanges get unique, allocator-minted w:ids', async () => {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      user: { name: 'Agent', email: 'agent@example.com' },
    } as any);

    // Attach tracked numbering to TWO unnumbered paragraphs → two API-created
    // pPrChanges, each with its own uuid.
    for (const needle of ['Third obligation', 'These terms are final']) {
      const tr = (editor as any).state.tr;
      let applied = false;
      (editor as any).state.doc.descendants((node: any, pos: number) => {
        if (applied || !node.isTextblock) return true;
        if (typeof node.textContent === 'string' && node.textContent.includes(needle)) {
          updateNumberingProperties({ numId: 1, ilvl: 0 }, node, pos, editor as any, tr, { trackChange: true });
          applied = true;
        }
        return true;
      });
      expect(applied, `numbering applied to "${needle}"`).toBe(true);
      (editor as any).view.dispatch(tr);
    }

    const xml = await exportDocumentXml(editor);
    const ids = [...xml.matchAll(/<w:pPrChange[^>]*\bw:id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length, 'two tracked pPrChanges exported').toBe(2);
    ids.forEach((id) => expect(id, `w:id must be decimal, got "${id}"`).toMatch(/^\d+$/));
    expect(new Set(ids).size, `w:pPrChange ids must be unique, got ${JSON.stringify(ids)}`).toBe(ids.length);
    editor.destroy();
  });

  // A FINAL-doc export flattens tracked
  // changes to the accepted result. A tracked numbering change must export as
  // the accepted numbering (w:numPr) with NO pending w:pPrChange — same as the
  // ins/del translators strip their wrappers when isFinalDoc.
  it('final-doc export flattens a tracked pPrChange (numbering kept, no w:pPrChange)', async () => {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      user: { name: 'Agent', email: 'agent@example.com' },
    } as any);

    const tr = (editor as any).state.tr;
    let applied = false;
    (editor as any).state.doc.descendants((node: any, pos: number) => {
      if (applied || !node.isTextblock) return true;
      if (typeof node.textContent === 'string' && node.textContent.includes('Third obligation')) {
        updateNumberingProperties({ numId: 1, ilvl: 0 }, node, pos, editor as any, tr, { trackChange: true });
        applied = true;
      }
      return true;
    });
    expect(applied, 'tracked numbering applied').toBe(true);
    (editor as any).view.dispatch(tr);

    // Regular export keeps the pending revision...
    const draftXml = await exportDocumentXml(editor);
    expect(
      (draftXml.match(/<w:pPrChange/g) || []).length,
      'draft export carries the pending revision',
    ).toBeGreaterThanOrEqual(1);

    // ...but the FINAL export flattens it: numbering kept, no w:pPrChange.
    const finalXml = await exportDocumentXml(editor, { isFinalDoc: true });
    expect(finalXml).toContain('<w:numPr');
    expect((finalXml.match(/<w:pPrChange/g) || []).length, 'no pending w:pPrChange in a final doc').toBe(0);
    editor.destroy();
  });
});
