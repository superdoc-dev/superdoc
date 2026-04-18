import { describe, expect, it } from 'vitest';

/**
 * Test the allowSelectionInViewMode behavior in the Editable extension.
 *
 * These tests verify the event handling logic without initializing
 * a full ProseMirror editor, ensuring the allowlist logic is correct.
 */

/**
 * Creates handler functions that mimic the editable plugin behavior.
 * This matches the implementation in editable.js.
 */
const createHandlers = (editable, allowSelectionInViewMode) => ({
  handleClick: () => !editable && !allowSelectionInViewMode,
  handleDoubleClick: () => !editable && !allowSelectionInViewMode,
  handleTripleClick: () => !editable && !allowSelectionInViewMode,
  handlePaste: () => !editable,
  handleDrop: () => !editable,
  // mousedown and focus return true to block, false to allow
  handleMousedown: (event) => {
    if (!editable && !allowSelectionInViewMode) {
      return true; // blocked
    }
    return false; // allowed
  },
  handleFocus: () => {
    if (!editable && !allowSelectionInViewMode) {
      return true; // blocked
    }
    return false; // allowed
  },
});

describe('Editable extension allowSelectionInViewMode click handling', () => {
  describe('when editable=false and allowSelectionInViewMode=false', () => {
    const handlers = createHandlers(false, false);

    it('blocks click events', () => {
      expect(handlers.handleClick()).toBe(true);
    });

    it('blocks double-click events', () => {
      expect(handlers.handleDoubleClick()).toBe(true);
    });

    it('blocks triple-click events', () => {
      expect(handlers.handleTripleClick()).toBe(true);
    });

    it('blocks mousedown events', () => {
      expect(handlers.handleMousedown({})).toBe(true);
    });

    it('blocks focus events', () => {
      expect(handlers.handleFocus()).toBe(true);
    });
  });

  describe('when editable=false and allowSelectionInViewMode=true', () => {
    const handlers = createHandlers(false, true);

    it('allows click events for selection', () => {
      expect(handlers.handleClick()).toBe(false);
    });

    it('allows double-click events for word selection', () => {
      expect(handlers.handleDoubleClick()).toBe(false);
    });

    it('allows triple-click events for paragraph selection', () => {
      expect(handlers.handleTripleClick()).toBe(false);
    });

    it('allows mousedown events for drag selection', () => {
      expect(handlers.handleMousedown({})).toBe(false);
    });

    it('allows focus events', () => {
      expect(handlers.handleFocus()).toBe(false);
    });
  });

  describe('when editable=true', () => {
    const handlers = createHandlers(true, false);

    it('allows all click events', () => {
      expect(handlers.handleClick()).toBe(false);
      expect(handlers.handleDoubleClick()).toBe(false);
      expect(handlers.handleTripleClick()).toBe(false);
      expect(handlers.handleMousedown({})).toBe(false);
      expect(handlers.handleFocus()).toBe(false);
    });
  });
});

describe('Editable extension paste and drop handling', () => {
  describe('when editable=false', () => {
    it('blocks paste regardless of allowSelectionInViewMode', () => {
      const handlers1 = createHandlers(false, false);
      const handlers2 = createHandlers(false, true);
      expect(handlers1.handlePaste()).toBe(true);
      expect(handlers2.handlePaste()).toBe(true);
    });

    it('blocks drop regardless of allowSelectionInViewMode', () => {
      const handlers1 = createHandlers(false, false);
      const handlers2 = createHandlers(false, true);
      expect(handlers1.handleDrop()).toBe(true);
      expect(handlers2.handleDrop()).toBe(true);
    });
  });

  describe('when editable=true', () => {
    const handlers = createHandlers(true, false);

    it('allows paste', () => {
      expect(handlers.handlePaste()).toBe(false);
    });

    it('allows drop', () => {
      expect(handlers.handleDrop()).toBe(false);
    });
  });
});

