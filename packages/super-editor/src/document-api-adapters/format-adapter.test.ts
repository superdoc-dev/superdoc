import { describe, expect, it, vi } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import {
  formatBoldAdapter,
  formatItalicAdapter,
  formatUnderlineAdapter,
  formatStrikethroughAdapter,
} from './format-adapter.js';

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

function makeEditor(
  text = 'Hello',
  options: { user?: { name: string } } = {},
): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  insertTrackedChange: ReturnType<typeof vi.fn>;
  textBetween: ReturnType<typeof vi.fn>;
  tr: {
    addMark: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
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
    addMark: vi.fn(),
    setMeta: vi.fn(),
  };
  tr.addMark.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);

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
    schema: {
      marks: {
        bold: {
          create: vi.fn(() => ({ type: 'bold' })),
        },
        italic: {
          create: vi.fn(() => ({ type: 'italic' })),
        },
        underline: {
          create: vi.fn(() => ({ type: 'underline' })),
        },
        strike: {
          create: vi.fn(() => ({ type: 'strike' })),
        },
        [TrackFormatMarkName]: {
          create: vi.fn(() => ({ type: TrackFormatMarkName })),
        },
      },
    },
    commands: {
      insertTrackedChange,
    },
    options: { user: options.user },
    dispatch,
  } as unknown as Editor;

  return { editor, dispatch, insertTrackedChange, textBetween, tr };
}

const TARGET = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 5 } };
const COLLAPSED_TARGET = { kind: 'text' as const, blockId: 'p1', range: { start: 2, end: 2 } };
const MISSING_TARGET = { kind: 'text' as const, blockId: 'missing', range: { start: 0, end: 5 } };

