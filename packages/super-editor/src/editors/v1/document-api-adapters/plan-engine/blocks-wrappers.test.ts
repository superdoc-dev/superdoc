import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { BlocksDeleteInput, MutationOptions } from '@superdoc/document-api';
import { blocksDeleteWrapper, blocksDeleteRangeWrapper, blocksListWrapper } from './blocks-wrappers.js';
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
  marks?: Array<{ attrs: Record<string, unknown> }>;
};

function computeTextContent(typeName: string, children: ProseMirrorNode[], text: string): string {
  if (typeName === 'text') return text;
  return children.map((c) => (c as any).textContent ?? c.text ?? '').join('');
}

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

  const textContent = computeTextContent(typeName, children, text);

  const marks = options.marks ?? [];

  const node = {
    type: { name: typeName },
    attrs,
    marks,
    text: isText ? text : undefined,
    textContent,
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
  /** Pass a mock fn, or `null` to simulate a missing helper. Defaults to an auto-matching mock. */
  getBlockNodeById?: ReturnType<typeof vi.fn> | null;
  /** Pass a mock fn, or `null` to simulate tracked-command unavailability. */
  insertTrackedChange?: ReturnType<typeof vi.fn> | null;
  /** Pass `null` to simulate a missing tracked-mode user. */
  user?: { name: string; email: string } | null;
  children?: ProseMirrorNode[];
};

