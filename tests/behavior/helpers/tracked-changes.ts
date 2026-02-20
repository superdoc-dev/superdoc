import type { Page } from '@playwright/test';

/**
 * Reject all tracked changes in the document via document-api.
 */
export async function rejectAllTrackedChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rejectAll = (window as any).editor?.doc?.trackChanges?.rejectAll;
    if (typeof rejectAll !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.rejectAll.');
    }
    rejectAll({});
  });
}
