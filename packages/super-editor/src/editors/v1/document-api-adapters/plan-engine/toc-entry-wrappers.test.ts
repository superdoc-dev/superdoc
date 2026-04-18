import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PlanReceipt } from '@superdoc/document-api';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean): PlanReceipt => {
    const applied = handler();
    return {
      success: true,
      revision: { before: '0', after: '0' },
      steps: [
        {
          stepId: 'step-1',
          op: 'domain.command',
          effect: applied ? 'changed' : 'noop',
          matchCount: applied ? 1 : 0,
          data: { domain: 'command', commandDispatched: applied },
        },
      ],
      timing: { totalMs: 0 },
    };
  }),
}));

import {
  tocListEntriesWrapper,
  tocGetEntryWrapper,
  tocMarkEntryWrapper,
  tocUnmarkEntryWrapper,
  tocEditEntryWrapper,
} from './toc-entry-wrappers.js';
import { DocumentApiAdapterError } from '../errors.js';
import { DocumentApiValidationError } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Test helpers
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
    textContent: isText ? text : children.map((c) => (c as unknown as { text?: string }).text ?? '').join(''),
    descendants(callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      function walk(nodes: ProseMirrorNode[], baseOffset: number): void {
        let offset = baseOffset;
        for (const child of nodes) {
          const shouldDescend = callback(child, offset);
          if (shouldDescend !== false) {
            const grandChildren = (child as unknown as { _children?: ProseMirrorNode[] })._children;
            if (grandChildren?.length) {
              walk(grandChildren, offset + 1);
            }
          }
          offset += child.nodeSize;
        }
      }

      walk(children, 0);
    },
  } as unknown as ProseMirrorNode;

  (node as unknown as { _children: ProseMirrorNode[] })._children = children;
  return node;
}

