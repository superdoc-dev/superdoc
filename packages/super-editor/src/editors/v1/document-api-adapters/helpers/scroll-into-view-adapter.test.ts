import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { ScrollIntoViewInput } from '@superdoc/document-api';

vi.mock('./adapter-utils.js', async () => {
  const actual = await vi.importActual<typeof import('./adapter-utils.js')>('./adapter-utils.js');
  return { ...actual, resolveTextTarget: vi.fn() };
});

import { resolveTextTarget } from './adapter-utils.js';
import { scrollRangeIntoView } from './scroll-into-view-adapter.js';

function makeEditor(
  presentationStub: {
    scrollToPositionAsync?: ReturnType<typeof vi.fn>;
    navigateTo?: ReturnType<typeof vi.fn>;
  } | null = {},
): Editor {
  const presentation = presentationStub
    ? {
        scrollToPositionAsync: presentationStub.scrollToPositionAsync ?? vi.fn().mockResolvedValue(true),
        navigateTo: presentationStub.navigateTo ?? vi.fn().mockResolvedValue(true),
      }
    : null;
  return { presentationEditor: presentation } as unknown as Editor;
}

describe('scrollRangeIntoView — TextAddress / TextTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a TextAddress target and delegates to scrollToPositionAsync', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 42, to: 48 });
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 9 } },
    });

    expect(out).toEqual({ success: true });
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'p1',
      range: { start: 3, end: 9 },
    });
    expect(scroll).toHaveBeenCalledWith(42, { block: 'center', behavior: 'smooth' });
  });

  it('resolves a multi-segment TextTarget using the first segment', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 100, to: 110 });
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    await scrollRangeIntoView(editor, {
      target: {
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 2, end: 10 } },
          { blockId: 'p2', range: { start: 0, end: 5 } },
        ],
      },
    });

    // Only the FIRST segment is passed to resolveTextTarget — the helper
    // scrolls to where the selection begins.
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'p1',
      range: { start: 2, end: 10 },
    });
    expect(scroll).toHaveBeenCalledWith(100, { block: 'center', behavior: 'smooth' });
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

  it('returns { success: false } when the text target cannot be resolved', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue(null);
    const editor = makeEditor();
    const scroll = editor.presentationEditor!.scrollToPositionAsync as ReturnType<typeof vi.fn>;

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } },
    });

    expect(out).toEqual({ success: false });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('returns { success: false } when the presentation editor reports failure', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 7, to: 9 });
    const editor = makeEditor({ scrollToPositionAsync: vi.fn().mockResolvedValue(false) });

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } },
    });

    expect(out).toEqual({ success: false });
  });

  it('returns { success: false } when resolveTextTarget throws (ambiguous block id)', async () => {
    // Production resolver throws `DocumentApiAdapterError` for ambiguous
    // block IDs. The adapter must catch and convert to success: false
    // rather than leak the error to the caller.
    vi.mocked(resolveTextTarget).mockImplementation(() => {
      throw new Error('Ambiguous block id');
    });
    const editor = makeEditor();

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'duplicated', range: { start: 0, end: 5 } },
    });

    expect(out).toEqual({ success: false });
  });

  it('returns { success: false } when scrollToPositionAsync rejects', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 10, to: 15 });
    const editor = makeEditor({
      scrollToPositionAsync: vi.fn().mockRejectedValue(new Error('layout not ready')),
    });

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
    });

    expect(out).toEqual({ success: false });
  });
});

describe('scrollRangeIntoView — EntityAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates a comment EntityAddress to presentation.navigateTo', async () => {
    const navigateTo = vi.fn().mockResolvedValue(true);
    const editor = makeEditor({ navigateTo });
    const input: ScrollIntoViewInput = {
      target: { kind: 'entity', entityType: 'comment', entityId: 'c_1' },
    };

    const out = await scrollRangeIntoView(editor, input);

    expect(out).toEqual({ success: true });
    expect(navigateTo).toHaveBeenCalledWith(input.target);
    // Text-path helpers must not be invoked for entity targets.
    expect(resolveTextTarget).not.toHaveBeenCalled();
  });

  it('delegates a trackedChange EntityAddress (including story) to presentation.navigateTo', async () => {
    const navigateTo = vi.fn().mockResolvedValue(true);
    const editor = makeEditor({ navigateTo });
    const input: ScrollIntoViewInput = {
      // trackedChange in a footnote story — story must reach navigateTo
      // unchanged so it can activate the right editor surface before
      // scrolling.
      target: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc_42',
        story: { storyType: 'footnote', refId: 'fn_1' },
      } as ScrollIntoViewInput['target'],
    };

    await scrollRangeIntoView(editor, input);

    expect(navigateTo).toHaveBeenCalledWith(input.target);
  });

  it('returns whatever navigateTo returns (e.g. success: false)', async () => {
    const navigateTo = vi.fn().mockResolvedValue(false);
    const editor = makeEditor({ navigateTo });

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'entity', entityType: 'comment', entityId: 'c_missing' },
    });

    expect(out).toEqual({ success: false });
  });

  it('returns { success: false } when navigateTo throws', async () => {
    const navigateTo = vi.fn().mockRejectedValue(new Error('boom'));
    const editor = makeEditor({ navigateTo });

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc_boom' },
    });

    expect(out).toEqual({ success: false });
  });
});

describe('scrollRangeIntoView — presentation unavailable', () => {
  it('returns { success: false } when the editor has no presentationEditor', async () => {
    vi.mocked(resolveTextTarget).mockReturnValue({ from: 5, to: 10 });
    const editor = makeEditor(null);

    const out = await scrollRangeIntoView(editor, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
    });

    expect(out).toEqual({ success: false });
  });
});
