import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Lightweight stand-in so `selection instanceof TextSelection` works in tests. */
const { MockTextSelection } = vi.hoisted(() => {
  class MockTextSelection {
    constructor({ from = 0, to = 0 } = {}) {
      this.from = from;
      this.to = to;
      this.empty = from === to;
    }
  }
  return { MockTextSelection };
});

vi.mock('prosemirror-state', () => ({
  TextSelection: MockTextSelection,
}));

vi.mock('@superdoc/url-validation', () => {
  const DEFAULT_ALLOWED_PROTOCOLS = ['http', 'https', 'mailto', 'tel', 'sms'];

  return {
    UrlValidationConstants: { DEFAULT_ALLOWED_PROTOCOLS },
    sanitizeHref: vi.fn((raw, config) => {
      if (!raw || typeof raw !== 'string') return null;

      const trimmed = raw.trim();
      if (!trimmed) return null;

      // Reject blocked protocols
      if (/^javascript:/i.test(trimmed)) return null;

      // Must have a known protocol
      const match = trimmed.match(/^([a-z]+):/i);
      if (!match) return null;

      const protocol = match[1].toLowerCase();
      const allowed = config?.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
      if (!allowed.includes(protocol)) return null;

      return { href: trimmed, protocol, isExternal: true };
    }),
  };
});

vi.mock('@core/super-converter/docx-helpers/document-rels.js', () => ({
  findRelationshipIdFromTarget: vi.fn(),
  insertNewRelationship: vi.fn(),
}));

vi.mock('../../utils/rangeUtils.js', () => ({
  mergeRanges: vi.fn((ranges, _docSize) => {
    if (!ranges.length) return [];
    const sorted = [...ranges].sort((a, b) => a.from - b.from);
    const merged = [];
    for (const range of sorted) {
      const last = merged[merged.length - 1];
      if (last && range.from <= last.to) {
        last.to = Math.max(last.to, range.to);
      } else {
        merged.push({ ...range });
      }
    }
    return merged;
  }),
}));

import { sanitizeHref } from '@superdoc/url-validation';
import {
  findRelationshipIdFromTarget,
  insertNewRelationship,
} from '@core/super-converter/docx-helpers/document-rels.js';
import {
  maybeAddProtocol,
  detectPasteUrl,
  canAllocateRels,
  handlePlainTextUrlPaste,
  normalizePastedLinks,
} from './paste-link-normalizer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shared link mark type so editor and transaction mocks use the same reference */
const LINK_MARK_TYPE = {
  name: 'link',
  create: (attrs) => ({ type: LINK_MARK_TYPE, attrs }),
};

function createMockEditor(overrides = {}) {
  return {
    options: {
      mode: 'docx',
      isChildEditor: false,
      isHeaderOrFooter: false,
      ...overrides,
    },
    schema: {
      marks: {
        link: LINK_MARK_TYPE,
        underline: {
          create: () => ({ type: { name: 'underline' } }),
        },
      },
    },
    converter: { convertedXml: {} },
  };
}

function createMockView({ selectionFrom = 0, selectionTo = 0, isTextSelection = true } = {}) {
  const dispatched = [];
  const tr = createMockTransaction();

  const selection = isTextSelection
    ? new MockTextSelection({ from: selectionFrom, to: selectionTo })
    : { from: selectionFrom, to: selectionTo, empty: selectionFrom === selectionTo };

  return {
    state: { selection, tr },
    dispatch: (transaction) => dispatched.push(transaction),
    _dispatched: dispatched,
  };
}

function createMockTransaction() {
  const tr = {
    doc: { content: { size: 100 } },
    mapping: {
      maps: [],
    },
    insertText: vi.fn(function () {
      return this;
    }),
    addMark: vi.fn(function () {
      return this;
    }),
    removeMark: vi.fn(function () {
      return this;
    }),
    scrollIntoView: vi.fn(function () {
      return this;
    }),
  };

  return tr;
}

// ---------------------------------------------------------------------------
// maybeAddProtocol
// ---------------------------------------------------------------------------

