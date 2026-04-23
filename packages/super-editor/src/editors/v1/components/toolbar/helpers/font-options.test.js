import { describe, expect, it } from 'vitest';

import { makeDefaultItems } from '../defaultItems.js';
import { normalizeFontOption } from './font-options.js';

describe('normalizeFontOption', () => {
  it('derives props.style.fontFamily from key when props are missing', () => {
    const result = normalizeFontOption({ label: 'Cambria', key: 'Cambria, serif' });
    expect(result.props.style.fontFamily).toBe('Cambria, serif');
    expect(result.props['data-item']).toBe('btn-fontFamily-option');
  });

  it('falls back to label when key is absent', () => {
    const result = normalizeFontOption({ label: 'Aptos' });
    expect(result.props.style.fontFamily).toBe('Aptos');
  });

  it('preserves an explicitly-set props.style.fontFamily', () => {
    const result = normalizeFontOption({
      label: 'Calibri',
      key: 'Calibri',
      props: { style: { fontFamily: 'Calibri, sans-serif' } },
    });
    expect(result.props.style.fontFamily).toBe('Calibri, sans-serif');
  });

  it('preserves an explicitly-set data-item attribute', () => {
    const result = normalizeFontOption({
      label: 'Arial',
      key: 'Arial',
      props: { 'data-item': 'custom-hook' },
    });
    expect(result.props['data-item']).toBe('custom-hook');
  });

  it('does not lose unrelated option properties or props', () => {
    const result = normalizeFontOption({
      label: 'Georgia',
      key: 'Georgia, serif',
      fontWeight: 400,
      props: { style: { color: 'red' }, 'data-custom': 'x' },
    });
    expect(result.fontWeight).toBe(400);
    expect(result.props.style.color).toBe('red');
    expect(result.props.style.fontFamily).toBe('Georgia, serif');
    expect(result.props['data-custom']).toBe('x');
  });

  it('is idempotent', () => {
    const input = { label: 'Verdana', key: 'Verdana, sans-serif' };
    const once = normalizeFontOption(input);
    const twice = normalizeFontOption(once);
    expect(twice).toEqual(once);
  });

  it('passes nullish entries through without throwing', () => {
    expect(normalizeFontOption(null)).toBeNull();
    expect(normalizeFontOption(undefined)).toBeUndefined();
  });
});

describe('makeDefaultItems font wiring', () => {
  const stubProxy = new Proxy(
    {},
    {
      get: () => 'stub',
    },
  );
  const superToolbar = {
    config: { mode: 'docx' },
    activeEditor: null,
    emitCommand: () => {},
  };

  it('normalizes custom fonts passed via toolbarFonts', () => {
    const { defaultItems, overflowItems } = makeDefaultItems({
      superToolbar,
      toolbarIcons: stubProxy,
      toolbarTexts: stubProxy,
      toolbarFonts: [{ label: 'Inter', key: 'Inter, sans-serif' }],
      hideButtons: false,
      availableWidth: Infinity,
    });

    const allItems = [...defaultItems, ...overflowItems];
    const fontItem = allItems.find((i) => i.name.value === 'fontFamily');
    expect(fontItem).toBeDefined();

    const inter = fontItem.nestedOptions.value.find((o) => o.label === 'Inter');
    expect(inter.props.style.fontFamily).toBe('Inter, sans-serif');
    expect(inter.props['data-item']).toBe('btn-fontFamily-option');
  });
});
