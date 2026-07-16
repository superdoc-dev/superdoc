import { describe, expect, it, vi } from 'vitest';
import { FontFamily } from './font-family.js';

describe('FontFamily extension', () => {
  const commands = FontFamily.config.addCommands();

  it('clears per-script font overrides when setting a font family', () => {
    const chainApi = {
      setMark: vi.fn(() => chainApi),
      run: vi.fn(() => true),
    };
    const chain = vi.fn(() => chainApi);

    const result = commands.setFontFamily('Courier New, monospace')({ chain });

    expect(result).toBe(true);
    expect(chainApi.setMark).toHaveBeenCalledWith('textStyle', {
      fontFamily: 'Courier New, monospace',
      eastAsiaFontFamily: null,
      csFontFamily: null,
    });
  });

  it('clears per-script font overrides when unsetting a font family', () => {
    const chainApi = {
      setMark: vi.fn(() => chainApi),
      removeEmptyTextStyle: vi.fn(() => chainApi),
      run: vi.fn(() => true),
    };
    const chain = vi.fn(() => chainApi);

    const result = commands.unsetFontFamily()({ chain });

    expect(result).toBe(true);
    expect(chainApi.setMark).toHaveBeenCalledWith('textStyle', {
      fontFamily: null,
      eastAsiaFontFamily: null,
      csFontFamily: null,
    });
    expect(chainApi.removeEmptyTextStyle).toHaveBeenCalled();
  });
});
