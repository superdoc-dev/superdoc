import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../parts/adapters/relationships-mutation.js', () => ({
  findOrCreateRelationship: vi.fn(),
}));

import { findOrCreateRelationship } from '../../../../../../parts/adapters/relationships-mutation.js';
import { ensureValidLinkRID } from './index.js';

describe('ensureValidLinkRID', () => {
  let mockEditor;
  let mockTransaction;
  let mockLogger;
  let mockLinkMarkType;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLinkMarkType = {
      create: vi.fn((attrs) => ({ type: 'link', attrs })),
    };

    mockTransaction = {
      removeMark: vi.fn(),
      addMark: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
    };

    mockEditor = {
      schema: {
        marks: {
          link: mockLinkMarkType,
        },
      },
    };
  });

  it('does nothing when rId is already present', () => {
    const links = [
      {
        mark: { attrs: { rId: 'r1', href: 'https://example.com' } },
        from: 0,
        to: 10,
      },
    ];

    const result = ensureValidLinkRID(links, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockTransaction.removeMark).not.toHaveBeenCalled();
    expect(mockTransaction.addMark).not.toHaveBeenCalled();
  });

  it('reuses existing rId when found', () => {
    findOrCreateRelationship.mockReturnValue('existing-rId');

    const links = [
      {
        mark: { attrs: { href: 'https://example.com' } },
        from: 5,
        to: 15,
      },
    ];

    const result = ensureValidLinkRID(links, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results[0]).toContain('Added missing rId to link');
    expect(findOrCreateRelationship).toHaveBeenCalledWith(mockEditor, 'link-rid:ensureValidLinkRID', {
      target: 'https://example.com',
      type: 'hyperlink',
    });
    expect(mockLinkMarkType.create).toHaveBeenCalledWith({
      href: 'https://example.com',
      rId: 'existing-rId',
    });

    expect(mockTransaction.removeMark).toHaveBeenCalledWith(5, 15, mockLinkMarkType);
    expect(mockTransaction.addMark).toHaveBeenCalledWith(5, 15, {
      type: 'link',
      attrs: {
        href: 'https://example.com',
        rId: 'existing-rId',
      },
    });
  });

  it('creates new rId when not found', () => {
    findOrCreateRelationship.mockReturnValue('new-rId');

    const links = [
      {
        mark: { attrs: { href: 'https://new.com' } },
        from: 2,
        to: 9,
      },
    ];

    const result = ensureValidLinkRID(links, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results[0]).toBe('Added missing rId to link from pos 2 to 9');

    expect(mockTransaction.removeMark).toHaveBeenCalledWith(2, 9, mockLinkMarkType);
    expect(mockTransaction.addMark).toHaveBeenCalledWith(2, 9, {
      type: 'link',
      attrs: {
        href: 'https://new.com',
        rId: 'new-rId',
      },
    });
  });

  it('skips marks with no href', () => {
    const links = [
      {
        mark: { attrs: {} },
        from: 3,
        to: 6,
      },
    ];

    const result = ensureValidLinkRID(links, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockTransaction.removeMark).not.toHaveBeenCalled();
    expect(mockTransaction.addMark).not.toHaveBeenCalled();
  });

  it('handles multiple links with mixed outcomes', () => {
    findOrCreateRelationship.mockReturnValueOnce('created-rId').mockReturnValueOnce('reused-rId');

    const links = [
      { mark: { attrs: { href: 'a.com' } }, from: 0, to: 5 },
      { mark: { attrs: { href: 'b.com' } }, from: 10, to: 15 },
    ];

    const result = ensureValidLinkRID(links, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(mockTransaction.removeMark).toHaveBeenCalledTimes(2);
    expect(mockTransaction.addMark).toHaveBeenCalledTimes(2);
  });
});
