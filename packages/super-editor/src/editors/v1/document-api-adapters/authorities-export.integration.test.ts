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

describe('authorities export integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('exports TA and TOA field codes after authorities API inserts', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const stamp = Date.now();
    const authorityHostToken = `AUTHORITY_HOST_${stamp}`;
    const longCitation = `Long Citation ${stamp}`;
    const shortCitation = `Short Citation ${stamp}`;

    await Promise.resolve(
      editor.doc.insert({
        value: [
          `Authorities export validation run ${stamp}.`,
          `This paragraph contains ${authorityHostToken} and hosts the TA field.`,
          `A TOA field should appear at document end.`,
        ].join('\n\n'),
        type: 'markdown',
      }),
    );

    const matchResult = await Promise.resolve(
      editor.doc.query.match({
        select: { type: 'text', pattern: authorityHostToken },
        require: 'first',
      }),
    );

    const hostBlock = matchResult?.items?.[0]?.blocks?.[0];
    expect(hostBlock?.blockId).toBeTruthy();
    expect(hostBlock?.range).toBeTruthy();
    if (!hostBlock?.blockId || !hostBlock?.range) return;

    const entryInsert = await Promise.resolve(
      editor.doc.authorities.entries.insert({
        at: {
          kind: 'text',
          segments: [{ blockId: hostBlock.blockId, range: { start: hostBlock.range.start, end: hostBlock.range.end } }],
        },
        entry: {
          longCitation,
          shortCitation,
          category: 1,
          bold: true,
          italic: true,
        },
      }),
    );

    expect(entryInsert.success).toBe(true);
    if (!entryInsert.success) return;

    const authoritiesInsert = await Promise.resolve(
      editor.doc.authorities.insert({
        at: { kind: 'documentEnd' },
        config: {
          category: 1,
          entryPageSeparator: ', ',
          usePassim: true,
          includeHeadings: true,
          tabLeader: 'dot',
          pageRangeSeparator: '-',
        },
      }),
    );

    expect(authoritiesInsert.success).toBe(true);
    if (!authoritiesInsert.success) return;

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    const instructions = extractInstructionTexts(documentXml);
    const taInstruction = instructions.find((instruction) => instruction.startsWith('TA '));
    const toaInstruction = instructions.find((instruction) => instruction.startsWith('TOA '));

    expect(taInstruction).toBeTruthy();
    expect(toaInstruction).toBeTruthy();

    expect(taInstruction).toContain(`\\l "${longCitation}"`);
    expect(taInstruction).toContain(`\\s "${shortCitation}"`);
    expect(taInstruction).toContain('\\c 1');

    expect(toaInstruction).toContain('\\c 1');
    expect(toaInstruction).toContain('\\e ", "');
    expect(toaInstruction).toContain('\\p');
    expect(toaInstruction).toContain('\\h');
    expect(toaInstruction).toContain('\\l "."');
    expect(toaInstruction).toContain('\\g "-"');

    const beginCount = (documentXml.match(/w:fldCharType="begin"/g) ?? []).length;
    const separateCount = (documentXml.match(/w:fldCharType="separate"/g) ?? []).length;
    const endCount = (documentXml.match(/w:fldCharType="end"/g) ?? []).length;

    expect(beginCount).toBeGreaterThanOrEqual(2);
    expect(separateCount).toBeGreaterThanOrEqual(2);
    expect(endCount).toBeGreaterThanOrEqual(2);
  });
});
