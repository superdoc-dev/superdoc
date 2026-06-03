import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

const MARKER_SELECTOR = '.superdoc-paragraph-marker';

type OrderedStyle =
  | 'decimal'
  | 'decimal-paren'
  | 'upper-roman'
  | 'lower-roman'
  | 'upper-alpha'
  | 'upper-alpha-paren'
  | 'lower-alpha'
  | 'lower-alpha-paren';

// What the user picks as the outer (level-0) marker.
const OUTER_MARKER: Record<OrderedStyle, string> = {
  decimal: '1.',
  'decimal-paren': '1)',
  'upper-roman': 'I.',
  'lower-roman': 'i.',
  'upper-alpha': 'A.',
  'upper-alpha-paren': 'A)',
  'lower-alpha': 'a.',
  'lower-alpha-paren': 'a)',
};

// Levels 2..9 (ilvl 1..8) should always render this cycle, regardless of the
// outer style — Word's hybridMultilevel template repeats lower-alpha → lower-roman
// → integer across nested levels.
const NESTED_MARKERS = ['a.', 'i.', '1.', 'a.', 'i.', '1.', 'a.', 'i.'] as const;

async function createNineLevelNestedList(superdoc: SuperDocFixture, outer: OrderedStyle): Promise<void> {
  // Plain paragraph → toggleOrderedListStyle on a non-list caret hits the create branch
  // in `toggleList`, which mints a fresh abstract with the outer style applied at ilvl=0
  // and the template's nested cycle preserved at ilvl 1..8.
  await superdoc.type('item0');
  await superdoc.waitForStable();
  await superdoc.executeCommand('toggleOrderedListStyle', outer as unknown as Record<string, unknown>);
  await superdoc.waitForStable();

  for (let i = 1; i <= 8; i++) {
    await superdoc.newLine();
    await superdoc.waitForStable();
    await superdoc.press('Tab');
    await superdoc.waitForStable();
    await superdoc.type(`item${i}`);
    await superdoc.waitForStable();
  }
}

test.describe('nested ordered list rendered marker cycle', () => {
  // For every supported outer style, the rendered DOM markers from level 2 down
  // to level 9 must follow lower-alpha → lower-roman → integer, repeating. Reading
  // from `.superdoc-paragraph-marker` (DomPainter's output) instead of node attrs
  // checks what the user actually sees.
  for (const style of Object.keys(OUTER_MARKER) as OrderedStyle[]) {
    test(`outer "${style}" → DOM markers render outer + a./i./1. cycle for levels 2..9`, async ({ superdoc }) => {
      await createNineLevelNestedList(superdoc, style);

      const visible = await superdoc.page.locator(MARKER_SELECTOR).allInnerTexts();
      const trimmed = visible.map((t) => t.trim());
      expect(trimmed).toEqual([OUTER_MARKER[style], ...NESTED_MARKERS]);
    });
  }
});
