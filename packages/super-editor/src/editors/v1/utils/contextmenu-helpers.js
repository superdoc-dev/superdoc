const isKeyboardInvocation = (event) => {
  return (
    event.type === 'contextmenu' &&
    typeof event.detail === 'number' &&
    event.detail === 0 &&
    (event.button === 0 || event.button === undefined) &&
    event.clientX === 0 &&
    event.clientY === 0
  );
};

const prefersNativeMenu = (event) => {
  if (!event) return false;

  if (event.ctrlKey || event.metaKey) {
    return true;
  }

  return isKeyboardInvocation(event);
};

/**
 * Determine if the native context menu should be allowed to appear.
 * We bypass the custom menu when the user explicitly requests the system menu
 * via modifier keys or when the event originated from a keyboard invocation.
 * @param {MouseEvent} event
 * @returns {boolean}
 */
const shouldAllowNativeContextMenu = (event) => {
  return prefersNativeMenu(event);
};

export { shouldAllowNativeContextMenu };

// Alias exports for existing call sites that expect equivalent semantics.
export const shouldBypassContextMenu = shouldAllowNativeContextMenu;

export const shouldUseNativeContextMenu = shouldAllowNativeContextMenu;
