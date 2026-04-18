import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../parts/adapters/relationships-mutation.js', () => ({
  findOrCreateRelationship: vi.fn(),
}));

import { findOrCreateRelationship } from '../../../../../../parts/adapters/relationships-mutation.js';
import { ensureValidImageRID } from './image-rid.js';

describe('ensureValidImageRID', () => {
  let mockEditor;
  let mockTransaction;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTransaction = {
      setNodeMarkup: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
    };

    mockEditor = {};
  });

  it('does nothing if image already has rId and src', () => {
    const images = [
      {
        node: { attrs: { rId: 'r123', src: 'image.png' } },
        pos: 5,
      },
    ];

    const result = ensureValidImageRID(images, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockTransaction.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('skips image nodes with no src', () => {
    const images = [
      {
        node: { attrs: {} },
        pos: 8,
      },
    ];

    const result = ensureValidImageRID(images, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockTransaction.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('reuses existing rId if found', () => {
    findOrCreateRelationship.mockReturnValue('existing-rId');

    const images = [
      {
        node: { attrs: { src: 'img.jpg' } },
        pos: 2,
      },
    ];

    const result = ensureValidImageRID(images, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results[0]).toBe('Added missing rId to image at pos 2');
    expect(findOrCreateRelationship).toHaveBeenCalledWith(mockEditor, 'image-rid:ensureValidImageRID', {
      target: 'img.jpg',
      type: 'image',
    });
    expect(mockTransaction.setNodeMarkup).toHaveBeenCalledWith(2, undefined, {
      src: 'img.jpg',
      rId: 'existing-rId',
    });
  });

  it('creates new rId when not found', () => {
    findOrCreateRelationship.mockReturnValue('new-rId');

    const images = [
      {
        node: { attrs: { src: 'new-img.png' } },
        pos: 3,
      },
    ];

    const result = ensureValidImageRID(images, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results[0]).toBe('Added missing rId to image at pos 3');
    expect(mockTransaction.setNodeMarkup).toHaveBeenCalledWith(3, undefined, {
      src: 'new-img.png',
      rId: 'new-rId',
    });
  });

  it('handles multiple images with mixed outcomes', () => {
    findOrCreateRelationship.mockReturnValueOnce('created-rId').mockReturnValueOnce('reused-rId');

    const images = [
      { node: { attrs: { src: 'a.png' } }, pos: 0 },
      { node: { attrs: { src: 'b.png' } }, pos: 10 },
    ];

    const result = ensureValidImageRID(images, mockEditor, mockTransaction, mockLogger);

    expect(result.modified).toBe(true);
    expect(result.results).toHaveLength(2);

    expect(mockTransaction.setNodeMarkup).toHaveBeenCalledTimes(2);
    expect(mockTransaction.setNodeMarkup).toHaveBeenNthCalledWith(1, 0, undefined, {
      src: 'a.png',
      rId: 'created-rId',
    });
    expect(mockTransaction.setNodeMarkup).toHaveBeenNthCalledWith(2, 10, undefined, {
      src: 'b.png',
      rId: 'reused-rId',
    });
  });
});
