import { describe, it, expect, vi } from 'vitest';
import { makeColorOption, icons, getAvailableColorOptions, renderColorOptions } from './color-dropdown-helpers.js';

describe('color-dropdown-helpers', () => {
  it('exports color icons as a non-empty 2D collection', () => {
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThan(0);
    expect(Array.isArray(icons[0])).toBe(true);
    expect(icons[0].length).toBeGreaterThan(0);
    expect(icons[0][0]).toMatchObject({
      label: expect.any(String),
      value: expect.any(String),
      icon: expect.anything(),
      style: expect.any(Object),
    });
  });

  it('flattens every icon value in getAvailableColorOptions', () => {
    const expected = icons.flat().map((item) => item.value);
    expect(getAvailableColorOptions()).toEqual(expected);
  });

  it('creates color options with expected shape', () => {
    const option = makeColorOption('#ABCDEF', 'custom');
    expect(option).toMatchObject({
      label: 'custom',
      value: '#ABCDEF',
      style: { color: '#ABCDEF' },
    });
  });

  it('emits the selected color and closes the dropdown', () => {
    const emitCommand = vi.fn();
    const button = {
      iconColor: { value: null },
      expand: { value: true },
    };

    const vnode = renderColorOptions({ emitCommand }, button);
    const onSelect = vnode.children[0].props.onSelect;
    onSelect('#00FF00');

    expect(button.iconColor.value).toBe('#00FF00');
    expect(button.expand.value).toBe(false);
    expect(emitCommand).toHaveBeenCalledWith({ item: button, argument: '#00FF00' });
  });
});
