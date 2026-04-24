import type { TextAddress, TextMutationResolution } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { ResolvedTextTarget } from './adapter-utils.js';
import { textBetweenWithTabs } from './text-with-tabs.js';

/** Unicode Object Replacement Character — used as placeholder for leaf inline nodes in textBetween(). */
const OBJECT_REPLACEMENT_CHAR = '\ufffc';

/**
 * Reads the canonical flattened text between two resolved document positions.
 *
 * Uses `\n` as the block separator and `\ufffc` (Object Replacement Character) as the
 * leaf-inline placeholder, matching the offset model used by `TextAddress`. Tab
 * nodes round-trip to a real '\t' so no-op comparisons against caller-supplied
 * text (e.g. `write-adapter`'s replace NO_OP check) continue to match.
 *
 * @param editor - The editor instance to read from.
 * @param range - Resolved absolute document positions.
 * @returns The text content between the resolved positions.
 */
export function readTextAtResolvedRange(editor: Editor, range: ResolvedTextTarget): string {
  return textBetweenWithTabs(editor.state.doc, range.from, range.to, '\n', OBJECT_REPLACEMENT_CHAR);
}

/**
 * Builds a `TextMutationResolution` from already-resolved adapter data.
 *
 * @param input - The resolved target, range, and text snapshot.
 * @returns A `TextMutationResolution` suitable for inclusion in a `TextMutationReceipt`.
 */
export function buildTextMutationResolution(input: {
  requestedTarget?: TextAddress;
  target: TextAddress;
  range: ResolvedTextTarget;
  text: string;
}): TextMutationResolution {
  return {
    ...(input.requestedTarget ? { requestedTarget: input.requestedTarget } : {}),
    target: input.target,
    range: { from: input.range.from, to: input.range.to },
    text: input.text,
  };
}
