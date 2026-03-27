/**
 * Type augmentation for MouseEvent to include custom event flags used by the ContextMenu component.
 */

declare global {
  interface MouseEvent {
    /**
     * Flag indicating that this context menu event has been handled by the ContextMenu component.
     * When true, the event should not be forwarded by other handlers like PresentationInputBridge.
     */
    __sdHandledByContextMenu?: boolean;
  }
}

/**
 * Flag name used to mark context menu events that have been handled by the ContextMenu component.
 */
export declare const CONTEXT_MENU_HANDLED_FLAG: string;

/** @deprecated Use CONTEXT_MENU_HANDLED_FLAG instead */
export declare const SLASH_MENU_HANDLED_FLAG: string;
