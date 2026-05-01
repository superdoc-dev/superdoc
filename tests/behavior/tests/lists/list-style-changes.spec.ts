import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { createBulletList, createOrderedList, getParagraphNumberingByText } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

type ListSnapshot = {
  text: string;
  numId: number | null;
  numberingType: string | null;
  markerText: string | null;
  numFmt: string | null;
  lvlText: string | null;
};

async function getListItemSnapshots(superdoc: SuperDocFixture, prefix: string): Promise<ListSnapshot[]> {
  return superdoc.page.evaluate((pfx: string) => {
    const editor = (window as any).editor;
    const numbering = editor.converter.numbering;
    const rows: any[] = [];
    editor.state.doc.descendants((node: any) => {
      if (node.type.name !== 'paragraph') return true;
      const text = String(node.textContent ?? '');
      if (!text.startsWith(pfx)) return true;

      const np = node.attrs?.paragraphProperties?.numberingProperties ?? null;
      const numId = np?.numId != null ? Number(np.numId) : null;
      const ilvl = np?.ilvl != null ? Number(np.ilvl) : 0;

      let numFmt: string | null = null;
      let lvlText: string | null = null;
      if (numId != null) {
        const def = numbering?.definitions?.[numId];
        const absId = def?.elements?.[0]?.attributes?.['w:val'];
        const abstractDef = absId != null ? numbering?.abstracts?.[absId] : null;
        const lvl = abstractDef?.elements?.find(
          (el: any) => el.name === 'w:lvl' && String(el.attributes['w:ilvl']) === String(ilvl),
        );
        numFmt = lvl?.elements?.find((el: any) => el.name === 'w:numFmt')?.attributes?.['w:val'] ?? null;
        lvlText = lvl?.elements?.find((el: any) => el.name === 'w:lvlText')?.attributes?.['w:val'] ?? null;
      }

      rows.push({
        text,
        numId,
        numberingType: node.attrs?.listRendering?.numberingType ?? null,
        markerText: node.attrs?.listRendering?.markerText ?? null,
        numFmt,
        lvlText,
      });
      return true;
    });
    return rows;
  }, prefix);
}

async function placeCursorIn(superdoc: SuperDocFixture, text: string): Promise<void> {
  const para = await getParagraphNumberingByText(superdoc, text);
  if (!para) throw new Error(`Paragraph "${text}" not found`);
  // Position cursor inside the paragraph (paragraph start + 1)
  await superdoc.page.evaluate((pos: number) => {
    const editor = (window as any).editor;
    const TS = editor.state.selection.constructor;
    editor.view.dispatch(editor.state.tr.setSelection(TS.create(editor.state.doc, pos + 1)));
  }, para.paragraphPos);
  await superdoc.waitForStable();
}

