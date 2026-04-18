import { describe, it, expect, vi } from 'vitest';
import { useToolbarItem } from '../../components/toolbar/use-toolbar-item.js';

describe('use-toolbar-item', () => {
  it('calls onActivate with empty object when attrs are omitted', () => {
    const onActivate = vi.fn();
    const item = useToolbarItem({
      type: 'dropdown',
      name: 'fontSize',
      onActivate,
    });

    expect(() => item.activate()).not.toThrow();
    expect(onActivate).toHaveBeenCalledWith({});
  });
});
