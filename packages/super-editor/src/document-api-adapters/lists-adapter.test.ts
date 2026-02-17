import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../core/Editor.js';
import {
  listsExitAdapter,
  listsIndentAdapter,
  listsInsertAdapter,
  listsListAdapter,
  listsOutdentAdapter,
  listsRestartAdapter,
  listsSetTypeAdapter,
} from './lists-adapter.js';
import { ListHelpers } from '../core/helpers/list-numbering-helpers.js';

type MockTextNode = {
  type: { name: 'text' };
  marks?: Array<{ type: { name: string }; attrs?: Record<string, unknown> }>;
};

type MockParagraphNode = {
  type: { name: 'paragraph' };
  attrs: Record<string, unknown>;
  nodeSize: number;
  isBlock: true;
  textContent: string;
  _textNode?: MockTextNode;
};

function makeListParagraph(options: {
  id: string;
  text?: string;
  numId?: number;
  ilvl?: number;
  markerText?: string;
  path?: number[];
  numberingType?: string;
  sdBlockId?: string;
  trackedMarkId?: string;
}): MockParagraphNode {
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
      sdBlockId: options.sdBlockId ?? options.id,
      paragraphProperties: numberingProperties ? { numberingProperties } : {},
      listRendering:
        options.numId != null
          ? {
              markerText: options.markerText ?? '',
              path: options.path ?? [],
              numberingType: options.numberingType ?? 'decimal',
            }
          : null,
    },
    nodeSize: Math.max(2, text.length + 2),
    isBlock: true,
    textContent: text,
    _textNode:
      options.trackedMarkId != null
        ? {
            type: { name: 'text' },
            marks: [{ type: { name: 'trackInsert' }, attrs: { id: options.trackedMarkId } }],
          }
        : undefined,
  };
}

function makeDoc(children: MockParagraphNode[]) {
  return {
    get content() {
      return {
        size: children.reduce((sum, child) => sum + child.nodeSize, 0),
      };
    },
    nodeAt(pos: number) {
      let cursor = 0;
      for (const child of children) {
        if (cursor === pos) return child;
        cursor += child.nodeSize;
      }
      return null;
    },
    descendants(callback: (node: MockParagraphNode, pos: number) => void) {
      let pos = 0;
      for (const child of children) {
        callback(child, pos);
        pos += child.nodeSize;
      }
      return undefined;
    },
    nodesBetween(from: number, to: number, callback: (node: unknown) => void) {
      let pos = 0;
      for (const child of children) {
        const end = pos + child.nodeSize;
        if (end < from || pos > to) {
          pos = end;
          continue;
        }
        callback(child);
        if (child._textNode) callback(child._textNode);
        pos = end;
      }
      return undefined;
    },
  };
}

function makeEditor(
  children: MockParagraphNode[],
  commandOverrides: Record<string, unknown> = {},
  editorOptions: { user?: { name: string } } = {},
): Editor {
  const doc = makeDoc(children);
  const baseCommands = {
    insertListItemAt: vi.fn(
      (options: {
        pos: number;
        position: 'before' | 'after';
        sdBlockId?: string;
        text?: string;
        tracked?: boolean;
      }) => {
        const insertionId = options.sdBlockId ?? `inserted-${Date.now()}`;
        let targetIndex = -1;
        let cursor = 0;
        for (let i = 0; i < children.length; i += 1) {
          if (cursor === options.pos) {
            targetIndex = i;
            break;
          }
          cursor += children[i]!.nodeSize;
        }
        if (targetIndex < 0) return false;

        const target = children[targetIndex]!;
        const numbering = (
          target.attrs.paragraphProperties as { numberingProperties?: { numId?: number; ilvl?: number } }
        )?.numberingProperties;
        if (!numbering) return false;

        const inserted = makeListParagraph({
          id: insertionId,
          sdBlockId: insertionId,
          text: options.text ?? '',
          numId: numbering.numId,
          ilvl: numbering.ilvl,
          markerText: '',
          path: [1],
          numberingType: target.attrs?.listRendering?.numberingType as string | undefined,
          trackedMarkId: options.tracked ? `tc-${insertionId}` : undefined,
        });
        const at = options.position === 'before' ? targetIndex : targetIndex + 1;
        children.splice(at, 0, inserted);
        return true;
      },
    ),
    setListTypeAt: vi.fn(() => true),
    setTextSelection: vi.fn(() => true),
    increaseListIndent: vi.fn(() => true),
    decreaseListIndent: vi.fn(() => true),
    restartNumbering: vi.fn(() => true),
    exitListItemAt: vi.fn(() => true),
    insertTrackedChange: vi.fn(() => true),
  };

  return {
    state: {
      doc,
    },
    commands: {
      ...baseCommands,
      ...commandOverrides,
    },
    options: { user: editorOptions.user },
    converter: {
      numbering: { definitions: {}, abstracts: {} },
    },
  } as unknown as Editor;
}

