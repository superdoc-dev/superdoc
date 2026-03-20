import { describe, it, expect, vi } from 'vitest';
// @ts-check
const { setLineHeight, unsetLineHeight } = await import('./lineHeight.js');
import { linesToTwips } from '@converter/helpers';

vi.mock('@converter/helpers', () => ({
  linesToTwips: mock((value) => value * 240),
}));

describe('lineHeight commands', () => {
  it('setLineHeight returns false for falsy input', () => {
    const result = setLineHeight(0)({ commands: {} });
    expect(result).toBe(false);
  });

  it('setLineHeight delegates to updateAttributes with converted values', () => {
    const updateAttributes = mock().mockReturnValue(true);
    const lineHeight = 1.5;

    const dispatched = setLineHeight(lineHeight)({ commands: { updateAttributes } });

    expect(dispatched).toBe(true);
    expect(linesToTwips).toHaveBeenCalledWith(lineHeight);
    expect(updateAttributes).toHaveBeenCalledWith('paragraph', {
      'paragraphProperties.spacing.line': lineHeight * 240,
      'paragraphProperties.spacing.lineRule': 'auto',
    });
  });

  it('unsetLineHeight delegates to resetAttributes for spacing keys', () => {
    const resetAttributes = mock().mockReturnValue(true);

    const dispatched = unsetLineHeight()({ commands: { resetAttributes } });

    expect(dispatched).toBe(true);
    expect(resetAttributes).toHaveBeenCalledWith(
      'paragraph',
      'paragraphProperties.spacing.line',
      'paragraphProperties.spacing.lineRule',
    );
  });
});
