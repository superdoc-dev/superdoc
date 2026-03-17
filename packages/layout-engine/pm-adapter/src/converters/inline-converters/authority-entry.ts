import type { TextRun } from '@superdoc/contracts';
import type { InlineConverterParams } from './common.js';

/**
 * Converts an authorityEntry PM node to a TextRun.
 * Authority entries (TA fields) are hidden markers — they produce no visible output.
 * Returns null to suppress rendering, matching Word's behavior.
 */
export function authorityEntryNodeToRun(_params: InlineConverterParams): TextRun | null {
  return null;
}
