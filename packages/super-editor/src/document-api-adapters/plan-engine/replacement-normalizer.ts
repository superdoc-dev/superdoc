/**
 * Replacement text normalizer — deterministic paragraph boundary detection.
 *
 * Converts a flat `replacement.text` string into structured paragraph blocks
 * for cross-block (span) targets per D3 normalization rules.
 */

import { planError } from './errors.js';

/**
 * Normalizes a flat replacement string into paragraph blocks for span targets.
 *
 * Rules (per D3):
 * 1. Normalize line endings (\r\n and \r → \n).
 * 2. Split paragraph boundaries on \n\n+ (two or more consecutive newlines).
 * 3. Trim leading/trailing empty chunks after split.
 * 4. Each separator run (\n\n, \n\n\n, etc.) creates one boundary (no implicit empty paragraphs).
 * 5. If normalized output has zero blocks, fail with INVALID_INPUT.
 * 6. Single \n within a chunk remains as inline line break content.
 */
export function normalizeReplacementText(text: string, stepId: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const chunks = normalized.split(/\n{2,}/);

  // Trim leading/trailing empty chunks
  while (chunks.length > 0 && chunks[0].length === 0) chunks.shift();
  while (chunks.length > 0 && chunks[chunks.length - 1].length === 0) chunks.pop();

  if (chunks.length === 0) {
    throw planError('INVALID_INPUT', 'replacement text normalized to zero blocks', stepId);
  }

  return chunks;
}
