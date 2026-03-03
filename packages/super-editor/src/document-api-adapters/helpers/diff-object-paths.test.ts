import { describe, expect, it } from 'vitest';
import { diffObjectPaths } from './diff-object-paths.js';

describe('diffObjectPaths', () => {
  it('returns empty list when structures are equal', () => {
    const before = { docDefaults: { runProperties: { bold: true } } };
    const after = { docDefaults: { runProperties: { bold: true } } };

    expect(diffObjectPaths(before, after)).toEqual([]);
  });

  it('returns nested paths for changed scalar values', () => {
    const before = { docDefaults: { paragraphProperties: { spacing: { before: 240, after: 120 } } } };
    const after = { docDefaults: { paragraphProperties: { spacing: { before: 480, after: 120 } } } };

    expect(diffObjectPaths(before, after)).toEqual(['docDefaults.paragraphProperties.spacing.before']);
  });

  it('returns added and removed keys as changed paths', () => {
    const before = { docDefaults: { runProperties: { color: { val: '000000', themeColor: 'text1' } } } };
    const after = { docDefaults: { runProperties: { color: { val: 'FF0000' } } } };

    expect(diffObjectPaths(before, after)).toEqual([
      'docDefaults.runProperties.color.themeColor',
      'docDefaults.runProperties.color.val',
    ]);
  });

  it('supports array paths with index notation', () => {
    const before = { styles: [{ name: 'Normal' }, { name: 'Heading1' }] };
    const after = { styles: [{ name: 'Normal' }, { name: 'Heading 1' }] };

    expect(diffObjectPaths(before, after)).toEqual(['styles[1].name']);
  });

  it('supports base path prefixes for scoped diffs', () => {
    const before = { before: 240 };
    const after = { before: 480 };

    expect(diffObjectPaths(before, after, 'docDefaults.paragraphProperties.spacing')).toEqual([
      'docDefaults.paragraphProperties.spacing.before',
    ]);
  });

  it('reports base path when an empty object branch is added', () => {
    expect(diffObjectPaths(undefined, {}, 'docDefaults.runProperties')).toEqual(['docDefaults.runProperties']);
  });
});
