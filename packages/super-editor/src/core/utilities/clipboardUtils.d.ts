/**
 * Checks if clipboard read permission is granted and handles permission prompts.
 * Returns true if clipboard-read permission is granted. If state is "prompt" it will
 * proactively trigger a readText() call which will surface the browser permission
 * dialog to the user. Falls back gracefully in older browsers that lack the
 * Permissions API.
 * @returns {Promise<boolean>} Whether clipboard read permission is granted
 */
export function ensureClipboardPermission(): Promise<boolean>;
/**
 * Reads raw HTML and text from the system clipboard (for use in paste actions).
 */
export function readClipboardRaw(): Promise<{ html: string; text: string }>;
/**
 * Reads content from the system clipboard and parses it into a ProseMirror fragment.
 * Attempts to read HTML first, falling back to plain text if necessary.
 * @param {EditorState} state - The ProseMirror editor state, used for schema and parsing.
 * @returns {Promise<ProseMirrorNode|null>} A promise that resolves to a ProseMirror fragment or text node, or null if reading fails.
 */
export function readFromClipboard(state: EditorState): Promise<ProseMirrorNode | null>;
//# sourceMappingURL=clipboardUtils.d.ts.map
