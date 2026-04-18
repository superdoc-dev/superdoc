/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

function mapExportedFiles(files: Array<{ name: string; content: string }>): Record<string, string> {
  const byName: Record<string, string> = {};
  for (const file of files) {
    byName[file.name] = file.content;
  }
  return byName;
}

const XML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|apos|gt|lt|quot);/g, (entity, token: string) => {
    const mapped = XML_ENTITY_MAP[token];
    if (mapped) return mapped;

    if (token.startsWith('#x')) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    if (token.startsWith('#')) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    return entity;
  });
}

function extractInstructionTexts(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((match) =>
    decodeXmlEntities(match[1]),
  );
}

async function exportDocxFiles(editor: Editor): Promise<Record<string, string>> {
  const zipper = new DocxZipper();
  const exportedBuffer = await editor.exportDocx();
  const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
  return mapExportedFiles(exportedFiles);
}

async function findFirstTextBlock(
  editor: Editor,
  pattern: string,
): Promise<{ blockId: string; range: { start: number; end: number } }> {
  const matchResult = await Promise.resolve(
    editor.doc.query.match({
      select: { type: 'text', pattern },
      require: 'first',
    }),
  );

  const block = matchResult?.items?.[0]?.blocks?.[0];
  if (!block?.blockId || !block?.range) {
    throw new Error(`Could not resolve text match for pattern "${pattern}": ${JSON.stringify(matchResult)}`);
  }

  return block;
}

describe('fields + captions export integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('exports DATE raw field and SEQ caption field codes after API inserts', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const stamp = Date.now();
    const rawFieldHostToken = `RAW_FIELD_HOST_${stamp}`;
    const captionAnchorToken = `CAPTION_ANCHOR_${stamp}`;
    const rawFieldInstruction = 'DATE \\@ "yyyy-MM-dd"';
    const captionLabel = 'Figure';
    const captionText = `Caption inserted by API ${stamp}`;

    await Promise.resolve(
      editor.doc.insert({
        value: [
          `Fields + captions export validation run ${stamp}.`,
          `Paragraph with ${rawFieldHostToken} for raw field insertion.`,
          `Paragraph with ${captionAnchorToken} to anchor caption placement.`,
          `Trailing paragraph ${stamp}.`,
        ].join('\n\n'),
        type: 'markdown',
      }),
    );

    const fieldHostBlock = await findFirstTextBlock(editor, rawFieldHostToken);
    const captionAnchorBlock = await findFirstTextBlock(editor, captionAnchorToken);

    const fieldInsert = await Promise.resolve(
      editor.doc.fields.insert({
        mode: 'raw',
        instruction: rawFieldInstruction,
        at: {
          kind: 'text',
          segments: [
            {
              blockId: fieldHostBlock.blockId,
              range: { start: fieldHostBlock.range.start, end: fieldHostBlock.range.start },
            },
          ],
        },
      }),
    );
    expect(fieldInsert.success).toBe(true);
    if (!fieldInsert.success) return;

    const captionInsert = await Promise.resolve(
      editor.doc.captions.insert({
        adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: captionAnchorBlock.blockId },
        position: 'below',
        label: captionLabel,
        text: captionText,
      }),
    );
    expect(captionInsert.success).toBe(true);
    if (!captionInsert.success) return;

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    const instructions = extractInstructionTexts(documentXml);
    const dateInstruction = instructions.find((instruction) => instruction.startsWith('DATE '));
    const sequenceInstruction = instructions.find((instruction) => instruction.startsWith(`SEQ ${captionLabel}`));

    expect(dateInstruction).toBe(rawFieldInstruction);
    expect(sequenceInstruction).toBe(`SEQ ${captionLabel} \\* ARABIC`);
    expect(documentXml).toContain(captionText);
    expect(documentXml).toMatch(/<w:pStyle[^>]*w:val="Caption"[^>]*\/>/);

    const beginCount = (documentXml.match(/w:fldCharType="begin"/g) ?? []).length;
    const separateCount = (documentXml.match(/w:fldCharType="separate"/g) ?? []).length;
    const endCount = (documentXml.match(/w:fldCharType="end"/g) ?? []).length;

    expect(beginCount).toBeGreaterThanOrEqual(2);
    expect(separateCount).toBeGreaterThanOrEqual(2);
    expect(endCount).toBeGreaterThanOrEqual(2);
  });
});
