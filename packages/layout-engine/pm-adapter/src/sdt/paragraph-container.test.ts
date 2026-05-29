import { describe, it, expect, vi } from 'vitest';
import { getParagraphContainerChildren, handleParagraphContainerNode } from './paragraph-container.js';
import { handleIndexNode } from './document-index.js';
import { handleBibliographyNode } from './bibliography.js';
import { handleTableOfAuthoritiesNode } from './table-of-authorities.js';
import type { PMNode, NodeHandlerContext } from '../types.js';

describe('getParagraphContainerChildren', () => {
  it('reads array-based content', () => {
    const node = { type: 'index', content: [{ type: 'paragraph' }, { type: 'paragraph' }] } as unknown as PMNode;
    expect(getParagraphContainerChildren(node)).toHaveLength(2);
  });

  it('reads ProseMirror Fragment-like content via forEach', () => {
    const kids = [{ type: 'paragraph' }];
    const node = {
      type: 'index',
      content: { forEach: (cb: (c: unknown) => void) => kids.forEach(cb) },
    } as unknown as PMNode;
    expect(getParagraphContainerChildren(node)).toEqual(kids);
  });

  it('returns an empty array when there is no content', () => {
    expect(getParagraphContainerChildren({ type: 'index' } as unknown as PMNode)).toEqual([]);
  });
});

describe('handleParagraphContainerNode', () => {
  const makeContext = () => {
    const blocks: unknown[] = [];
    const paragraphToFlowBlocks = vi.fn(({ para }: { para: PMNode }) => [
      { kind: 'paragraph', text: (para as { text?: string }).text },
    ]);
    const context = {
      blocks,
      recordBlockKind: vi.fn(),
      nextBlockId: vi.fn(() => 'b1'),
      positions: {},
      trackedChangesConfig: undefined,
      bookmarks: undefined,
      hyperlinkConfig: undefined,
      sectionState: { ranges: [], currentSectionIndex: 0, currentParagraphIndex: 0 },
      converters: { paragraphToFlowBlocks },
      themeColors: undefined,
      enableComments: false,
      converterContext: {},
    } as unknown as NodeHandlerContext;
    return { context, blocks, paragraphToFlowBlocks };
  };

  it('converts each child paragraph to flow blocks and advances the paragraph counter', () => {
    const { context, blocks, paragraphToFlowBlocks } = makeContext();
    const node = {
      type: 'index',
      content: [
        { type: 'paragraph', text: 'a' },
        { type: 'paragraph', text: 'b' },
        { type: 'someAtom', text: 'skip' },
      ],
    } as unknown as PMNode;

    handleParagraphContainerNode(node, context);

    expect(paragraphToFlowBlocks).toHaveBeenCalledTimes(2);
    expect(blocks).toHaveLength(2);
    expect((context.sectionState as { currentParagraphIndex: number }).currentParagraphIndex).toBe(2);
  });

  it('is the single implementation shared by the three block-field handlers', () => {
    expect(handleIndexNode).toBe(handleParagraphContainerNode);
    expect(handleBibliographyNode).toBe(handleParagraphContainerNode);
    expect(handleTableOfAuthoritiesNode).toBe(handleParagraphContainerNode);
  });
});
