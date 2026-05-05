import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

/**
 * SD-2875 — Right-clicking a misspelled word must show provider replacements
 * in the context menu. In 1.29 the wiring between <ContextMenu> and the
 * proofing manager broke (resolveProofingContext could not find the manager
 * when the menu's editor handle was the PresentationEditor wrapper instead
 * of the inner Editor). This test reproduces the customer-reported flow:
 * type "teh", attach a stub provider that flags it, right-click the word,
 * and assert the suggestions appear and replace the word when clicked.
 */

type StubIssue = {
  segmentId: string;
  start: number;
  end: number;
  kind: 'spelling';
  replacements: string[];
};

declare global {
  interface Window {
    __sd2875Calls?: number;
  }
}

async function configureStubProvider(
  superdoc: { page: import('@playwright/test').Page },
  word: string,
  replacements: string[],
): Promise<void> {
  await superdoc.page.evaluate(
    ({ misspelled, repls }) => {
      window.__sd2875Calls = 0;
      const stubProvider = {
        id: 'sd-2875-stub',
        getCapabilities: () => ({
          issueKinds: ['spelling'],
          supportsSuggestions: true,
        }),
        check: async ({ segments }: { segments: Array<{ id: string; text: string }> }) => {
          window.__sd2875Calls = (window.__sd2875Calls ?? 0) + 1;
          const issues: StubIssue[] = [];
          for (const seg of segments) {
            let from = 0;
            while (from <= seg.text.length) {
              const i = seg.text.indexOf(misspelled, from);
              if (i === -1) break;
              issues.push({
                segmentId: seg.id,
                start: i,
                end: i + misspelled.length,
                kind: 'spelling',
                replacements: repls,
              });
              from = i + misspelled.length;
            }
          }
          return { issues };
        },
      };

      const editor = (window as unknown as { editor?: { presentationEditor?: unknown } }).editor;
      const pe = editor?.presentationEditor as
        | {
            updateProofingConfig: (patch: Record<string, unknown>) => void;
          }
        | undefined;
      if (!pe?.updateProofingConfig) {
        throw new Error('SD-2875 test: no PresentationEditor.updateProofingConfig found on window.editor');
      }

      pe.updateProofingConfig({
        enabled: true,
        provider: stubProvider,
        defaultLanguage: 'en_US',
        // Keep debounce short so the test does not stall waiting for
        // provider scheduling — we only care about the wiring, not the
        // throttling.
        debounceMs: 50,
        maxSuggestions: 5,
        allowIgnoreWord: true,
      });
    },
    { misspelled: word, repls: replacements },
  );
}

async function waitForProofingIssue(superdoc: { page: import('@playwright/test').Page }, timeout = 10_000) {
  await superdoc.page.waitForFunction(
    () => {
      const editor = (window as unknown as { editor?: { presentationEditor?: unknown } }).editor;
      const pe = editor?.presentationEditor as
        | {
            proofingManager?: {
              getPaintSlices?: () => Array<{ pmFrom: number; pmTo: number }>;
            } | null;
          }
        | undefined;
      const slices = pe?.proofingManager?.getPaintSlices?.() ?? [];
      return slices.length > 0;
    },
    null,
    { timeout, polling: 50 },
  );
}

async function rightClickAtPmPos(superdoc: { page: import('@playwright/test').Page }, pos: number): Promise<void> {
  const coords = await superdoc.page.evaluate((p: number) => {
    const editor = (
      window as unknown as {
        editor?: {
          presentationEditor?: {
            coordsAtPos?: (pos: number) => { top: number; bottom: number; left: number; right: number } | null;
          };
        };
      }
    ).editor;
    const c = editor?.presentationEditor?.coordsAtPos?.(p) ?? null;
    if (!c) return null;
    // Aim a couple of pixels into the run rather than at its left edge so
    // posAtCoords resolves a position inside (not at the boundary of) the
    // misspelled word.
    return { x: c.left + 2, y: (c.top + c.bottom) / 2 };
  }, pos);

  if (!coords) {
    throw new Error(`SD-2875 test: coordsAtPos returned null for pmPos ${pos}`);
  }

  await superdoc.page.mouse.click(coords.x, coords.y, { button: 'right' });
}

test('right-click on a misspelled word shows provider suggestions in the context menu (SD-2875)', async ({
  superdoc,
}) => {
  const { page } = superdoc;

  await superdoc.type('Hello teh world');
  await superdoc.waitForStable();

  await configureStubProvider(superdoc, 'teh', ['the', 'tech', 'meh']);

  // Wait until the proofing manager has stored an issue for 'teh'. Without
  // this, racing the right-click before the provider has returned can mask
  // a regression as a flaky timing issue.
  await waitForProofingIssue(superdoc);

  // Aim the right-click at the middle of the misspelled word so
  // posAtCoords lands inside the issue range.
  const tehPos = await superdoc.findTextPos('teh');
  await rightClickAtPmPos(superdoc, tehPos + 1);
  await superdoc.waitForStable();

  // The context menu must open and surface the provider replacements as
  // clickable rows. Pre-fix (1.29+) only the generic actions appeared.
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();

  const items = menu.locator('.context-menu-item');
  await expect(items.filter({ hasText: /^the$/ })).toBeVisible();
  await expect(items.filter({ hasText: /^tech$/ })).toBeVisible();
  await expect(items.filter({ hasText: /^meh$/ })).toBeVisible();

  // Clicking a suggestion must apply it to the document — confirms the
  // action callback wires through to the live editor view.
  await items.filter({ hasText: /^the$/ }).first().click();
  await superdoc.waitForStable();

  await expect(menu).toBeHidden();

  const text = await page.evaluate(() => {
    const editor = (
      window as unknown as {
        editor?: {
          state?: { doc?: { textBetween: (a: number, b: number, sep: string) => string; content: { size: number } } };
        };
      }
    ).editor;
    const doc = editor?.state?.doc;
    if (!doc) return null;
    return doc.textBetween(0, doc.content.size, '\n');
  });
  expect(text).toContain('Hello the world');
  expect(text).not.toContain('teh');
});

test('right-click on a correctly spelled word does NOT add proofing items (SD-2875)', async ({ superdoc }) => {
  const { page } = superdoc;

  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  // Configure proofing with a provider that flags the word 'teh' (which is
  // not present in the document). This guarantees the manager is wired
  // up but has no issue at any position.
  await configureStubProvider(superdoc, 'teh', ['the']);

  // Wait until the stub has actually run, otherwise this test can pass
  // because the check never fired rather than because nothing matched.
  await page.waitForFunction(() => (window.__sd2875Calls ?? 0) > 0, null, { timeout: 5_000 });
  await superdoc.waitForStable();

  const helloPos = await superdoc.findTextPos('Hello');
  await rightClickAtPmPos(superdoc, helloPos + 2);
  await superdoc.waitForStable();

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();

  // No proofing-replace rows should appear when there is no issue at
  // the cursor; the menu should still surface the regular actions.
  await expect(menu.locator('[id*="proofing-replace"]')).toHaveCount(0);
});
