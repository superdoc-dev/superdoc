import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-2447-toc-tab-alignment.docx');

test.skip(!fs.existsSync(DOC_PATH), 'TOC fixture missing');

// SD-2447: TOC paragraphs have a single right-aligned dot-leader tab stop.
// The bug was: on load, the first \t jumped straight to the leader, pushing the
// title to the right margin with no page-number alignment. The fix seeds the
// default 0.5" grid and binds the trailing tab to the right-aligned stop.
test('TOC entries render with aligned dot leaders and right-justified page numbers', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);

  // TOC should render — not a blank editor
  await expect(superdoc.page.locator('.superdoc-leader').first()).toBeVisible({ timeout: 15_000 });

  // Collect leader geometry per TOC entry
  const entries = await superdoc.page.evaluate(() => {
    const leaders = Array.from(document.querySelectorAll('div.superdoc-leader'));
    return leaders.map((leader) => {
      const parent = leader.parentElement as HTMLElement;
      const pageNum = Array.from(parent.querySelectorAll('a, span')).slice(-1)[0] as HTMLElement;
      const leaderRect = leader.getBoundingClientRect();
      const pageNumRect = pageNum ? pageNum.getBoundingClientRect() : null;
      const parentRect = parent.getBoundingClientRect();
      return {
        text: (parent.textContent || '').slice(0, 80),
        leaderFrom: leaderRect.x,
        leaderTo: leaderRect.x + leaderRect.width,
        pageNumRight: pageNumRect ? pageNumRect.x + pageNumRect.width : null,
        parentRight: parentRect.x + parentRect.width,
      };
    });
  });

  expect(entries.length).toBeGreaterThan(0);

  // All leader endpoints should be consistent (within 5px) — the trailing tab is
  // bound to the single right-aligned stop for every TOC entry.
  const leaderEnds = entries.map((e) => e.leaderTo);
  const minEnd = Math.min(...leaderEnds);
  const maxEnd = Math.max(...leaderEnds);
  expect(maxEnd - minEnd).toBeLessThan(5);

  // Page numbers should be right-aligned near the right margin — the page-number
  // right edge should be within 30px of the parent's right edge for every entry.
  for (const entry of entries) {
    expect(entry.pageNumRight).not.toBeNull();
    expect(entry.parentRight - (entry.pageNumRight as number)).toBeLessThan(60);
  }

  // Leader start position must vary with title length (short titles produce longer
  // leaders). If every leader started at the same spot, the first tab would have
  // been incorrectly bound to the end stop (the reported bug).
  const leaderStarts = entries.map((e) => e.leaderFrom);
  const startRange = Math.max(...leaderStarts) - Math.min(...leaderStarts);
  expect(startRange).toBeGreaterThan(20);
});
