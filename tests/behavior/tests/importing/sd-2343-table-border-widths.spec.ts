import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-2343-table-border-widths.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test fixture not available');

test.use({ config: { toolbar: 'full', comments: 'off' } });

// SD-2343: table border widths must reflect the eighth-points value exactly once.
// The fixture has tables at sz=4 (~0.67px), sz=8 (~1.33px), sz=24 (4px), sz=48 (8px).
// If borders were converted twice, every width would shrink by ~6x and most would
// be invisible (clamped to MIN_BORDER_SIZE_PX = 0.5).
test('table border widths render at single-conversion px values', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Collect inline borderTopWidth from every cell inside a table fragment.
  // We read the inline style (what the painter wrote) rather than the computed
  // style, because Chromium rounds sub-pixel border widths to whole pixels in
  // computed style - a renderer concern, not a conversion concern.
  const widths = await superdoc.page.evaluate(() => {
    const fragments = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-table-fragment'));
    const out: number[] = [];
    for (const frag of fragments) {
      const candidates = Array.from(frag.querySelectorAll<HTMLElement>('div'));
      for (const el of candidates) {
        const inline = el.style.borderTopWidth;
        if (!inline) continue;
        const w = parseFloat(inline);
        if (w > 0) out.push(w);
      }
    }
    return out;
  });

  expect(widths.length).toBeGreaterThan(0);

  // Expected widths after a single eighth-points → pixels conversion.
  // sz=4 → 0.667px, sz=8 → 1.333px, sz=24 → 4px, sz=48 → 8px.
  const expected = [0.667, 1.333, 4, 8];
  const tolerance = 0.05;

  for (const target of expected) {
    const found = widths.some((w) => Math.abs(w - target) <= tolerance);
    expect(
      found,
      `expected at least one cell with inline border-top-width ≈ ${target}px, got [${widths.join(', ')}]`,
    ).toBe(true);
  }

  // A double-conversion regression would render every width as ≤ 1.5px (everything
  // below MIN_BORDER_SIZE_PX would clamp; the largest sz=48 would shrink to ~1.33).
  const maxWidth = Math.max(...widths);
  expect(maxWidth).toBeGreaterThan(2);
});
