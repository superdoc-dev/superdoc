// @ts-check
import { describe, it, expect } from 'vitest';
import { createWordIdAllocator, isDecimalWordId } from './word-id-allocator.js';

describe('isDecimalWordId', () => {
  it.each([
    ['0', true],
    ['1', true],
    ['12345', true],
    ['-3', false],
    ['', false],
    ['abc', false],
    ['1a', false],
    ['1.0', false],
    [null, false],
    [undefined, false],
    [42, true],
  ])('classifies %p as %p', (value, expected) => {
    expect(isDecimalWordId(value)).toBe(expected);
  });
});

describe('createWordIdAllocator', () => {
  it('mints sequential decimal ids per part', () => {
    const alloc = createWordIdAllocator();
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'a' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'b' })).toBe('2');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'c' })).toBe('3');
  });

  it('keeps allocations isolated per part', () => {
    const alloc = createWordIdAllocator();
    alloc.allocate({ partPath: 'word/document.xml', logicalId: 'a' });
    alloc.allocate({ partPath: 'word/header1.xml', logicalId: 'a' });
    alloc.allocate({ partPath: 'word/footer1.xml', logicalId: 'b' });

    const snap = alloc.__snapshot();
    expect(snap['word/document.xml'].nextDecimal).toBe(2);
    expect(snap['word/header1.xml'].nextDecimal).toBe(2);
    expect(snap['word/footer1.xml'].nextDecimal).toBe(2);
  });

  it('preserves a decimal sourceId verbatim and reserves it', () => {
    const alloc = createWordIdAllocator();
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '42', logicalId: 'imported' })).toBe('42');
    // The mint counter must skip the reserved value.
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'next' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'next2' })).toBe('2');
  });

  it('skips minted ids that collide with reserved sourceIds', () => {
    const alloc = createWordIdAllocator();
    alloc.reserveAll([
      { partPath: 'word/document.xml', sourceId: '1' },
      { partPath: 'word/document.xml', sourceId: '2' },
      { partPath: 'word/document.xml', sourceId: '4' },
    ]);

    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'a' })).toBe('3');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'b' })).toBe('5');
  });

  it('returns the same id for the same logical id within a part', () => {
    const alloc = createWordIdAllocator();
    const first = alloc.allocate({ partPath: 'word/document.xml', logicalId: 'shared' });
    const second = alloc.allocate({ partPath: 'word/document.xml', logicalId: 'shared' });
    expect(first).toBe(second);
  });

  it('returns different ids for the same logical id across parts', () => {
    const alloc = createWordIdAllocator();
    const body = alloc.allocate({ partPath: 'word/document.xml', logicalId: 'shared' });
    const header = alloc.allocate({ partPath: 'word/header1.xml', logicalId: 'shared' });
    expect(body).toBe('1');
    expect(header).toBe('1');
  });

  it('ignores non-decimal sourceIds when allocating', () => {
    const alloc = createWordIdAllocator();
    // UUID-like sourceIds (some upstream tools embed non-decimal strings) are
    // treated as missing — the allocator mints a fresh decimal id instead.
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: 'aaaa-bbbb', logicalId: 'x' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '-3', logicalId: 'y' })).toBe('2');
  });

  it('records non-decimal sourceId rewrites for reopen import', () => {
    const alloc = createWordIdAllocator();

    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: 'uuid-a', logicalId: 'a' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '9', logicalId: 'word-import' })).toBe('9');
    expect(alloc.allocate({ partPath: 'word/header1.xml', sourceId: 'uuid-h', logicalId: 'h' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: 'uuid-a', logicalId: 'a' })).toBe('1');

    expect(alloc.getSourceIdMap()).toEqual({
      'word/document.xml': { 1: 'uuid-a' },
      'word/header1.xml': { 1: 'uuid-h' },
    });
  });

  it('handles missing partPath by routing to document.xml', () => {
    const alloc = createWordIdAllocator();
    expect(alloc.allocate({ partPath: '', logicalId: 'x' })).toBe('1');
    const snap = alloc.__snapshot();
    expect(Object.keys(snap)).toEqual(['word/document.xml']);
  });

  it('reserve() is a no-op for non-decimal values', () => {
    const alloc = createWordIdAllocator();
    alloc.reserve('word/document.xml', 'not-a-number');
    alloc.reserve('word/document.xml', '');
    alloc.reserve('word/document.xml', null);
    alloc.reserve('word/document.xml', undefined);
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'a' })).toBe('1');
  });

  it('successor fragments get fresh part-local ids after preserved imports', () => {
    const alloc = createWordIdAllocator();
    // Imagine document.xml originally had w:id 1, 3, 7.
    alloc.reserveAll([
      { partPath: 'word/document.xml', sourceId: '1' },
      { partPath: 'word/document.xml', sourceId: '3' },
      { partPath: 'word/document.xml', sourceId: '7' },
    ]);

    // Preserve original ids on re-export.
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '1', logicalId: 'imp-1' })).toBe('1');
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '3', logicalId: 'imp-3' })).toBe('3');
    expect(alloc.allocate({ partPath: 'word/document.xml', sourceId: '7', logicalId: 'imp-7' })).toBe('7');

    // Successor fragments mint fresh ids that avoid the reserved set.
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'frag-a' })).toBe('2');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'frag-b' })).toBe('4');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'frag-c' })).toBe('5');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'frag-d' })).toBe('6');
    expect(alloc.allocate({ partPath: 'word/document.xml', logicalId: 'frag-e' })).toBe('8');
  });
});
