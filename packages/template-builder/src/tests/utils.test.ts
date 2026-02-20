import { describe, it, expect } from 'vitest';
import { areTemplateFieldsEqual, resolveToolbar, clampToViewport } from '../utils';
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
