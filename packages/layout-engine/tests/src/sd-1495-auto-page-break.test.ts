import { describe, expect, it } from 'vitest';
import { layoutDocument } from '@superdoc/layout-engine';
import { toFlowBlocks, type ConverterContext } from '@superdoc/pm-adapter';
import { measureBlock } from '@superdoc/measuring-dom';
import type { FlowBlock, PMNode } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LETTER = {
  pageSize: { w: 612, h: 792 },
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

type FixtureCase = {
  filename: string;
  headingText: string;
};

const FIXTURES: FixtureCase[] = [
  { filename: 'sd-1495-auto-page-break.docx', headingText: 'Throughout this form' },
  { filename: 'sd-1495-auto-page-break-2.docx', headingText: 'TITLE IN HERE' },
];

const FIXTURE_DIR = path.join(__dirname, '../../../super-editor/src/tests/data');
const EXTENSIONS_TO_CONVERT = new Set(['.xml', '.rels']);

async function loadDocxFixture(filename: string): Promise<{ pmDoc: PMNode; converterContext: ConverterContext }> {
  const { default: DocxZipper } = await import('../../../super-editor/src/core/DocxZipper.js');
  const { createDocumentJson } = await import(
    '../../../super-editor/src/core/super-converter/v2/importer/docxImporter.js'
  );
  const { parseXmlToJson } = await import('../../../super-editor/src/core/super-converter/v2/docxHelper.js');

  const docxPath = path.join(FIXTURE_DIR, filename);
  const fileBuffer = fs.readFileSync(docxPath);

  const zipper = new DocxZipper();
  const xmlFiles = await zipper.getDocxData(fileBuffer, true);

  const docx: Record<string, unknown> = {};
  xmlFiles.forEach((entry: { name: string; content: string | Buffer }) => {
    const { name, content } = entry;
    const extension = name.slice(name.lastIndexOf('.'));
    if (EXTENSIONS_TO_CONVERT.has(extension)) {
      docx[name] = parseXmlToJson(content as string);
    } else {
      docx[name] = content;
    }
  });

  const converter = {
    telemetry: {
      trackFileStructure: () => {},
      trackUsage: () => {},
      trackStatistic: () => {},
    },
    docHiglightColors: new Set(),
  };

  const editor = { options: {}, emit: () => {} };
  const result = createDocumentJson(docx, converter, editor);

  if (!result?.pmDoc) {
    throw new Error('Failed to extract PM JSON from DOCX fixture');
  }

  const converterContext: ConverterContext = {
    docx,
    numbering: result.numbering,
    linkedStyles: result.linkedStyles,
    translatedLinkedStyles: result.translatedLinkedStyles,
    translatedNumbering: result.translatedNumbering,
  };

  return { pmDoc: result.pmDoc, converterContext };
}

function blockText(block: FlowBlock): string {
  if (block.kind !== 'paragraph') return '';
  const runs = (block as FlowBlock & { runs?: Array<{ text?: string }> }).runs ?? [];
  return runs.map((run) => (typeof run.text === 'string' ? run.text : '')).join('');
}

function findPageIndex(layout: ReturnType<typeof layoutDocument>, blockId?: string): number {
  if (!blockId) return -1;
  return layout.pages.findIndex((page) => page.fragments.some((fragment) => fragment.blockId === blockId));
}

describe('SD-1495 auto page breaks', () => {
  it.each(FIXTURES)('pushes heading to next page for %s', async ({ filename, headingText }) => {
    const { pmDoc, converterContext } = await loadDocxFixture(filename);
    const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true, converterContext });

    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    const headingIndex = blocks.findIndex(
      (block) => block.kind === 'paragraph' && blockText(block).includes(headingText),
    );
    expect(headingIndex).toBeGreaterThan(0);

    let prevParagraphIndex = -1;
    for (let i = headingIndex - 1; i >= 0; i -= 1) {
      if (blocks[i].kind === 'paragraph') {
        prevParagraphIndex = i;
        break;
      }
    }
    expect(prevParagraphIndex).toBeGreaterThanOrEqual(0);

    const headingPage = findPageIndex(layout, blocks[headingIndex].id);
    const prevPage = findPageIndex(layout, blocks[prevParagraphIndex].id);

    expect(headingPage).toBeGreaterThanOrEqual(0);
    expect(prevPage).toBeGreaterThanOrEqual(0);
    expect(headingPage).toBeGreaterThan(prevPage);
  });
});
