import { describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor.ts';

describe('Editor.setOptions', () => {
  it('preserves non-enumerable option metadata across updates', () => {
    const parentEditor = { id: 'parent-editor' };
    const options: Record<string, unknown> = { editable: false };
    Object.defineProperty(options, 'parentEditor', {
      enumerable: false,
      configurable: true,
      get() {
        return parentEditor;
      },
    });

    const context = {
      options,
      view: {
        setProps: vi.fn(),
        updateState: vi.fn(),
      },
      state: { doc: null },
      isDestroyed: false,
    };

    Editor.prototype.setOptions.call(context as unknown as Editor, { documentMode: 'editing' });

    expect((context.options as { parentEditor?: unknown }).parentEditor).toBe(parentEditor);
    expect(Object.getOwnPropertyDescriptor(context.options, 'parentEditor')?.enumerable).toBe(false);
    expect(context.view.updateState).toHaveBeenCalledWith(context.state);
  });
});
