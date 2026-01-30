import { describe, it, expect, vi } from 'vitest';

const setupKeymap = async ({ isMacOS, isIOS }) => {
  vi.resetModules();
  vi.doMock('../utilities/isMacOS.js', () => ({ isMacOS: () => isMacOS }));
  vi.doMock('../utilities/isIOS.js', () => ({ isIOS: () => isIOS }));

  const { Keymap } = await import('./keymap.js');
  const { getExtensionConfigField } = await import('../helpers/getExtensionConfigField.js');

  const editor = {
    commands: {
      selectAll: vi.fn(),
      selectTextblockStart: vi.fn(),
    },
  };

  const addShortcuts = getExtensionConfigField(Keymap, 'addShortcuts', {
    name: Keymap.name,
    editor,
  });

  const bindings = addShortcuts();
  return { bindings, editor };
};

describe('Keymap extension', () => {
  it('maps Ctrl-a to selectAll on macOS', async () => {
    const { bindings, editor } = await setupKeymap({ isMacOS: true, isIOS: false });

    expect(bindings['Ctrl-a']).toBeTypeOf('function');
    bindings['Ctrl-a']();

    expect(editor.commands.selectAll).toHaveBeenCalledTimes(1);
    expect(editor.commands.selectTextblockStart).not.toHaveBeenCalled();
  });

  it('keeps Mod-a mapped to selectAll on non-mac platforms', async () => {
    const { bindings, editor } = await setupKeymap({ isMacOS: false, isIOS: false });

    expect(bindings['Mod-a']).toBeTypeOf('function');
    bindings['Mod-a']();

    expect(editor.commands.selectAll).toHaveBeenCalledTimes(1);
    expect(editor.commands.selectTextblockStart).not.toHaveBeenCalled();
  });
});
