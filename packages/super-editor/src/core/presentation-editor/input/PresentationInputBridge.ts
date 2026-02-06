import { isInRegisteredSurface } from '../utils/uiSurfaceRegistry.js';
import { CONTEXT_MENU_HANDLED_FLAG } from '../../../components/context-menu/event-flags.js';

export class PresentationInputBridge {
  #windowRoot: Window;
  #layoutSurfaces: Set<EventTarget>;
  #getTargetDom: () => HTMLElement | null;
  /** Callback that returns whether the editor is in an editable mode (editing/suggesting vs viewing) */
  #isEditable: () => boolean;
  #onTargetChanged?: (target: HTMLElement | null) => void;
  #listeners: Array<{ type: string; handler: EventListener; target: EventTarget; useCapture: boolean }>;
  #currentTarget: HTMLElement | null = null;
  #destroyed = false;
  #useWindowFallback: boolean;

  /**
   * Creates a new PresentationInputBridge that forwards user input events from the visible layout
   * surface to the hidden editor DOM. This enables input handling when the actual editor is not
   * directly visible to the user.
   *
   * @param windowRoot - The window object containing the layout surface and editor target
   * @param layoutSurface - The visible HTML element that receives user input events (e.g., keyboard, mouse)
   * @param getTargetDom - Callback that returns the hidden editor's DOM element where events should be forwarded
   * @param isEditable - Callback that returns whether the editor is in an editable mode (editing/suggesting).
   *                     When this returns false (e.g., in viewing mode), keyboard, text, and composition
   *                     events will not be forwarded to prevent document modification.
   * @param onTargetChanged - Optional callback invoked when the target editor DOM element changes
   * @param options - Optional configuration including:
   *                  - useWindowFallback: Whether to attach window-level event listeners as fallback
   */
  constructor(
    windowRoot: Window,
    layoutSurface: HTMLElement,
    getTargetDom: () => HTMLElement | null,
    isEditable: () => boolean,
    onTargetChanged?: (target: HTMLElement | null) => void,
    options?: { useWindowFallback?: boolean },
  ) {
    this.#windowRoot = windowRoot;
    this.#layoutSurfaces = new Set<EventTarget>([layoutSurface]);
    this.#getTargetDom = getTargetDom;
    this.#isEditable = isEditable;
    this.#onTargetChanged = onTargetChanged;
    this.#listeners = [];
    this.#useWindowFallback = options?.useWindowFallback ?? false;
  }

  bind() {
    const keyboardTargets = this.#getListenerTargets();
    keyboardTargets.forEach((target) => {
      this.#addListener('keydown', this.#forwardKeyboardEvent, target);
      this.#addListener('keyup', this.#forwardKeyboardEvent, target);
    });

    const compositionTargets = this.#getListenerTargets();
    compositionTargets.forEach((target) => {
      this.#addListener('compositionstart', this.#forwardCompositionEvent, target);
      this.#addListener('compositionupdate', this.#forwardCompositionEvent, target);
      this.#addListener('compositionend', this.#forwardCompositionEvent, target);
    });

    const textTargets = this.#getListenerTargets();
    textTargets.forEach((target) => {
      this.#addListener('beforeinput', this.#forwardTextEvent, target);
      this.#addListener('input', this.#forwardTextEvent, target);
      this.#addListener('textInput', this.#forwardTextEvent, target);
    });

    const contextTargets = this.#getListenerTargets();
    contextTargets.forEach((target) => {
      this.#addListener('contextmenu', this.#forwardContextMenu, target);
    });
  }

