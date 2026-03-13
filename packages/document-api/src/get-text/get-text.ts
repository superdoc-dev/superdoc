export type GetTextInput = Record<string, never>;

/**
 * Engine-specific adapter that the getText API delegates to.
 */
export interface GetTextAdapter {
  /**
   * Return the full document text content.
   */
  getText(input: GetTextInput): string;
}

/**
 * Execute a getText operation via the provided adapter.
 *
 * @param adapter - Engine-specific getText adapter.
 * @param input - Canonical getText input object.
 * @returns The full document text content.
 */
export function executeGetText(adapter: GetTextAdapter, input: GetTextInput): string {
  return adapter.getText(input);
}
