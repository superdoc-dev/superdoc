import { describe, it, expect, beforeEach, vi } from 'vitest';

let listIdCounter = 0;

const getNewListIdMock = vi.hoisted(() => vi.fn(() => ++listIdCounter));
const generateNewListDefinitionMock = vi.hoisted(() => vi.fn());
const getListDefinitionDetailsMock = vi.hoisted(() => vi.fn(() => ({ listNumberingType: 'decimal', lvlText: '%1.' })));

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: getNewListIdMock,
    generateNewListDefinition: generateNewListDefinitionMock,
    getListDefinitionDetails: getListDefinitionDetailsMock,
  },
}));

import { flattenListsInHtml, createSingleItemList, unflattenListsInHtml } from './html-helpers.js';

describe('html list helpers', () => {
  const editor = { options: {}, converter: {} };

  beforeEach(() => {
    listIdCounter = 0;
    getNewListIdMock.mockClear();
    generateNewListDefinitionMock.mockClear();
    getListDefinitionDetailsMock.mockClear();
  });

  it('flattens multi-item lists so each list has a single item', () => {
    const html = '<ul><li>One</li><li>Two</li></ul>';

    const flattened = flattenListsInHtml(html, editor);
    const parsed = new DOMParser().parseFromString(`<body>${flattened}</body>`, 'text/html');
    const lists = parsed.querySelectorAll('p[data-num-id]');

    expect(lists.length).toBe(2);
    expect(generateNewListDefinitionMock).toHaveBeenCalled();
  });

  it('creates a single-item list with numbering metadata', () => {
    const doc = new DOMParser().parseFromString('<li style="color:red">Solo</li>', 'text/html');
    const li = doc.body.firstElementChild;

    const listItem = createSingleItemList({
      li,
      tag: 'ol',
      rootNumId: '42',
      level: 0,
      editor,
      NodeInterface: window.Node,
    });

    expect(listItem.tagName).toBe('P');
    expect(listItem.getAttribute('data-num-id')).toBe('42');
    expect(listItem.getAttribute('data-level')).toBe('0');
  });

  it('reconstructs nested lists from flattened paragraph markup', () => {
    const flattenedHtml = `
      <p data-num-id="7" data-level="0" data-list-numbering-type="decimal" data-list-level="[1]">Item 1</p>
      <p data-num-id="7" data-level="1" data-list-numbering-type="bullet" data-list-level="[1,1]">Nested</p>
      <p data-num-id="7" data-level="0" data-list-numbering-type="decimal" data-list-level="[2]">Item 2</p>
    `;

    const reconstructed = unflattenListsInHtml(flattenedHtml);
    const parsed = new DOMParser().parseFromString(`<body>${reconstructed}</body>`, 'text/html');
    const list = parsed.querySelector('ol[data-list-id="7"]');

    expect(list).not.toBeNull();
    const topLevelItems = list.querySelectorAll(':scope > li');
    expect(topLevelItems.length).toBe(2);

    const nestedList = topLevelItems[0].querySelector('ul');
    expect(nestedList).not.toBeNull();
    expect(nestedList.querySelectorAll('li').length).toBe(1);
    expect(parsed.querySelectorAll('p[data-num-id]').length).toBe(0);
  });

  it('preserves start attribute for ordered lists', () => {
    const flattenedHtml = `
      <p data-num-id="9" data-level="0" data-list-numbering-type="decimal" data-list-level="[3]">Item 3</p>
      <p data-num-id="9" data-level="0" data-list-numbering-type="decimal" data-list-level="[4]">Item 4</p>
    `;

    const reconstructed = unflattenListsInHtml(flattenedHtml);
    const parsed = new DOMParser().parseFromString(`<body>${reconstructed}</body>`, 'text/html');
    const list = parsed.querySelector('ol[data-list-id="9"]');

    expect(list).not.toBeNull();
    expect(list.getAttribute('start')).toBe('3');
  });

  it('round-trips flattened HTML through unflatten -> flatten', () => {
    const sourceHtml = `
      <ol>
        <li>Item 1</li>
        <li>
          Item 2
          <ol>
            <li>Sub Item</li>
          </ol>
        </li>
        <li>Item 3</li>
      </ol>
    `;

    const flattenedOnce = flattenListsInHtml(sourceHtml, editor);
    const unflattened = unflattenListsInHtml(flattenedOnce);
    const flattenedAgain = flattenListsInHtml(unflattened, editor);

    const firstPass = flattenedOnce.replace(/\s+/g, ' ').trim();
    const secondPass = flattenedAgain.replace(/\s+/g, ' ').trim();

    expect(secondPass).toBe(firstPass);
  });
});
