/**
 * Multi-Section Document Page Count Test
 *
 * Validates that multi_section_doc.docx renders with the correct number of pages.
 * This document has 4 sections with different orientations and column layouts:
 * - Section 0 (paras 0-2): Portrait, 1 column, type defaults to 'nextPage'
 * - Section 1 (paras 3-5): Portrait, 2 columns, type defaults to 'nextPage'
 * - Section 2 (paras 6-8): Portrait, 1 column, type defaults to 'nextPage'
 * - Section 3 (paras 9-10): Landscape, 1 column, type defaults to 'nextPage' (body sectPr)
 *
 * Expected: 4 pages total
 * Bug: Currently renders as 3 pages (sections 2 and 3 appearing on same page)
 *
 * @module multi-section-page-count.test
 */

import { describe, it, expect } from 'vitest';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import { layoutDocument } from '@superdoc/layout-engine';
import { measureBlocks } from './test-helpers/section-test-utils.js';
import type { FlowBlock, PMNode, SectionBreakBlock } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load DOCX file and convert to ProseMirror JSON
 *
 * This uses the same machinery as the extract-pm-json script.
 *
 * @param docxPath - Path to DOCX file
 * @returns ProseMirror document and converter context
 */
async function docxToPMJson(docxPath: string): Promise<{
  pmDoc: PMNode;
  converterContext: {
    docx: Record<string, unknown>;
    translatedLinkedStyles: unknown;
    translatedNumbering: unknown;
  };
  themeColors?: unknown;
}> {
  // Dynamic imports to avoid bundling issues
  const { default: DocxZipper } = await import('../../../super-editor/src/core/DocxZipper.js');
  const { createDocumentJson } = await import(
    '../../../super-editor/src/core/super-converter/v2/importer/docxImporter.js'
  );
  const { parseXmlToJson } = await import('../../../super-editor/src/core/super-converter/v2/docxHelper.js');

  const EXTENSIONS_TO_CONVERT = new Set(['.xml', '.rels']);

  const fileBuffer = fs.readFileSync(docxPath);

  // Unzip and parse
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

  // Convert to PM JSON
  const converter = {
    docHiglightColors: new Set(),
  };

  const editor = {
    options: {},
    emit: () => {},
  };

  const result = createDocumentJson(docx, converter, editor);

  if (!result || !result.pmDoc) {
    throw new Error('Failed to extract PM JSON from DOCX');
  }

  return {
    pmDoc: result.pmDoc,
    converterContext: {
      docx,
      translatedLinkedStyles: result.translatedLinkedStyles,
      translatedNumbering: result.translatedNumbering,
    },
    themeColors: result.themeColors,
  };
}

/**
 * Analyze section break blocks in the flow
 *
 * @param blocks - Flow blocks to analyze
 * @returns Section break information
 */
function analyzeSectionBreaks(blocks: FlowBlock[]): {
  totalBreaks: number;
  breakDetails: Array<{
    index: number;
    type: string;
    pageSize?: { w: number; h: number };
    orientation?: 'portrait' | 'landscape';
    columns?: { count: number; gap: number };
  }>;
} {
  const breakDetails: Array<{
    index: number;
    type: string;
    pageSize?: { w: number; h: number };
    orientation?: 'portrait' | 'landscape';
    columns?: { count: number; gap: number };
  }> = [];

  blocks.forEach((block, index) => {
    if (block.kind === 'sectionBreak') {
      const sb = block as SectionBreakBlock;
      breakDetails.push({
        index,
        type: sb.type,
        pageSize: sb.pageSize,
        orientation: sb.orientation,
        columns: sb.columns,
      });
    }
  });

  return {
    totalBreaks: breakDetails.length,
    breakDetails,
  };
}