  destroy() {
    this.#listeners.forEach(({ type, handler, target, useCapture }) => {
      target.removeEventListener(type, handler, useCapture);
    });
    this.#listeners = [];
    this.#currentTarget = null;
    this.#destroyed = true;
  }

  notifyTargetChanged() {
    if (this.#destroyed) {
      return;
    }
    const nextTarget = this.#getTargetDom();
    if (nextTarget === this.#currentTarget) {
      return;
    }
    if (this.#currentTarget) {
      let synthetic: Event | null = null;
      if (typeof CompositionEvent !== 'undefined') {
        // Fire compositionend with empty data to complete any active composition.
        // Note: Empty string is the standard value for compositionend - it signals
        // that composition input is complete, not that the composed text is empty.
        // This ensures IME state is properly cleared when switching edit targets.
        synthetic = new CompositionEvent('compositionend', { data: '', bubbles: true, cancelable: true });
      } else {
        synthetic = new Event('compositionend', { bubbles: true, cancelable: true });
      }
      try {
        this.#currentTarget.dispatchEvent(synthetic);
      } catch (error) {
        // Ignore dispatch failures - can happen if target was removed from DOM
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] Failed to dispatch composition event:', error);
        }
      }
    }
    this.#currentTarget = nextTarget;
    this.#onTargetChanged?.(nextTarget ?? null);
  }

  #addListener<T extends Event>(type: string, handler: (event: T) => void, target: EventTarget, useCapture = false) {
    const bound = handler.bind(this) as EventListener;
    this.#listeners.push({ type, handler: bound, target, useCapture });
    target.addEventListener(type, bound, useCapture);
  }

  #dispatchToTarget(originalEvent: Event, synthetic: Event) {
    if (this.#destroyed) return;
    const target = this.#getTargetDom();
    this.#currentTarget = target;
    if (!target) return;
    const isConnected = (target as { isConnected?: boolean }).isConnected;
    if (isConnected === false) return;
    try {
      const canceled = !target.dispatchEvent(synthetic) || synthetic.defaultPrevented;
      if (canceled) {
        originalEvent.preventDefault();
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] Failed to dispatch event to target:', error);
      }
    }
  }

  /**
   * Forwards keyboard events to the hidden editor, skipping IME composition events
   * and plain character keys (which are handled by beforeinput instead).
   * Uses microtask deferral to allow other handlers to preventDefault first.
   *
   * @param event - The keyboard event from the layout surface
   */
  #forwardKeyboardEvent(event: KeyboardEvent) {
    if (!this.#isEditable()) {
      return;
    }
    if (this.#shouldSkipSurface(event)) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (this.#isPlainCharacterKey(event)) {
      return;
    }

    // Dispatch synchronously so browser defaults can still be prevented
    const synthetic = new KeyboardEvent(event.type, {
      key: event.key,
      code: event.code,
      location: event.location,
      repeat: event.repeat,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      bubbles: true,
      cancelable: true,
    });
    this.#dispatchToTarget(event, synthetic);
  }

  /**
   * Forwards text input events (beforeinput) to the hidden editor.
   * Skips composition events and uses microtask deferral for cooperative handling.
   *
   * @param event - The input event from the layout surface
   */
  #forwardTextEvent(event: InputEvent | TextEvent) {
    if (!this.#isEditable()) {
      return;
    }
    if (this.#shouldSkipSurface(event)) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    if ((event as InputEvent).isComposing) {
      return;
    }

    queueMicrotask(() => {
      // Only re-check mutable state - surface check was already done
      if (event.defaultPrevented) {
        return;
      }

      let synthetic: Event;
      if (typeof InputEvent !== 'undefined') {
        synthetic = new InputEvent(event.type, {
          data: (event as InputEvent).data ?? (event as TextEvent).data ?? null,
          inputType: (event as InputEvent).inputType ?? 'insertText',
          dataTransfer: (event as InputEvent).dataTransfer ?? null,
          isComposing: (event as InputEvent).isComposing ?? false,
          bubbles: true,
          cancelable: true,
        });
      } else {
        synthetic = new Event(event.type, { bubbles: true, cancelable: true });
      }
      this.#dispatchToTarget(event, synthetic);
    });
  }

  /**
   * Forwards composition events (compositionstart, compositionupdate, compositionend)
   * to the hidden editor for IME input handling.
   *
   * @param event - The composition event from the layout surface
   */
  #forwardCompositionEvent(event: CompositionEvent) {
    if (!this.#isEditable()) {
      return;
    }
    if (this.#shouldSkipSurface(event)) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }

    let synthetic: Event;
    if (typeof CompositionEvent !== 'undefined') {
      synthetic = new CompositionEvent(event.type, {
        data: event.data ?? '',
        bubbles: true,
        cancelable: true,
      });
    } else {
      synthetic = new Event(event.type, { bubbles: true, cancelable: true });
    }
    this.#dispatchToTarget(event, synthetic);
  }

  /**
   * Forwards context menu events to the hidden editor.
   *
   * Checks if the ContextMenu component has already handled the event by inspecting
   * the CONTEXT_MENU_HANDLED_FLAG. If the flag is set, the event is not forwarded,
   * preventing duplicate context menu handling. This coordination allows ContextMenu
   * to intercept right-clicks in the capture phase and prevent the default editor
   * context menu from appearing.
   *
   * @param event - The context menu event from the layout surface
   */
  #forwardContextMenu(event: MouseEvent) {
    // Skip forwarding if ContextMenu has already handled this event
    const handledByContextMenu = Boolean((event as unknown as Record<string, unknown>)[CONTEXT_MENU_HANDLED_FLAG]);
    if (handledByContextMenu) {
      return;
    }
    if (!this.#isEditable()) {
      return;
    }
    if (this.#shouldSkipSurface(event)) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    const synthetic = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    this.#dispatchToTarget(event, synthetic);
  }

  #isEventOnActiveTarget(event: Event): boolean {
    const targetDom = this.#getTargetDom();
    if (!targetDom) return false;
    const origin = event.target as Node | null;
    if (!origin) return false;
    const targetNode = targetDom as unknown as Node;
    const containsFn =
      typeof (targetNode as { contains?: (node: Node | null) => boolean }).contains === 'function'
        ? (targetNode as { contains: (node: Node | null) => boolean }).contains
        : null;
    if (targetNode === origin) {
      return true;
    }
    if (containsFn) {
      return containsFn.call(targetNode, origin);
    }
    return false;
  }

  /**
   * Determines if an event originated from a UI surface that should be excluded
   * from keyboard forwarding (e.g., toolbars, dropdowns).
   *
   * Checks three conditions in order:
   * 1. Event is already on the active target (hidden editor) - skip to prevent loops
   * 2. Event is not in a layout surface - skip non-editor events
   * 3. Event is in a registered UI surface - skip toolbar/dropdown events
   *
   * @param event - The event to check
   * @returns true if the event should be skipped, false if it should be forwarded
   */
  #shouldSkipSurface(event: Event): boolean {
    if (this.#isEventOnActiveTarget(event)) {
      return true;
    }
    if (!this.#isInLayoutSurface(event)) {
      return true;
    }
    if (isInRegisteredSurface(event)) {
      return true;
    }
    return false;
  }

  /**
   * Checks if an event originated within a layout surface by walking the
   * event's composed path. Falls back to checking event.target directly
   * if composedPath is unavailable.
   *
   * @param event - The event to check
   * @returns true if event originated in a layout surface
   */
  #isInLayoutSurface(event: Event): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.length) {
      return path.some((node) => this.#layoutSurfaces.has(node as EventTarget));
    }
    const origin = event.target as EventTarget | null;
    return origin ? this.#layoutSurfaces.has(origin) : false;
  }

  /**
   * Returns the set of event targets to attach listeners to.
   * Includes registered layout surfaces and optionally the window for fallback.
   *
   * @returns Set of EventTargets for listener attachment
   */
  #getListenerTargets(): EventTarget[] {
    const targets = new Set<EventTarget>(this.#layoutSurfaces);
    if (this.#useWindowFallback) {
      targets.add(this.#windowRoot);
    }
    return Array.from(targets);
  }

  /**
   * Determines if a keyboard event represents a plain character key without
   * modifiers. Plain character keys are filtered out because they should be
   * handled by the beforeinput event instead to avoid double-handling.
   *
   * Note: Shift is intentionally not considered a modifier here since
   * Shift+character produces a different character (e.g., uppercase) that
   * should still go through beforeinput.
   *
   * @param event - The keyboard event to check
   * @returns true if event is a single character without Ctrl/Meta/Alt modifiers
   */
  #isPlainCharacterKey(event: KeyboardEvent): boolean {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  }
}
