import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListRenderingSync } from './listRenderingSync.js';
import { generateOrderedListIndex } from '@helpers/orderedListUtils.js';

const mocks = vi.hoisted(() => ({
  allDefinitions: {},
  definitionDetailsByKey: new Map(),
}));

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getAllListDefinitions: vi.fn(() => mocks.allDefinitions),
    getListDefinitionDetails: vi.fn(({ numId, level }) => mocks.definitionDetailsByKey.get(`${numId}:${level}`)),
  },
}));

vi.mock('@helpers/orderedListUtils.js', () => ({
  generateOrderedListIndex: vi.fn(({ listLevel }) => `${listLevel.at(-1)}.`),
}));

vi.mock('@core/super-converter/v2/importer/listImporter.js', () => ({
  docxNumberingHelpers: {
    normalizeLvlTextChar: vi.fn(() => '•'),
  },
}));

const editor = {
  converter: {
    numbering: {},
    translatedNumbering: {},
  },
};

const paragraph = (numId, ilvl = 0) => ({
  type: { name: 'paragraph' },
  attrs: {
    paragraphProperties: {
      numberingProperties: { numId, ilvl },
    },
  },
});

function setDefinition(numId, level, details = {}) {
  mocks.definitionDetailsByKey.set(`${numId}:${level}`, {
    lvlText: `%${Number(level) + 1}.`,
    listNumberingType: 'decimal',
    suffix: 'tab',
    justification: 'left',
    abstractId: 'abstract-1',
    ...details,
  });
}

function sync(paragraphs) {
  const syncer = createListRenderingSync(editor);
  const updates = [];

  syncer.syncListRendering({
    visitNodes: (visit) => {
      paragraphs.forEach((node, index) => visit(node, index * 10 + 1));
    },
    updateListRendering: (node, pos, listRendering) => {
      updates.push({ node, pos, listRendering });
    },
  });

  return updates;
}

describe('listRenderingSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allDefinitions = {};
    mocks.definitionDetailsByKey = new Map();
  });

  it('calculates ordered list rendering in paragraph order', () => {
    mocks.allDefinitions = { 1: { 0: { start: '1' } } };
    setDefinition(1, 0);

    const updates = sync([paragraph(1), paragraph(1)]);

    expect(updates.map((update) => update.listRendering.markerText)).toEqual(['1.', '2.']);
    expect(updates.map((update) => update.listRendering.path)).toEqual([[1], [2]]);
    expect(generateOrderedListIndex).toHaveBeenLastCalledWith({
      listLevel: [2],
      lvlText: '%1.',
      listNumberingType: 'decimal',
      customFormat: undefined,
    });
  });

  it('uses bullet marker text from the numbering definition', () => {
    mocks.allDefinitions = { 9: { 0: { start: '1' } } };
    setDefinition(9, 0, { lvlText: 'o', listNumberingType: 'bullet' });

    const [update] = sync([paragraph(9)]);

    expect(update.listRendering).toMatchObject({
      markerText: '•',
      numberingType: 'bullet',
      path: [1],
    });
    expect(generateOrderedListIndex).not.toHaveBeenCalled();
  });

  it('honors start values from translated numbering definitions', () => {
    mocks.allDefinitions = { 2: { 0: { start: '5' } } };
    setDefinition(2, 0);

    const [update] = sync([paragraph(2)]);

    expect(update.listRendering.markerText).toBe('5.');
    expect(update.listRendering.path).toEqual([5]);
  });

  it('restarts nested levels after a parent level appears', () => {
    mocks.allDefinitions = {
      3: {
        0: { start: '1' },
        1: { start: '1' },
      },
    };
    setDefinition(3, 0);
    setDefinition(3, 1);

    const updates = sync([paragraph(3, 0), paragraph(3, 1), paragraph(3, 1), paragraph(3, 0), paragraph(3, 1)]);

    expect(updates.map((update) => update.listRendering.path)).toEqual([[1], [1, 1], [1, 2], [2], [2, 1]]);
  });

  it('returns null when definition details are missing', () => {
    mocks.allDefinitions = { 4: { 0: { start: '1' } } };

    const [update] = sync([paragraph(4)]);

    expect(update.listRendering).toBeNull();
    expect(generateOrderedListIndex).not.toHaveBeenCalled();
  });

  it('calculates nested paths across multiple levels', () => {
    mocks.allDefinitions = {
      5: {
        0: { start: '1' },
        1: { start: '1' },
        2: { start: '1' },
      },
    };
    setDefinition(5, 0);
    setDefinition(5, 1);
    setDefinition(5, 2);

    const updates = sync([paragraph(5, 0), paragraph(5, 1), paragraph(5, 2)]);

    expect(updates.at(-1).listRendering.path).toEqual([1, 1, 1]);
  });
});
