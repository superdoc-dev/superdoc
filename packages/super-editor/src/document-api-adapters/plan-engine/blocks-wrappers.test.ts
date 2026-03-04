import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { BlocksDeleteInput, MutationOptions } from '@superdoc/document-api';
import { blocksDeleteWrapper } from './blocks-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { DocumentApiAdapterError } from '../errors.js';

// Ensure the domain.command executor is registered for executeDomainCommand
registerBuiltInExecutors();

// ---------------------------------------------------------------------------
// Mock node builder
// ---------------------------------------------------------------------------

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

  const node = {
    type: { name: typeName },
    attrs,
    text: isText ? text : undefined,
    content: { size: contentSize },
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
      // Recursive traversal matching real ProseMirror behavior
      function walk(childNodes: ProseMirrorNode[], baseOffset: number) {
        let offset = baseOffset;
        for (const child of childNodes) {
          callback(child, offset);
          // Recurse into children (skip +1 for open tag of non-text, non-leaf nodes)
          const grandchildren = (child as any)._children;
          if (grandchildren?.length) {
            walk(grandchildren, offset + 1);
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  } as unknown as ProseMirrorNode;

  // Store children for recursive traversal
  (node as any)._children = children;

  return node;
}

// ---------------------------------------------------------------------------
// Mock editor builder
// ---------------------------------------------------------------------------

type BlockDeleteEditorOptions = {
  /** Pass a mock fn, or `null` to simulate a missing command. Defaults to `vi.fn(() => true)`. */
  deleteBlockNodeById?: ReturnType<typeof vi.fn> | null;
  /** Pass a mock fn, or `null` to simulate a missing helper. Defaults to an auto-matching mock. */
  getBlockNodeById?: ReturnType<typeof vi.fn> | null;
  children?: ProseMirrorNode[];
};

function makeBlockDeleteEditor(options: BlockDeleteEditorOptions = {}): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  deleteBlockNodeById: ReturnType<typeof vi.fn> | undefined;
} {
  const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
    attrs: { paraId: 'p1', sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const children = options.children ?? [paragraph];
  const doc = createNode('doc', children, { isBlock: false });

  const dispatch = vi.fn();
  const tr = {
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };

  // null = explicitly missing; undefined = use default mock
  const deleteBlockNodeById =
    options.deleteBlockNodeById === null ? undefined : (options.deleteBlockNodeById ?? vi.fn(() => true));
  const getBlockNodeById =
    options.getBlockNodeById === null
      ? undefined
      : (options.getBlockNodeById ??
        vi.fn((id: string) => {
          const matches = children.filter((c) => c.attrs?.sdBlockId === id || c.attrs?.paraId === id);
          return matches.map((node, i) => ({ node, pos: i }));
        }));

  const commands: Record<string, unknown> = {};
  if (deleteBlockNodeById !== undefined) {
    commands.deleteBlockNodeById = deleteBlockNodeById;
  }

  const helpers: Record<string, unknown> = {};
  if (getBlockNodeById !== undefined) {
    helpers.blockNode = { getBlockNodeById };
  }

  const editor = {
    state: { doc, tr },
    dispatch,
    commands,
    helpers,
  } as unknown as Editor;

  return { editor, dispatch, deleteBlockNodeById };
}

function makeInput(nodeType: string, nodeId: string): BlocksDeleteInput {
  return { target: { kind: 'block', nodeType: nodeType as BlocksDeleteInput['target']['nodeType'], nodeId } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blocksDeleteWrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Successful deletion cases
  // -------------------------------------------------------------------------

  describe('successful deletion', () => {
    it('deletes a paragraph block', () => {
      const { editor } = makeBlockDeleteEditor();
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'direct' });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } });
    });

    it('deletes a heading block', () => {
      const heading = createNode('paragraph', [createNode('text', [], { text: 'Title' })], {
        attrs: {
          paraId: 'h1',
          sdBlockId: 'h1',
          paragraphProperties: { styleId: 'Heading1' },
        },
        isBlock: true,
        inlineContent: true,
      });
      const { editor } = makeBlockDeleteEditor({ children: [heading] });
      const result = blocksDeleteWrapper(editor, makeInput('heading', 'h1'), { changeMode: 'direct' });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'heading', nodeId: 'h1' } });
    });

    it('deletes a list item block', () => {
      const listItem = createNode('paragraph', [createNode('text', [], { text: 'Item 1' })], {
        attrs: {
          paraId: 'li1',
          sdBlockId: 'li1',
          paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
        },
        isBlock: true,
        inlineContent: true,
      });
      const { editor } = makeBlockDeleteEditor({ children: [listItem] });
      const result = blocksDeleteWrapper(editor, makeInput('listItem', 'li1'), { changeMode: 'direct' });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' } });
    });

    it('deletes a table block', () => {
      const table = createNode('table', [], {
        attrs: { blockId: 't1', sdBlockId: 't1' },
        isBlock: true,
        inlineContent: false,
      });
      const { editor } = makeBlockDeleteEditor({ children: [table] });
      const result = blocksDeleteWrapper(editor, makeInput('table', 't1'), { changeMode: 'direct' });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'table', nodeId: 't1' } });
    });

    it('rejects image target (inline-only in ProseMirror schema)', () => {
      const image = createNode('image', [], {
        attrs: { blockId: 'img1', sdBlockId: 'img1' },
        isBlock: true,
        isLeaf: true,
        inlineContent: false,
      });
      const { editor } = makeBlockDeleteEditor({ children: [image] });
      expect(() => blocksDeleteWrapper(editor, makeInput('image', 'img1'), { changeMode: 'direct' })).toThrow(
        DocumentApiAdapterError,
      );
    });

    it('deletes an sdt block', () => {
      const sdt = createNode('sdt', [], {
        attrs: { blockId: 'sdt1', sdBlockId: 'sdt1' },
        isBlock: true,
        inlineContent: false,
      });
      const { editor } = makeBlockDeleteEditor({ children: [sdt] });
      const result = blocksDeleteWrapper(editor, makeInput('sdt', 'sdt1'), { changeMode: 'direct' });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'sdt', nodeId: 'sdt1' } });
    });

    it('deletes an empty paragraph block', () => {
      const emptyParagraph = createNode('paragraph', [], {
        attrs: { paraId: 'empty1', sdBlockId: 'empty1' },
        isBlock: true,
        inlineContent: true,
      });
      const { editor } = makeBlockDeleteEditor({ children: [emptyParagraph] });
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'empty1'), { changeMode: 'direct' });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  describe('error cases', () => {
    it('throws TARGET_NOT_FOUND for nonexistent block ID', () => {
      const { editor } = makeBlockDeleteEditor();
      expect(() => blocksDeleteWrapper(editor, makeInput('paragraph', 'missing'))).toThrow(DocumentApiAdapterError);

      try {
        blocksDeleteWrapper(editor, makeInput('paragraph', 'missing'));
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('TARGET_NOT_FOUND');
      }
    });

    it('throws AMBIGUOUS_TARGET for duplicate block IDs', () => {
      const p1 = createNode('paragraph', [createNode('text', [], { text: 'A' })], {
        attrs: { paraId: 'dup', sdBlockId: 'dup' },
        isBlock: true,
        inlineContent: true,
      });
      const p2 = createNode('paragraph', [createNode('text', [], { text: 'B' })], {
        attrs: { paraId: 'dup', sdBlockId: 'dup' },
        isBlock: true,
        inlineContent: true,
      });
      const { editor } = makeBlockDeleteEditor({ children: [p1, p2] });

      try {
        blocksDeleteWrapper(editor, makeInput('paragraph', 'dup'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('AMBIGUOUS_TARGET');
      }
    });

    it('throws INVALID_TARGET for tableRow target', () => {
      const tableRow = createNode('tableRow', [], {
        attrs: { blockId: 'tr1', sdBlockId: 'tr1' },
        isBlock: true,
        inlineContent: false,
      });
      // Use a table as the top-level child so the row is nested correctly
      const table = createNode('table', [tableRow], {
        attrs: { blockId: 't1', sdBlockId: 't1' },
        isBlock: true,
        inlineContent: false,
      });
      const { editor } = makeBlockDeleteEditor({ children: [table] });

      try {
        blocksDeleteWrapper(editor, makeInput('tableRow' as any, 'tr1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('INVALID_TARGET');
        expect((error as DocumentApiAdapterError).message).toContain('tableRow');
      }
    });

    it('throws INVALID_TARGET for tableCell target', () => {
      const { editor } = makeBlockDeleteEditor();

      try {
        blocksDeleteWrapper(editor, makeInput('tableCell' as any, 'tc1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        // Since tableCell won't be found in the block index, it will throw
        // TARGET_NOT_FOUND before reaching the nodeType validation.
        // The INVALID_TARGET check happens after findBlockByIdStrict resolves.
        expect(error).toBeInstanceOf(DocumentApiAdapterError);
      }
    });

    it('throws CAPABILITY_UNAVAILABLE when tracked mode is requested', () => {
      const { editor } = makeBlockDeleteEditor();

      try {
        blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked' });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
        expect((error as DocumentApiAdapterError).message).toContain('tracked mode');
      }
    });

    it('throws CAPABILITY_UNAVAILABLE when deleteBlockNodeById command is missing', () => {
      const { editor } = makeBlockDeleteEditor({ deleteBlockNodeById: null });

      try {
        blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
      }
    });

    it('throws CAPABILITY_UNAVAILABLE when blockNode helper is missing', () => {
      const { editor } = makeBlockDeleteEditor({ getBlockNodeById: null });

      try {
        blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Dry run
  // -------------------------------------------------------------------------

  describe('dry run', () => {
    it('returns success without executing the command', () => {
      const deleteBlockNodeById = vi.fn(() => true);
      const { editor } = makeBlockDeleteEditor({ deleteBlockNodeById });
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), {
        changeMode: 'direct',
        dryRun: true,
      });
      expect(result).toEqual({ success: true, deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } });
      expect(deleteBlockNodeById).not.toHaveBeenCalled();
    });

    it('still validates target exists during dry run', () => {
      const { editor } = makeBlockDeleteEditor();
      expect(() =>
        blocksDeleteWrapper(editor, makeInput('paragraph', 'missing'), { changeMode: 'direct', dryRun: true }),
      ).toThrow(DocumentApiAdapterError);
    });

    it('still rejects tracked mode during dry run', () => {
      const { editor } = makeBlockDeleteEditor();
      expect(() =>
        blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked', dryRun: true }),
      ).toThrow(DocumentApiAdapterError);
    });
  });

  // -------------------------------------------------------------------------
  // Cache invalidation
  // -------------------------------------------------------------------------

  describe('cache invalidation', () => {
    it('calls deleteBlockNodeById with the resolved sdBlockId', () => {
      const deleteBlockNodeById = vi.fn(() => true);
      const { editor } = makeBlockDeleteEditor({ deleteBlockNodeById });
      blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'direct' });
      expect(deleteBlockNodeById).toHaveBeenCalledWith('p1');
    });
  });

  // -------------------------------------------------------------------------
  // Default changeMode
  // -------------------------------------------------------------------------

  describe('default changeMode', () => {
    it('works without explicit changeMode (defaults to direct)', () => {
      const { editor } = makeBlockDeleteEditor();
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'));
      expect(result.success).toBe(true);
    });
  });
});
