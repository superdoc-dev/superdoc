import { defineStory } from '@superdoc-testing/helpers';
import type { Page } from '@playwright/test';

const WAIT_MS = 400;

/**
 * Find an SDT node position by its id attribute.
 * Returns { pos, size } for the first matching structuredContent or structuredContentBlock node.
 */
async function findSdtPosition(page: Page, id: string): Promise<{ pos: number; size: number } | null> {
  return page.evaluate((sdtId) => {
    const editor = (window as unknown as { editor?: { state?: { doc?: { descendants?: Function } } } }).editor;
    if (!editor?.state?.doc?.descendants) return null;

    let result: { pos: number; size: number } | null = null;
    editor.state.doc.descendants(
      (node: { type: { name: string }; attrs: Record<string, unknown>; nodeSize: number }, pos: number) => {
        if (result) return false;
        if (
          (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
          String(node.attrs.id) === sdtId
        ) {
          result = { pos, size: node.nodeSize };
          return false;
        }
        return true;
      },
    );
    return result;
  }, id);
}

/**
 * Set the cursor position in the editor.
 */
async function setCursorPosition(page: Page, pos: number): Promise<void> {
  await page.evaluate((p) => {
    const editor = (
      window as unknown as {
        editor?: { commands?: { setTextSelection?: (sel: { from: number; to: number }) => void; focus?: () => void } };
      }
    ).editor;
    editor?.commands?.setTextSelection?.({ from: p, to: p });
    editor?.commands?.focus?.();
  }, pos);
}

/**
 * Insert an inline structured content node via the editor command.
 */
async function insertInlineSdt(
  page: Page,
  attrs: { id: string; alias: string; lockMode: string },
  text: string,
): Promise<void> {
  await page.evaluate(
    ({ attrs, text }) => {
      const editor = (
        window as unknown as {
          editor?: {
            commands?: {
              insertStructuredContentInline?: (opts: { attrs: typeof attrs; text: string }) => boolean;
            };
          };
        }
      ).editor;
      if (!editor?.commands?.insertStructuredContentInline) {
        throw new Error('insertStructuredContentInline command not available');
      }
      editor.commands.insertStructuredContentInline({ attrs, text });
    },
    { attrs, text },
  );
}

/**
 * Demonstrates SDT (Structured Document Tag) lock modes via programmatic
 * commands and keyboard interactions.
 *
 * Lock modes:
 *  - unlocked:          wrapper deletable, content editable
 *  - sdtLocked:         wrapper NOT deletable, content editable
 *  - contentLocked:     wrapper deletable, content NOT editable
 *  - sdtContentLocked:  wrapper NOT deletable, content NOT editable
 *
 * This story exercises insertStructuredContentInline, insertStructuredContentBlock,
 * updateStructuredContentById, cursor placement inside SDTs, and demonstrates
 * lock enforcement by attempting keyboard interactions in locked SDTs.
 */
export default defineStory({
  name: 'sdt-lock-modes',
  description: 'Create SDTs with various lock modes, interact with keyboard, demonstrate lock enforcement',
  startDocument: null,
  hideCaret: false,

  async run(page, helpers): Promise<void> {
    const { step, focus, type, press, waitForStable, milestone } = helpers;

    // -----------------------------------------------------------------
    // Step 1 – Insert inline SDTs with different lock modes
    // -----------------------------------------------------------------
    await step('Insert inline SDTs', async () => {
      await focus();

      // Line 1: unlocked inline SDT
      await type('Unlocked inline: ');
      await waitForStable(WAIT_MS);
      await insertInlineSdt(page, { id: '100', alias: 'Unlocked Field', lockMode: 'unlocked' }, 'editable value');
      await waitForStable(WAIT_MS);

      // Line 2: sdtLocked inline SDT
      await press('End');
      await press('Enter');
      await type('SDT-locked inline: ');
      await waitForStable(WAIT_MS);
      await insertInlineSdt(page, { id: '200', alias: 'SDT Locked', lockMode: 'sdtLocked' }, 'cannot delete wrapper');
      await waitForStable(WAIT_MS);

      // Line 3: contentLocked inline SDT
      await press('End');
      await press('Enter');
      await type('Content-locked inline: ');
      await waitForStable(WAIT_MS);
      await insertInlineSdt(
        page,
        { id: '300', alias: 'Content Locked', lockMode: 'contentLocked' },
        'read-only content',
      );
      await waitForStable(WAIT_MS);

      await milestone('inline-sdts-created', 'Three inline SDTs: unlocked, sdtLocked, contentLocked');
    });

    // -----------------------------------------------------------------
    // Step 2 – Insert a block SDT with sdtContentLocked
    // -----------------------------------------------------------------
    await step('Insert block SDT (sdtContentLocked)', async () => {
      await press('End');
      await press('Enter');
      await press('Enter');
      await waitForStable(WAIT_MS);

      await page.evaluate(() => {
        const editor = (
          window as unknown as {
            editor?: {
              commands?: {
                insertStructuredContentBlock?: (opts: {
                  attrs: { id: string; alias: string; lockMode: string };
                  html: string;
                }) => boolean;
              };
            };
          }
        ).editor;
        if (!editor?.commands?.insertStructuredContentBlock) {
          throw new Error('insertStructuredContentBlock command not available');
        }
        editor.commands.insertStructuredContentBlock({
          attrs: { id: '400', alias: 'Fully Locked Block', lockMode: 'sdtContentLocked' },
          html: '<p>This block is fully locked (sdtContentLocked).</p>',
        });
      });
      await waitForStable(WAIT_MS);

      await milestone('block-sdt-created', 'Block SDT with sdtContentLocked created');
    });

    // -----------------------------------------------------------------
    // Step 3 – Place cursor inside sdtLocked inline and type
    //          (content is editable — sdtLocked only protects the wrapper)
    // -----------------------------------------------------------------
    await step('Type inside sdtLocked inline (content editable)', async () => {
      const sdt = await findSdtPosition(page, '200');
      if (!sdt) throw new Error('sdtLocked SDT (id=200) not found');

      // Place cursor inside the SDT text
      await setCursorPosition(page, sdt.pos + 2);
      await waitForStable(WAIT_MS);

      await type(' ADDED');
      await waitForStable(WAIT_MS);

      await milestone('sdt-locked-typed', 'Typed " ADDED" inside sdtLocked inline — content is editable');
    });

    // -----------------------------------------------------------------
    // Step 4 – Place cursor inside contentLocked inline and try typing
    //          (content is NOT editable)
    // -----------------------------------------------------------------
    await step('Try typing inside contentLocked inline', async () => {
      const sdt = await findSdtPosition(page, '300');
      if (!sdt) throw new Error('contentLocked SDT (id=300) not found');

      await setCursorPosition(page, sdt.pos + 2);
      await waitForStable(WAIT_MS);

      // Attempt to type — should be blocked by contentLocked
      await type('BLOCKED');
      await waitForStable(WAIT_MS);

      await milestone('content-locked-typing-blocked', 'Typing inside contentLocked SDT — should be blocked');
    });

    // -----------------------------------------------------------------
    // Step 5 – Place cursor inside contentLocked and try Backspace
    //          (content deletion should also be blocked)
    // -----------------------------------------------------------------
    await step('Try Backspace inside contentLocked inline', async () => {
      const sdt = await findSdtPosition(page, '300');
      if (!sdt) throw new Error('contentLocked SDT (id=300) not found');

      // Place cursor at end of SDT content
      await setCursorPosition(page, sdt.pos + sdt.size - 2);
      await waitForStable(WAIT_MS);

      await press('Backspace');
      await press('Backspace');
      await press('Backspace');
      await waitForStable(WAIT_MS);

      await milestone('content-locked-backspace-blocked', 'Backspace inside contentLocked SDT — should be blocked');
    });

    // -----------------------------------------------------------------
    // Step 6 – Update lock mode via updateStructuredContentById
    //          Change the unlocked inline (id=100) to contentLocked
    // -----------------------------------------------------------------
    await step('Update lock mode: unlocked → contentLocked', async () => {
      await page.evaluate(() => {
        const editor = (
          window as unknown as {
            editor?: {
              commands?: {
                updateStructuredContentById?: (id: string, opts: { attrs: { lockMode: string } }) => boolean;
              };
            };
          }
        ).editor;
        if (!editor?.commands?.updateStructuredContentById) {
          throw new Error('updateStructuredContentById command not available');
        }
        editor.commands.updateStructuredContentById('100', {
          attrs: { lockMode: 'contentLocked' },
        });
      });
      await waitForStable(WAIT_MS);

      await milestone('lock-mode-updated', 'Updated id=100 from unlocked → contentLocked');
    });

    // -----------------------------------------------------------------
    // Step 7 – Verify updated lock — try typing inside formerly unlocked SDT
    // -----------------------------------------------------------------
    await step('Try typing in updated contentLocked SDT', async () => {
      const sdt = await findSdtPosition(page, '100');
      if (!sdt) throw new Error('Updated SDT (id=100) not found');

      await setCursorPosition(page, sdt.pos + 2);
      await waitForStable(WAIT_MS);

      // Attempt to type — should now be blocked
      await type('SHOULD FAIL');
      await waitForStable(WAIT_MS);

      await milestone('updated-lock-enforced', 'Typing in updated contentLocked SDT — should be blocked');
    });

    // -----------------------------------------------------------------
    // Step 8 – Final state
    // -----------------------------------------------------------------
    await step('Final state', async () => {
      await focus();
      await setCursorPosition(page, 1);
      await waitForStable(WAIT_MS);

      await milestone('final-state', 'Final document state with all SDT lock modes');
    });
  },
});
