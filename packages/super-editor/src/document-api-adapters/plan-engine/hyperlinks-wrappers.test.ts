import type { Node as ProseMirrorNode, Mark } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PlanReceipt, HyperlinkTarget, InlineAnchor } from '@superdoc/document-api';
import type { InlineCandidate, InlineIndex } from '../helpers/inline-address-resolver.js';
import type { BlockIndex } from '../helpers/node-address-resolver.js';

// ---------------------------------------------------------------------------
// Module mocks — must come before imports of the module under test
// ---------------------------------------------------------------------------

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

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => '42'),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: vi.fn((): BlockIndex => ({ candidates: [] }) as unknown as BlockIndex),
  clearIndexCache: vi.fn(),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: vi.fn((opName: string, options?: { changeMode?: string }) => {
    if (options?.changeMode === 'tracked') {
      const err = new Error(`${opName} does not support tracked mode`);
      (err as unknown as { code: string; details: Record<string, unknown> }).code = 'CAPABILITY_UNAVAILABLE';
      (err as unknown as { code: string; details: Record<string, unknown> }).details = {
        reason: 'tracked_mode_unsupported',
      };
      throw err;
    }
  }),
}));

vi.mock('../helpers/hyperlink-mutation-helper.js', () => ({
  wrapWithLink: vi.fn(() => true),
  insertLinkedText: vi.fn(() => true),
  patchLinkMark: vi.fn(() => true),
  unwrapLink: vi.fn(() => true),
  deleteLinkedText: vi.fn(() => true),
  sanitizeHrefOrThrow: vi.fn((href: string) => {
    if (href.startsWith('javascript:')) {
      throw Object.assign(new Error('Blocked href'), { code: 'INVALID_INPUT' });
    }
    return href;
  }),
}));

// Store a reference we can control per-test
let mockCandidates: InlineCandidate[] = [];

vi.mock('../helpers/inline-address-resolver.js', () => ({
  buildInlineIndex: vi.fn(
    (): InlineIndex => ({
      candidates: mockCandidates,
      byType: new Map([['hyperlink', mockCandidates]]),
      byKey: new Map(),
    }),
  ),
  findInlineByType: vi.fn((_index: InlineIndex, _type: string) => mockCandidates),
  findInlineByAnchor: vi.fn((_index: InlineIndex, target: HyperlinkTarget) => {
    return (
      mockCandidates.find(
        (c) =>
          c.anchor.start.blockId === target.anchor.start.blockId &&
          c.anchor.start.offset === target.anchor.start.offset &&
          c.anchor.end.offset === target.anchor.end.offset,
      ) ?? null
    );
  }),
}));

