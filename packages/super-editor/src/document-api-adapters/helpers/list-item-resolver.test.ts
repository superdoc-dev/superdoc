import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { listListItems, resolveListItem } from './list-item-resolver.js';

type MockParagraphOptions = {
  id: string;
  text?: string;
  numId?: number;
  ilvl?: number;
  markerText?: string;
  path?: number[];
  numberingType?: string;
};

type MockNode = {
  type: { name: string };
  attrs: Record<string, unknown>;
  nodeSize: number;
  isBlock: boolean;
  textContent: string;
};

function makeParagraph(options: MockParagraphOptions): MockNode {
  const text = options.text ?? '';
  const numberingProperties =
    options.numId != null
      ? {
          numId: options.numId,
          ilvl: options.ilvl ?? 0,
        }
      : undefined;

  return {
    type: { name: 'paragraph' },
    attrs: {
      paraId: options.id,
      paragraphProperties: numberingProperties ? { numberingProperties } : {},
      listRendering:
        options.numId != null
          ? {
              markerText: options.markerText ?? '',
              path: options.path ?? [],
              numberingType: options.numberingType,
            }
          : null,
    },
    nodeSize: Math.max(2, text.length + 2),
    isBlock: true,
    textContent: text,
  };
}

function makeDoc(children: MockNode[]) {
  return {
    content: {
      size: children.reduce((sum, child) => sum + child.nodeSize, 0),
    },
    descendants(callback: (node: MockNode, pos: number) => void) {
      let pos = 0;
      for (const child of children) {
        callback(child, pos);
        pos += child.nodeSize;
      }
      return undefined;
    },
  };
}

function makeEditor(children: MockNode[]): Editor {
  return {
    state: {
      doc: makeDoc(children),
    },
    converter: {
      numbering: { definitions: {}, abstracts: {} },
    },
  } as unknown as Editor;
}

describe('list-item-resolver', () => {
  it('lists paragraph-based list items with paragraph node ids', () => {
    const editor = makeEditor([
      makeParagraph({
        id: 'li-1',
        text: 'First',
        numId: 1,
        ilvl: 0,
        markerText: '1.',
        path: [1],
        numberingType: 'decimal',
      }),
      makeParagraph({
        id: 'li-2',
        text: 'Second',
        numId: 1,
        ilvl: 0,
        markerText: '2.',
        path: [2],
        numberingType: 'decimal',
      }),
      makeParagraph({ id: 'p-3', text: 'Plain paragraph' }),
    ]);

    const result = listListItems(editor);
    expect(result.total).toBe(2);
    expect(result.matches.map((match) => match.nodeId)).toEqual(['li-1', 'li-2']);
    expect(result.items[0]?.kind).toBe('ordered');
    expect(result.items[0]?.ordinal).toBe(1);
    expect(result.items[1]?.ordinal).toBe(2);
  });

  it('applies inclusive within scope when within itself is a list item', () => {
    const editor = makeEditor([
      makeParagraph({
        id: 'li-1',
        text: 'First',
        numId: 1,
        ilvl: 0,
        markerText: '1.',
        path: [1],
        numberingType: 'decimal',
      }),
      makeParagraph({
        id: 'li-2',
        text: 'Second',
        numId: 1,
        ilvl: 0,
        markerText: '2.',
        path: [2],
        numberingType: 'decimal',
      }),
    ]);

    const result = listListItems(editor, {
      within: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
    });

    expect(result.total).toBe(1);
    expect(result.matches[0]?.nodeId).toBe('li-1');
  });

  it('throws TARGET_NOT_FOUND when resolving a stale list address', () => {
    const editor = makeEditor([
      makeParagraph({ id: 'li-1', numId: 1, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    expect(() =>
      resolveListItem(editor, {
        kind: 'block',
        nodeType: 'listItem',
        nodeId: 'missing',
      }),
    ).toThrow('List item target was not found');
  });

  it('throws INVALID_TARGET for ambiguous list ids', () => {
    const editor = makeEditor([
      makeParagraph({ id: 'dup', numId: 1, markerText: '1.', path: [1], numberingType: 'decimal' }),
      makeParagraph({ id: 'dup', numId: 2, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    try {
      resolveListItem(editor, { kind: 'block', nodeType: 'listItem', nodeId: 'dup' });
      throw new Error('expected resolver to throw');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('INVALID_TARGET');
    }
  });
});
