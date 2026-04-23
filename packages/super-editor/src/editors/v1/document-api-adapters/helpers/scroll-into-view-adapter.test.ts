import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { ScrollIntoViewInput } from '@superdoc/document-api';
import type { CommentAnchor } from './comment-target-resolver.js';

vi.mock('./adapter-utils.js', async () => {
  const actual = await vi.importActual<typeof import('./adapter-utils.js')>('./adapter-utils.js');
  return { ...actual, resolveTextTarget: vi.fn() };
});

vi.mock('./tracked-change-resolver.js', async () => {
  const actual = await vi.importActual<typeof import('./tracked-change-resolver.js')>('./tracked-change-resolver.js');
  return { ...actual, resolveTrackedChange: vi.fn() };
});

vi.mock('./comment-target-resolver.js', async () => {
  const actual = await vi.importActual<typeof import('./comment-target-resolver.js')>('./comment-target-resolver.js');
  return { ...actual, listCommentAnchors: vi.fn(() => [] as CommentAnchor[]) };
});

import { resolveTextTarget } from './adapter-utils.js';
import { resolveTrackedChange } from './tracked-change-resolver.js';
import { listCommentAnchors } from './comment-target-resolver.js';
import { scrollRangeIntoView } from './scroll-into-view-adapter.js';

function makeEditor(
  presentationStub: {
    scrollToPositionAsync?: ReturnType<typeof vi.fn>;
  } | null = {},
): Editor {
  const presentation = presentationStub
    ? {
        scrollToPositionAsync: presentationStub.scrollToPositionAsync ?? vi.fn().mockResolvedValue(true),
      }
    : null;
  return {
    presentationEditor: presentation,
  } as unknown as Editor;
}

describe('scrollRangeIntoView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a TextAddress target and delegates to the presentation editor', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 42, to: 48 });
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    const input: ScrollIntoViewInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 9 } },
    };
    const out = await scrollRangeIntoView(editor, input);

    expect(out).toEqual({ success: true });
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'p1',
      range: { start: 3, end: 9 },
    });
    // PM position 42 (segment.from) with defaulted options.
    expect(scroll).toHaveBeenCalledWith(42, { block: 'center', behavior: 'smooth' });
  });

  it('resolves a multi-segment TextTarget using the first segment', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 100, to: 110 });
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    const input: ScrollIntoViewInput = {
      target: {
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 2, end: 10 } },
          { blockId: 'p2', range: { start: 0, end: 5 } },
        ],
      },
    };
    await scrollRangeIntoView(editor, input);

    // Only the FIRST segment is passed to resolveTextTarget — the helper
    // scrolls to where the selection begins.
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'p1',
      range: { start: 2, end: 10 },
    });
    expect(scroll).toHaveBeenCalledWith(100, { block: 'center', behavior: 'smooth' });
  });

  it('resolves an EntityAddress (trackedChange) via resolveTrackedChange', async () => {
    vi.mocked(resolveTrackedChange).mockReturnValue({ from: 200, to: 210 } as ReturnType<typeof resolveTrackedChange>);
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    await scrollRangeIntoView(editor, {
      target: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc_42' },
    });

    expect(resolveTrackedChange).toHaveBeenCalledWith(editor, 'tc_42');
    expect(scroll).toHaveBeenCalledWith(200, { block: 'center', behavior: 'smooth' });
  });

  it('resolves an EntityAddress (comment) via listCommentAnchors and commentId match', async () => {
    vi.mocked(listCommentAnchors).mockReturnValue([
      { commentId: 'other', pos: 50, end: 55 } as CommentAnchor,
      { commentId: 'c_99', pos: 300, end: 312 } as CommentAnchor,
    ]);
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    await scrollRangeIntoView(editor, {
      target: { kind: 'entity', entityType: 'comment', entityId: 'c_99' },
    });

    expect(scroll).toHaveBeenCalledWith(300, { block: 'center', behavior: 'smooth' });
  });

  it('falls back to importedId when the commentId does not match an anchor', async () => {
    vi.mocked(listCommentAnchors).mockReturnValue([
      { commentId: 'c_generated', importedId: 'docx-42', pos: 777, end: 800 } as CommentAnchor,
    ]);
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    await scrollRangeIntoView(editor, {
      target: { kind: 'entity', entityType: 'comment', entityId: 'docx-42' },
    });

    expect(scroll).toHaveBeenCalledWith(777, { block: 'center', behavior: 'smooth' });
  });

  it('returns { success: false } when the target cannot be resolved', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue(null);
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } },
    });

    expect(out).toEqual({ success: false });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('returns { success: false } when the editor has no presentationEditor', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 5, to: 10 });
    // Editor is missing presentationEditor — the custom-UI host hasn't
    // mounted one (e.g. headless test environment).
    const editor = makeEditor(null);

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
    });

    expect(out).toEqual({ success: false });
  });

  it('passes through block and behavior options when provided', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 1, to: 2 });
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
      block: 'start',
      behavior: 'auto',
    });

    expect(scroll).toHaveBeenCalledWith(1, { block: 'start', behavior: 'auto' });
  });

  it('returns { success: false } when the presentation editor reports failure', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 7, to: 9 });
    const editor = makeEditor({ scrollToPositionAsync: vi.fn().mockResolvedValue(false) });

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } },
    });

    expect(out).toEqual({ success: false });
  });
});