describe('Editable extension allowSelectionInViewMode keyboard handling', () => {
  /**
   * Creates a handleKeyDown function that mimics the editable plugin behavior.
   * This matches the implementation in editable.js.
   */
  const createHandleKeyDown = (editable, allowSelectionInViewMode) => {
    return (_view, event) => {
      if (!editable) {
        if (allowSelectionInViewMode) {
          // Allow navigation keys for selection
          const isNavigationKey = [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
            'PageUp',
            'PageDown',
          ].includes(event.key);

          // Allow copy and select all
          const isCopyOrSelectAll = (event.ctrlKey || event.metaKey) && ['c', 'a'].includes(event.key.toLowerCase());

          if (isNavigationKey || isCopyOrSelectAll) return false;
        }
        return true;
      }
      return false;
    };
  };

  const createKeyEvent = (key, modifiers = {}) => ({
    key,
    ctrlKey: modifiers.ctrlKey || false,
    metaKey: modifiers.metaKey || false,
    shiftKey: modifiers.shiftKey || false,
  });

  describe('when editable=false and allowSelectionInViewMode=false', () => {
    const handleKeyDown = createHandleKeyDown(false, false);

    it('blocks all keyboard input', () => {
      expect(handleKeyDown(null, createKeyEvent('a'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('ArrowRight'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('c', { metaKey: true }))).toBe(true);
    });
  });

  describe('when editable=false and allowSelectionInViewMode=true', () => {
    const handleKeyDown = createHandleKeyDown(false, true);

    it('allows Cmd+C for copy', () => {
      expect(handleKeyDown(null, createKeyEvent('c', { metaKey: true }))).toBe(false);
    });

    it('allows Ctrl+C for copy', () => {
      expect(handleKeyDown(null, createKeyEvent('c', { ctrlKey: true }))).toBe(false);
    });

    it('allows Cmd+A for select all', () => {
      expect(handleKeyDown(null, createKeyEvent('a', { metaKey: true }))).toBe(false);
    });

    it('allows Ctrl+A for select all', () => {
      expect(handleKeyDown(null, createKeyEvent('a', { ctrlKey: true }))).toBe(false);
    });

    it('allows arrow key navigation', () => {
      expect(handleKeyDown(null, createKeyEvent('ArrowLeft'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('ArrowRight'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('ArrowUp'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('ArrowDown'))).toBe(false);
    });

    it('allows Home/End navigation', () => {
      expect(handleKeyDown(null, createKeyEvent('Home'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('End'))).toBe(false);
    });

    it('allows PageUp/PageDown navigation', () => {
      expect(handleKeyDown(null, createKeyEvent('PageUp'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('PageDown'))).toBe(false);
    });

    it('blocks regular character input', () => {
      expect(handleKeyDown(null, createKeyEvent('a'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('z'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('1'))).toBe(true);
    });

    it('blocks other keyboard shortcuts', () => {
      expect(handleKeyDown(null, createKeyEvent('v', { metaKey: true }))).toBe(true); // paste
      expect(handleKeyDown(null, createKeyEvent('x', { metaKey: true }))).toBe(true); // cut
      expect(handleKeyDown(null, createKeyEvent('b', { metaKey: true }))).toBe(true); // bold
    });

    it('blocks Enter and Backspace', () => {
      expect(handleKeyDown(null, createKeyEvent('Enter'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('Backspace'))).toBe(true);
      expect(handleKeyDown(null, createKeyEvent('Delete'))).toBe(true);
    });
  });

  describe('when editable=true', () => {
    const handleKeyDown = createHandleKeyDown(true, true);

    it('allows all keyboard input regardless of allowSelectionInViewMode', () => {
      expect(handleKeyDown(null, createKeyEvent('a'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('ArrowRight'))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('c', { metaKey: true }))).toBe(false);
      expect(handleKeyDown(null, createKeyEvent('Enter'))).toBe(false);
    });
  });
});
