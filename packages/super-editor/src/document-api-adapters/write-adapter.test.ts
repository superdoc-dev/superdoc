import { describe, expect, it, vi } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import { writeAdapter } from './write-adapter.js';
import * as trackedChangeResolver from './helpers/tracked-change-resolver.js';

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  return {
    type: { name: typeName },
    attrs,
    text: isText ? text : undefined,
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(text = 'Hello'): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  insertTrackedChange: ReturnType<typeof vi.fn>;
  textBetween: ReturnType<typeof vi.fn>;
  tr: {
    insertText: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
    addMark: ReturnType<typeof vi.fn>;
  };
} {
  const textNode = createNode('text', [], { text });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const tr = {
    insertText: vi.fn(),
    delete: vi.fn(),
    setMeta: vi.fn(),
    addMark: vi.fn(),
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);

  const dispatch = vi.fn();
  const insertTrackedChange = vi.fn(() => true);
  const textBetween = vi.fn((from: number, to: number) => {
    const start = Math.max(0, from - 1);
    const end = Math.max(start, to - 1);
    return text.slice(start, end);
  });

  const editor = {
    state: {
      doc: {
        ...doc,
        textBetween,
      },
      tr,
    },
    commands: {
      insertTrackedChange,
    },
    options: {
      user: { name: 'Test User' },
    },
    dispatch,
  } as unknown as Editor;

  return { editor, dispatch, insertTrackedChange, textBetween, tr };
}

