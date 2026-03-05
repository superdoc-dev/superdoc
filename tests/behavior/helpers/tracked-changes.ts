import type { Page } from '@playwright/test';

type InsertTrackedChangeOptions = {
  from: number;
  to: number;
  text: string;
};

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

export async function insertTrackedChange(page: Page, options: InsertTrackedChangeOptions): Promise<void> {
  await page.evaluate((payload) => {
    (window as any).editor.commands.insertTrackedChange({
      ...payload,
      user: { name: 'Track Tester', email: 'track@example.com' },
    });
  }, options);
}

export async function getMarkedText(page: Page, markName: string): Promise<string> {
  return page.evaluate((name) => {
    let text = '';
    const doc = (window as any).editor.state.doc;

    doc.descendants((node: any) => {
      if (!node.isText) return;
      if (node.marks.some((mark: any) => mark.type.name === name)) {
        text += node.text ?? '';
      }
    });

    return text;
  }, markName);
}

export async function getSelectedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const { from, to, empty } = (window as any).editor.state.selection;
    if (empty) return '';
    return (window as any).editor.state.doc.textBetween(from, to);
  });
}
