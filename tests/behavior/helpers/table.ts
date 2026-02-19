import type { Page } from '@playwright/test';

/**
 * Count table cells in the first table found via document-api.
 *
 * The preferred path uses explicit tableRow/tableCell addresses. Some adapter paths
 * still expose only table-scoped paragraphs; this helper falls back to paragraph count
 * in that case.
 *
 * @param page - Playwright page with a SuperDoc editor instance
 * @returns The total number of table cells in the first table, or 0 if no table exists
 * @throws When the document-api is unavailable
 */
export async function countTableCells(page: Page): Promise<number> {
  return page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    if (!docApi?.find) {
      throw new Error('Document API is unavailable: expected editor.doc.find().');
    }

    const countMatches = (result: unknown): number => {
      const matches = (result as { matches?: unknown[] } | null | undefined)?.matches;
      return Array.isArray(matches) ? matches.length : 0;
    };

    const findCellCountWithin = (within: unknown): number => {
      const tableCells = docApi.find({ select: { type: 'node', nodeType: 'tableCell' }, within });
      let tableHeadersCount = 0;
      try {
        const tableHeaders = docApi.find({ select: { type: 'node', nodeType: 'tableHeader' }, within });
        tableHeadersCount = countMatches(tableHeaders);
      } catch {
        // Some adapters do not expose tableHeader as a queryable node type.
      }
      return countMatches(tableCells) + tableHeadersCount;
    };

    const tableResult = docApi.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
    const tableAddress = tableResult?.matches?.[0];
    if (!tableAddress) return 0;

    const rowResult = docApi.find({ select: { type: 'node', nodeType: 'tableRow' }, within: tableAddress });
    const rowAddresses = Array.isArray(rowResult?.matches) ? rowResult.matches : [];
    if (rowAddresses.length > 0) {
      const explicitCellCount = rowAddresses.reduce(
        (total: number, rowAddress: unknown) => total + findCellCountWithin(rowAddress),
        0,
      );
      if (explicitCellCount > 0) return explicitCellCount;
    }

    const paragraphResult = docApi.find({
      select: { type: 'node', nodeType: 'paragraph' },
      within: tableAddress,
    });
    return Array.isArray(paragraphResult?.matches) ? paragraphResult.matches.length : 0;
  });
}
