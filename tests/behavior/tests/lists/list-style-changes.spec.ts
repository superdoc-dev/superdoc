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

  test.describe('partial-selection style switch', () => {
    test('applying a different bullet style to one item splits the list', async ({ superdoc }) => {
      await createBulletList(superdoc, ['alpha', 'beta', 'gamma']);

      const before = await Promise.all(['alpha', 'beta', 'gamma'].map((t) => getParagraphNumberingByText(superdoc, t)));
      // Sanity: all three start in the same list.
      expect(before[0]?.numId).toBe(before[1]?.numId);
      expect(before[1]?.numId).toBe(before[2]?.numId);

      await placeCursorIn(superdoc, 'alpha');
      await superdoc.executeCommand('toggleBulletListStyle', 'square' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const after = await Promise.all(['alpha', 'beta', 'gamma'].map((t) => getParagraphNumberingByText(superdoc, t)));

      // Currently observed behavior (PR-2873): alpha gets a fresh numId (a brand-new
      // single-item square list); beta/gamma stay in the original list.
      //
      // This documents the partial-selection fragmentation finding from the runtime
      // review. If/when the PR converts to whole-list-conversion semantics
      // (Word's behavior), this expectation should flip to:
      //   expect(after[0]?.numId).toBe(after[1]?.numId);
      expect(after[0]?.numId).not.toBe(before[0]?.numId);
      expect(after[1]?.numId).toBe(before[1]?.numId);
      expect(after[2]?.numId).toBe(before[2]?.numId);
    });

    test('applying a different ordered style to item 1 renumbers the surviving items', async ({ superdoc }) => {
      await createOrderedList(superdoc, ['one', 'two', 'three']);

      const beforeSnapshots = await getListItemSnapshots(superdoc, 'one');
      const beforeTwo = await getListItemSnapshots(superdoc, 'two');
      const beforeThree = await getListItemSnapshots(superdoc, 'three');
      expect(beforeSnapshots[0].markerText).toBe('1.');
      expect(beforeTwo[0].markerText).toBe('2.');
      expect(beforeThree[0].markerText).toBe('3.');

      await placeCursorIn(superdoc, 'one');
      await superdoc.executeCommand('toggleOrderedListStyle', 'upper-roman' as unknown as Record<string, unknown>);
      await superdoc.waitForStable();

      const afterOne = await getListItemSnapshots(superdoc, 'one');
      const afterTwo = await getListItemSnapshots(superdoc, 'two');
      const afterThree = await getListItemSnapshots(superdoc, 'three');

      // "one" now belongs to a fresh single-item upper-roman list.
      expect(afterOne[0].markerText).toBe('I.');
      expect(afterOne[0].numFmt).toBe('upperRoman');

      // "two" and "three" are still decimal but Word-compatible behavior would keep
      // them as 2./3.; this PR auto-renumbers them from 1. because the head left.
      expect(afterTwo[0].numFmt).toBe('decimal');
      expect(afterThree[0].numFmt).toBe('decimal');
      expect(afterTwo[0].markerText).toBe('1.');
      expect(afterThree[0].markerText).toBe('2.');
    });
  });
});