describe('formatBoldAdapter', () => {
  it('applies direct bold formatting', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({
      target: TARGET,
      range: { from: 1, to: 6 },
      text: 'Hello',
    });
    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('sets skipTrackChanges meta in direct mode to preserve operation-scoped semantics', () => {
    const { editor, tr } = makeEditor();
    const receipt = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
    expect(tr.setMeta).not.toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('sets forceTrackChanges meta in tracked mode', () => {
    const { editor, tr } = makeEditor('Hello', { user: { name: 'Test' } });
    const receipt = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked' });

    expect(receipt.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('throws when target cannot be resolved', () => {
    const { editor } = makeEditor();
    expect(() => formatBoldAdapter(editor, { target: MISSING_TARGET }, { changeMode: 'direct' })).toThrow(
      'Format target could not be resolved.',
    );
  });

  it('returns INVALID_TARGET for collapsed target ranges', () => {
    const { editor } = makeEditor();
    const receipt = formatBoldAdapter(editor, { target: COLLAPSED_TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'INVALID_TARGET' });
    expect(receipt.resolution.range).toEqual({ from: 3, to: 3 });
  });

  it('throws when bold mark is unavailable', () => {
    const { editor } = makeEditor();
    delete (editor.schema?.marks as Record<string, unknown>)?.bold;

    expect(() => formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'direct' })).toThrow(
      'requires the "bold" mark',
    );
  });

  it('throws when tracked format capability is unavailable', () => {
    const { editor } = makeEditor();
    delete (editor.commands as Record<string, unknown>)?.insertTrackedChange;

    expect(() => formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked' })).toThrow(
      'requires the insertTrackedChange command',
    );
  });

  it('supports direct dry-run without building a transaction', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'direct', dryRun: true });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution.range).toEqual({ from: 1, to: 6 });
    expect(tr.addMark).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports tracked dry-run without building a transaction', () => {
    const { editor, dispatch, tr } = makeEditor('Hello', { user: { name: 'Test' } });
    const receipt = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked', dryRun: true });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution.range).toEqual({ from: 1, to: 6 });
    expect(tr.addMark).not.toHaveBeenCalled();
    expect(tr.setMeta).not.toHaveBeenCalledWith('forceTrackChanges', true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps direct and tracked bold operations deterministic for the same target', () => {
    const { editor, tr } = makeEditor('Hello', { user: { name: 'Test' } });

    const direct = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'direct' });
    expect(direct.success).toBe(true);

    const tracked = formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked' });
    expect(tracked.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('throws CAPABILITY_UNAVAILABLE for tracked dry-run without a configured user', () => {
    const { editor } = makeEditor();

    expect(() => formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked', dryRun: true })).toThrow(
      'requires a user to be configured',
    );
  });

  it('throws same error for tracked non-dry-run without a configured user', () => {
    const { editor } = makeEditor();

    expect(() => formatBoldAdapter(editor, { target: TARGET }, { changeMode: 'tracked' })).toThrow(
      'requires a user to be configured',
    );
  });
});

describe('formatItalicAdapter', () => {
  it('applies direct italic formatting', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatItalicAdapter(editor, { target: TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({ target: TARGET, range: { from: 1, to: 6 }, text: 'Hello' });
    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('returns INVALID_TARGET for collapsed target ranges', () => {
    const { editor } = makeEditor();
    const receipt = formatItalicAdapter(editor, { target: COLLAPSED_TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'INVALID_TARGET' });
  });

  it('throws when italic mark is unavailable', () => {
    const { editor } = makeEditor();
    delete (editor.schema?.marks as Record<string, unknown>)?.italic;

    expect(() => formatItalicAdapter(editor, { target: TARGET }, { changeMode: 'direct' })).toThrow(
      'requires the "italic" mark',
    );
  });

  it('supports dry-run without building a transaction', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatItalicAdapter(editor, { target: TARGET }, { changeMode: 'direct', dryRun: true });

    expect(receipt.success).toBe(true);
    expect(tr.addMark).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports tracked mode', () => {
    const { editor, tr } = makeEditor('Hello', { user: { name: 'Test' } });
    const receipt = formatItalicAdapter(editor, { target: TARGET }, { changeMode: 'tracked' });

    expect(receipt.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });
});

describe('formatUnderlineAdapter', () => {
  it('applies direct underline formatting', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatUnderlineAdapter(editor, { target: TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({ target: TARGET, range: { from: 1, to: 6 }, text: 'Hello' });
    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('returns INVALID_TARGET for collapsed target ranges', () => {
    const { editor } = makeEditor();
    const receipt = formatUnderlineAdapter(editor, { target: COLLAPSED_TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'INVALID_TARGET' });
  });

  it('throws when underline mark is unavailable', () => {
    const { editor } = makeEditor();
    delete (editor.schema?.marks as Record<string, unknown>)?.underline;

    expect(() => formatUnderlineAdapter(editor, { target: TARGET }, { changeMode: 'direct' })).toThrow(
      'requires the "underline" mark',
    );
  });

  it('supports dry-run without building a transaction', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatUnderlineAdapter(editor, { target: TARGET }, { changeMode: 'direct', dryRun: true });

    expect(receipt.success).toBe(true);
    expect(tr.addMark).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports tracked mode', () => {
    const { editor, tr } = makeEditor('Hello', { user: { name: 'Test' } });
    const receipt = formatUnderlineAdapter(editor, { target: TARGET }, { changeMode: 'tracked' });

    expect(receipt.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });
});

describe('formatStrikethroughAdapter', () => {
  it('applies direct strikethrough formatting using the "strike" mark', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatStrikethroughAdapter(editor, { target: TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(true);
    expect(receipt.resolution).toMatchObject({ target: TARGET, range: { from: 1, to: 6 }, text: 'Hello' });
    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('returns INVALID_TARGET for collapsed target ranges', () => {
    const { editor } = makeEditor();
    const receipt = formatStrikethroughAdapter(editor, { target: COLLAPSED_TARGET }, { changeMode: 'direct' });

    expect(receipt.success).toBe(false);
    expect(receipt.failure).toMatchObject({ code: 'INVALID_TARGET' });
  });

  it('throws when strike mark is unavailable', () => {
    const { editor } = makeEditor();
    delete (editor.schema?.marks as Record<string, unknown>)?.strike;

    expect(() => formatStrikethroughAdapter(editor, { target: TARGET }, { changeMode: 'direct' })).toThrow(
      'requires the "strike" mark',
    );
  });

  it('supports dry-run without building a transaction', () => {
    const { editor, dispatch, tr } = makeEditor();
    const receipt = formatStrikethroughAdapter(editor, { target: TARGET }, { changeMode: 'direct', dryRun: true });

    expect(receipt.success).toBe(true);
    expect(tr.addMark).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports tracked mode', () => {
    const { editor, tr } = makeEditor('Hello', { user: { name: 'Test' } });
    const receipt = formatStrikethroughAdapter(editor, { target: TARGET }, { changeMode: 'tracked' });

    expect(receipt.success).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });
});
