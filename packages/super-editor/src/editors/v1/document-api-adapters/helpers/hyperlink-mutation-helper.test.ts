import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { Mark, MarkType } from 'prosemirror-model';

vi.mock('@superdoc/url-validation', () => ({
  sanitizeHref: vi.fn((href: string) => {
    if (href.startsWith('javascript:')) return null;
    return { href };
  }),
}));

vi.mock('../../core/parts/adapters/relationships-mutation.js', () => ({
  findOrCreateRelationship: vi.fn(() => 'rId-mock'),
}));

vi.mock('./transaction-meta.js', () => ({
  applyDirectMutationMeta: vi.fn(),
}));

import {
  sanitizeHrefOrThrow,
  buildMarkAttrs,
  wrapWithLink,
  insertLinkedText,
  patchLinkMark,
  unwrapLink,
  deleteLinkedText,
} from './hyperlink-mutation-helper.js';

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

function makeMockTr() {
  const tr = {
    docChanged: true,
    addMark: vi.fn().mockReturnThis(),
    removeMark: vi.fn().mockReturnThis(),
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
  };
  return tr;
}

function makeMockMarkType(): MarkType {
  return {
    create: vi.fn((attrs: Record<string, unknown>) => ({ type: { name: 'link' }, attrs })),
  } as unknown as MarkType;
}

function makeMockEditor(opts: { mode?: string } = {}): {
  editor: Editor;
  tr: ReturnType<typeof makeMockTr>;
  markType: MarkType;
} {
  const tr = makeMockTr();
  const markType = makeMockMarkType();
  const dispatch = vi.fn();

  const editor = {
    state: { tr },
    schema: { marks: { link: markType } },
    options: { mode: opts.mode ?? 'html' },
    dispatch,
  } as unknown as Editor;

  return { editor, tr, markType };
}

function makeMark(attrs: Record<string, unknown>): Mark {
  return { type: { name: 'link' }, attrs } as unknown as Mark;
}

// ---------------------------------------------------------------------------
// sanitizeHrefOrThrow
// ---------------------------------------------------------------------------

describe('sanitizeHrefOrThrow', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns sanitized href for valid URLs', () => {
    expect(sanitizeHrefOrThrow('https://example.com')).toBe('https://example.com');
  });

  it('throws INVALID_INPUT for blocked protocols', () => {
    try {
      sanitizeHrefOrThrow('javascript:alert(1)');
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('Blocked or invalid href');
      expect((err as { code: string }).code).toBe('INVALID_INPUT');
    }
  });
});

// ---------------------------------------------------------------------------
// buildMarkAttrs
// ---------------------------------------------------------------------------

describe('buildMarkAttrs', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('builds attrs with href', () => {
    const { editor } = makeMockEditor();
    const attrs = buildMarkAttrs(editor, { href: 'https://example.com' });
    expect(attrs.href).toBe('https://example.com');
    expect(attrs.rId).toBeNull(); // html mode → no rId
  });

  it('creates rId in docx mode', () => {
    const { editor } = makeMockEditor({ mode: 'docx' });
    const attrs = buildMarkAttrs(editor, { href: 'https://example.com' });
    expect(attrs.rId).toBe('rId-mock');
  });

  it('synthesizes href for anchor-only spec', () => {
    const { editor } = makeMockEditor();
    const attrs = buildMarkAttrs(editor, { anchor: 'bookmark1' });
    expect(attrs.anchor).toBe('bookmark1');
    expect(attrs.href).toBe('#bookmark1');
  });

  it('does not synthesize href when both href and anchor are provided', () => {
    const { editor } = makeMockEditor();
    const attrs = buildMarkAttrs(editor, { href: 'https://example.com', anchor: 'bookmark1' });
    expect(attrs.href).toBe('https://example.com');
    expect(attrs.anchor).toBe('bookmark1');
  });

  it('passes through optional metadata fields', () => {
    const { editor } = makeMockEditor();
    const attrs = buildMarkAttrs(editor, {
      href: 'https://example.com',
      tooltip: 'Tip',
      target: '_blank',
      rel: 'noopener',
      docLocation: 'sheet1',
    });
    expect(attrs.tooltip).toBe('Tip');
    expect(attrs.target).toBe('_blank');
    expect(attrs.rel).toBe('noopener');
    expect(attrs.docLocation).toBe('sheet1');
  });
});

// ---------------------------------------------------------------------------
// wrapWithLink
// ---------------------------------------------------------------------------

