import { describe, it, expect } from 'vitest';
import { getExportedResult } from '@tests/export/export-helpers/index.js';

/**
 * SD-1919: Exporter should only write explicitly-set inline properties to w:rPr,
 * filtering out properties inherited from the style cascade.
 *
 * These fixtures are Word-native documents (created by Microsoft Word via COM)
 * with proper style hierarchies, docDefaults, and basedOn chains.
 */

/** Count occurrences of a tag name in an XML element tree */
function countTag(node, tagName) {
  let count = 0;
  if (node?.name === tagName) count++;
  if (node?.elements) {
    for (const child of node.elements) {
      count += countTag(child, tagName);
    }
  }
  return count;
}

/** Collect all w:rPr elements from w:r (run) elements in the body */
function collectRunRPr(body) {
  const results = [];
  function walk(node) {
    if (node?.name === 'w:r') {
      const rPr = node.elements?.find((el) => el.name === 'w:rPr');
      const text = node.elements
        ?.filter((el) => el.name === 'w:t')
        .flatMap((t) => t.elements?.filter((e) => e.type === 'text').map((e) => e.text) || [])
        .join('');
      results.push({ text: text?.slice(0, 40), hasRPr: !!rPr, rPrElements: rPr?.elements?.map((e) => e.name) || [] });
    }
    if (node?.elements) node.elements.forEach(walk);
  }
  walk(body);
  return results;
}

describe('SD-1919: inline property filtering on Word-native documents', () => {
  describe('simple document (no direct formatting)', () => {
    it('does not export inherited w:rFonts or w:sz on plain runs', async () => {
      const exportResult = await getExportedResult('sd-1919-word-simple.docx');
      const body = exportResult.elements.find((el) => el.name === 'w:body');
      expect(body).toBeDefined();

      const rFontsCount = countTag(body, 'w:rFonts');
      const szCount = countTag(body, 'w:sz');
      const langCount = countTag(body, 'w:lang');

      // Plain body text runs should not have inherited font/size/lang
      expect(rFontsCount).toBe(0);
      expect(szCount).toBe(0);
      expect(langCount).toBe(0);
    });
  });

  describe('mixed document (explicit bold, color, font overrides)', () => {
    it('preserves explicit overrides but omits inherited properties', async () => {
      const exportResult = await getExportedResult('sd-1919-word-mixed.docx');
      const body = exportResult.elements.find((el) => el.name === 'w:body');
      expect(body).toBeDefined();

      const runs = collectRunRPr(body);

      // Find the bold run
      const boldRun = runs.find((r) => r.text?.includes('bold'));
      expect(boldRun).toBeDefined();
      expect(boldRun.hasRPr).toBe(true);
      expect(boldRun.rPrElements).toContain('w:b');
      // Should NOT have inherited w:rFonts or w:sz from Normal style
      expect(boldRun.rPrElements).not.toContain('w:rFonts');
      expect(boldRun.rPrElements).not.toContain('w:sz');

      // Find the Courier New override run
      const courierRun = runs.find((r) => r.text?.includes('Courier New'));
      expect(courierRun).toBeDefined();
      expect(courierRun.hasRPr).toBe(true);
      expect(courierRun.rPrElements).toContain('w:rFonts');
      expect(courierRun.rPrElements).toContain('w:sz');

      // Plain text runs should not have w:rPr with inherited props
      const plainRun = runs.find((r) => r.text?.includes('no direct formatting'));
      if (plainRun) {
        const inheritedProps = (plainRun.rPrElements || []).filter(
          (name) => name === 'w:rFonts' || name === 'w:sz' || name === 'w:lang',
        );
        expect(inheritedProps).toEqual([]);
      }
    });

    it('does not inflate document.xml beyond 2x the original', async () => {
      const exportResult = await getExportedResult('sd-1919-word-mixed.docx');
      const body = exportResult.elements.find((el) => el.name === 'w:body');
      // Count total w:rPr elements — should not be significantly more than the original (11)
      const totalRPr = countTag(body, 'w:rPr');
      expect(totalRPr).toBeLessThan(30);
    });
  });

  describe('table document (Table Grid style with inherited margins)', () => {
    it('does not duplicate cell margins in individual w:tcPr', async () => {
      const exportResult = await getExportedResult('sd-1919-word-table.docx');
      const body = exportResult.elements.find((el) => el.name === 'w:body');
      expect(body).toBeDefined();

      // w:tcMar should NOT appear on individual cells (margins from table style)
      const tcMarCount = countTag(body, 'w:tcMar');
      expect(tcMarCount).toBe(0);

      // w:tblCellMar should appear once on the table properties
      const tbl = body.elements?.find((el) => el.name === 'w:tbl');
      const tblPr = tbl?.elements?.find((el) => el.name === 'w:tblPr');
      const tblCellMar = tblPr?.elements?.find((el) => el.name === 'w:tblCellMar');
      expect(tblCellMar).toBeDefined();
    });

    it('does not export inherited w:rFonts on table cell runs', async () => {
      const exportResult = await getExportedResult('sd-1919-word-table.docx');
      const body = exportResult.elements.find((el) => el.name === 'w:body');

      const tbl = body.elements?.find((el) => el.name === 'w:tbl');
      expect(tbl).toBeDefined();

      // No w:rFonts inside the table — cell text inherits from style
      const rFontsInTable = countTag(tbl, 'w:rFonts');
      expect(rFontsInTable).toBe(0);
    });
  });
});
