import { describe, it, expect, vi } from 'vitest';

const ids = ['a1', 'b2', 'c3', 'd4', 'e5'];
const generateDocxRandomIdMock = vi.hoisted(() => vi.fn(() => ids.shift() || 'ffff'));

vi.mock('./generateDocxRandomId', () => ({
  generateDocxRandomId: generateDocxRandomIdMock,
}));

import { generateDocxListAttributes } from './generateDocxListAttributes.js';

describe('generateDocxListAttributes', () => {
  it('creates paragraph properties for the requested list type', () => {
    const attrs = generateDocxListAttributes('orderedList');
    const { parentAttributes } = attrs.attributes;

    expect(parentAttributes['w14:paraId']).toBeDefined();
    expect(parentAttributes.paragraphProperties.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'w:pStyle' }),
        expect.objectContaining({
          name: 'w:numPr',
          elements: expect.arrayContaining([
            expect.objectContaining({ name: 'w:ilvl' }),
            expect.objectContaining({ name: 'w:numId', attributes: { 'w:val': 2 } }),
          ]),
        }),
      ]),
    );
  });

  it('defaults to zero when list type is unknown', () => {
    const attrs = generateDocxListAttributes('custom');
    const numPr = attrs.attributes.parentAttributes.paragraphProperties.elements.find(
      (item) => item.name === 'w:numPr',
    );
    const numId = numPr.elements.find((el) => el.name === 'w:numId');
    expect(numId.attributes['w:val']).toBe(0);
  });
});
