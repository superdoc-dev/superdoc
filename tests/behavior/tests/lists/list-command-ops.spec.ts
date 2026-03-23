import { test, expect } from '../../fixtures/superdoc.js';
import {
  createBulletList,
  createOrderedList,
  countListMarkers,
  getStartOverrideForText,
  getParagraphNumberingByText,
  getParagraphPosByText,
} from '../../helpers/lists.js';

test.describe('list command operations', () => {
  test('insertListItemAt inserts a new list item at the requested position', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['alpha']);

    const alphaPos = await getParagraphPosByText(superdoc, 'alpha');
    await superdoc.executeCommand('insertListItemAt', {
      pos: alphaPos,
      position: 'after',
      text: 'beta',
    });
    await superdoc.waitForStable();

    await superdoc.assertTextContains('beta');
    expect(await countListMarkers(superdoc)).toBe(2);

    const betaNumbering = await getParagraphNumberingByText(superdoc, 'beta');
    expect(betaNumbering?.numId).not.toBeNull();
  });

  test('setListTypeAt converts list kind for the targeted item', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['alpha', 'beta']);

    const alphaPos = await getParagraphPosByText(superdoc, 'alpha');
    await superdoc.executeCommand('setListTypeAt', { pos: alphaPos, kind: 'bullet' });
    await superdoc.waitForStable();

    const alphaNumbering = await getParagraphNumberingByText(superdoc, 'alpha');
    expect(alphaNumbering?.numberingType).toBe('bullet');
    expect(await countListMarkers(superdoc)).toBe(2);
  });

  test('exitListItemAt removes numbering only for the targeted item', async ({ superdoc }) => {
    await createBulletList(superdoc, ['alpha', 'beta']);

    const betaPos = await getParagraphPosByText(superdoc, 'beta');
    await superdoc.executeCommand('exitListItemAt', { pos: betaPos });
    await superdoc.waitForStable();

    const alphaNumbering = await getParagraphNumberingByText(superdoc, 'alpha');
    const betaNumbering = await getParagraphNumberingByText(superdoc, 'beta');

    expect(alphaNumbering?.numId).not.toBeNull();
    expect(betaNumbering).toBeNull();
    expect(await countListMarkers(superdoc)).toBe(1);
  });

  test('restartNumbering resets the current ordered list item ordinal to one', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['first', 'second']);

    const secondPos = await superdoc.findTextPos('second');
    await superdoc.setTextSelection(secondPos);
    await superdoc.waitForStable();

    const startOverrideBefore = await getStartOverrideForText(superdoc, 'second');
    expect(startOverrideBefore).toBeNull();

    await superdoc.executeCommand('restartNumbering');
    await superdoc.waitForStable();

    const startOverrideAfter = await getStartOverrideForText(superdoc, 'second');
    expect(startOverrideAfter).toBe(1);
  });
});
