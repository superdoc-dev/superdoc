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
  marks?: MockMark[];
};

function createParagraphNode(attrs: Record<string, unknown>): MockNode {
  return {
    type: { name: 'paragraph' },
    isBlock: true,
    nodeSize: 2,
    attrs,
  };
}

type MockMark = {
  type: { name: string; create?: (attrs: Record<string, unknown>) => MockMark };
  attrs?: Record<string, unknown>;
};

function createFormattingMark(name: string, attrs?: Record<string, unknown>): MockMark {
  return { type: { name }, attrs };
}

function createTextStyleMark(attrs?: Record<string, unknown>): MockMark {
  return createFormattingMark('textStyle', attrs);
}

function makeEditor(
  paragraphProperties: Record<string, unknown>,
  textMarks: MockMark[] = [],
): {
  editor: Editor;
  setNodeMarkup: ReturnType<typeof vi.fn>;
  removeMark: ReturnType<typeof vi.fn>;
  addMark: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
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
  const addMark = vi.fn().mockReturnThis();
  const tr = {
    setNodeMarkup,
    removeMark,
    addMark,
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

  return { editor, setNodeMarkup, removeMark, addMark, dispatch: editor.dispatch as ReturnType<typeof vi.fn> };
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
  it('clears direct run formatting while leaving unrelated marks untouched', () => {
    const boldMark = createFormattingMark('bold');
    const textStyleMark = createTextStyleMark({ fontFamily: 'Arial', fontSize: '12pt' });
    const hyperlinkMark = createFormattingMark('link');
    const { editor, setNodeMarkup, removeMark, addMark } = makeEditor({}, [boldMark, textStyleMark, hyperlinkMark]);

    paragraphsSetStyleWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      styleId: 'Heading1',
    });

    expect(removeMark).toHaveBeenCalledTimes(2);
    expect(removeMark).toHaveBeenCalledWith(1, 5, boldMark);
    expect(removeMark).toHaveBeenCalledWith(1, 5, textStyleMark);
    expect(addMark).not.toHaveBeenCalled();
    const nextAttrs = setNodeMarkup.mock.calls[0]?.[2] as { paragraphProperties: Record<string, unknown> };
    expect(nextAttrs.paragraphProperties).toEqual({ styleId: 'Heading1' });
  });

  it('preserves character-style reference (styleId) on textStyle marks', () => {
    const emphasisStyleMark = createTextStyleMark({ styleId: 'Emphasis' });
    const { editor, removeMark, addMark } = makeEditor({}, [emphasisStyleMark]);

    paragraphsSetStyleWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      styleId: 'Heading1',
    });

    // Mark only has styleId (no formatting attrs) — should not be touched at all
    expect(removeMark).not.toHaveBeenCalled();
    expect(addMark).not.toHaveBeenCalled();
  });

  it('strips formatting attrs from textStyle but re-adds styleId', () => {
    const createdMark = createTextStyleMark({ styleId: 'Emphasis' });
    const mixedMark: MockMark = {
      type: { name: 'textStyle', create: (attrs) => ({ ...createdMark, attrs }) },
      attrs: { styleId: 'Emphasis', fontFamily: 'Arial' },
    };
    const { editor, removeMark, addMark } = makeEditor({}, [mixedMark]);

    paragraphsSetStyleWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      styleId: 'Heading1',
    });

    expect(removeMark).toHaveBeenCalledTimes(1);
    expect(removeMark).toHaveBeenCalledWith(1, 5, mixedMark);
    expect(addMark).toHaveBeenCalledTimes(1);
    expect(addMark).toHaveBeenCalledWith(1, 5, expect.objectContaining({ attrs: { styleId: 'Emphasis' } }));
  });

  it('returns NO_OP when the style already matches', () => {
    const boldMark = createFormattingMark('bold');
    const { editor, removeMark, dispatch } = makeEditor({ styleId: 'Normal' }, [boldMark]);

    const result = paragraphsSetStyleWrapper(editor, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      styleId: 'Normal',
    });

    expect(result).toEqual({
      success: false,
      failure: { code: 'NO_OP', message: 'styles.paragraph.setStyle produced no changes.' },
    });
    expect(removeMark).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
