import { describe, it, expect } from 'vitest';
import { shouldBypassContextMenu, shouldAllowNativeContextMenu } from '../../../utils/contextmenu-helpers.js';

describe('context menu helpers', () => {
  it('returns false for standard right click', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: false,
      metaKey: false,
      detail: 1,
      button: 2,
      clientX: 120,
      clientY: 150,
    };

    expect(shouldBypassContextMenu(event)).toBe(false);
    expect(shouldAllowNativeContextMenu(event)).toBe(false);
  });

  it('returns true when ctrl key is pressed', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: true,
      metaKey: false,
      detail: 1,
      button: 2,
      clientX: 120,
      clientY: 150,
    };

    expect(shouldBypassContextMenu(event)).toBe(true);
    expect(shouldAllowNativeContextMenu(event)).toBe(true);
  });

  it('returns true for keyboard invocation', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: false,
      metaKey: false,
      detail: 0,
      button: 0,
      clientX: 0,
      clientY: 0,
    };

    expect(shouldBypassContextMenu(event)).toBe(true);
    expect(shouldAllowNativeContextMenu(event)).toBe(true);
  });
});
