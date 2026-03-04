import { describe, expect, it } from 'vitest';
import {
  TABLE_STYLE_ID_TABLE_GRID,
  TABLE_STYLE_ID_TABLE_NORMAL,
  isKnownTableStyleId,
  findTypeDefaultTableStyleId,
  resolveExistingTableEffectiveStyleId,
  resolvePreferredNewTableStyleId,
} from './table-style-selection.ts';
import type { StylesDocumentProperties } from './styles-types.ts';

const emptyStyles: StylesDocumentProperties = { docDefaults: {}, latentStyles: {}, styles: {} };

const withStyles = (styles: Record<string, { type?: string; default?: boolean }>): StylesDocumentProperties => ({
  ...emptyStyles,
  styles: Object.fromEntries(Object.entries(styles).map(([id, def]) => [id, { styleId: id, ...def }])),
});

// ──────────────────────────────────────────────────────────────────────────────
// isKnownTableStyleId
// ──────────────────────────────────────────────────────────────────────────────

describe('isKnownTableStyleId', () => {
  it('returns true for a valid table style', () => {
    const styles = withStyles({ TableGrid: { type: 'table' } });
    expect(isKnownTableStyleId('TableGrid', styles)).toBe(true);
  });

  it('returns false for a non-table style type', () => {
    const styles = withStyles({ Normal: { type: 'paragraph' } });
    expect(isKnownTableStyleId('Normal', styles)).toBe(false);
  });

  it('returns false for a missing style', () => {
    expect(isKnownTableStyleId('DoesNotExist', emptyStyles)).toBe(false);
  });

  it('returns false for null/undefined inputs', () => {
    expect(isKnownTableStyleId(null, emptyStyles)).toBe(false);
    expect(isKnownTableStyleId(undefined, emptyStyles)).toBe(false);
    expect(isKnownTableStyleId('TableGrid', null)).toBe(false);
    expect(isKnownTableStyleId('TableGrid', undefined)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// findTypeDefaultTableStyleId
// ──────────────────────────────────────────────────────────────────────────────

describe('findTypeDefaultTableStyleId', () => {
  it('finds the style with type=table and default=true', () => {
    const styles = withStyles({
      TableNormal: { type: 'table', default: true },
      TableGrid: { type: 'table' },
    });
    expect(findTypeDefaultTableStyleId(styles)).toBe('TableNormal');
  });

  it('returns null when no type-default table style exists', () => {
    const styles = withStyles({
      TableGrid: { type: 'table' },
      Normal: { type: 'paragraph', default: true },
    });
    expect(findTypeDefaultTableStyleId(styles)).toBeNull();
  });

  it('returns null for empty/null styles', () => {
    expect(findTypeDefaultTableStyleId(emptyStyles)).toBeNull();
    expect(findTypeDefaultTableStyleId(null)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveExistingTableEffectiveStyleId
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveExistingTableEffectiveStyleId', () => {
  it('returns explicit source when style exists and is type=table', () => {
    const styles = withStyles({ TableGrid: { type: 'table' } });
    const result = resolveExistingTableEffectiveStyleId('TableGrid', styles);
    expect(result).toEqual({ styleId: 'TableGrid', source: 'explicit' });
  });

  it('falls through to type-default when explicit style is invalid', () => {
    const styles = withStyles({
      Normal: { type: 'paragraph' },
      TableNormal: { type: 'table', default: true },
    });
    const result = resolveExistingTableEffectiveStyleId('Normal', styles);
    expect(result).toEqual({ styleId: 'TableNormal', source: 'type-default' });
  });

  it('falls through to type-default when explicit style does not exist', () => {
    const styles = withStyles({
      TableNormal: { type: 'table', default: true },
    });
    const result = resolveExistingTableEffectiveStyleId('MissingStyle', styles);
    expect(result).toEqual({ styleId: 'TableNormal', source: 'type-default' });
  });

  it('returns none when no style can be resolved', () => {
    const result = resolveExistingTableEffectiveStyleId('MissingStyle', emptyStyles);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });

  it('returns none when explicit is null', () => {
    const result = resolveExistingTableEffectiveStyleId(null, emptyStyles);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolvePreferredNewTableStyleId
// ──────────────────────────────────────────────────────────────────────────────

describe('resolvePreferredNewTableStyleId', () => {
  it('uses settings default when valid', () => {
    const styles = withStyles({ MyTableStyle: { type: 'table' } });
    const result = resolvePreferredNewTableStyleId('MyTableStyle', styles);
    expect(result).toEqual({ styleId: 'MyTableStyle', source: 'settings-default' });
  });

  it('ignores settings default when it references a non-existent style', () => {
    const styles = withStyles({ TableGrid: { type: 'table' } });
    const result = resolvePreferredNewTableStyleId('DoesNotExist', styles);
    expect(result).toEqual({ styleId: 'TableGrid', source: 'builtin-fallback' });
  });

  it('ignores settings default when it references a non-table style', () => {
    const styles = withStyles({
      Normal: { type: 'paragraph' },
      TableGrid: { type: 'table' },
    });
    const result = resolvePreferredNewTableStyleId('Normal', styles);
    expect(result).toEqual({ styleId: 'TableGrid', source: 'builtin-fallback' });
  });

  it('skips TableNormal as type-default (it is the base/reset style)', () => {
    const styles = withStyles({
      TableNormal: { type: 'table', default: true },
    });
    const result = resolvePreferredNewTableStyleId(null, styles);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });

  it('uses a non-TableNormal type-default', () => {
    const styles = withStyles({
      CustomTableStyle: { type: 'table', default: true },
    });
    const result = resolvePreferredNewTableStyleId(null, styles);
    expect(result).toEqual({ styleId: 'CustomTableStyle', source: 'type-default' });
  });

  it('falls through to TableGrid builtin fallback', () => {
    const styles = withStyles({ TableGrid: { type: 'table' } });
    const result = resolvePreferredNewTableStyleId(null, styles);
    expect(result).toEqual({ styleId: TABLE_STYLE_ID_TABLE_GRID, source: 'builtin-fallback' });
  });

  it('skips TableNormal even as builtin fallback', () => {
    const styles = withStyles({ TableNormal: { type: 'table' } });
    const result = resolvePreferredNewTableStyleId(null, styles);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });

  it('returns none when no styles exist at all', () => {
    const result = resolvePreferredNewTableStyleId(null, emptyStyles);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });

  it('returns none when styles is null', () => {
    const result = resolvePreferredNewTableStyleId(null, null);
    expect(result).toEqual({ styleId: null, source: 'none' });
  });

  it('settings default takes precedence over type-default', () => {
    const styles = withStyles({
      CustomDefault: { type: 'table' },
      TableNormal: { type: 'table', default: true },
    });
    const result = resolvePreferredNewTableStyleId('CustomDefault', styles);
    expect(result).toEqual({ styleId: 'CustomDefault', source: 'settings-default' });
  });

  it('type-default takes precedence over builtin fallback', () => {
    const styles = withStyles({
      TableGrid: { type: 'table' },
      SomeDefault: { type: 'table', default: true },
    });
    const result = resolvePreferredNewTableStyleId(null, styles);
    expect(result).toEqual({ styleId: 'SomeDefault', source: 'type-default' });
  });
});