test.describe('PR-2873 list style changes', () => {
  test.describe('toolbar active state', () => {
    test('bullet list button is active when caret is in a bullet list', async ({ superdoc }) => {
      await superdoc.type('item');
      await superdoc.executeCommand('toggleBulletList');
      await superdoc.waitForStable();
      await placeCursorIn(superdoc, 'item');

      await expect(superdoc.page.locator('[data-item="btn-list"]').first()).toHaveClass(/active/);
      await expect(superdoc.page.locator('[data-item="btn-numberedlist"]').first()).not.toHaveClass(/active/);
    });

    test('numbered list button is active when caret is in an ordered list', async ({ superdoc }) => {
      await superdoc.type('item');
      await superdoc.executeCommand('toggleOrderedList');
      await superdoc.waitForStable();
      await placeCursorIn(superdoc, 'item');

      await expect(superdoc.page.locator('[data-item="btn-numberedlist"]').first()).toHaveClass(/active/);
      await expect(superdoc.page.locator('[data-item="btn-list"]').first()).not.toHaveClass(/active/);
    });

    test('neither button is active when caret is on a plain paragraph', async ({ superdoc }) => {
      await superdoc.type('plain');
      await superdoc.waitForStable();

      await expect(superdoc.page.locator('[data-item="btn-list"]').first()).not.toHaveClass(/active/);
      await expect(superdoc.page.locator('[data-item="btn-numberedlist"]').first()).not.toHaveClass(/active/);
    });
  });

  test.describe('toggleBulletListStyle creates correct OOXML', () => {
    const cases = [
      { style: 'disc' as const, expectedChar: '\u2022' },
      { style: 'circle' as const, expectedChar: '\u25E6' },
      { style: 'square' as const, expectedChar: '\u25AA' },
    ];

    for (const { style, expectedChar } of cases) {
      test(`"${style}" produces lvlText="${expectedChar}" and matching markerText`, async ({ superdoc }) => {
        // Apply the style to a plain paragraph so we exercise the create-new-list
        // branch that runs the BULLET_STYLE_CHARS override. Calling toggle with the
        // SAME style as an already-styled list would toggle off (remove) instead.
        await superdoc.type(`bullet-${style}-target`);
        await superdoc.waitForStable();

        await superdoc.executeCommand('toggleBulletListStyle', style as unknown as Record<string, unknown>);
        await superdoc.waitForStable();

        const items = await getListItemSnapshots(superdoc, `bullet-${style}-target`);
        expect(items).toHaveLength(1);
        expect(items[0].numFmt).toBe('bullet');
        expect(items[0].lvlText).toBe(expectedChar);
        expect(items[0].markerText).toBe(expectedChar);
        expect(items[0].numberingType).toBe('bullet');
      });
    }
  });

  test.describe('toggleOrderedListStyle creates correct OOXML', () => {
    const cases = [
      { style: 'decimal', expectedFmt: 'decimal', expectedLvlText: '%1.', firstMarker: '1.' },
      { style: 'decimal-paren', expectedFmt: 'decimal', expectedLvlText: '%1)', firstMarker: '1)' },
      { style: 'upper-roman', expectedFmt: 'upperRoman', expectedLvlText: '%1.', firstMarker: 'I.' },
      { style: 'lower-roman', expectedFmt: 'lowerRoman', expectedLvlText: '%1.', firstMarker: 'i.' },
      { style: 'upper-alpha', expectedFmt: 'upperLetter', expectedLvlText: '%1.', firstMarker: 'A.' },
      { style: 'upper-alpha-paren', expectedFmt: 'upperLetter', expectedLvlText: '%1)', firstMarker: 'A)' },
      { style: 'lower-alpha', expectedFmt: 'lowerLetter', expectedLvlText: '%1.', firstMarker: 'a.' },
      { style: 'lower-alpha-paren', expectedFmt: 'lowerLetter', expectedLvlText: '%1)', firstMarker: 'a)' },
    ] as const;

    for (const { style, expectedFmt, expectedLvlText, firstMarker } of cases) {
      test(`"${style}" produces numFmt=${expectedFmt}, lvlText=${expectedLvlText}, marker ${firstMarker}`, async ({
        superdoc,
      }) => {
        // Plain paragraph → exercise create-new-list with the ORDERED_LIST_STYLES override.
        await superdoc.type(`ordered-${style}-target`);
        await superdoc.waitForStable();

        await superdoc.executeCommand('toggleOrderedListStyle', style as unknown as Record<string, unknown>);
        await superdoc.waitForStable();

        const items = await getListItemSnapshots(superdoc, `ordered-${style}-target`);
        expect(items).toHaveLength(1);
        expect(items[0].numFmt).toBe(expectedFmt);
        expect(items[0].lvlText).toBe(expectedLvlText);
        expect(items[0].markerText).toBe(firstMarker);
      });
    }
  });

  test.describe('whole-list style switch', () => {
    test('cmd+Z reverts the style change instead of removing characters', async ({ superdoc }) => {
      // Reproduces the user-reported bug: with a bare caret on a list paragraph, change
      // the style — then undo. The first undo should put the markers back to their
      // original style; it must NOT skip the style change and start removing typed text.
      await createBulletList(superdoc, ['alpha', 'beta']);

      // Confirm we start as discs.
      const beforeMarkers = await Promise.all(['alpha', 'beta'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(beforeMarkers[0][0].markerText).toBe('•');
      expect(beforeMarkers[1][0].markerText).toBe('•');

      await placeCursorIn(superdoc, 'alpha');
      await superdoc.executeCommand('toggleBulletListStyle', 'square' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      // Style change applied to both siblings.
      const afterMarkers = await Promise.all(['alpha', 'beta'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(afterMarkers[0][0].markerText).toBe('▪');
      expect(afterMarkers[1][0].markerText).toBe('▪');

      // Undo. First undo MUST revert the style — not remove text.
      await superdoc.undo();
      await superdoc.waitForStable();

      const undoneMarkers = await Promise.all(['alpha', 'beta'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(undoneMarkers[0][0].markerText).toBe('•');
      expect(undoneMarkers[1][0].markerText).toBe('•');

      // The text content should be intact — undo didn't reach into the typing.
      await superdoc.assertTextContains('alpha');
      await superdoc.assertTextContains('beta');
    });

    test('applying a different bullet style restyles every item at the same level', async ({ superdoc }) => {
      await createBulletList(superdoc, ['alpha', 'beta', 'gamma']);

      const before = await Promise.all(['alpha', 'beta', 'gamma'].map((t) => getParagraphNumberingByText(superdoc, t)));
      expect(before[0]?.numId).toBe(before[1]?.numId);
      expect(before[1]?.numId).toBe(before[2]?.numId);

      await placeCursorIn(superdoc, 'alpha');
      await superdoc.executeCommand('toggleBulletListStyle', 'square' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const after = await Promise.all(['alpha', 'beta', 'gamma'].map((t) => getParagraphNumberingByText(superdoc, t)));
      const snapshots = await Promise.all(['alpha', 'beta', 'gamma'].map((t) => getListItemSnapshots(superdoc, t)));

      // Caret in one item migrates every sibling at the same (numId, ilvl) to a fresh
      // numId whose abstract carries the new style at that level. The new numId is shared
      // so all siblings still continue numbering together.
      expect(after[0]?.numId).toBe(after[1]?.numId);
      expect(after[1]?.numId).toBe(after[2]?.numId);
      expect(after[0]?.numId).not.toBe(before[0]?.numId);
      for (const snap of snapshots) {
        expect(snap[0].markerText).toBe('▪');
        expect(snap[0].lvlText).toBe('▪');
      }
    });

    test('switching list kind from bullet to ordered flips every item at the same level', async ({ superdoc }) => {
      await createBulletList(superdoc, ['one', 'two']);

      const before = await Promise.all(['one', 'two'].map((t) => getParagraphNumberingByText(superdoc, t)));
      expect(before[0]?.numId).toBe(before[1]?.numId);

      // Caret is only in the first item.
      await placeCursorIn(superdoc, 'one');
      await superdoc.executeCommand('toggleOrderedList');
      await superdoc.waitForStable();

      const afterOne = await getListItemSnapshots(superdoc, 'one');
      const afterTwo = await getListItemSnapshots(superdoc, 'two');

      // Both items at the same level should have flipped — no fragmentation.
      expect(afterOne[0].numberingType).toBe('decimal');
      expect(afterTwo[0].numberingType).toBe('decimal');
      expect(afterOne[0].markerText).toBe('1.');
      expect(afterTwo[0].markerText).toBe('2.');
      expect(afterOne[0].numId).toBe(afterTwo[0].numId);
    });

    test('switching list kind from ordered to bullet flips every item at the same level', async ({ superdoc }) => {
      await createOrderedList(superdoc, ['one', 'two']);

      const before = await Promise.all(['one', 'two'].map((t) => getParagraphNumberingByText(superdoc, t)));
      expect(before[0]?.numId).toBe(before[1]?.numId);

      await placeCursorIn(superdoc, 'one');
      await superdoc.executeCommand('toggleBulletList');
      await superdoc.waitForStable();

      const afterOne = await getListItemSnapshots(superdoc, 'one');
      const afterTwo = await getListItemSnapshots(superdoc, 'two');

      expect(afterOne[0].numberingType).toBe('bullet');
      expect(afterTwo[0].numberingType).toBe('bullet');
      expect(afterOne[0].numId).toBe(afterTwo[0].numId);
    });

    test('decimal → roman after creating the list via toggleOrderedList (user-reported scenario)', async ({
      superdoc,
    }) => {
      // Mirrors the exact reproduction the user described:
      //   1. Type two plain paragraphs.
      //   2. Convert them into an ordered (decimal) list via the toolbar command.
      //   3. With caret in one item, switch the style to upper-roman.
      // Both items must end up as roman markers (I., II.).
      await superdoc.type('one');
      await superdoc.newLine();
      await superdoc.type('two');
      await superdoc.waitForStable();

      // Select both paragraphs and convert them to a decimal ordered list.
      await superdoc.page.evaluate(() => {
        const editor = (window as any).editor;
        const TS = editor.state.selection.constructor;
        editor.view.dispatch(
          editor.state.tr.setSelection(TS.create(editor.state.doc, 1, editor.state.doc.content.size - 1)),
        );
      });
      await superdoc.executeCommand('toggleOrderedList');
      await superdoc.waitForStable();

      const decimalSnapshots = await Promise.all(['one', 'two'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(decimalSnapshots[0][0].markerText).toBe('1.');
      expect(decimalSnapshots[1][0].markerText).toBe('2.');

      await placeCursorIn(superdoc, 'one');
      await superdoc.executeCommand('toggleOrderedListStyle', 'upper-roman' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const romanSnapshots = await Promise.all(['one', 'two'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(romanSnapshots[0][0].numFmt).toBe('upperRoman');
      expect(romanSnapshots[1][0].numFmt).toBe('upperRoman');
      expect(romanSnapshots[0][0].markerText).toBe('I.');
      expect(romanSnapshots[1][0].markerText).toBe('II.');
      expect(romanSnapshots[0][0].numId).toBe(romanSnapshots[1][0].numId);

      // Also assert what the user actually sees: the DOM markers rendered by DomPainter.
      const visibleMarkers = await superdoc.page.locator('.superdoc-paragraph-marker').allInnerTexts();
      expect(visibleMarkers.map((t) => t.trim())).toEqual(['I.', 'II.']);
    });

    test('changing a sublevel style preserves continuous numbering across siblings', async ({ superdoc }) => {
      // Reproduces the user-reported issue:
      //   1. Add "level0" at level 0 (decimal).
      //   2. Press Enter + Tab → "sub1" at level 1.
      //   3. Press Enter → "sub2" at level 1.
      //   4. Caret in sub1, change style to upper-roman.
      // Both sublevel items should renumber as "I." and "II.", not duplicate "I." and "I.".
      // Use the input rule to create the list — same shortcut a user would type.
      await superdoc.type('1. level0');
      await superdoc.waitForStable();
      await superdoc.newLine();
      await superdoc.waitForStable();
      await superdoc.type('sub1');
      await superdoc.press('Tab');
      await superdoc.waitForStable();
      await superdoc.newLine();
      await superdoc.waitForStable();
      await superdoc.type('sub2');
      await superdoc.waitForStable();

      // Sanity: before changing style we should see "1." (level0), and the
      // input-rule default markers for level 1 ("a.", "b.") on sub1 and sub2.
      const before = await Promise.all(['level0', 'sub1', 'sub2'].map((t) => getListItemSnapshots(superdoc, t)));
      expect(before[0][0].markerText).toBe('1.');
      expect(before[1][0].markerText).toBe('a.');
      expect(before[2][0].markerText).toBe('b.');

      // Caret in sub1, change style to upper-roman.
      await placeCursorIn(superdoc, 'sub1');
      await superdoc.executeCommand('toggleOrderedListStyle', 'upper-roman' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const after = await Promise.all(['level0', 'sub1', 'sub2'].map((t) => getListItemSnapshots(superdoc, t)));

      // level0 stays decimal (we only changed level 1).
      expect(after[0][0].markerText).toBe('1.');
      // Sublevel items should be I. and II. — preserve continuous numbering.
      expect(after[1][0].numFmt).toBe('upperRoman');
      expect(after[2][0].numFmt).toBe('upperRoman');
      expect(after[1][0].markerText).toBe('I.');
      expect(after[2][0].markerText).toBe('II.');

      // Visible DOM should match the data layer: top-level "1.", sublevels "I.", "II.".
      const visibleMarkers = await superdoc.page.locator('.superdoc-paragraph-marker').allInnerTexts();
      expect(visibleMarkers.map((t) => t.trim())).toEqual(['1.', 'I.', 'II.']);
    });

    test('switching kind on a nested item preserves the level — going back to level 0 continues the parent list', async ({
      superdoc,
    }) => {
      // Reproduces the user-reported scenario:
      //   1. type "first" and toggle bullet list   -> "• first" at level 0
      //   2. enter, tab, type "nested"             -> "◦ nested" at level 1
      //   3. with caret in "nested", click numbered list  -> level 1 becomes ordered
      //   4. enter (still level 1), shift+tab (back to level 0)
      // Expectation: the new paragraph at level 0 continues the bullet list — i.e. it is
      // a level-0 bullet, NOT a level-0 ordered marker.
      await superdoc.type('first');
      await superdoc.waitForStable();
      await superdoc.executeCommand('toggleBulletList');
      await superdoc.waitForStable();

      await superdoc.newLine();
      await superdoc.waitForStable();
      await superdoc.press('Tab');
      await superdoc.waitForStable();
      await superdoc.type('nested');
      await superdoc.waitForStable();

      const nestedBefore = await getListItemSnapshots(superdoc, 'nested');
      expect(nestedBefore[0].numberingType).toBe('bullet');

      // Bare caret on "nested" — kind switch hits the whole-list-restyle path. The level-1
      // abstract is cloned (preserving level 0 = bullet) so going back to level 0 keeps
      // rendering as a bullet.
      await placeCursorIn(superdoc, 'nested');
      await superdoc.executeCommand('toggleOrderedList');
      await superdoc.waitForStable();

      const nestedAfter = await getListItemSnapshots(superdoc, 'nested');
      // After kind switch, "nested" should still be at level 1 (not collapsed to level 0)
      // and should now be ordered.
      expect(nestedAfter[0].numberingType).not.toBe('bullet');

      await superdoc.newLine();
      await superdoc.waitForStable();
      await superdoc.press('Shift+Tab');
      await superdoc.waitForStable();
      await superdoc.type('continued');
      await superdoc.waitForStable();

      const continued = await getListItemSnapshots(superdoc, 'continued');

      // "continued" is at level 0. The cloned abstract preserves the parent bullet at
      // level 0 so the marker still renders as a bullet — visual continuity is intact
      // even though list identity (numId) has migrated.
      expect(continued[0].numberingType).toBe('bullet');
    });

    test('applying a different ordered style restyles every item at the same level', async ({ superdoc }) => {
      await createOrderedList(superdoc, ['one', 'two', 'three']);

      const beforeOne = await getListItemSnapshots(superdoc, 'one');
      const beforeTwo = await getListItemSnapshots(superdoc, 'two');
      const beforeThree = await getListItemSnapshots(superdoc, 'three');
      expect(beforeOne[0].markerText).toBe('1.');
      expect(beforeTwo[0].markerText).toBe('2.');
      expect(beforeThree[0].markerText).toBe('3.');

      await placeCursorIn(superdoc, 'one');
      await superdoc.executeCommand('toggleOrderedListStyle', 'upper-roman' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const afterOne = await getListItemSnapshots(superdoc, 'one');
      const afterTwo = await getListItemSnapshots(superdoc, 'two');
      const afterThree = await getListItemSnapshots(superdoc, 'three');

      // All three items at the same level are now upper-roman (I., II., III.).
      for (const snap of [afterOne, afterTwo, afterThree]) {
        expect(snap[0].numFmt).toBe('upperRoman');
        expect(snap[0].lvlText).toBe('%1.');
      }
      expect(afterOne[0].markerText).toBe('I.');
      expect(afterTwo[0].markerText).toBe('II.');
      expect(afterThree[0].markerText).toBe('III.');

      // All three siblings migrate to a fresh shared numId whose cloned abstract carries
      // the new style. They keep continuous numbering together; the original numId is
      // left untouched so PM history can revert this on undo.
      expect(afterOne[0].numId).toBe(afterTwo[0].numId);
      expect(afterTwo[0].numId).toBe(afterThree[0].numId);
      expect(afterOne[0].numId).not.toBe(beforeOne[0].numId);
    });
  });
});
