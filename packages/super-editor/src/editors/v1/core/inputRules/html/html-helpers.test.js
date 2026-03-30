import { describe, it, expect, beforeEach, vi } from 'vitest';

let listIdCounter = 0;

const getNewListIdMock = vi.hoisted(() => vi.fn(() => ++listIdCounter));
const generateNewListDefinitionMock = vi.hoisted(() => vi.fn());
const setLvlOverrideMock = vi.hoisted(() => vi.fn());
const getListDefinitionDetailsMock = vi.hoisted(() => vi.fn(() => ({ listNumberingType: 'decimal', lvlText: '%1.' })));

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getNewListId: getNewListIdMock,
    generateNewListDefinition: generateNewListDefinitionMock,
    setLvlOverride: setLvlOverrideMock,
    getListDefinitionDetails: getListDefinitionDetailsMock,
  },
  /** Mirrors `createListIdAllocator` from list-numbering-helpers (uses mocked getNewListId). */
  createListIdAllocator: (editor) => {
    const existingIds = new Set(
      Object.keys(editor?.converter?.numbering?.definitions || {})
        .map((value) => Number(value))
        .filter(Number.isFinite),
    );
    let nextId = Number(getNewListIdMock(editor));
    return () => {
      while (!Number.isFinite(nextId) || existingIds.has(nextId)) {
        nextId = Number.isFinite(nextId) ? nextId + 1 : Number(getNewListIdMock(editor));
      }
      const allocatedId = nextId;
      existingIds.add(allocatedId);
      nextId += 1;
      return allocatedId;
    };
  },
}));

import { flattenListsInHtml, createSingleItemList, unflattenListsInHtml } from './html-helpers.js';

describe('html list helpers', () => {
  const editor = { options: {}, converter: {} };

  beforeEach(() => {
    listIdCounter = 0;
    getNewListIdMock.mockReset().mockImplementation(() => ++listIdCounter);
    generateNewListDefinitionMock.mockReset();
    setLvlOverrideMock.mockReset();
    getListDefinitionDetailsMock.mockReset().mockReturnValue({ listNumberingType: 'decimal', lvlText: '%1.' });
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

  it('rebuilds numbering definitions for copied list paragraphs before parsing', () => {
    const flattenedHtml = `
      <p data-num-id="41" data-level="0" data-list-numbering-type="upperRoman" data-list-level="[4]">Item 4</p>
      <p data-num-id="41" data-level="0" data-list-numbering-type="upperRoman" data-list-level="[5]">Item 5</p>
    `;

    const restored = flattenListsInHtml(flattenedHtml, editor);
    const parsed = new DOMParser().parseFromString(`<body>${restored}</body>`, 'text/html');
    const paragraphs = Array.from(parsed.querySelectorAll('p[data-num-id]'));

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].getAttribute('data-num-id')).toBe('1');
    expect(paragraphs[1].getAttribute('data-num-id')).toBe('1');
    expect(paragraphs[0].getAttribute('data-num-fmt')).toBe('upperRoman');
    expect(paragraphs[0].getAttribute('data-lvl-text')).toBe('%1.');
    expect(generateNewListDefinitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        numId: 1,
        listType: 'orderedList',
        level: '0',
        start: '4',
        text: '%1.',
        fmt: 'upperRoman',
        editor,
      }),
    );
    expect(setLvlOverrideMock).toHaveBeenCalledWith(editor, 1, 0, { startOverride: 4 });
  });

  it('assigns distinct remapped ids to different copied lists even when the helper returns the same next id', () => {
    getNewListIdMock.mockReturnValue(7);

    const flattenedHtml = `
      <p data-num-id="41" data-level="0" data-list-numbering-type="decimal">One</p>
      <p data-num-id="42" data-level="0" data-list-numbering-type="bullet">Two</p>
    `;

    const restored = flattenListsInHtml(flattenedHtml, editor);
    const parsed = new DOMParser().parseFromString(`<body>${restored}</body>`, 'text/html');
    const paragraphs = Array.from(parsed.querySelectorAll('p[data-num-id]'));

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].getAttribute('data-num-id')).toBe('7');
    expect(paragraphs[1].getAttribute('data-num-id')).toBe('8');
    expect(generateNewListDefinitionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ numId: 7, fmt: 'decimal', listType: 'orderedList' }),
    );
    expect(generateNewListDefinitionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ numId: 8, fmt: 'bullet', listType: 'bulletList' }),
    );
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
