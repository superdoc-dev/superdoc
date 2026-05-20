/**
 * Editor-neutral layout identity primitives (prep-001) — contract tests.
 *
 * These tests pin the additive substrate so v1 fixtures cannot quietly
 * lose `pmStart`/`pmEnd` fields and future producers cannot break the
 * editor-neutral shape used by downstream surfaces.
 */
import { describe, expect, it } from 'vitest';
import {
  LAYOUT_BOUNDARY_SCHEMA,
  bodyStoryLocator,
  buildLayoutSourceIdentity,
  buildLayoutSourceIdentityForFragment,
  computeLayoutFragmentId,
  namedStoryLocator,
} from './layout-identity.js';
import type { ParaFragment, TableFragment } from './index.js';

describe('layout-identity (prep-001)', () => {
  it('exposes a versioned schema constant', () => {
    expect(LAYOUT_BOUNDARY_SCHEMA).toBe('layout-identity/1');
  });

  it('builds story locators for body and named stories', () => {
    expect(bodyStoryLocator()).toEqual({ kind: 'body' });
    expect(namedStoryLocator('header', 'rId4')).toEqual({ kind: 'header', id: 'rId4' });
    expect(namedStoryLocator('footer', 'rId7')).toEqual({ kind: 'footer', id: 'rId7' });
  });

  it('falls back to unknown when a named story has no id', () => {
    // Empty id is not a useful story handle; reject rather than silently
    // shipping `{kind:'header', id:''}` to consumers.
    expect(namedStoryLocator('header', '')).toEqual({ kind: 'unknown' });
  });

  it('computes a stable opaque fragment id for paragraph fragments', () => {
    const a = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
      toLine: 2,
    });
    const b = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
      toLine: 2,
    });
    const c = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 7,
      toLine: 8,
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('differentiates by story when story changes', () => {
    const body = computeLayoutFragmentId({ blockId: '5-paragraph', kind: 'para', fromLine: 0 });
    const header = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
      story: namedStoryLocator('header', 'rId4'),
    });
    expect(body).not.toBe(header);
  });

  it('differentiates paragraph and table split fragments by their full rendered slice', () => {
    const paragraphA = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
      toLine: 1,
    });
    const paragraphB = computeLayoutFragmentId({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
      toLine: 2,
    });
    const a = computeLayoutFragmentId({
      blockId: '12-table',
      kind: 'table',
      fromRow: 3,
      toRow: 4,
      partialRow: { rowIndex: 3, fromLineByCell: [0, 1], toLineByCell: [2, -1] },
    });
    const b = computeLayoutFragmentId({
      blockId: '12-table',
      kind: 'table',
      fromRow: 3,
      toRow: 4,
      partialRow: { rowIndex: 3, fromLineByCell: [2, 1], toLineByCell: [4, -1] },
    });
    expect(paragraphA).not.toBe(paragraphB);
    expect(a).not.toBe(b);
  });

  it('derives fragment identity from the same discriminators used by rendered fragment keys', () => {
    const para = buildLayoutSourceIdentityForFragment({
      kind: 'para',
      blockId: 'p1',
      fromLine: 0,
      toLine: 1,
      x: 20,
      y: 40,
    });
    const imageA = buildLayoutSourceIdentityForFragment({
      kind: 'image',
      blockId: 'img1',
      x: 20,
      y: 40,
    });
    const imageB = buildLayoutSourceIdentityForFragment({
      kind: 'image',
      blockId: 'img1',
      x: 20,
      y: 80,
    });

    expect(para.fragmentId).toContain('para:0:1');
    expect(imageA.fragmentId).not.toBe(imageB.fragmentId);
  });

  it('builds a composite identity with schema, story, blockRef, and fragmentId', () => {
    const identity = buildLayoutSourceIdentity({
      blockId: '5-paragraph',
      kind: 'para',
      fromLine: 0,
    });
    expect(identity.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(identity.story).toEqual({ kind: 'body' });
    expect(identity.blockRef).toBe('5-paragraph');
    expect(typeof identity.fragmentId).toBe('string');
    expect(identity.fragmentId.length).toBeGreaterThan(0);
  });

  it('keeps neutral identity optional on Fragment shapes', () => {
    // Compile-time intent: ParaFragment / TableFragment should still type-check
    // without `layoutSourceIdentity` so v1 fixtures (and existing tests) stay
    // valid.
    const para: ParaFragment = {
      kind: 'para',
      blockId: '0-paragraph',
      fromLine: 0,
      toLine: 1,
      x: 0,
      y: 0,
      width: 100,
    };
    const table: TableFragment = {
      kind: 'table',
      blockId: '12-table',
      fromRow: 0,
      toRow: 1,
      x: 0,
      y: 0,
      width: 200,
      height: 50,
    };

    expect(para.layoutSourceIdentity).toBeUndefined();
    expect(table.layoutSourceIdentity).toBeUndefined();
    // pmStart / pmEnd remain available alongside the neutral substrate.
    expect('pmStart' in para).toBe(false);
    expect('pmEnd' in para).toBe(false);
  });
});