describe('wrapWithLink', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls tr.addMark with correct range and mark', () => {
    const { editor, tr, markType } = makeMockEditor();
    wrapWithLink(editor, 5, 10, { href: 'https://example.com' });

    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(tr.addMark.mock.calls[0]![0]).toBe(5);
    expect(tr.addMark.mock.calls[0]![1]).toBe(10);
    expect(markType.create).toHaveBeenCalledTimes(1);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
  });

  it('returns true', () => {
    const { editor } = makeMockEditor();
    expect(wrapWithLink(editor, 0, 5, { href: 'https://example.com' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertLinkedText
// ---------------------------------------------------------------------------

describe('insertLinkedText', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('inserts text then applies mark over the inserted range', () => {
    const { editor, tr } = makeMockEditor();
    insertLinkedText(editor, 3, 'Click here', { href: 'https://example.com' });

    expect(tr.insertText).toHaveBeenCalledWith('Click here', 3);
    expect(tr.addMark).toHaveBeenCalledTimes(1);
    expect(tr.addMark.mock.calls[0]![0]).toBe(3);
    expect(tr.addMark.mock.calls[0]![1]).toBe(3 + 'Click here'.length);
  });
});

// ---------------------------------------------------------------------------
// patchLinkMark
// ---------------------------------------------------------------------------

describe('patchLinkMark', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('merges patch onto existing attrs', () => {
    const { editor, tr, markType } = makeMockEditor();
    const existing = makeMark({ href: 'https://old.com', tooltip: 'Old tip' });

    patchLinkMark(editor, 0, 5, existing, { tooltip: 'New tip' });

    expect(tr.removeMark).toHaveBeenCalledWith(0, 5, existing);
    expect(markType.create).toHaveBeenCalledTimes(1);
    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.href).toBe('https://old.com');
    expect(newAttrs.tooltip).toBe('New tip');
  });

  it('clears fields set to null', () => {
    const { editor, markType } = makeMockEditor();
    const existing = makeMark({ href: 'https://example.com', tooltip: 'Tip' });

    patchLinkMark(editor, 0, 5, existing, { tooltip: null });

    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.tooltip).toBeNull();
  });

  it('ignores undefined patch fields', () => {
    const { editor, markType } = makeMockEditor();
    const existing = makeMark({ href: 'https://example.com', tooltip: 'Tip' });

    patchLinkMark(editor, 0, 5, existing, { tooltip: undefined });

    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.tooltip).toBe('Tip');
  });

  it('re-synthesizes href when anchor changes and existing href is synthetic', () => {
    const { editor, markType } = makeMockEditor();
    const existing = makeMark({ href: '#oldBookmark', anchor: 'oldBookmark' });

    patchLinkMark(editor, 0, 5, existing, { anchor: 'newBookmark' });

    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.anchor).toBe('newBookmark');
    expect(newAttrs.href).toBe('#newBookmark');
  });

  it('does not re-synthesize href when anchor changes but href is external', () => {
    const { editor, markType } = makeMockEditor();
    const existing = makeMark({ href: 'https://example.com', anchor: 'oldBookmark' });

    patchLinkMark(editor, 0, 5, existing, { anchor: 'newBookmark' });

    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.anchor).toBe('newBookmark');
    expect(newAttrs.href).toBe('https://example.com');
  });

  it('synthesizes href when href is cleared and anchor remains', () => {
    const { editor, markType } = makeMockEditor();
    const existing = makeMark({ href: 'https://example.com', anchor: 'bm1' });

    patchLinkMark(editor, 0, 5, existing, { href: null });

    const newAttrs = (markType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(newAttrs.href).toBe('#bm1');
    expect(newAttrs.rId).toBeNull();
  });

  it('returns false and does not dispatch when transaction is a no-op', () => {
    const { editor, tr } = makeMockEditor();
    const existing = makeMark({ href: 'https://example.com' });
    tr.docChanged = false;

    const applied = patchLinkMark(editor, 0, 5, existing, { tooltip: 'New tip' });

    expect(applied).toBe(false);
    expect(editor.dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unwrapLink / deleteLinkedText
// ---------------------------------------------------------------------------

describe('unwrapLink', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('removes the link mark type from the range', () => {
    const { editor, tr } = makeMockEditor();
    unwrapLink(editor, 2, 8);

    expect(tr.removeMark).toHaveBeenCalledTimes(1);
    expect(tr.removeMark.mock.calls[0]![0]).toBe(2);
    expect(tr.removeMark.mock.calls[0]![1]).toBe(8);
  });

  it('returns false when removing marks produces no document change', () => {
    const { editor, tr } = makeMockEditor();
    tr.docChanged = false;

    const applied = unwrapLink(editor, 2, 8);

    expect(applied).toBe(false);
    expect(editor.dispatch).not.toHaveBeenCalled();
  });
});

describe('deleteLinkedText', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('deletes the text range', () => {
    const { editor, tr } = makeMockEditor();
    deleteLinkedText(editor, 2, 8);

    expect(tr.delete).toHaveBeenCalledWith(2, 8);
  });
});
