import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-3110-inline-sdt-appearance-variants.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

// The fixture has five paragraphs; we keep the wrapper-by-sdtId mapping
// explicit because it's the contract this spec asserts against.
const HIDDEN_IDS = ['1001', '1004', '1005'] as const;
const EXPLICIT_BOUNDING_BOX_IDS = ['1002'] as const;
const DEFAULT_APPEARANCE_IDS = ['1003'] as const;
const VISIBLE_IDS = [...EXPLICIT_BOUNDING_BOX_IDS, ...DEFAULT_APPEARANCE_IDS] as const;
const HIDDEN_ALIAS_CANARIES = ['HIDDEN_ALIAS_LEAK_CANARY', 'HIDDEN_ALIAS_DOUBLE_A', 'HIDDEN_ALIAS_DOUBLE_B'] as const;

const INLINE_SDT = '.superdoc-structured-content-inline';
const INLINE_LABEL = '.superdoc-structured-content-inline__label';

test.describe('inline SDT appearance=hidden (SD-3110)', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();
  });

  test('wrappers carry explicit data-appearance values and omit the default', async ({ superdoc }) => {
    const attrs = await superdoc.page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel)).map((el) => ({
        sdtId: (el as HTMLElement).dataset.sdtId ?? null,
        appearance: (el as HTMLElement).dataset.appearance ?? null,
      }));
    }, INLINE_SDT);

    const byId = new Map(attrs.map((a) => [a.sdtId, a.appearance]));
    for (const id of HIDDEN_IDS) expect(byId.get(id)).toBe('hidden');
    for (const id of EXPLICIT_BOUNDING_BOX_IDS) expect(byId.get(id)).toBe('boundingBox');
    for (const id of DEFAULT_APPEARANCE_IDS) expect(byId.get(id)).toBeNull();
  });

  test('hidden wrappers have no alias label child; visible wrappers do', async ({ superdoc }) => {
    const labelPresence = await superdoc.page.evaluate(
      ({ sel, labelSel }) => {
        return Array.from(document.querySelectorAll(sel)).map((el) => ({
          sdtId: (el as HTMLElement).dataset.sdtId ?? null,
          hasLabel: !!el.querySelector(labelSel),
        }));
      },
      { sel: INLINE_SDT, labelSel: INLINE_LABEL },
    );

    const byId = new Map(labelPresence.map((a) => [a.sdtId, a.hasLabel]));
    for (const id of HIDDEN_IDS) expect(byId.get(id)).toBe(false);
    for (const id of VISIBLE_IDS) expect(byId.get(id)).toBe(true);
  });

  test('hidden wrappers omit the alias canary from textContent', async ({ superdoc }) => {
    const textByIdRaw = await superdoc.page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel)).map((el) => ({
        sdtId: (el as HTMLElement).dataset.sdtId ?? null,
        text: el.textContent ?? '',
      }));
    }, INLINE_SDT);
    const textById = new Map(textByIdRaw.map((a) => [a.sdtId, a.text]));

    expect(textById.get('1001')).toBe('Alpha Corp v. SEC');
    expect(textById.get('1004')).toBe('first hidden span');
    expect(textById.get('1005')).toBe('second hidden span');

    // Visible wrappers still surface the alias as a label — that's the
    // pre-existing boundingBox/default behavior.
    expect(textById.get('1002')).toContain('VISIBLE_ALIAS_FOR_COMPARISON');
    expect(textById.get('1003')).toContain('DEFAULT_APPEARANCE_ALIAS');
  });

  test('no hidden-SDT alias canary appears anywhere in the painted layout', async ({ superdoc }) => {
    const layoutText = await superdoc.page.evaluate(() => {
      // .presentation-editor__pages is the painter-dom root; selection,
      // copy, and visual reads operate on it.
      const root = document.querySelector('.presentation-editor__pages') ?? document.querySelector('.superdoc-layout');
      return root?.textContent ?? '';
    });

    for (const canary of HIDDEN_ALIAS_CANARIES) {
      expect(layoutText).not.toContain(canary);
    }
  });

  test('hovering a hidden wrapper does not paint the lock-hover background or boost z-index', async ({ superdoc }) => {
    // Regression guard for the CSS specificity bug caught in PR review:
    // the lock-hover rule
    //   .superdoc-structured-content-inline[data-lock-mode]:hover:not(.ProseMirror-selectednode)
    // has (0,4,0) specificity vs (0,3,0) for the hidden-appearance hover
    // rule, so without an explicit :not([data-appearance='hidden']) it
    // re-introduces the lock-hover blue background + z-index 9999999 on
    // hover, contradicting "visually transparent".
    // Painter may emit more than one wrapper for the same SDT when the run
    // is split across lines/fragments — each fragment carries the same
    // data-sdt-id. Scope to the painter class and take `.first()`: the
    // CSS specificity bug is per-element, so a single wrapper is enough.
    const wrapper = superdoc.page.locator('.superdoc-structured-content-inline[data-sdt-id="1001"]').first();
    await wrapper.hover();
    await superdoc.waitForStable();

    const styles = await wrapper.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { backgroundColor: cs.backgroundColor, zIndex: cs.zIndex };
    });

    // Default backgrounds on most browsers are transparent / rgba(0, 0, 0, 0);
    // the regression value is rgba(98, 155, 231, 0.08).
    expect(styles.backgroundColor).not.toContain('98, 155, 231');
    // The lock-hover rule sets z-index 9999999 on top of any default — if
    // it slipped through, the hidden wrapper would jump above siblings.
    expect(styles.zIndex).not.toBe('9999999');
  });

  test('selecting a hidden wrapper copies only the wrapped phrase', async ({ superdoc }) => {
    const selectionText = await superdoc.page.evaluate(() => {
      const wrapper = document.querySelector('[data-sdt-id="1001"]');
      if (!wrapper) return null;
      const range = document.createRange();
      range.selectNodeContents(wrapper);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return sel?.toString() ?? null;
    });

    expect(selectionText).toBe('Alpha Corp v. SEC');
    expect(selectionText).not.toContain('HIDDEN_ALIAS_LEAK_CANARY');
  });
});
