import { test, expect } from '../../fixtures/superdoc.js';
import {
  createBulletList,
  countListMarkers,
  getAllListLevels,
  getParagraphNumberingByText,
} from '../../helpers/lists.js';

test.describe('empty list item Enter behavior', () => {
  test('Enter on an empty nested list item outdents by one level', async ({ superdoc }) => {
    await createBulletList(superdoc, ['parent']);

    await superdoc.newLine();
    await superdoc.waitForStable();
    await superdoc.press('Tab');
    await superdoc.waitForStable();
    await superdoc.type('child');
    await superdoc.waitForStable();

    await superdoc.newLine();
    await superdoc.waitForStable();

    const levelsBeforeOutdent = await getAllListLevels(superdoc);
    expect(levelsBeforeOutdent).toEqual([0, 1, 1]);

    await superdoc.newLine();
    await superdoc.waitForStable();

    const levelsAfterOutdent = await getAllListLevels(superdoc);
    expect(levelsAfterOutdent).toEqual([0, 1, 0]);
  });

  test('Enter on an empty top-level list item exits the list', async ({ superdoc }) => {
    await createBulletList(superdoc, ['single item']);

    await superdoc.newLine();
    await superdoc.waitForStable();

    const levelsBeforeExit = await getAllListLevels(superdoc);
    expect(levelsBeforeExit).toEqual([0, 0]);

    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.type('outside list');
    await superdoc.waitForStable();

    const levelsAfterExit = await getAllListLevels(superdoc);
    expect(levelsAfterExit).toEqual([0]);

    const outsideParagraphNumbering = await getParagraphNumberingByText(superdoc, 'outside list');
    expect(outsideParagraphNumbering).toBeNull();
    expect(await countListMarkers(superdoc)).toBe(1);
  });
});
