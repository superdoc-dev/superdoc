export type GetMarkdownInput = Record<string, never>;

/**
 * Engine-specific adapter that the getMarkdown API delegates to.
 */
export interface GetMarkdownAdapter {
  /**
   * Return the full document content as a Markdown string.
   */
  getMarkdown(input: GetMarkdownInput): string;
}

/**
 * Execute a getMarkdown operation via the provided adapter.
 *
 * @param adapter - Engine-specific getMarkdown adapter.
 * @param input - Canonical getMarkdown input object.
 * @returns The full document content as a Markdown-formatted string.
 */
export function executeGetMarkdown(adapter: GetMarkdownAdapter, input: GetMarkdownInput): string {
  return adapter.getMarkdown(input);
}
