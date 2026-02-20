/**
 * Multi-Section Document Page Count Test (Simplified)
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
 * @module multi-section-page-count-simple.test
 */

import { describe, it, expect } from 'vitest';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import { layoutDocument } from '@superdoc/layout-engine';
import { measureBlock } from '@superdoc/measuring-dom';
import type { FlowBlock, PMNode, SectionBreakBlock, Measure } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONVERTER_CONTEXT } from './test-helpers/section-test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load ProseMirror JSON fixture
 *
 * @param fixtureName - Name of the fixture file
 * @returns ProseMirror document
 */
function loadPMJsonFixture(fixtureName: string): PMNode {
  const fixturePath = path.join(__dirname, '../../pm-adapter/src/fixtures', fixtureName);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }

  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
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
      // Note: kind is 'sectionBreak' in camelCase
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

describe('Multi-Section Document Page Count (Simple)', () => {
  it('should render multi_section_doc.docx as exactly 4 pages', async () => {
    console.log('\n=== STARTING MULTI-SECTION PAGE COUNT TEST ===\n');

    // Load the pre-generated PM JSON
    console.log('Loading ProseMirror JSON...');
    const pmDoc = loadPMJsonFixture('multi_section_doc.json');
    console.log(`PM Doc has ${pmDoc.content?.length ?? 0} top-level nodes`);

    // Convert PM JSON to flow blocks
    console.log('\nConverting to flow blocks...');
    const { blocks, bookmarks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true, // CRITICAL: Must enable section break emission
      converterContext: DEFAULT_CONVERTER_CONTEXT,
    });
    console.log(`Generated ${blocks.length} flow blocks`);
    console.log(`Generated ${bookmarks.size} bookmarks`);

    // Debug: Print all block kinds
    console.log('\n--- All Block Kinds (Debug) ---');
    blocks.forEach((b, i) => {
      if (b.kind === 'sectionBreak' || b.kind.includes('section') || b.kind.includes('Section')) {
        console.log(`Block ${i}: kind="${b.kind}"`);
      }
    });

    // Analyze section breaks
    const sectionAnalysis = analyzeSectionBreaks(blocks);
    console.log('\n--- Section Break Analysis ---');
    console.log(`Total section breaks: ${sectionAnalysis.totalBreaks}`);
    sectionAnalysis.breakDetails.forEach((detail, i) => {
      console.log(`\nBreak ${i + 1} (block index ${detail.index}):`);
      console.log(`  Type: ${detail.type}`);
      console.log(`  Orientation: ${detail.orientation ?? 'not specified'}`);
      console.log(`  Page Size: ${detail.pageSize ? `${detail.pageSize.w}x${detail.pageSize.h}` : 'not specified'}`);
      console.log(
        `  Columns: ${detail.columns ? `${detail.columns.count} columns (gap: ${detail.columns.gap})` : 'not specified'}`,
      );
    });

    // Log paragraph blocks for context
    const paragraphBlocks = blocks.filter((b) => b.kind === 'paragraph');
    console.log(`\nTotal paragraph blocks: ${paragraphBlocks.length}`);

    // Log all block types
    const blockTypes = blocks.reduce(
      (acc, b) => {
        acc[b.kind] = (acc[b.kind] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log('\n--- Block Type Distribution ---');
    Object.entries(blockTypes).forEach(([kind, count]) => {
      console.log(`  ${kind}: ${count}`);
    });

    // Measure the flow blocks
    console.log('\n--- Measuring Blocks ---');
    const measures: Measure[] = await Promise.all(
      blocks.map((block) => measureBlock(block, 468)), // 612 - 72*2 = 468px content width
    );
    console.log(`Generated ${measures.length} measures`);

    // Layout the document
    console.log('\n--- Laying Out Document ---');
    const layout = layoutDocument(blocks, measures);
    console.log(`Generated ${layout.pages.length} pages`);

    // Detailed page analysis
    console.log('\n--- Page Analysis ---');
    layout.pages.forEach((page, i) => {
      console.log(`\nPage ${i + 1}:`);
      console.log(`  Orientation: ${page.orientation ?? 'portrait'}`);
      console.log(`  Page size: ${page.pageSize?.w ?? 612}x${page.pageSize?.h ?? 792}`);
      console.log(`  Fragments: ${page.fragments.length}`);

      // Count different fragment types
      const fragTypes = page.fragments.reduce(
        (acc, f) => {
          acc[f.blockKind] = (acc[f.blockKind] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      Object.entries(fragTypes).forEach(([kind, count]) => {
        console.log(`    ${kind}: ${count}`);
      });
    });

    console.log('\n=== TEST ASSERTIONS ===\n');

    // Main assertion: should have exactly 4 pages
    console.log(`Expected pages: 4`);
    console.log(`Actual pages: ${layout.pages.length}`);

    expect(layout.pages.length).toBe(4);

    // Page 4 should have landscape orientation
    const page4 = layout.pages[3];
    expect(page4).toBeDefined();
    console.log(`Page 4 orientation: ${page4.orientation}`);
    expect(page4.orientation).toBe('landscape');

    // Verify page size is landscape (width > height)
    if (page4.pageSize) {
      console.log(
        `Page 4 size: ${page4.pageSize.w}x${page4.pageSize.h} (w > h: ${page4.pageSize.w > page4.pageSize.h})`,
      );
      expect(page4.pageSize.w).toBeGreaterThan(page4.pageSize.h);
    }

    console.log('\n=== TEST COMPLETE ===\n');
  });

  it('should emit 4 section break blocks for a 4-section document', () => {
    const pmDoc = loadPMJsonFixture('multi_section_doc.json');
    const { blocks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true,
      converterContext: DEFAULT_CONVERTER_CONTEXT,
    });

    const sectionBreaks = blocks.filter((b) => b.kind === 'sectionBreak');
    console.log(`\nSection breaks found: ${sectionBreaks.length}`);

    sectionBreaks.forEach((sb, i) => {
      const breakBlock = sb as SectionBreakBlock;
      console.log(`Break ${i + 1}: type=${breakBlock.type}, orientation=${breakBlock.orientation}`);
    });

    // 4 sections = 4 section breaks (initial section + breaks between sections)
    // The pm-adapter emits an initial section break to set document properties
    expect(sectionBreaks.length).toBe(4);

    // The last section break should have landscape orientation
    const lastBreak = sectionBreaks[sectionBreaks.length - 1] as SectionBreakBlock;
    expect(lastBreak.orientation).toBe('landscape');
  });

  it('should have correct section break types', () => {
    const pmDoc = loadPMJsonFixture('multi_section_doc.json');
    const { blocks } = toFlowBlocks(pmDoc, {
      emitSectionBreaks: true,
      converterContext: DEFAULT_CONVERTER_CONTEXT,
    });

    const sectionBreaks = blocks.filter((b) => b.kind === 'sectionBreak') as SectionBreakBlock[];

    console.log(`\n=== Section Break Types ===`);
    // All breaks should be 'nextPage' type (default for explicit sections)
    sectionBreaks.forEach((sb, i) => {
      console.log(`Break ${i + 1} type: ${sb.type}`);
      expect(sb.type).toBe('nextPage');
    });
  });
});