describe('Multi-Section Document Page Count', () => {
  it('should render multi_section_doc.docx as exactly 4 pages', async () => {
    // Load the DOCX file
    const docxPath = path.join(__dirname, '../../../super-editor/src/tests/data/multi_section_doc.docx');

    if (!fs.existsSync(docxPath)) {
      throw new Error(`Test document not found: ${docxPath}`);
    }

    // Convert DOCX to PM JSON
    console.log('Converting DOCX to ProseMirror JSON...');
    const { pmDoc, converterContext, themeColors } = await docxToPMJson(docxPath);
    console.log(`PM Doc has ${pmDoc.content?.length ?? 0} top-level nodes`);

    // Convert PM JSON to flow blocks
    console.log('Converting to flow blocks...');
    const { blocks, bookmarks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true,
      converterContext,
      themeColors,
    });
    console.log(`Generated ${blocks.length} flow blocks`);

    // Analyze section breaks
    const sectionAnalysis = analyzeSectionBreaks(blocks);
    console.log('Section break analysis:');
    console.log(`  Total section breaks: ${sectionAnalysis.totalBreaks}`);
    sectionAnalysis.breakDetails.forEach((detail, i) => {
      console.log(`  Break ${i + 1} (block ${detail.index}):`);
      console.log(`    Type: ${detail.type}`);
      console.log(`    Orientation: ${detail.orientation ?? 'not specified'}`);
      console.log(`    Page Size: ${detail.pageSize ? `${detail.pageSize.w}x${detail.pageSize.h}` : 'not specified'}`);
      console.log(`    Columns: ${detail.columns ? `${detail.columns.count} columns` : 'not specified'}`);
    });

    // Log paragraph blocks for context
    const paragraphBlocks = blocks.filter((b) => b.kind === 'paragraph');
    console.log(`Total paragraph blocks: ${paragraphBlocks.length}`);

    // Measure the flow blocks
    console.log('Measuring blocks...');
    const measures = await measureBlocks(blocks);
    console.log(`Generated ${measures.length} measures`);

    // Layout the document
    console.log('Laying out document...');
    const layout = layoutDocument(blocks, measures);
    console.log(`Generated ${layout.pages.length} pages`);

    // Detailed page analysis
    layout.pages.forEach((page, i) => {
      console.log(`Page ${i + 1}:`);
      console.log(`  Orientation: ${page.orientation ?? 'portrait'}`);
      console.log(`  Page size: ${page.pageSize?.w ?? 612}x${page.pageSize?.h ?? 792}`);
      console.log(`  Fragments: ${page.fragments.length}`);

      // Count paragraphs on this page
      const paraFrags = page.fragments.filter((f) => f.blockKind === 'paragraph');
      console.log(`  Paragraph fragments: ${paraFrags.length}`);
    });

    // Assertions
    expect(layout.pages.length).toBe(4);

    // Page 4 should have landscape orientation
    const page4 = layout.pages[3];
    expect(page4).toBeDefined();
    expect(page4.orientation).toBe('landscape');

    // Verify page size is landscape (width > height)
    if (page4.pageSize) {
      expect(page4.pageSize.w).toBeGreaterThan(page4.pageSize.h);
    }
  });

  it('should emit 3 section break blocks for a 4-section document', async () => {
    const docxPath = path.join(__dirname, '../../../super-editor/src/tests/data/multi_section_doc.docx');

    const { pmDoc, converterContext, themeColors } = await docxToPMJson(docxPath);
    const { blocks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true,
      converterContext,
      themeColors,
    });

    const sectionBreaks = blocks.filter((b) => b.kind === 'sectionBreak');
    console.log(`Section breaks found: ${sectionBreaks.length}`);

    sectionBreaks.forEach((sb, i) => {
      const breakBlock = sb as SectionBreakBlock;
      console.log(`Break ${i + 1}: type=${breakBlock.type}, orientation=${breakBlock.orientation}`);
    });

    // 4 sections = 3 section breaks (between sections 0-1, 1-2, 2-3)
    const emittedBreaks = sectionBreaks.filter((breakBlock) => !breakBlock.attrs?.isFirstSection);
    expect(emittedBreaks.length).toBe(3);

    // The last section break should have landscape orientation
    const lastBreak = sectionBreaks[sectionBreaks.length - 1] as SectionBreakBlock;
    expect(lastBreak.orientation).toBe('landscape');
  });

  it('should have correct section break types', async () => {
    const docxPath = path.join(__dirname, '../../../super-editor/src/tests/data/multi_section_doc.docx');

    const { pmDoc, converterContext, themeColors } = await docxToPMJson(docxPath);
    const { blocks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true,
      converterContext,
      themeColors,
    });

    const sectionBreaks = blocks.filter((b) => b.kind === 'sectionBreak') as SectionBreakBlock[];

    // All breaks should be 'nextPage' type (default for explicit sections)
    sectionBreaks.forEach((sb, i) => {
      console.log(`Break ${i + 1} type: ${sb.type}`);
      expect(sb.type).toBe('nextPage');
    });
  });
});
