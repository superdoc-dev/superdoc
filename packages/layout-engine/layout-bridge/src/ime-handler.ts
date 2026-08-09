/**
 * IME Handler
 *
 * Handles Input Method Editor (IME) composition events for languages that require
 * multi-key input sequences (e.g., Chinese, Japanese, Korean).
 *
 * Strategy:
 * 1. Track composition state (start, update, end)
 * 2. Defer aggressive layout updates during composition
 * 3. Provide composition text for cursor positioning
 * 4. Signal when full layout should resume
 *
 * @module ime-handler
 */

/**
 * IME composition state.
 */
export interface ImeState {
  /** Whether IME composition is currently active */
  active: boolean;
  /** Current composition text */
  text: string;
  /** Selection start within composition */
  start: number;
  /** Selection end within composition */
  end: number;
}

/**
 * ImeHandler manages IME composition events and provides signals for
 * layout debouncing during multi-key input sequences.
 */
export class ImeHandler {
  private state: ImeState = { active: false, text: '', start: 0, end: 0 };
  private layoutDebounceActive: boolean = false;

  /**
   * Called when composition starts (compositionstart event).
   *
   * @param event - CompositionEvent from browser
   */
  onCompositionStart(event: CompositionEvent): void {
    this.state = {
      active: true,
      text: event.data || '',
      start: 0,
      end: 0,
    };
    this.layoutDebounceActive = true;
  }

  /**
   * Called when composition updates (compositionupdate event).
   *
   * @param event - CompositionEvent from browser
   */
  onCompositionUpdate(event: CompositionEvent): void {
    if (this.state.active) {
      this.state.text = event.data || '';
    }
  }

  /**
   * Called when composition ends (compositionend event).
   *
   * @param event - CompositionEvent from browser
   */
  onCompositionEnd(event: CompositionEvent): void {
    this.state = {
      active: false,
      text: event.data || '',
      start: 0,
      end: 0,
    };
    this.layoutDebounceActive = false;
  }

  /**
   * Check if IME composition is currently active.
   *
   * @returns True if composition is in progress
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get current composition text.
   *
   * @returns Composition text, or empty string if not composing
   */
  getCompositionText(): string {
    return this.state.text;
  }

  /**
   * Should layout be debounced more aggressively during composition?
   *
   * @returns True if layout should be deferred
   */
  shouldDeferLayout(): boolean {
    return this.layoutDebounceActive && this.state.active;
  }

  /**
   * Get full composition state for cursor positioning.
   *
   * @returns Current IME state
   */
  getState(): ImeState {
    return { ...this.state };
  }

  /**
   * Manually reset IME state (useful for testing or error recovery).
   */
  reset(): void {
    this.state = { active: false, text: '', start: 0, end: 0 };
    this.layoutDebounceActive = false;
  }
}
