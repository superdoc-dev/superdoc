// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    hasListDefinition: vi.fn().mockReturnValue(true),
  },
}));

vi.mock(import('@helpers/index.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findParentNode: vi.fn(),
  };
});

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node.attrs.paragraphProperties || {}),
  calculateResolvedParagraphProperties: vi.fn((_, node, __) => node.attrs.paragraphProperties || {}),
}));

import { changeListLevel } from './changeListLevel.js';
import { findParentNode } from '@helpers/index.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';

const createResolvedPos = ({ pos = 0, before = pos, parent } = {}) => {
  const resolvedParent = parent || {
    type: { name: 'paragraph' },
    attrs: {},
  };

  return {
    pos,
    parent: resolvedParent,
    depth: resolvedParent ? 1 : 0,
    before: () => before,
  };
};

const createSelection = (fromConfig = {}, toConfig = {}) => {
  const $from = createResolvedPos(fromConfig);
  const $to = createResolvedPos(toConfig);
  return {
    $from,
    $to,
    ranges: [{ $from, $to }],
  };
};

describe('changeListLevel', () => {
  /** @type {{ state: any, converter: { convertedXml: any, numbering: { definitions: any, abstracts: any } } }} */
  let editor;
  /** @type {{ setNodeMarkup: ReturnType<typeof vi.fn> }} */
  let tr;
  /** @type {{ nodesBetween: ReturnType<typeof vi.fn> }} */
  let rootNode;
  /** @type<Array<{ node: any, pos: number }>> */
  let nodesBetweenSequence;
  /** @type {any} */
  let selection;

  beforeEach(() => {
    vi.clearAllMocks();

    nodesBetweenSequence = [];
    rootNode = {
      nodesBetween: vi.fn((_from, _to, callback) => {
        nodesBetweenSequence.forEach(({ node, pos }) => callback(node, pos));
      }),
    };

    selection = createSelection({ pos: 0, before: 0 }, { pos: 1000, before: 1000 });

    editor = {
      state: {
        doc: rootNode,
        selection,
      },
      converter: {
        convertedXml: {},
        numbering: { definitions: {}, abstracts: {} },
      },
    };
    tr = { setNodeMarkup: vi.fn() };

    findParentNode.mockReturnValue(() => null);
    ListHelpers.hasListDefinition.mockReturnValue(true);
  });

  it('returns false when no current list item is found', () => {
    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(false);
    expect(rootNode.nodesBetween).toHaveBeenCalled();
    expect(ListHelpers.hasListDefinition).not.toHaveBeenCalled();
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('returns true without updating when the new level would be negative', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: 0, numId: 5 } },
        listRendering: {},
      },
    };
    nodesBetweenSequence.push({ node, pos: 10 });

    const result = changeListLevel(-1, editor, tr);

    expect(result).toBe(true);
    expect(ListHelpers.hasListDefinition).not.toHaveBeenCalled();
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('coerces ilvl strings before applying the delta', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: '0', numId: 42 } },
        listRendering: {},
      },
    };

    nodesBetweenSequence.push({ node, pos: 18 });

    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(true);
    expect(ListHelpers.hasListDefinition).toHaveBeenCalledWith(editor, 42, 1);
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      18,
      null,
      expect.objectContaining({
        paragraphProperties: expect.objectContaining({
          numberingProperties: { ilvl: 1, numId: 42 },
        }),
      }),
    );
  });

  it('returns false when list definition for target level is missing', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: 1, numId: 99 } },
        listRendering: {},
      },
    };

    nodesBetweenSequence.push({ node, pos: 15 });
    ListHelpers.hasListDefinition.mockReturnValue(false);

    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(false);
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('updates numbering properties and resolves paragraph properties when the level change is valid', () => {
    const nodes = [
      {
        type: { name: 'paragraph' },
        attrs: {
          paragraphProperties: {
            numberingProperties: { ilvl: 1, numId: 123 },
            indent: { left: 720 },
            keepLines: true,
          },
          listRendering: { foo: 'bar' },
          someOtherAttr: 'keep-me',
        },
      },
      {
        type: { name: 'paragraph' },
        attrs: {
          paragraphProperties: {
            numberingProperties: { ilvl: 2, numId: 123 },
            keepLines: false,
          },
          listRendering: { foo: 'baz' },
          someOtherAttr: 'stay',
        },
      },
    ];

    nodesBetweenSequence.push({ node: nodes[0], pos: 21 }, { node: nodes[1], pos: 30 });

    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(true);
    expect(ListHelpers.hasListDefinition).toHaveBeenNthCalledWith(1, editor, 123, 2);
    expect(ListHelpers.hasListDefinition).toHaveBeenNthCalledWith(2, editor, 123, 3);
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);

    const firstCall = tr.setNodeMarkup.mock.calls[0];
    const secondCall = tr.setNodeMarkup.mock.calls[1];

    expect(firstCall[0]).toBe(21);
    expect(firstCall[1]).toBeNull();
    expect(firstCall[2].paragraphProperties).toEqual({
      numberingProperties: { ilvl: 2, numId: 123 },
      keepLines: true,
    });

    expect(secondCall[0]).toBe(30);
    expect(secondCall[2].paragraphProperties).toEqual({
      numberingProperties: { ilvl: 3, numId: 123 },
      keepLines: false,
    });
  });

  it('falls back to the current list item when the selection range contributes none', () => {
    const fallbackItem = {
      node: {
        attrs: {
          paragraphProperties: { numberingProperties: { ilvl: 1, numId: 321 } },
          listRendering: {},
        },
      },
      pos: 42,
    };

    findParentNode.mockReturnValue(() => fallbackItem);

    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(true);
    expect(ListHelpers.hasListDefinition).toHaveBeenCalledWith(editor, 321, 2);
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(1);
  });

  it('includes partially selected list items at the selection edges', () => {
    const firstNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: 0, numId: 7 } },
        listRendering: {},
      },
    };
    const middleNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: 1, numId: 7 } },
        listRendering: {},
      },
    };
    const lastNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { ilvl: 2, numId: 7 } },
        listRendering: {},
      },
    };

    nodesBetweenSequence.push({ node: middleNode, pos: 30 });

    selection = createSelection({ pos: 5, before: 0, parent: firstNode }, { pos: 65, before: 60, parent: lastNode });
    selection.ranges = [{ $from: selection.$from, $to: selection.$to }];
    editor.state.selection = selection;

    const result = changeListLevel(1, editor, tr);

    expect(result).toBe(true);
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(3);
    expect(tr.setNodeMarkup.mock.calls.map(([pos]) => pos)).toEqual([0, 30, 60]);
  });
});
