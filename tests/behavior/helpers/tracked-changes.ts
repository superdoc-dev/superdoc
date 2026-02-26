import type { Page } from '@playwright/test';

/**
 * Reject all tracked changes in the document via document-api.
 */
export async function rejectAllTrackedChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const decide = (window as any).editor?.doc?.trackChanges?.decide;
    if (typeof decide !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.decide.');
    }
    decide({ decision: 'reject', target: { scope: 'all' } });
  });
}