function makeEntryEditor(commandOverrides: Record<string, unknown> = {}) {
  const tcEntry = createNode('tableOfContentsEntry', [], {
    attrs: { instruction: 'TC "Chapter One" \\f "A" \\l "2"' },
    isInline: true,
    isLeaf: true,
  });
  const paragraph = createNode('paragraph', [createNode('text', [], { text: 'Body text' }), tcEntry], {
    attrs: { sdBlockId: 'p-1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const commands = {
    insertTableOfContentsEntryAt: vi.fn(() => true),
    deleteTableOfContentsEntryAt: vi.fn(() => true),
    updateTableOfContentsEntryAt: vi.fn(() => true),
    ...commandOverrides,
  };

  const editor = {
    state: { doc, schema: { nodes: { paragraph: { create: vi.fn() } } } },
    commands,
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;

  return { editor, commands, doc };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toc entry wrappers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('tocListEntriesWrapper', () => {
    it('lists TC entry nodes in the document', () => {
      const { editor } = makeEntryEditor();
      const result = tocListEntriesWrapper(editor);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.address.nodeType).toBe('tableOfContentsEntry');
    });

    it('filters by tableIdentifier', () => {
      const { editor } = makeEntryEditor();
      const result = tocListEntriesWrapper(editor, { tableIdentifier: 'B' });
      expect(result.total).toBe(0);
    });

    it('filters by levelRange', () => {
      const { editor } = makeEntryEditor();
      // TC entry has level 2, so range 3-5 should exclude it
      const result = tocListEntriesWrapper(editor, { levelRange: { from: 3, to: 5 } });
      expect(result.total).toBe(0);

      // Range 1-3 should include it
      const result2 = tocListEntriesWrapper(editor, { levelRange: { from: 1, to: 3 } });
      expect(result2.total).toBe(1);
    });
  });

  describe('tocGetEntryWrapper', () => {
    it('retrieves TC entry info by address', () => {
      const { editor } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      const info = tocGetEntryWrapper(editor, {
        target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId },
      });
      expect(info.nodeType).toBe('tableOfContentsEntry');
      expect(info.properties.text).toBe('Chapter One');
      expect(info.properties.level).toBe(2);
      expect(info.properties.tableIdentifier).toBe('A');
    });
  });

  describe('tocMarkEntryWrapper', () => {
    it('inserts a TC entry at end of paragraph', () => {
      const { editor, commands } = makeEntryEditor();
      const result = tocMarkEntryWrapper(
        editor,
        {
          target: { anchor: { nodeId: 'p-1' } },
          text: 'New Entry',
        },
        { changeMode: 'direct' },
      );

      expect(result.success).toBe(true);
      expect(commands.insertTableOfContentsEntryAt).toHaveBeenCalledTimes(1);
    });

    it('supports dryRun', () => {
      const { editor, commands } = makeEntryEditor();
      const result = tocMarkEntryWrapper(
        editor,
        {
          target: { anchor: { nodeId: 'p-1' } },
          text: 'Dry Run Entry',
        },
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(commands.insertTableOfContentsEntryAt).not.toHaveBeenCalled();
    });

    it('rejects tracked mode', () => {
      const { editor } = makeEntryEditor();
      expect(() =>
        tocMarkEntryWrapper(editor, { target: { anchor: { nodeId: 'p-1' } }, text: 'X' }, { changeMode: 'tracked' }),
      ).toThrow(DocumentApiAdapterError);
    });

    it('rejects level 0', () => {
      const { editor } = makeEntryEditor();
      expect(() =>
        tocMarkEntryWrapper(
          editor,
          { target: { anchor: { nodeId: 'p-1' } }, text: 'X', level: 0 },
          { changeMode: 'direct' },
        ),
      ).toThrow(DocumentApiValidationError);
    });

    it('rejects level 10', () => {
      const { editor } = makeEntryEditor();
      expect(() =>
        tocMarkEntryWrapper(
          editor,
          { target: { anchor: { nodeId: 'p-1' } }, text: 'X', level: 10 },
          { changeMode: 'direct' },
        ),
      ).toThrow(DocumentApiValidationError);
    });

    it('accepts levels 1 through 9', () => {
      const { editor } = makeEntryEditor();
      for (const level of [1, 5, 9]) {
        const result = tocMarkEntryWrapper(
          editor,
          { target: { anchor: { nodeId: 'p-1' } }, text: 'X', level },
          { changeMode: 'direct' },
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('tocUnmarkEntryWrapper', () => {
    it('removes a TC entry by address', () => {
      const { editor, commands } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      const result = tocUnmarkEntryWrapper(
        editor,
        { target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId } },
        { changeMode: 'direct' },
      );

      expect(result.success).toBe(true);
      expect(commands.deleteTableOfContentsEntryAt).toHaveBeenCalledTimes(1);
    });
  });

  describe('tocEditEntryWrapper', () => {
    it('patches a TC entry instruction', () => {
      const { editor, commands } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      const result = tocEditEntryWrapper(
        editor,
        {
          target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId },
          patch: { text: 'Updated Chapter' },
        },
        { changeMode: 'direct' },
      );

      expect(result.success).toBe(true);
      expect(commands.updateTableOfContentsEntryAt).toHaveBeenCalledTimes(1);
    });

    it('returns NO_OP when patch produces no change', () => {
      const { editor } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      const result = tocEditEntryWrapper(
        editor,
        {
          target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId },
          patch: { text: 'Chapter One', level: 2, tableIdentifier: 'A' },
        },
        { changeMode: 'direct' },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('NO_OP');
      }
    });

    it('rejects level 0 in patch', () => {
      const { editor } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      expect(() =>
        tocEditEntryWrapper(
          editor,
          {
            target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId },
            patch: { level: 0 },
          },
          { changeMode: 'direct' },
        ),
      ).toThrow(DocumentApiValidationError);
    });

    it('rejects level 10 in patch', () => {
      const { editor } = makeEntryEditor();
      const list = tocListEntriesWrapper(editor);
      const entryId = list.items[0]!.address.nodeId;

      expect(() =>
        tocEditEntryWrapper(
          editor,
          {
            target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: entryId },
            patch: { level: 10 },
          },
          { changeMode: 'direct' },
        ),
      ).toThrow(DocumentApiValidationError);
    });
  });
});
