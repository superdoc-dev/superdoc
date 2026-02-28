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
  createTableOfContentsWrapper,
  tocConfigureWrapper,
  tocListWrapper,
  tocRemoveWrapper,
  tocUpdateWrapper,
} from './toc-wrappers.js';
import { DocumentApiAdapterError } from '../errors.js';

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

function makeTocEditor(commandOverrides: Record<string, unknown> = {}): {
  editor: Editor;
  commands: {
    insertTableOfContentsAt: ReturnType<typeof vi.fn>;
    setTableOfContentsInstructionById: ReturnType<typeof vi.fn>;
    replaceTableOfContentsContentById: ReturnType<typeof vi.fn>;
    deleteTableOfContentsById: ReturnType<typeof vi.fn>;
  };
} {
  const tocParagraph = createNode('paragraph', [createNode('text', [], { text: 'TOC entry' })], {
    attrs: { sdBlockId: 'toc-entry-p1' },
    isBlock: true,
    inlineContent: true,
  });
  const tocNode = createNode('tableOfContents', [tocParagraph], {
    attrs: { sdBlockId: 'toc-1', instruction: 'TOC \\o "1-3" \\h \\u \\z' },
    isBlock: true,
  });
  const heading = createNode('paragraph', [createNode('text', [], { text: 'Heading 1' })], {
    attrs: {
      sdBlockId: 'h-1',
      paragraphProperties: { styleId: 'Heading1' },
    },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [tocNode, heading], { isBlock: false });

  const dispatch = vi.fn();
  const tr = {
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setNodeMarkup: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  const commands = {
    insertTableOfContentsAt: vi.fn(() => true),
    setTableOfContentsInstructionById: vi.fn(() => true),
    replaceTableOfContentsContentById: vi.fn(() => true),
    deleteTableOfContentsById: vi.fn(() => true),
    ...commandOverrides,
  };

  const editor = {
    state: { doc, tr, schema: { nodes: { paragraph: { create: vi.fn() }, tableOfContents: {} } } },
    dispatch,
    commands,
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;

  return { editor, commands };
}

function expectTrackedModeUnsupported(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    const err = error as DocumentApiAdapterError;
    expect(err).toBeInstanceOf(DocumentApiAdapterError);
    expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
    expect(err.details).toEqual({ reason: 'tracked_mode_unsupported' });
    return;
  }

  throw new Error('Expected tracked mode to be rejected.');
}

describe('toc wrappers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses toc.list nodeId as a valid before/after target for create.tableOfContents', () => {
    const { editor, commands } = makeTocEditor();

    const list = tocListWrapper(editor);
    expect(list.items).toHaveLength(1);
    const target = list.items[0]!.address;

    const result = createTableOfContentsWrapper(editor, { at: { kind: 'after', target } }, { changeMode: 'direct' });

    expect(result.success).toBe(true);
    expect(commands.insertTableOfContentsAt).toHaveBeenCalledTimes(1);
    expect(commands.insertTableOfContentsAt.mock.calls[0]?.[0]).toMatchObject({ pos: 13 });
  });

  it('rejects tracked mode for TOC mutation wrappers', () => {
    const { editor } = makeTocEditor();
    const tocTarget = { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } as const;

    expectTrackedModeUnsupported(() => {
      createTableOfContentsWrapper(editor, { at: { kind: 'documentEnd' } }, { changeMode: 'tracked' });
    });

    expectTrackedModeUnsupported(() => {
      tocConfigureWrapper(editor, { target: tocTarget, patch: { hyperlinks: false } }, { changeMode: 'tracked' });
    });

    expectTrackedModeUnsupported(() => {
      tocUpdateWrapper(editor, { target: tocTarget }, { changeMode: 'tracked' });
    });

    expectTrackedModeUnsupported(() => {
      tocRemoveWrapper(editor, { target: tocTarget }, { changeMode: 'tracked' });
    });
  });
});
