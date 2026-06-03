import { test, expect } from '../../fixtures/superdoc.js';
import {
  assertDocumentApiReady,
  listContinuePrevious,
  listSeparate,
  listSetValue,
} from '../../helpers/document-api.js';
import { createOrderedList, getListItemAddressByText, getListItemByText } from '../../helpers/lists.js';

test.describe('list document-api mutations', () => {
  test('lists.setValue updates the target item ordinal in browser integration', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['one', 'two', 'three']);
    await assertDocumentApiReady(superdoc.page);

    const targetAddress = await getListItemAddressByText(superdoc, 'two');
    const secondBefore = await getListItemByText(superdoc, 'two');
    expect(secondBefore?.ordinal).toBe(2);

    const receipt = await listSetValue(superdoc.page, {
      target: targetAddress,
      value: 7,
    });

    expect(receipt.success).toBe(true);
    await superdoc.waitForStable();

    const secondAfter = await getListItemByText(superdoc, 'two');
    expect(secondAfter?.ordinal).toBe(7);
  });

  test('lists.continuePrevious links a compatible sequence to the previous one', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['first', 'second', 'third', 'fourth']);

    await assertDocumentApiReady(superdoc.page);

    const targetAddress = await getListItemAddressByText(superdoc, 'third');
    const firstBefore = await getListItemByText(superdoc, 'first');
    const thirdBefore = await getListItemByText(superdoc, 'third');
    expect(firstBefore).not.toBeNull();
    expect(thirdBefore?.ordinal).toBe(3);

    const separationReceipt = await listSeparate(superdoc.page, { target: targetAddress });
    expect(separationReceipt.success).toBe(true);
    await superdoc.waitForStable();

    const thirdAfterSeparation = await getListItemByText(superdoc, 'third');
    expect(thirdAfterSeparation?.listId).not.toBe(firstBefore?.listId);

    const targetAddressAfterSeparation = await getListItemAddressByText(superdoc, 'third');
    const receipt = await listContinuePrevious(superdoc.page, { target: targetAddressAfterSeparation });

    expect(receipt.success).toBe(true);
    await superdoc.waitForStable();

    const thirdAfter = await getListItemByText(superdoc, 'third');
    const fourthAfter = await getListItemByText(superdoc, 'fourth');

    expect(thirdAfter?.ordinal).toBe(3);
    expect(fourthAfter?.ordinal).toBe(4);
    expect(thirdAfter?.listId).toBe(firstBefore?.listId);
  });
});
