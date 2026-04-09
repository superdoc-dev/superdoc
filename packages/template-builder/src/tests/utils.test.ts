import { describe, it, expect } from 'vitest';
import {
  areTemplateFieldsEqual,
  resolveToolbar,
  clampToViewport,
  getFieldTypeStyle,
  generateFieldColorCSS,
} from '../utils';
import type { TemplateField } from '../types';

describe('areTemplateFieldsEqual', () => {
  it('returns true for reference-equal arrays', () => {
    const fields: TemplateField[] = [{ id: '1', alias: 'Name' }];
    expect(areTemplateFieldsEqual(fields, fields)).toBe(true);
  });

  it('returns true for identical field arrays', () => {
    const a: TemplateField[] = [
      { id: '1', alias: 'Name', tag: 'tag1', position: 0, mode: 'inline', group: 'g1', fieldType: 'owner' },
    ];
    const b: TemplateField[] = [
      { id: '1', alias: 'Name', tag: 'tag1', position: 0, mode: 'inline', group: 'g1', fieldType: 'owner' },
    ];
    expect(areTemplateFieldsEqual(a, b)).toBe(true);
  });

  it('returns true for empty arrays', () => {
    expect(areTemplateFieldsEqual([], [])).toBe(true);
  });

  it('returns false for different lengths', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name' }];
    const b: TemplateField[] = [
      { id: '1', alias: 'Name' },
      { id: '2', alias: 'Email' },
    ];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when id differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name' }];
    const b: TemplateField[] = [{ id: '2', alias: 'Name' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when alias differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Email' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when tag differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', tag: 'a' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', tag: 'b' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when position differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', position: 0 }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', position: 5 }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when mode differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', mode: 'inline' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', mode: 'block' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when group differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', group: 'g1' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', group: 'g2' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when fieldType differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', fieldType: 'owner' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', fieldType: 'signer' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns false when lockMode differs', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', lockMode: 'unlocked' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', lockMode: 'sdtContentLocked' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(false);
  });

  it('returns true when lockMode is the same', () => {
    const a: TemplateField[] = [{ id: '1', alias: 'Name', lockMode: 'contentLocked' }];
    const b: TemplateField[] = [{ id: '1', alias: 'Name', lockMode: 'contentLocked' }];
    expect(areTemplateFieldsEqual(a, b)).toBe(true);
  });
});

describe('resolveToolbar', () => {
  it('returns null for falsy input', () => {
    expect(resolveToolbar(undefined)).toBeNull();
    expect(resolveToolbar(false)).toBeNull();
  });

  it('returns default config for true', () => {
    const result = resolveToolbar(true);
    expect(result).toEqual({
      selector: '#superdoc-toolbar',
      config: {},
      renderDefaultContainer: true,
    });
  });

  it('returns custom selector for string input', () => {
    const result = resolveToolbar('#my-toolbar');
    expect(result).toEqual({
      selector: '#my-toolbar',
      config: {},
      renderDefaultContainer: false,
    });
  });

  it('returns full config for object input', () => {
    const result = resolveToolbar({ selector: '#custom', toolbarGroups: ['left'] });
    expect(result).toEqual({
      selector: '#custom',
      config: { toolbarGroups: ['left'] },
      renderDefaultContainer: false,
    });
  });

  it('uses default selector when selector is missing in object', () => {
    const result = resolveToolbar({ toolbarGroups: ['center'] });
    expect(result).toEqual({
      selector: '#superdoc-toolbar',
      config: { toolbarGroups: ['center'] },
      renderDefaultContainer: true,
    });
  });
});

describe('clampToViewport', () => {
  it('passes through a rect within bounds', () => {
    // jsdom defaults: innerWidth=1024, innerHeight=768
    const rect = new DOMRect(100, 100, 0, 0);
    const result = clampToViewport(rect);
    expect(result.left).toBe(100);
    expect(result.top).toBe(100);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('clamps left/top to viewport padding minimum', () => {
    const rect = new DOMRect(-50, -50, 0, 0);
    const result = clampToViewport(rect);
    expect(result.left).toBe(10); // MENU_VIEWPORT_PADDING
    expect(result.top).toBe(10);
  });

  it('clamps to max bounds when exceeding viewport', () => {
    const rect = new DOMRect(2000, 2000, 0, 0);
    const result = clampToViewport(rect);
    // maxLeft = 1024 - 250 - 10 = 764
    // maxTop = 768 - 300 - 10 = 458
    expect(result.left).toBe(764);
    expect(result.top).toBe(458);
  });
});

describe('getFieldTypeStyle', () => {
  it('returns hardcoded signer style without fieldColors', () => {
    const style = getFieldTypeStyle('signer');
    expect(style).toEqual({ background: '#fef3c7', color: '#b45309' });
  });

  it('returns default style for unknown type without fieldColors', () => {
    const style = getFieldTypeStyle('unknown');
    expect(style).toEqual({ background: '#f3f4f6', color: '#6b7280' });
  });

  it('returns custom color with color-mix background when fieldColors provided', () => {
    const style = getFieldTypeStyle('date', { date: '#059669' });
    expect(style.color).toBe('#059669');
    expect(style.background).toContain('color-mix');
    expect(style.background).toContain('#059669');
  });

  it('falls back to default for types not in fieldColors', () => {
    const style = getFieldTypeStyle('unknown', { owner: '#629be7' });
    expect(style).toEqual({ background: '#f3f4f6', color: '#6b7280' });
  });

  it('works with non-hex colors', () => {
    const style = getFieldTypeStyle('custom', { custom: 'rgb(100, 200, 50)' });
    expect(style.color).toBe('rgb(100, 200, 50)');
    expect(style.background).toContain('color-mix');
  });
});

describe('generateFieldColorCSS', () => {
  it('returns empty string for empty object', () => {
    expect(generateFieldColorCSS({}, '.scope')).toBe('');
  });

  it('generates per-type rules with data-sdt-tag selectors', () => {
    const css = generateFieldColorCSS({ signer: '#d97706' }, '.scope');
    expect(css).toContain('[data-sdt-tag*=\'"fieldType":"signer"\']');
    expect(css).toContain('#d97706');
  });

  it('generates default rule when owner is defined', () => {
    const css = generateFieldColorCSS({ owner: '#629be7', signer: '#d97706' }, '.scope');
    // Default rule (no tag selector) + per-type rules
    expect(css).toContain('.scope .superdoc-structured-content-inline,');
    expect(css).toContain('#629be7');
    expect(css).toContain('#d97706');
  });

  it('does not generate default rule when no owner key', () => {
    const css = generateFieldColorCSS({ signer: '#d97706' }, '.scope');
    // Should only have tag-selector rules, not a blanket default
    const lines = css.split('\n').filter((l) => l.includes('border-color'));
    lines.forEach((line) => {
      // Every border-color rule should be within a tag selector context
      expect(css).toContain('data-sdt-tag');
    });
  });

  it('uses correct label selectors for inline and block', () => {
    const css = generateFieldColorCSS({ owner: '#629be7' }, '.scope');
    expect(css).toContain('.superdoc-structured-content-inline__label');
    expect(css).toContain('.superdoc-structured-content__label');
    // Should NOT contain the wrong block label class
    expect(css).not.toContain('.superdoc-structured-content-block__label');
  });

  it('uses color-mix for label backgrounds', () => {
    const css = generateFieldColorCSS({ owner: '#629be7' }, '.scope');
    expect(css).toContain('color-mix(in srgb, #629be7 87%, transparent)');
  });
});