vi.mock('../helpers/adapter-utils.js', () => ({
  paginate: vi.fn((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveTextTarget: vi.fn((_editor: Editor, target: { blockId: string; range: { start: number; end: number } }) => {
    // Return a mock resolved range that maps offset to absolute positions
    return { from: target.range.start + 1, to: target.range.end + 1 };
  }),
  resolveDefaultInsertTarget: vi.fn(() => ({
    kind: 'text-block' as const,
    target: { kind: 'text' as const, blockId: 'last-p', range: { start: 10, end: 10 } },
    range: { from: 50, to: 50 },
  })),
  insertParagraphAtEnd: vi.fn(),
  resolveWithinScope: vi.fn(() => ({ ok: true, range: undefined })),
  scopeByRange: vi.fn((candidates: InlineCandidate[]) => candidates),
}));

import {
  hyperlinksListWrapper,
  hyperlinksGetWrapper,
  hyperlinksWrapWrapper,
  hyperlinksInsertWrapper,
  hyperlinksPatchWrapper,
  hyperlinksRemoveWrapper,
} from './hyperlinks-wrappers.js';
import { DocumentApiAdapterError } from '../errors.js';
import {
  wrapWithLink,
  insertLinkedText,
  patchLinkMark,
  unwrapLink,
  deleteLinkedText,
  sanitizeHrefOrThrow,
} from '../helpers/hyperlink-mutation-helper.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAnchor(blockId: string, start: number, end: number): InlineAnchor {
  return { start: { blockId, offset: start }, end: { blockId, offset: end } };
}

function makeLinkMark(attrs: Record<string, unknown>): Mark {
  return { type: { name: 'link' }, attrs } as unknown as Mark;
}

function makeCandidate(
  blockId: string,
  startOffset: number,
  endOffset: number,
  markAttrs: Record<string, unknown>,
  posOverride?: { pos: number; end: number },
): InlineCandidate {
  const anchor = makeAnchor(blockId, startOffset, endOffset);
  return {
    nodeType: 'hyperlink',
    anchor,
    blockId,
    pos: posOverride?.pos ?? startOffset + 1,
    end: posOverride?.end ?? endOffset + 1,
    mark: makeLinkMark(markAttrs),
    attrs: markAttrs,
  };
}

function makeEditor(): Editor {
  return {
    state: {
      doc: {
        textBetween: vi.fn((_from: number, _to: number) => 'link text'),
        resolve: vi.fn(() => ({
          depth: 1,
          node: () => ({ type: { name: 'paragraph' } }),
        })),
      },
    },
    schema: { marks: { link: {} } },
    options: { mode: 'html' },
  } as unknown as Editor;
}

function makeHyperlinkTarget(blockId: string, start: number, end: number): HyperlinkTarget {
  return {
    kind: 'inline',
    nodeType: 'hyperlink',
    anchor: makeAnchor(blockId, start, end),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  mockCandidates = [];
});

// ---------------------------------------------------------------------------
// hyperlinks.list
// ---------------------------------------------------------------------------

describe('hyperlinksListWrapper', () => {
  it('returns empty result for document with no links', () => {
    const editor = makeEditor();
    const result = hyperlinksListWrapper(editor);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('returns all hyperlinks in the document', () => {
    mockCandidates = [
      makeCandidate('p1', 0, 5, { href: 'https://a.com' }),
      makeCandidate('p2', 0, 3, { href: 'https://b.com' }),
    ];
    const editor = makeEditor();

    const result = hyperlinksListWrapper(editor);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('filters by hrefPattern', () => {
    mockCandidates = [
      makeCandidate('p1', 0, 5, { href: 'https://example.com/page' }),
      makeCandidate('p2', 0, 3, { href: 'https://other.com' }),
    ];
    const editor = makeEditor();

    const result = hyperlinksListWrapper(editor, { hrefPattern: 'example.com' });
    expect(result.total).toBe(1);
  });

  it('filters by anchor', () => {
    mockCandidates = [
      makeCandidate('p1', 0, 5, { href: '#bookmark1', anchor: 'bookmark1' }),
      makeCandidate('p2', 0, 3, { href: 'https://example.com' }),
    ];
    const editor = makeEditor();

    const result = hyperlinksListWrapper(editor, { anchor: 'bookmark1' });
    expect(result.total).toBe(1);
  });

  it('applies pagination', () => {
    mockCandidates = [
      makeCandidate('p1', 0, 5, { href: 'https://a.com' }),
      makeCandidate('p2', 0, 3, { href: 'https://b.com' }),
      makeCandidate('p3', 0, 4, { href: 'https://c.com' }),
    ];
    const editor = makeEditor();

    const result = hyperlinksListWrapper(editor, { limit: 2 });
    expect(result.total).toBe(3);
    expect(result.page.limit).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// hyperlinks.get
// ---------------------------------------------------------------------------

describe('hyperlinksGetWrapper', () => {
  it('returns info for a found hyperlink', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com', tooltip: 'Tip' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
    expect(result.address.nodeType).toBe('hyperlink');
    expect(result.properties.href).toBe('https://example.com');
    expect(result.properties.tooltip).toBe('Tip');
  });

  it('throws TARGET_NOT_FOUND when hyperlink is not found', () => {
    mockCandidates = [];
    const editor = makeEditor();

    try {
      hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentApiAdapterError);
      expect((err as DocumentApiAdapterError).code).toBe('TARGET_NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// hyperlinks.wrap
// ---------------------------------------------------------------------------

describe('hyperlinksWrapWrapper', () => {
  it('wraps text range with a link', () => {
    mockCandidates = [];
    const editor = makeEditor();

    const result = hyperlinksWrapWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(wrapWithLink).toHaveBeenCalledTimes(1);
  });

  it('returns NO_OP when range is already linked with same destination', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksWrapWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('NO_OP');
    }
  });

  it('validates href before dry-run return', () => {
    mockCandidates = [];
    const editor = makeEditor();

    expect(() => {
      hyperlinksWrapWrapper(
        editor,
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          link: { destination: { href: 'javascript:alert(1)' } },
        },
        { dryRun: true },
      );
    }).toThrow('Blocked href');
  });

  it('supports dry-run without calling mutation', () => {
    mockCandidates = [];
    const editor = makeEditor();

    const result = hyperlinksWrapWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        link: { destination: { href: 'https://example.com' } },
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(wrapWithLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hyperlinks.insert
// ---------------------------------------------------------------------------

describe('hyperlinksInsertWrapper', () => {
  it('inserts linked text at the target position', () => {
    mockCandidates = [];
    const editor = makeEditor();

    const result = hyperlinksInsertWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } },
        text: 'Click',
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(insertLinkedText).toHaveBeenCalledTimes(1);
  });

  it('uses resolveDefaultInsertTarget when target is omitted', async () => {
    mockCandidates = [];
    const editor = makeEditor();
    const { resolveDefaultInsertTarget } = await import('../helpers/adapter-utils.js');

    const result = hyperlinksInsertWrapper(
      editor,
      {
        text: 'Click',
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(resolveDefaultInsertTarget).toHaveBeenCalledTimes(1);
  });

  it('validates href before dry-run return', () => {
    mockCandidates = [];
    const editor = makeEditor();

    expect(() => {
      hyperlinksInsertWrapper(
        editor,
        {
          text: 'Click',
          link: { destination: { href: 'javascript:alert(1)' } },
        },
        { dryRun: true },
      );
    }).toThrow('Blocked href');
  });

  it('supports dry-run without calling mutation', () => {
    mockCandidates = [];
    const editor = makeEditor();

    const result = hyperlinksInsertWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } },
        text: 'Click',
        link: { destination: { href: 'https://example.com' } },
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(insertLinkedText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hyperlinks.patch
// ---------------------------------------------------------------------------

describe('hyperlinksPatchWrapper', () => {
  it('patches mark attrs on an existing link', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://old.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { href: 'https://new.com' },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(patchLinkMark).toHaveBeenCalledTimes(1);
  });

  it('uses resolved text range instead of candidate absolute positions', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://old.com' }, { pos: 100, end: 200 });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { href: 'https://new.com' },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    const call = (patchLinkMark as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(6);
  });

  it('returns NO_OP when patch matches existing values', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { href: 'https://example.com' },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('NO_OP');
    }
  });

  it('rejects patch that would clear both href and anchor', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    try {
      hyperlinksPatchWrapper(
        editor,
        {
          target: makeHyperlinkTarget('p1', 0, 5),
          patch: { href: null },
        },
        { changeMode: 'direct' },
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentApiAdapterError);
      expect((err as DocumentApiAdapterError).code).toBe('INVALID_INPUT');
    }
  });

  it('allows patch on fragment-style links (href: "#bookmark")', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: '#bookmark1' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { tooltip: 'Updated tooltip' },
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
  });

  it('supports dry-run without calling mutation', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://old.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { href: 'https://new.com' },
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(patchLinkMark).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hyperlinks.remove
// ---------------------------------------------------------------------------

describe('hyperlinksRemoveWrapper', () => {
  it('unwraps a link by default (preserves text)', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksRemoveWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(unwrapLink).toHaveBeenCalledTimes(1);
    expect(deleteLinkedText).not.toHaveBeenCalled();
  });

  it('uses resolved text range instead of candidate absolute positions', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' }, { pos: 100, end: 200 });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksRemoveWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        mode: 'unwrap',
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    const call = (unwrapLink as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(6);
  });

  it('deletes text when mode is deleteText', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksRemoveWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        mode: 'deleteText',
      },
      { changeMode: 'direct' },
    );

    expect(result.success).toBe(true);
    expect(deleteLinkedText).toHaveBeenCalledTimes(1);
    expect(unwrapLink).not.toHaveBeenCalled();
  });

  it('supports dry-run without calling mutation', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksRemoveWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(unwrapLink).not.toHaveBeenCalled();
  });

  it('throws TARGET_NOT_FOUND for missing hyperlink', () => {
    mockCandidates = [];
    const editor = makeEditor();

    try {
      hyperlinksRemoveWrapper(
        editor,
        {
          target: makeHyperlinkTarget('p1', 0, 5),
        },
        { changeMode: 'direct' },
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentApiAdapterError);
      expect((err as DocumentApiAdapterError).code).toBe('TARGET_NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// Read normalization (tested via list/get output)
// ---------------------------------------------------------------------------

describe('read normalization via hyperlinksGetWrapper', () => {
  it('normalizes #-prefixed href to anchor when no anchor attr exists', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: '#bookmark1' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
    expect(result.properties.anchor).toBe('bookmark1');
    expect(result.properties.href).toBeUndefined();
  });

  it('suppresses synthetic href when it matches anchor', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: '#bm1', anchor: 'bm1' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
    expect(result.properties.anchor).toBe('bm1');
    expect(result.properties.href).toBeUndefined();
  });

  it('reports external href as-is', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: 'https://example.com' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
    expect(result.properties.href).toBe('https://example.com');
  });

  it('reports both href and anchor when #-href differs from anchor', () => {
    const candidate = makeCandidate('p1', 0, 5, { href: '#other', anchor: 'bookmark1' });
    mockCandidates = [candidate];
    const editor = makeEditor();

    const result = hyperlinksGetWrapper(editor, { target: makeHyperlinkTarget('p1', 0, 5) });
    expect(result.properties.href).toBe('#other');
    expect(result.properties.anchor).toBe('bookmark1');
  });
});
