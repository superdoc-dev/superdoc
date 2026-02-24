import type { Page } from '@playwright/test';

/**
 * Count table cells in the first table found via document-api.
 *
 * Tries tableCell + tableHeader first. Falls back to counting paragraphs
 * when the adapter doesn't expose cell-level querying.
 */
export async function countTableCells(page: Page): Promise<number> {
  return page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    if (!docApi?.find) {
      throw new Error('Document API is unavailable: expected editor.doc.find().');
    }

    const tableResult = docApi.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
    const tableAddress = tableResult?.matches?.[0];
    if (!tableAddress) return 0;

    const cellResult = docApi.find({ select: { type: 'node', nodeType: 'tableCell' }, within: tableAddress });
    let cellCount = cellResult?.matches?.length ?? 0;

    try {
      const headerResult = docApi.find({ select: { type: 'node', nodeType: 'tableHeader' }, within: tableAddress });
      cellCount += headerResult?.matches?.length ?? 0;
    } catch {
      /* tableHeader may not be queryable */
    }

    if (cellCount > 0) return cellCount;

    // Fallback: count paragraphs when cell-level querying isn't available.
    const paragraphResult = docApi.find({ select: { type: 'node', nodeType: 'paragraph' }, within: tableAddress });
    return paragraphResult?.matches?.length ?? 0;
  });
}