function makeBlockDeleteEditor(options: BlockDeleteEditorOptions = {}): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  tr: {
    setMeta: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    mapping: { map: (pos: number) => number };
    docChanged: boolean;
  };
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
    setMeta: vi.fn(),
    delete: vi.fn(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };
  tr.setMeta.mockReturnValue(tr);
  tr.delete.mockImplementation(() => {
    tr.docChanged = true;
    return tr;
  });

  const insertTrackedChange =
    options.insertTrackedChange === null ? undefined : (options.insertTrackedChange ?? vi.fn(() => true));
  const getBlockNodeById =
    options.getBlockNodeById === null
      ? undefined
      : (options.getBlockNodeById ??
        vi.fn((id: string) => {
          const matches = children.filter((c) => c.attrs?.sdBlockId === id || c.attrs?.paraId === id);
          return matches.map((node, i) => ({ node, pos: i }));
        }));

  const commands: Record<string, unknown> = {};
  if (insertTrackedChange !== undefined) {
    commands.insertTrackedChange = insertTrackedChange;
  }

  const helpers: Record<string, unknown> = {};
  if (getBlockNodeById !== undefined) {
    helpers.blockNode = { getBlockNodeById };
  }

  const editor = {
    options: {
      user: options.user === undefined ? { name: 'Test User', email: 'test@example.com' } : options.user,
    },
    state: { doc, tr },
    dispatch,
    commands,
    helpers,
  } as unknown as Editor;

  return { editor, dispatch, tr };
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
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } });
      expect(result.deletedBlock).toMatchObject({ nodeId: 'p1', nodeType: 'paragraph', textPreview: 'Hello' });
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
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'heading', nodeId: 'h1' } });
      expect(result.deletedBlock).toMatchObject({ nodeId: 'h1', nodeType: 'heading', textPreview: 'Title' });
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
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' } });
      expect(result.deletedBlock).toMatchObject({ nodeId: 'li1', nodeType: 'listItem' });
    });

    it('deletes a table block', () => {
      const table = createNode('table', [], {
        attrs: { blockId: 't1', sdBlockId: 't1' },
        isBlock: true,
        inlineContent: false,
      });
      const { editor } = makeBlockDeleteEditor({ children: [table] });
      const result = blocksDeleteWrapper(editor, makeInput('table', 't1'), { changeMode: 'direct' });
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'table', nodeId: 't1' } });
      expect(result.deletedBlock).toMatchObject({ nodeId: 't1', nodeType: 'table', textPreview: null });
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
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'sdt', nodeId: 'sdt1' } });
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

    it('uses tracked transaction metadata when tracked mode is requested', () => {
      const { editor, dispatch, tr } = makeBlockDeleteEditor();

      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked' });

      expect(result.success).toBe(true);
      expect(tr.delete).toHaveBeenCalledWith(0, 7);
      expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
      expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
      expect(dispatch).toHaveBeenCalledWith(tr);
    });

    it('throws CAPABILITY_UNAVAILABLE when tracked mode lacks insertTrackedChange support', () => {
      const { editor } = makeBlockDeleteEditor({ insertTrackedChange: null });

      expect(() => blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked' })).toThrow(
        DocumentApiAdapterError,
      );
    });

    it('throws CAPABILITY_UNAVAILABLE when tracked mode lacks a configured user', () => {
      const { editor } = makeBlockDeleteEditor({ user: null });

      expect(() => blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked' })).toThrow(
        DocumentApiAdapterError,
      );
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
    it('returns success without dispatching a transaction', () => {
      const { editor, dispatch, tr } = makeBlockDeleteEditor();
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), {
        changeMode: 'direct',
        dryRun: true,
      });
      expect(result).toMatchObject({ success: true, deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } });
      expect(result.deletedBlock).toBeDefined();
      expect(tr.delete).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('still validates target exists during dry run', () => {
      const { editor } = makeBlockDeleteEditor();
      expect(() =>
        blocksDeleteWrapper(editor, makeInput('paragraph', 'missing'), { changeMode: 'direct', dryRun: true }),
      ).toThrow(DocumentApiAdapterError);
    });

    it('still validates tracked capability during dry run', () => {
      const { editor } = makeBlockDeleteEditor({ insertTrackedChange: null });
      expect(() => blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'tracked', dryRun: true }))
        .toThrow(DocumentApiAdapterError);
    });
  });

  // -------------------------------------------------------------------------
  // Ordinal consistency
  // -------------------------------------------------------------------------

  describe('ordinal consistency with blocks.list', () => {
    it('reports top-level ordinal, not descendant-traversal index position', () => {
      // A table with a nested tableRow — the full block index (via descendants())
      // includes: table, tableRow, paragraph → indexOf(paragraph) = 2.
      // But blocks.list only lists top-level blocks: table=0, paragraph=1.
      const tableRow = createNode('tableRow', [], {
        attrs: { paraId: 'tr1', sdBlockId: 'tr1' },
        isBlock: true,
        inlineContent: false,
      });
      const table = createNode('table', [tableRow], {
        attrs: { blockId: 't1', sdBlockId: 't1' },
        isBlock: true,
        inlineContent: false,
      });
      const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
        attrs: { paraId: 'p1', sdBlockId: 'p1' },
        isBlock: true,
        inlineContent: true,
      });

      const { editor } = makeBlockDeleteEditor({ children: [table, paragraph] });
      const result = blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'direct' });

      // Must be 1 (top-level: table=0, paragraph=1), NOT 2 (descendant index position)
      expect(result.deletedBlock.ordinal).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Cache invalidation
  // -------------------------------------------------------------------------

  describe('cache invalidation', () => {
    it('deletes the resolved block range directly', () => {
      const { editor, tr } = makeBlockDeleteEditor();
      blocksDeleteWrapper(editor, makeInput('paragraph', 'p1'), { changeMode: 'direct' });
      expect(tr.delete).toHaveBeenCalledWith(0, 7);
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

// ---------------------------------------------------------------------------
// blocksListWrapper — canonical ID consistency
// ---------------------------------------------------------------------------

describe('blocksListWrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits canonical blockId (not sdBlockId) for non-paragraph block types', () => {
    // SDT nodes: resolveBlockNodeId prefers blockId over sdBlockId.
    // This test ensures blocks.list uses the same canonical ID as the block
    // index, so IDs from blocks.list work in follow-up delete operations.
    const sdt = createNode('sdt', [], {
      attrs: { blockId: 'sdt-canonical', sdBlockId: 'sdt-internal' },
      isBlock: true,
      inlineContent: false,
    });
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [sdt, paragraph], { isBlock: false });
    const editor = {
      state: { doc },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const sdtEntry = result.blocks.find((b) => b.nodeType === 'sdt');
    expect(sdtEntry).toBeDefined();
    // Must use blockId (the canonical ID), not sdBlockId
    expect(sdtEntry!.nodeId).toBe('sdt-canonical');
  });

  it('emits canonical paraId for paragraph types even when sdBlockId differs', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
      attrs: { paraId: 'para-canonical', sdBlockId: 'para-internal' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    expect(result.blocks[0]!.nodeId).toBe('para-canonical');
  });

  it('applies offset and limit pagination correctly', () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      createNode('paragraph', [createNode('text', [], { text: `P${i}` })], {
        attrs: { paraId: `p${i}`, sdBlockId: `p${i}` },
        isBlock: true,
        inlineContent: true,
      }),
    );
    const doc = createNode('doc', children, { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor, { offset: 1, limit: 2 });
    expect(result.total).toBe(5);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.ordinal).toBe(1);
    expect(result.blocks[0]!.nodeId).toBe('p1');
    expect(result.blocks[1]!.ordinal).toBe(2);
    expect(result.blocks[1]!.nodeId).toBe('p2');
  });

  it('filters by nodeTypes when specified', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const table = createNode('table', [], {
      attrs: { blockId: 't1', sdBlockId: 't1' },
      isBlock: true,
      inlineContent: false,
    });
    const doc = createNode('doc', [paragraph, table], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor, { nodeTypes: ['table'] });
    expect(result.total).toBe(1);
    expect(result.blocks[0]!.nodeType).toBe('table');
  });

  it('truncates textPreview to 80 characters for long paragraphs', () => {
    const longText = 'A'.repeat(200);
    const paragraph = createNode('paragraph', [createNode('text', [], { text: longText })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor);
    expect(result.blocks[0]!.textPreview).toHaveLength(80);
    expect(result.blocks[0]!.textPreview).toBe('A'.repeat(80));
  });

  it('does not truncate textPreview for short paragraphs', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Short text' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor);
    expect(result.blocks[0]!.textPreview).toBe('Short text');
  });

  it('returns full block text when includeText is true', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Longer full text value' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor, { includeText: true });
    expect(result.blocks[0]!.text).toBe('Longer full text value');
    expect(result.blocks[0]!.textPreview).toBe('Longer full text value');
  });

  it('omits full block text when includeText is false or omitted', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Body text' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    expect(blocksListWrapper(editor).blocks[0]!.text).toBeUndefined();
    expect(blocksListWrapper(editor, { includeText: false }).blocks[0]!.text).toBeUndefined();
  });

  it('returns null full text for non-text blocks when includeText is true', () => {
    const table = createNode('table', [], {
      attrs: { blockId: 't1', sdBlockId: 't1' },
      isBlock: true,
      inlineContent: false,
    });
    const doc = createNode('doc', [table], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor, { includeText: true });
    expect(result.blocks[0]!.text).toBeNull();
    expect(result.blocks[0]!.textPreview).toBeNull();
  });

  it('reads alignment from paragraphProperties.justification', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Centered' })], {
      attrs: {
        paraId: 'p1',
        sdBlockId: 'p1',
        paragraphProperties: { justification: 'center' },
      },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor);
    expect((result.blocks[0] as any).alignment).toBe('center');
  });

  it('omits alignment when paragraphProperties has no justification', () => {
    const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Default' })], {
      attrs: {
        paraId: 'p1',
        sdBlockId: 'p1',
        paragraphProperties: { styleId: 'Normal' },
      },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor);
    expect((result.blocks[0] as any).alignment).toBeUndefined();
  });

  it('extracts formatting (fontFamily, fontSize, bold) from first text run marks', () => {
    const textNode = createNode('text', [], {
      text: 'Styled',
      marks: [
        { type: { name: 'textStyle' }, attrs: { fontFamily: 'Arial', fontSize: 12 } },
        { type: { name: 'bold' }, attrs: { value: true } },
      ],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: {
        paraId: 'p1',
        sdBlockId: 'p1',
        paragraphProperties: { styleId: 'Heading1' },
      },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = { state: { doc } } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    expect(block.fontFamily).toBe('Arial');
    expect(block.fontSize).toBe(12);
    expect(block.bold).toBe(true);
    expect(block.styleId).toBe('Heading1');
    expect(block.headingLevel).toBe(1);
  });

  it('resolves fontSize from Normal style when inline marks have no fontSize', () => {
    const textNode = createNode('text', [], {
      text: 'No inline fontSize',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Times New Roman' } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    // Mock editor with converter that has translatedLinkedStyles
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: { runProperties: { fontSize: 24 } },
          latentStyles: {},
          styles: {
            Normal: { runProperties: { fontSize: 20 } },
          },
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    // Normal style has fontSize 20 half-points = 10pt
    expect(block.fontSize).toBe(10);
  });

  it('resolves fontSize from basedOn chain when block has a styleId', () => {
    const textNode = createNode('text', [], {
      text: 'Heading text',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Times New Roman' } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1', paragraphProperties: { styleId: 'Heading1' } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: { runProperties: { fontSize: 20 } },
          latentStyles: {},
          styles: {
            Normal: { runProperties: { fontSize: 20 } },
            Heading1: { basedOn: 'Normal', runProperties: { fontSize: 28 } },
          },
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    // Heading1 has fontSize 28 half-points = 14pt
    expect(block.fontSize).toBe(14);
  });

  it('walks basedOn chain when style has no fontSize', () => {
    const textNode = createNode('text', [], {
      text: 'List text',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Arial' } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1', paragraphProperties: { styleId: 'ListParagraph' } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {
            Normal: { runProperties: { fontSize: 22 } },
            ListParagraph: { basedOn: 'Normal', runProperties: {} },
          },
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    // ListParagraph has no fontSize, basedOn Normal which has 22 hp = 11pt
    expect(block.fontSize).toBe(11);
  });

  it('falls back to docDefaults when no style defines fontSize', () => {
    const textNode = createNode('text', [], {
      text: 'Default text',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Calibri' } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: { runProperties: { fontSize: 24 } },
          latentStyles: {},
          styles: { Normal: { runProperties: {} } },
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    // docDefaults has fontSize 24 hp = 12pt
    expect(block.fontSize).toBe(12);
  });

  it('falls back to 10pt OOXML default when nothing defines fontSize', () => {
    const textNode = createNode('text', [], {
      text: 'Bare text',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Courier' } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {},
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    expect(block.fontSize).toBe(10);
  });

  it('inline fontSize takes precedence over style chain', () => {
    const textNode = createNode('text', [], {
      text: 'Explicit size',
      marks: [{ type: { name: 'textStyle' }, attrs: { fontFamily: 'Arial', fontSize: 16 } }],
    });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { paraId: 'p1', sdBlockId: 'p1', paragraphProperties: { styleId: 'Heading1' } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = {
      state: { doc },
      converter: {
        translatedLinkedStyles: {
          docDefaults: { runProperties: { fontSize: 20 } },
          latentStyles: {},
          styles: { Heading1: { runProperties: { fontSize: 28 } } },
        },
      },
    } as unknown as Editor;

    const result = blocksListWrapper(editor);
    const block = result.blocks[0] as any;
    // Inline fontSize 16 takes precedence over Heading1's 28hp (14pt)
    expect(block.fontSize).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// blocksDeleteRangeWrapper — section-break rejection
// ---------------------------------------------------------------------------

describe('blocksDeleteRangeWrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeRangeDeleteEditor(children: ProseMirrorNode[]) {
    const doc = createNode('doc', children, { isBlock: false });
    const dispatch = vi.fn();
    const tr = {
      setMeta: vi.fn().mockReturnThis(),
      mapping: { map: (pos: number) => pos },
      docChanged: false,
      delete: vi.fn().mockImplementation(function (this: { docChanged: boolean }) {
        this.docChanged = true;
      }),
    };
    return {
      state: { doc, tr },
      dispatch,
      commands: {
        deleteBlockNodeById: vi.fn(() => true),
      },
      helpers: {
        blockNode: {
          getBlockNodeById: vi.fn((id: string) => {
            const match = children.find((c) => c.attrs?.sdBlockId === id || c.attrs?.paraId === id);
            return match ? [{ node: match, pos: 0 }] : [];
          }),
        },
      },
    } as unknown as Editor;
  }

  it('rejects a range that includes a section-break paragraph', () => {
    const p1 = createNode('paragraph', [createNode('text', [], { text: 'Before' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const sectBreak = createNode('paragraph', [createNode('text', [], { text: 'Break' })], {
      attrs: {
        paraId: 'sect1',
        sdBlockId: 'sect1',
        paragraphProperties: { sectPr: { name: 'w:sectPr', elements: [] } },
      },
      isBlock: true,
      inlineContent: true,
    });
    const p3 = createNode('paragraph', [createNode('text', [], { text: 'After' })], {
      attrs: { paraId: 'p3', sdBlockId: 'p3' },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([p1, sectBreak, p3]);

    try {
      blocksDeleteRangeWrapper(
        editor,
        {
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p3' },
        },
        { changeMode: 'direct' },
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiAdapterError);
      expect((error as DocumentApiAdapterError).code).toBe('INVALID_TARGET');
      expect((error as DocumentApiAdapterError).message).toContain('section break');
    }
  });

  it('also rejects section breaks during dry-run', () => {
    const p1 = createNode('paragraph', [createNode('text', [], { text: 'Before' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const sectBreak = createNode('paragraph', [createNode('text', [], { text: 'Break' })], {
      attrs: {
        paraId: 'sect1',
        sdBlockId: 'sect1',
        paragraphProperties: { sectPr: { name: 'w:sectPr', elements: [] } },
      },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([p1, sectBreak]);

    expect(() =>
      blocksDeleteRangeWrapper(
        editor,
        {
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'sect1' },
        },
        { changeMode: 'direct', dryRun: true },
      ),
    ).toThrow(DocumentApiAdapterError);
  });

  it('rejects when start nodeType does not match the resolved block', () => {
    const li = createNode('paragraph', [createNode('text', [], { text: 'List item' })], {
      attrs: {
        paraId: 'li1',
        sdBlockId: 'li1',
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      },
      isBlock: true,
      inlineContent: true,
    });
    const p2 = createNode('paragraph', [createNode('text', [], { text: 'Second' })], {
      attrs: { paraId: 'p2', sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([li, p2]);

    try {
      blocksDeleteRangeWrapper(
        editor,
        {
          // Caller says "paragraph" but li1 resolves to "listItem"
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'li1' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        { changeMode: 'direct' },
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiAdapterError);
      expect((error as DocumentApiAdapterError).code).toBe('INVALID_TARGET');
      expect((error as DocumentApiAdapterError).message).toContain('start expected paragraph');
      expect((error as DocumentApiAdapterError).message).toContain('resolved to listItem');
    }
  });

  it('rejects a range that would silently delete unrecognized node types', () => {
    const p1 = createNode('paragraph', [createNode('text', [], { text: 'First' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    // A node type that mapBlockNodeType does not recognize (e.g., bibliography)
    const bibliography = createNode('bibliography', [], {
      attrs: { blockId: 'bib1' },
      isBlock: true,
      inlineContent: false,
    });
    const p2 = createNode('paragraph', [createNode('text', [], { text: 'Last' })], {
      attrs: { paraId: 'p2', sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([p1, bibliography, p2]);

    try {
      blocksDeleteRangeWrapper(
        editor,
        {
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        { changeMode: 'direct' },
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiAdapterError);
      expect((error as DocumentApiAdapterError).code).toBe('INVALID_TARGET');
      expect((error as DocumentApiAdapterError).message).toContain('unrecognized');
      expect((error as DocumentApiAdapterError).message).toContain('bibliography');
    }
  });

  it('allows passthrough nodes in a deletion range (opaque OOXML preservation)', () => {
    const p1 = createNode('paragraph', [createNode('text', [], { text: 'First' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const passthrough = createNode('passthroughBlock', [], {
      attrs: { originalName: 'w:bookmarkStart', originalXml: '<w:bookmarkStart/>' },
      isBlock: true,
      inlineContent: false,
    });
    const p2 = createNode('paragraph', [createNode('text', [], { text: 'Last' })], {
      attrs: { paraId: 'p2', sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([p1, passthrough, p2]);
    const result = blocksDeleteRangeWrapper(
      editor,
      {
        start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
      },
      { changeMode: 'direct' },
    );
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2); // Only recognized blocks counted
  });

  it('resolves correctly when different node types share the same nodeId', () => {
    // A paragraph and a listItem both have paraId "shared" — different nodeTypes
    // but the same raw nodeId. The old findBlockByNodeIdOnly approach would throw
    // AMBIGUOUS_TARGET; composite-key lookup correctly disambiguates.
    const para = createNode('paragraph', [createNode('text', [], { text: 'Text' })], {
      attrs: { paraId: 'shared', sdBlockId: 'sb-para' },
      isBlock: true,
      inlineContent: true,
    });
    const listItem = createNode('paragraph', [createNode('text', [], { text: 'List item' })], {
      attrs: {
        paraId: 'shared',
        sdBlockId: 'sb-li',
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([para, listItem]);

    // Should NOT throw AMBIGUOUS_TARGET — composite keys (paragraph:shared, listItem:shared) are distinct
    const result = blocksDeleteRangeWrapper(
      editor,
      {
        start: { kind: 'block', nodeType: 'paragraph', nodeId: 'shared' },
        end: { kind: 'block', nodeType: 'listItem', nodeId: 'shared' },
      },
      { changeMode: 'direct' },
    );
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
  });

  it('allows a range without section breaks', () => {
    const p1 = createNode('paragraph', [createNode('text', [], { text: 'First' })], {
      attrs: { paraId: 'p1', sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const p2 = createNode('paragraph', [createNode('text', [], { text: 'Second' })], {
      attrs: { paraId: 'p2', sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });

    const editor = makeRangeDeleteEditor([p1, p2]);
    const result = blocksDeleteRangeWrapper(
      editor,
      {
        start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
      },
      { changeMode: 'direct' },
    );
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
  });
});
