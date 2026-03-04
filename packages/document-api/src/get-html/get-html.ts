export interface GetHtmlInput {
  /**
   * Convert SuperDoc's internal flat-list representation to proper nested
   * `<ol>`/`<ul>` HTML. Defaults to `true`.
   */
  unflattenLists?: boolean;
}

/**
 * Engine-specific adapter that the getHtml API delegates to.
 */
export interface GetHtmlAdapter {
  /**
   * Return the full document content as an HTML string.
   */
  getHtml(input: GetHtmlInput): string;
}

/**
 * Execute a getHtml operation via the provided adapter.
 *
 * @param adapter - Engine-specific getHtml adapter.
 * @param input - Canonical getHtml input object.
 * @returns The full document content as an HTML string.
 */
export function executeGetHtml(adapter: GetHtmlAdapter, input: GetHtmlInput): string {
  return adapter.getHtml(input);
}
