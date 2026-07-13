/**
 * Shared constants for the Markdown ↔ ProseMirror conversion pipeline.
 */

/**
 * The font family used to mark monospace ("code") text in both directions of
 * the markdown ↔ ProseMirror conversion:
 *  - `mdastToProseMirror.ts` applies this font (via a `textStyle` mark and/or
 *    direct `runProperties.fontFamily`) to fenced code blocks (`code`) and
 *    inline code spans (`inlineCode`).
 *  - `proseMirrorToMdast.ts` detects this font (on either the mark or the
 *    direct run properties) to convert monospace runs back into `inlineCode`
 *    mdast nodes.
 *
 * Keeping this as a single shared constant avoids the two directions
 * silently drifting out of sync if the monospace font ever changes.
 */
export const MARKDOWN_MONOSPACE_FONT = 'Courier New';
