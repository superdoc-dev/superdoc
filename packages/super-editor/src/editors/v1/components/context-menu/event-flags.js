/**
 * Event flag constants used for cross-component communication.
 * These flags are attached to DOM events to coordinate behavior between different parts of the editor.
 */

/**
 * Flag name used to mark context menu events that have been handled by the ContextMenu component.
 * When this flag is set on a MouseEvent, it indicates that the ContextMenu has already processed
 * the right-click and the event should not be forwarded by PresentationInputBridge.
 *
 * @constant {string}
 */
export const CONTEXT_MENU_HANDLED_FLAG = '__sdHandledByContextMenu';

/** @deprecated Use CONTEXT_MENU_HANDLED_FLAG instead */
export const SLASH_MENU_HANDLED_FLAG = CONTEXT_MENU_HANDLED_FLAG;
