import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean) => {
    const changed = handler();
    return {
      success: true,
      revision: { before: '0', after: '1' },
      steps: [
        {
          stepId: 'step-1',
          op: 'domain.command',
          effect: changed ? 'changed' : 'noop',
          matchCount: changed ? 1 : 0,
          data: { domain: 'command', commandDispatched: changed },
        },
      ],
      timing: { totalMs: 0 },
    };
  }),
}));

import { paragraphsSetIndentationWrapper, paragraphsSetStyleWrapper } from './paragraphs-wrappers.js';

type MockNode = {
  type: { name: 'paragraph' | 'text' };
  isBlock?: true;
  isText?: true;
  nodeSize: number;
  attrs: Record<string, unknown>;
  marks?: Array<{ type: { name: string } }>;
};

function createParagraphNode(attrs: Record<string, unknown>): MockNode {
  return {
    type: { name: 'paragraph' },
    isBlock: true,
    nodeSize: 2,
    attrs,
  };
}

function makeEditor(
  paragraphProperties: Record<string, unknown>,
  textMarks: Array<{ type: { name: string } }> = [],
): {
  editor: Editor;
  setNodeMarkup: ReturnType<typeof vi.fn>;
  removeMark: ReturnType<typeof vi.fn>;
} {
  const paragraphNode = createParagraphNode({
    paraId: 'p1',
    sdBlockId: 'p1',
    paragraphProperties,
  });
  paragraphNode.nodeSize = 6;

  const textNode: MockNode = {
    type: { name: 'text' },
    isText: true,
    nodeSize: 4,
    attrs: {},
    marks: textMarks,
  };

  const setNodeMarkup = vi.fn().mockReturnThis();
  const removeMark = vi.fn().mockReturnThis();
  const tr = {
    setNodeMarkup,
    removeMark,
    doc: {
      nodesBetween(callbackStart: number, callbackEnd: number, callback: (node: MockNode, pos: number) => void) {
        if (callbackStart < callbackEnd) {
          callback(textNode, 1);
        }
      },
    },
  };

  const doc = {
    descendants(callback: (node: MockNode, pos: number) => void) {
      callback(paragraphNode, 0);
    },
    nodeAt(pos: number) {
      return pos === 0 ? paragraphNode : null;
    },
    nodesBetween(from: number, to: number, callback: (node: MockNode, pos: number) => void) {
      if (from < to) {
        callback(textNode, 1);
      }
    },
  };

  const editor = {
    state: { doc, tr },
    dispatch: vi.fn(),
    commands: {},
  } as unknown as Editor;

  return { editor, setNodeMarkup, removeMark };
}

describe('paragraphsSetIndentationWrapper', () => {
  it('drops existing hanging when setting firstLine', () => {
    const { editor, setNodeMarkup } = makeEditor({
      indent: { left: 240, hanging: 360 },
    });

    paragraphsSetIndentationWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      firstLine: 720,
    });

    const nextAttrs = setNodeMarkup.mock.calls[0]?.[2] as { paragraphProperties: { indent: Record<string, unknown> } };
    expect(nextAttrs.paragraphProperties.indent).toEqual({ left: 240, firstLine: 720 });
  });

  it('drops existing firstLine when setting hanging', () => {
    const { editor, setNodeMarkup } = makeEditor({
      indent: { right: 120, firstLine: 480 },
    });

    paragraphsSetIndentationWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      hanging: 360,
    });

    const nextAttrs = setNodeMarkup.mock.calls[0]?.[2] as { paragraphProperties: { indent: Record<string, unknown> } };
    expect(nextAttrs.paragraphProperties.indent).toEqual({ right: 120, hanging: 360 });
  });
});

describe('paragraphsSetStyleWrapper', () => {
  it('clears linked-style formatting marks while setting the paragraph style', () => {
    const textStyleMark = { type: { name: 'textStyle' } };
    const hyperlinkMark = { type: { name: 'link' } };
    const { editor, setNodeMarkup, removeMark } = makeEditor({}, [textStyleMark, hyperlinkMark]);

    paragraphsSetStyleWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      styleId: 'Heading1',
    });

    expect(removeMark).toHaveBeenCalledTimes(1);
    expect(removeMark).toHaveBeenCalledWith(1, 5, textStyleMark);
    const nextAttrs = setNodeMarkup.mock.calls[0]?.[2] as { paragraphProperties: Record<string, unknown> };
    expect(nextAttrs.paragraphProperties).toEqual({ styleId: 'Heading1' });
  });
});