describe('lists adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists projected list items', () => {
    const editor = makeEditor([
      makeListParagraph({
        id: 'li-1',
        text: 'One',
        numId: 1,
        ilvl: 0,
        markerText: '1.',
        path: [1],
        numberingType: 'decimal',
      }),
      makeListParagraph({
        id: 'li-2',
        text: 'Two',
        numId: 1,
        ilvl: 0,
        markerText: '2.',
        path: [2],
        numberingType: 'decimal',
      }),
    ]);

    const result = listsListAdapter(editor);
    expect(result.total).toBe(2);
    expect(result.matches.map((match) => match.nodeId)).toEqual(['li-1', 'li-2']);
  });

  it('inserts a list item with deterministic insertionPoint at offset 0', () => {
    const editor = makeEditor([
      makeListParagraph({
        id: 'li-1',
        text: 'One',
        numId: 1,
        ilvl: 0,
        markerText: '1.',
        path: [1],
        numberingType: 'decimal',
      }),
    ]);

    const result = listsInsertAdapter(
      editor,
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        position: 'after',
        text: 'Inserted',
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.insertionPoint.range).toEqual({ start: 0, end: 0 });
  });

  it('throws CAPABILITY_UNAVAILABLE for direct-only tracked requests', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    expect(() =>
      listsSetTypeAdapter(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          kind: 'bullet',
        },
        { changeMode: 'tracked' },
      ),
    ).toThrow('does not support tracked mode');
  });

  it('returns NO_OP when setType already matches requested kind', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'bullet' }),
    ]);

    const result = listsSetTypeAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      kind: 'bullet',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('NO_OP');
  });

  it('returns NO_OP for outdent at level 0', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    const result = listsOutdentAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('NO_OP');
  });

  it('returns NO_OP for indent when list definition does not support next level', () => {
    const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(false);
    const editor = makeEditor([
      makeListParagraph({
        id: 'li-1',
        numId: 1,
        ilvl: 2,
        markerText: 'iii.',
        path: [1, 1, 3],
        numberingType: 'lowerRoman',
      }),
    ]);

    const result = listsIndentAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('NO_OP');
    expect(hasDefinitionSpy).toHaveBeenCalled();
  });

  it('returns NO_OP for restart when target is already effective start at 1 and run start', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    const result = listsRestartAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('NO_OP');
  });

  it('returns NO_OP for restart when a level-1 item starts after a level-0 item with same numId', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
      makeListParagraph({
        id: 'li-2',
        numId: 1,
        ilvl: 1,
        markerText: 'a.',
        path: [1, 1],
        numberingType: 'lowerLetter',
      }),
    ]);
    const restartNumbering = editor.commands!.restartNumbering as ReturnType<typeof vi.fn>;

    const result = listsRestartAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('NO_OP');
    expect(restartNumbering).not.toHaveBeenCalled();
  });

  it('throws TARGET_NOT_FOUND for stale list targets', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    expect(() =>
      listsExitAdapter(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'missing' },
      }),
    ).toThrow('List item target was not found');
  });

  it('maps explicit non-applied exit command to INVALID_TARGET', () => {
    const editor = makeEditor(
      [makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' })],
      { exitListItemAt: vi.fn(() => false) },
    );

    const result = listsExitAdapter(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.code).toBe('INVALID_TARGET');
  });

  describe('dryRun', () => {
    function makeListEditor() {
      return makeEditor([
        makeListParagraph({
          id: 'li-1',
          text: 'One',
          numId: 1,
          ilvl: 1,
          markerText: '1.',
          path: [1],
          numberingType: 'decimal',
        }),
        makeListParagraph({
          id: 'li-2',
          text: 'Two',
          numId: 1,
          ilvl: 1,
          markerText: '2.',
          path: [2],
          numberingType: 'decimal',
        }),
      ]);
    }

    it('insert: returns placeholder success without mutating the document', () => {
      const editor = makeListEditor();
      const insertListItemAt = editor.commands!.insertListItemAt as ReturnType<typeof vi.fn>;

      const result = listsInsertAdapter(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          position: 'after',
        },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(insertListItemAt).not.toHaveBeenCalled();
    });

    it('setType: returns success without dispatching command', () => {
      const editor = makeListEditor();
      const setListTypeAt = editor.commands!.setListTypeAt as ReturnType<typeof vi.fn>;

      const result = listsSetTypeAdapter(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          kind: 'bullet',
        },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(setListTypeAt).not.toHaveBeenCalled();
    });

    it('indent: returns success without dispatching command', () => {
      vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor();
      const increaseListIndent = editor.commands!.increaseListIndent as ReturnType<typeof vi.fn>;

      const result = listsIndentAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(increaseListIndent).not.toHaveBeenCalled();
    });

    it('outdent: returns success without dispatching command', () => {
      const editor = makeListEditor();
      const decreaseListIndent = editor.commands!.decreaseListIndent as ReturnType<typeof vi.fn>;

      const result = listsOutdentAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(decreaseListIndent).not.toHaveBeenCalled();
    });

    it('restart: returns success without dispatching command', () => {
      const editor = makeListEditor();
      const restartNumbering = editor.commands!.restartNumbering as ReturnType<typeof vi.fn>;

      const result = listsRestartAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' } },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(restartNumbering).not.toHaveBeenCalled();
    });

    it('exit: returns placeholder success without dispatching command', () => {
      const editor = makeListEditor();
      const exitListItemAt = editor.commands!.exitListItemAt as ReturnType<typeof vi.fn>;

      const result = listsExitAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.paragraph.nodeId).toBe('(dry-run)');
      expect(exitListItemAt).not.toHaveBeenCalled();
    });
  });

  it('throws CAPABILITY_UNAVAILABLE for tracked insert dry-run without a configured user', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    expect(() =>
      listsInsertAdapter(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          position: 'after',
        },
        { changeMode: 'tracked', dryRun: true },
      ),
    ).toThrow('requires a user to be configured');
  });

  it('returns TARGET_NOT_FOUND failure when post-apply list item resolution fails', () => {
    const children = [
      makeListParagraph({
        id: 'li-1',
        text: 'One',
        numId: 1,
        ilvl: 0,
        markerText: '1.',
        path: [1],
        numberingType: 'decimal',
      }),
    ];

    // Custom insertListItemAt that returns true but inserts a node with a
    // different sdBlockId/paraId than what was requested, making it
    // unresolvable by resolveInsertedListItem.
    const insertListItemAt = vi.fn((options: { pos: number; position: 'before' | 'after'; sdBlockId?: string }) => {
      const inserted = makeListParagraph({
        id: 'unrelated-id',
        sdBlockId: 'unrelated-sdBlockId',
        numId: 1,
        ilvl: 0,
        markerText: '',
        path: [1],
        numberingType: 'decimal',
      });
      const at = options.position === 'before' ? 0 : 1;
      children.splice(at, 0, inserted);
      return true;
    });

    const editor = makeEditor(children, { insertListItemAt });

    const result = listsInsertAdapter(
      editor,
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        position: 'after',
      },
      { changeMode: 'direct' },
    );

    // Contract: success:false means no mutation was applied.
    // The mutation DID apply, so we must return success with the generated ID.
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.item.nodeType).toBe('listItem');
    expect(typeof result.item.nodeId).toBe('string');
    expect(result.item.nodeId).not.toBe('(dry-run)');
  });

  it('throws same error for tracked insert non-dry-run without a configured user', () => {
    const editor = makeEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, markerText: '1.', path: [1], numberingType: 'decimal' }),
    ]);

    expect(() =>
      listsInsertAdapter(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          position: 'after',
        },
        { changeMode: 'tracked' },
      ),
    ).toThrow('requires a user to be configured');
  });
});
