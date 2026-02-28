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

import { paragraphsSetIndentationWrapper } from './paragraphs-wrappers.js';

type MockNode = {
  type: { name: 'paragraph' };
  isBlock: true;
  nodeSize: number;
  attrs: Record<string, unknown>;
};

function createParagraphNode(attrs: Record<string, unknown>): MockNode {
  return {
    type: { name: 'paragraph' },
    isBlock: true,
    nodeSize: 2,
    attrs,
  };
}

function makeEditor(paragraphProperties: Record<string, unknown>): {
  editor: Editor;
  setNodeMarkup: ReturnType<typeof vi.fn>;
} {
  const paragraphNode = createParagraphNode({
    paraId: 'p1',
    sdBlockId: 'p1',
    paragraphProperties,
  });

  const setNodeMarkup = vi.fn().mockReturnThis();
  const tr = {
    setNodeMarkup,
  };

  const doc = {
    descendants(callback: (node: MockNode, pos: number) => void) {
      callback(paragraphNode, 0);
    },
    nodeAt(pos: number) {
      return pos === 0 ? paragraphNode : null;
    },
  };

  const editor = {
    state: { doc, tr },
    dispatch: vi.fn(),
    commands: {},
  } as unknown as Editor;

  return { editor, setNodeMarkup };
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
