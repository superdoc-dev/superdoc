// @ts-check
import { describe, it, expect } from 'vitest';
import { createImportTrackingContext, withParentFrame } from './import-context.js';

describe('createImportTrackingContext', () => {
  it('defaults partPath / replacements', () => {
    const ctx = createImportTrackingContext();
    expect(ctx.partPath).toBe('word/document.xml');
    expect(ctx.replacements).toBe('paired');
  });

  it('tracks a parent stack via pushParent / popParent', () => {
    const ctx = createImportTrackingContext();
    expect(ctx.currentParent()).toBeNull();

    ctx.pushParent({ logicalId: 'a', side: 'insertion', sourceId: '1', author: 'Alice', date: '2024-01-01' });
    expect(ctx.currentParent()).toMatchObject({ logicalId: 'a', side: 'insertion' });

    ctx.pushParent({ logicalId: 'b', side: 'deletion', sourceId: '2', author: 'Bob', date: '2024-01-02' });
    expect(ctx.parentStack().map((f) => f.logicalId)).toEqual(['a', 'b']);

    expect(ctx.popParent()?.logicalId).toBe('b');
    expect(ctx.currentParent()?.logicalId).toBe('a');
  });

  it('withParentFrame pops the frame even on throw', () => {
    const ctx = createImportTrackingContext();
    expect(() => {
      withParentFrame(ctx, { logicalId: 'x', side: 'insertion', sourceId: '7', author: 'A', date: 'D' }, () => {
        expect(ctx.currentParent()?.logicalId).toBe('x');
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(ctx.currentParent()).toBeNull();
  });

  it('collects diagnostics and exposes a snapshot copy', () => {
    const ctx = createImportTrackingContext();
    ctx.reportDiagnostic({ code: 'IMPORT_MISSING_AUTHOR_IDENTITY', partPath: 'word/document.xml', sourceId: '1' });
    ctx.reportDiagnostic({ code: 'IMPORT_REPLACEMENT_MISSING_SIDE', partPath: 'word/document.xml' });

    const list = ctx.diagnostics();
    expect(list).toHaveLength(2);
    expect(list[0].code).toBe('IMPORT_MISSING_AUTHOR_IDENTITY');
    // snapshot must not allow callers to mutate internal storage.
    list.push({ code: 'EXPORT_FALLBACK_LOSSY', partPath: 'word/document.xml' });
    expect(ctx.diagnostics()).toHaveLength(2);
  });

  it('forNestedPart shares diagnostics + knownLogicalIds across parts', () => {
    const ctx = createImportTrackingContext();
    ctx.recordLogicalId('uuid-1', { sourceId: '1', side: 'insertion' });

    const nested = ctx.forNestedPart('word/header1.xml');
    expect(nested.partPath).toBe('word/header1.xml');
    expect(nested.hasLogicalId('uuid-1')).toBe(true);

    nested.reportDiagnostic({ code: 'IMPORT_HEURISTIC_RECONSTRUCTION', partPath: 'word/header1.xml' });
    expect(ctx.diagnostics().some((d) => d.partPath === 'word/header1.xml')).toBe(true);
  });

  it('diagnoses duplicate same-side logical ids but allows paired opposite sides', () => {
    const ctx = createImportTrackingContext();
    ctx.recordLogicalId('7', { sourceId: '7', side: 'insertion' });
    ctx.recordLogicalId('7', { sourceId: '7', side: 'deletion' });
    expect(ctx.diagnostics()).toEqual([]);

    ctx.recordLogicalId('7', { sourceId: '7', side: 'insertion' });
    expect(ctx.diagnostics()).toEqual([
      {
        code: 'IMPORT_DUPLICATE_LOGICAL_ID',
        partPath: 'word/document.xml',
        logicalId: '7',
        side: 'insertion',
      },
    ]);
  });

  it('continues to diagnose duplicates after both replacement sides were seen', () => {
    const ctx = createImportTrackingContext();
    ctx.recordLogicalId('7', { sourceId: '7', side: 'insertion' });
    ctx.recordLogicalId('7', { sourceId: '7', side: 'deletion' });
    ctx.recordLogicalId('7', { sourceId: '7', side: 'deletion' });

    expect(ctx.diagnostics()).toEqual([
      {
        code: 'IMPORT_DUPLICATE_LOGICAL_ID',
        partPath: 'word/document.xml',
        logicalId: '7',
        side: 'deletion',
      },
    ]);
  });

  it('ignores malformed parent frames', () => {
    const ctx = createImportTrackingContext();
    ctx.pushParent(/** @type {any} */ (null));
    ctx.pushParent(/** @type {any} */ ({}));
    expect(ctx.parentStack()).toEqual([]);
  });
});