describe('maybeAddProtocol', () => {
  it('prepends https:// to www. URLs', () => {
    expect(maybeAddProtocol('www.example.com')).toBe('https://www.example.com');
  });

  it('handles case-insensitive www. prefix', () => {
    expect(maybeAddProtocol('WWW.Example.COM')).toBe('https://WWW.Example.COM');
  });

  it('does not modify URLs that already have a protocol', () => {
    expect(maybeAddProtocol('https://example.com')).toBe('https://example.com');
  });

  it('does not modify non-URL text', () => {
    expect(maybeAddProtocol('not a url')).toBe('not a url');
  });

  it('returns empty string unchanged', () => {
    expect(maybeAddProtocol('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// detectPasteUrl
// ---------------------------------------------------------------------------

describe('detectPasteUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects https URL', () => {
    const result = detectPasteUrl('https://example.com');
    expect(result).toEqual({ href: 'https://example.com' });
  });

  it('detects http URL with path and query', () => {
    const result = detectPasteUrl('http://example.com/path?q=1');
    expect(result).toEqual({ href: 'http://example.com/path?q=1' });
  });

  it('detects www. URL by prepending https://', () => {
    const result = detectPasteUrl('www.example.com');
    expect(result).toEqual({ href: 'https://www.example.com' });
  });

  it('detects mailto links', () => {
    const result = detectPasteUrl('mailto:user@example.com');
    expect(result).toEqual({ href: 'mailto:user@example.com' });
  });

  it('returns null for plain text', () => {
    expect(detectPasteUrl('just some text')).toBeNull();
  });

  it('returns null for URL with trailing text', () => {
    expect(detectPasteUrl('https://example.com extra text')).toBeNull();
  });

  it('rejects javascript: protocol', () => {
    expect(detectPasteUrl('javascript:alert(1)')).toBeNull();
  });

  it('trims whitespace before detecting', () => {
    const result = detectPasteUrl('  https://example.com  ');
    expect(result).toEqual({ href: 'https://example.com' });
  });

  it('returns null for empty string', () => {
    expect(detectPasteUrl('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(detectPasteUrl(null)).toBeNull();
    expect(detectPasteUrl(undefined)).toBeNull();
  });

  it('normalizes protocol config entries (case and {scheme} objects)', () => {
    // Mock sanitizeHref to accept FTP protocol when configured
    sanitizeHref.mockImplementationOnce((raw, config) => {
      if (raw === 'ftp://files.example.com' && config?.allowedProtocols?.includes('ftp')) {
        return { href: 'ftp://files.example.com', protocol: 'ftp', isExternal: true };
      }
      return null;
    });

    const result = detectPasteUrl('ftp://files.example.com', [{ scheme: 'FTP' }]);
    expect(result).toEqual({ href: 'ftp://files.example.com' });
  });
});

// ---------------------------------------------------------------------------
// canAllocateRels
// ---------------------------------------------------------------------------

describe('canAllocateRels', () => {
  it('returns true for main docx editor', () => {
    const editor = createMockEditor();
    expect(canAllocateRels(editor)).toBe(true);
  });

  it('returns false for child editors', () => {
    const editor = createMockEditor({ isChildEditor: true });
    expect(canAllocateRels(editor)).toBe(false);
  });

  it('returns false for header/footer editors', () => {
    const editor = createMockEditor({ isHeaderOrFooter: true });
    expect(canAllocateRels(editor)).toBe(false);
  });

  it('returns false for non-docx mode', () => {
    const editor = createMockEditor({ mode: 'html' });
    expect(canAllocateRels(editor)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handlePlainTextUrlPaste
// ---------------------------------------------------------------------------

describe('handlePlainTextUrlPaste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts URL text and applies link + underline marks on collapsed selection', () => {
    const editor = createMockEditor({ mode: 'html' });
    const view = createMockView({ selectionFrom: 5, selectionTo: 5 });
    const detected = { href: 'https://example.com' };

    const handled = handlePlainTextUrlPaste(editor, view, 'https://example.com', detected);

    expect(handled).toBe(true);
    expect(view._dispatched).toHaveLength(1);

    const tr = view._dispatched[0];
    expect(tr.insertText).toHaveBeenCalledWith('https://example.com', 5);
    expect(tr.addMark).toHaveBeenCalledTimes(2); // link + underline
  });

  it('applies link mark to non-collapsed text selection without inserting text', () => {
    const editor = createMockEditor({ mode: 'html' });
    const view = createMockView({ selectionFrom: 5, selectionTo: 15 });
    const detected = { href: 'https://example.com' };

    const handled = handlePlainTextUrlPaste(editor, view, 'https://example.com', detected);

    expect(handled).toBe(true);

    const tr = view._dispatched[0];
    expect(tr.insertText).not.toHaveBeenCalled();
    expect(tr.addMark).toHaveBeenCalled();
  });

  it('returns false for non-text selections (NodeSelection, CellSelection)', () => {
    const editor = createMockEditor({ mode: 'html' });
    const view = createMockView({ selectionFrom: 5, selectionTo: 15, isTextSelection: false });
    const detected = { href: 'https://example.com' };

    const handled = handlePlainTextUrlPaste(editor, view, 'https://example.com', detected);
    expect(handled).toBe(false);
    expect(view._dispatched).toHaveLength(0);
  });

  it('allocates rId for main docx editor', () => {
    const editor = createMockEditor({ mode: 'docx' });
    const view = createMockView({ selectionFrom: 0, selectionTo: 0 });

    findRelationshipIdFromTarget.mockReturnValue(null);
    insertNewRelationship.mockReturnValue('rId5');

    handlePlainTextUrlPaste(editor, view, 'https://example.com', { href: 'https://example.com' });

    expect(insertNewRelationship).toHaveBeenCalledWith('https://example.com', 'hyperlink', editor);
  });

  it('does not allocate rId for child editor', () => {
    const editor = createMockEditor({ mode: 'docx', isChildEditor: true });
    const view = createMockView({ selectionFrom: 0, selectionTo: 0 });

    handlePlainTextUrlPaste(editor, view, 'https://example.com', { href: 'https://example.com' });

    expect(insertNewRelationship).not.toHaveBeenCalled();
  });

  it('returns false when link mark type is not in schema', () => {
    const editor = createMockEditor();
    editor.schema.marks.link = undefined;
    const view = createMockView();

    const handled = handlePlainTextUrlPaste(editor, view, 'https://example.com', { href: 'https://example.com' });
    expect(handled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizePastedLinks
// ---------------------------------------------------------------------------

describe('normalizePastedLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createTransactionWithLinks(linkSpans = []) {
    const tr = {
      doc: {
        content: { size: 100 },
        nodesBetween: vi.fn((from, to, callback) => {
          for (const span of linkSpans) {
            if (span.from >= from && span.from < to) {
              const linkMark = { type: LINK_MARK_TYPE, attrs: { ...span.attrs } };
              const node = {
                isInline: true,
                nodeSize: span.to - span.from,
                marks: [linkMark],
              };
              callback(node, span.from);
            }
          }
        }),
      },
      mapping: {
        maps: [
          {
            forEach: (cb) => {
              // Simulate one changed range covering the whole area
              if (linkSpans.length) {
                const minFrom = Math.min(...linkSpans.map((s) => s.from));
                const maxTo = Math.max(...linkSpans.map((s) => s.to));
                cb(minFrom, maxTo, minFrom, maxTo);
              }
            },
          },
        ],
      },
      removeMark: vi.fn(),
      addMark: vi.fn(),
    };

    return { tr, linkMarkType: LINK_MARK_TYPE };
  }

  it('sanitizes valid href and strips pasted rId (non-docx)', () => {
    const editor = createMockEditor({ mode: 'html' });
    const { tr, linkMarkType } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: 'https://example.com', rId: 'rId99' } },
    ]);

    normalizePastedLinks(tr, editor);

    expect(tr.removeMark).toHaveBeenCalledWith(0, 10, linkMarkType);
    expect(tr.addMark).toHaveBeenCalled();

    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.href).toBe('https://example.com');
    expect(addedMark.attrs.rId).toBeNull();
  });

  it('allocates fresh rId for main docx editor', () => {
    const editor = createMockEditor({ mode: 'docx' });
    findRelationshipIdFromTarget.mockReturnValue(null);
    insertNewRelationship.mockReturnValue('rId10');

    const { tr } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: 'https://example.com', rId: 'rId1' } },
    ]);

    normalizePastedLinks(tr, editor);

    expect(insertNewRelationship).toHaveBeenCalledWith('https://example.com', 'hyperlink', editor);

    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.rId).toBe('rId10');
  });

  it('strips rId but skips allocation for child/header editor', () => {
    const editor = createMockEditor({ mode: 'docx', isHeaderOrFooter: true });
    const { tr } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: 'https://example.com', rId: 'rId5' } },
    ]);

    normalizePastedLinks(tr, editor);

    expect(insertNewRelationship).not.toHaveBeenCalled();

    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.rId).toBeNull();
  });

  it('removes link mark when href is invalid', () => {
    const editor = createMockEditor({ mode: 'html' });
    const { tr, linkMarkType } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: 'javascript:alert(1)', rId: null } },
    ]);

    normalizePastedLinks(tr, editor);

    expect(tr.removeMark).toHaveBeenCalledWith(0, 10, linkMarkType);
    expect(tr.addMark).not.toHaveBeenCalled();
  });

  it('prepends https:// to www. hrefs in pasted HTML', () => {
    const editor = createMockEditor({ mode: 'html' });
    const { tr } = createTransactionWithLinks([{ from: 0, to: 10, attrs: { href: 'www.example.com', rId: null } }]);

    // Override sanitizeHref to accept the prepended URL
    sanitizeHref.mockImplementationOnce((raw) => {
      if (raw === 'https://www.example.com') {
        return { href: 'https://www.example.com', protocol: 'https', isExternal: true };
      }
      return null;
    });

    normalizePastedLinks(tr, editor);

    expect(sanitizeHref).toHaveBeenCalledWith('https://www.example.com', expect.any(Object));
    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.href).toBe('https://www.example.com');
  });

  it('is a no-op when there are no link marks in range', () => {
    const editor = createMockEditor();
    const { tr } = createTransactionWithLinks([]);

    // No step maps = no changed ranges
    tr.mapping.maps = [];
    normalizePastedLinks(tr, editor);

    expect(tr.removeMark).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
  });

  it('normalizes multiple links independently', () => {
    const editor = createMockEditor({ mode: 'html' });
    const { tr } = createTransactionWithLinks([
      { from: 0, to: 5, attrs: { href: 'https://one.com', rId: 'rId1' } },
      { from: 10, to: 15, attrs: { href: 'https://two.com', rId: 'rId2' } },
    ]);

    normalizePastedLinks(tr, editor);

    // Both links should be removed then re-added
    expect(tr.removeMark).toHaveBeenCalledTimes(2);
    expect(tr.addMark).toHaveBeenCalledTimes(2);
  });

  it('reapplies anchor-only link with rId stripped', () => {
    const editor = createMockEditor({ mode: 'docx' });
    const { tr, linkMarkType } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: null, anchor: 'bookmark1', rId: 'rId3' } },
    ]);

    normalizePastedLinks(tr, editor);

    // Must reapply the mark to strip the pasted rId
    expect(tr.removeMark).toHaveBeenCalledWith(0, 10, linkMarkType);
    expect(tr.addMark).toHaveBeenCalledTimes(1);

    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.rId).toBeNull();
    expect(addedMark.attrs.anchor).toBe('bookmark1');
  });

  it('preserves name-only anchor target with rId stripped', () => {
    const editor = createMockEditor({ mode: 'docx' });
    const { tr, linkMarkType } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: null, name: 'toc_1', rId: 'rId7' } },
    ]);

    normalizePastedLinks(tr, editor);

    // Name-only links are valid bookmark targets — must be preserved
    expect(tr.removeMark).toHaveBeenCalledWith(0, 10, linkMarkType);
    expect(tr.addMark).toHaveBeenCalledTimes(1);

    const addedMark = tr.addMark.mock.calls[0][2];
    expect(addedMark.attrs.rId).toBeNull();
    expect(addedMark.attrs.name).toBe('toc_1');
  });

  it('removes link with no href, no anchor, and no name', () => {
    const editor = createMockEditor({ mode: 'html' });
    const { tr, linkMarkType } = createTransactionWithLinks([
      { from: 0, to: 10, attrs: { href: null, anchor: undefined, name: null, rId: null } },
    ]);

    normalizePastedLinks(tr, editor);

    expect(tr.removeMark).toHaveBeenCalledWith(0, 10, linkMarkType);
    expect(tr.addMark).not.toHaveBeenCalled();
  });
});