function makeEditorWithDuplicateBlockIds(): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  tr: {
    insertText: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
    addMark: ReturnType<typeof vi.fn>;
  };
} {
  const firstTextNode = createNode('text', [], { text: 'Hello' });
  const secondTextNode = createNode('text', [], { text: 'World' });
  const firstParagraph = createNode('paragraph', [firstTextNode], {
    attrs: { sdBlockId: 'dup' },
    isBlock: true,
    inlineContent: true,
  });
  const secondParagraph = createNode('paragraph', [secondTextNode], {
    attrs: { sdBlockId: 'dup' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [firstParagraph, secondParagraph], { isBlock: false });

  const tr = {
    insertText: vi.fn(),
    delete: vi.fn(),
    setMeta: vi.fn(),
    addMark: vi.fn(),
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);

  const dispatch = vi.fn();

  const editor = {
    state: {
      doc: {
        ...doc,
        textBetween: vi.fn((from: number, to: number) => {
          const docText = 'Hello\nWorld';
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return docText.slice(start, end);
        }),
      },
      tr,
    },
    commands: {
      insertTrackedChange: vi.fn(() => true),
    },
    options: {
      user: { name: 'Test User' },
    },
    dispatch,
  } as unknown as Editor;

  return { editor, dispatch, tr };
}

function makeEditorWithoutEditableTextBlock(): {
  editor: Editor;
} {
  const table = createNode('table', [], {
    attrs: { sdBlockId: 't1' },
    isBlock: true,
    inlineContent: false,
  });
  const doc = createNode('doc', [table], { isBlock: false, inlineContent: false });

  const tr = {
    insertText: vi.fn(),
    delete: vi.fn(),
    setMeta: vi.fn(),
    addMark: vi.fn(),
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);

  const editor = {
    state: {
      doc: {
        ...doc,
        textBetween: vi.fn(() => ''),
      },
      tr,
    },
    commands: {
      insertTrackedChange: vi.fn(() => true),
    },
    dispatch: vi.fn(),
  } as unknown as Editor;

  return { editor };
}

function makeEditorWithBlankParagraph(): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  insertTrackedChange: ReturnType<typeof vi.fn>;
  tr: {
    insertText: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
    addMark: ReturnType<typeof vi.fn>;
  };
} {
  const paragraph = createNode('paragraph', [], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const tr = {
    insertText: vi.fn(),
    delete: vi.fn(),
    setMeta: vi.fn(),
    addMark: vi.fn(),
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);

  const dispatch = vi.fn();
  const insertTrackedChange = vi.fn(() => true);

  const editor = {
    state: {
      doc: {
        ...doc,
        textBetween: vi.fn(() => ''),
      },
      tr,
    },
    commands: {
      insertTrackedChange,
    },
    dispatch,
  } as unknown as Editor;

  return { editor, dispatch, insertTrackedChange, tr };
}

describe('writeAdapter', () => {
  it('applies direct replace mutations', () => {
    const { editor, dispatch, tr } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      range: { from: 1, to: 6 },
      text: 'Hello',
    });
    expect(tr.insertText).toHaveBeenCalledWith('World', 1, 6);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('sets skipTrackChanges metadata for direct writes to preserve direct mutation semantics', () => {
    const { editor, tr } = makeEditor('Hello');

    writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'direct' },
    );

    expect(tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
  });

  it('creates tracked changes for tracked writes', () => {
    const resolverSpy = vi
      .spyOn(trackedChangeResolver, 'toCanonicalTrackedChangeId')
      .mockReturnValue('resolved-change-id');
    const { editor, insertTrackedChange } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.inserted?.[0]?.entityType).toBe('trackedChange');
    expect(insertTrackedChange).toHaveBeenCalledTimes(1);
    expect(insertTrackedChange.mock.calls[0]?.[0]).toMatchObject({
      from: 1,
      to: 6,
      text: 'World',
    });
    expect(typeof insertTrackedChange.mock.calls[0]?.[0]?.id).toBe('string');
    resolverSpy.mockRestore();
  });

  it('returns canonical tracked-change entity ids when resolver can map raw ids', () => {
    const resolverSpy = vi
      .spyOn(trackedChangeResolver, 'toCanonicalTrackedChangeId')
      .mockReturnValue('stable-change-id');
    const { editor } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.inserted?.[0]?.entityId).toBe('stable-change-id');
    resolverSpy.mockRestore();
  });

  it('returns degraded success without inserted ref when canonical resolution fails', () => {
    const resolverSpy = vi.spyOn(trackedChangeResolver, 'toCanonicalTrackedChangeId').mockReturnValue(null);
    const { editor } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.inserted).toBeUndefined();
    resolverSpy.mockRestore();
  });

  it('returns failure when target cannot be resolved', () => {
    const { editor } = makeEditor('Hello');

    expect(() =>
      writeAdapter(
        editor,
        {
          kind: 'replace',
          target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 5 } },
          text: 'World',
        },
        { changeMode: 'direct' },
      ),
    ).toThrow('Mutation target could not be resolved.');
  });

  it('throws INVALID_TARGET when target block id is ambiguous across multiple text blocks', () => {
    const { editor, dispatch, tr } = makeEditorWithDuplicateBlockIds();

    try {
      writeAdapter(
        editor,
        {
          kind: 'replace',
          target: { kind: 'text', blockId: 'dup', range: { start: 0, end: 1 } },
          text: 'X',
        },
        { changeMode: 'direct' },
      );
      throw new Error('Expected writeAdapter to throw for ambiguous blockId target.');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('INVALID_TARGET');
    }

    expect(tr.insertText).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('requires collapsed targets for insert', () => {
    const { editor } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'insert',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'X',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('defaults insert-without-target to the first paragraph at offset 0', () => {
    const { editor, dispatch, tr } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'insert',
        text: 'X',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.resolution.target.range).toEqual({ start: 0, end: 0 });
    expect(receipt.resolution.range).toEqual({ from: 1, to: 1 });
    expect(tr.insertText).toHaveBeenCalledWith('X', 1, 1);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('supports insert-without-target for blank text blocks', () => {
    const { editor, dispatch, tr } = makeEditorWithBlankParagraph();

    const receipt = writeAdapter(
      editor,
      {
        kind: 'insert',
        text: 'X',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.resolution.target).toEqual({
      kind: 'text',
      blockId: 'p1',
      range: { start: 0, end: 0 },
    });
    expect(receipt.resolution.range).toEqual({ from: 1, to: 1 });
    expect(receipt.resolution.text).toBe('');
    expect(tr.insertText).toHaveBeenCalledWith('X', 1, 1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('supports tracked insert-without-target using the default insertion point', () => {
    const { editor, insertTrackedChange } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'insert',
        text: 'X',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(insertTrackedChange).toHaveBeenCalledTimes(1);
    expect(insertTrackedChange.mock.calls[0]?.[0]).toMatchObject({
      from: 1,
      to: 1,
      text: 'X',
    });
    expect(typeof insertTrackedChange.mock.calls[0]?.[0]?.id).toBe('string');
  });

  it('throws TARGET_NOT_FOUND for insert-without-target when no editable text block exists', () => {
    const { editor } = makeEditorWithoutEditableTextBlock();

    expect(() =>
      writeAdapter(
        editor,
        {
          kind: 'insert',
          text: 'X',
        },
        { changeMode: 'direct' },
      ),
    ).toThrow('Mutation target could not be resolved.');
  });

  it('throws CAPABILITY_UNAVAILABLE when tracked writes are unavailable', () => {
    const { editor } = makeEditor('Hello');
    (editor.commands as { insertTrackedChange?: unknown }).insertTrackedChange = undefined;

    expect(() =>
      writeAdapter(
        editor,
        {
          kind: 'replace',
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          text: 'World',
        },
        { changeMode: 'tracked' },
      ),
    ).toThrow('requires the insertTrackedChange command');
  });

  it('throws CAPABILITY_UNAVAILABLE when tracked dry-run capability is unavailable', () => {
    const { editor } = makeEditor('Hello');
    (editor.commands as { insertTrackedChange?: unknown }).insertTrackedChange = undefined;

    expect(() =>
      writeAdapter(
        editor,
        {
          kind: 'replace',
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          text: 'World',
        },
        { changeMode: 'tracked', dryRun: true },
      ),
    ).toThrow('requires the insertTrackedChange command');
  });

  it('throws CAPABILITY_UNAVAILABLE for tracked write without a configured user', () => {
    const { editor } = makeEditor('Hello');
    (editor as { options: { user?: unknown } }).options.user = undefined;

    expect(() =>
      writeAdapter(
        editor,
        {
          kind: 'replace',
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          text: 'World',
        },
        { changeMode: 'tracked' },
      ),
    ).toThrow('requires a user to be configured');
  });

  it('returns explicit NO_OP when replacement text is unchanged', () => {
    const { editor, textBetween } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'Hello',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'NO_OP',
    });
    expect(textBetween).toHaveBeenCalledWith(1, 6, '\n', '\ufffc');
  });

  it('returns INVALID_TARGET for replace with empty text', () => {
    const { editor } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: '',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('applies the same NO_OP rule for tracked replace as direct replace', () => {
    const { editor, insertTrackedChange } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'Hello',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'NO_OP',
    });
    expect(insertTrackedChange).not.toHaveBeenCalled();
  });

  it('returns NO_OP when tracked write command does not apply', () => {
    const { editor } = makeEditor('Hello');
    (editor.commands as { insertTrackedChange?: ReturnType<typeof vi.fn> }).insertTrackedChange = vi.fn(() => false);

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({
      code: 'NO_OP',
    });
  });

  it('supports direct dry-run without mutating editor state', () => {
    const { editor, dispatch, tr } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'direct', dryRun: true },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      range: { from: 1, to: 6 },
      text: 'Hello',
    });
    expect(tr.insertText).not.toHaveBeenCalled();
    expect(tr.delete).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports tracked dry-run without applying tracked changes', () => {
    const { editor, insertTrackedChange, dispatch } = makeEditor('Hello');

    const receipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'tracked', dryRun: true },
    );

    expect(receipt.success).toBe(true);
    expect(receipt.resolution.range).toEqual({ from: 1, to: 6 });
    expect(insertTrackedChange).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps direct and tracked writes deterministic on the same target window', () => {
    const { editor, insertTrackedChange } = makeEditor('Hello');

    const directReceipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'World',
      },
      { changeMode: 'direct' },
    );
    expect(directReceipt.success).toBe(true);

    const trackedReceipt = writeAdapter(
      editor,
      {
        kind: 'replace',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'Again',
      },
      { changeMode: 'tracked' },
    );
    expect(trackedReceipt.success).toBe(true);
    expect(insertTrackedChange).toHaveBeenCalledTimes(1);
  });
});
