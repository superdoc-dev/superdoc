/**
 * Numbering mutation adapter — the single entry point for runtime
 * `word/numbering.xml` mutations.
 *
 * All numbering writes must flow through `mutateNumbering` or
 * `mutateNumberingBatch`. These functions:
 *   1. Open a `mutatePart` transaction
 *   2. Run the caller's transform against `converter.numbering`
 *   3. Sync the model back to the XML tree
 *   4. Let `afterCommit` rebuild caches and emit events
 */

import type { Editor } from '../../Editor.js';
import type { MutatePartResult } from '../types.js';
import type { NumberingModel } from './numbering-transforms.js';
import { mutatePart, mutateParts } from '../mutation/mutate-part.js';
import { syncNumberingToXmlTree, ensureTranslatedNumberingFresh } from './numbering-part-descriptor.js';

// ---------------------------------------------------------------------------
// Converter access
// ---------------------------------------------------------------------------

interface ConverterForNumbering {
  numbering: NumberingModel;
}

function getNumbering(editor: Editor): NumberingModel {
  const converter = (editor as unknown as { converter?: ConverterForNumbering }).converter;
  if (!converter?.numbering) {
    throw new Error('mutateNumbering: editor.converter.numbering is not available.');
  }

  // Lazy recovery: if the last afterCommit failed, rebuild translatedNumbering
  // before any numbering operation runs.
  ensureTranslatedNumberingFresh(editor);

  return converter.numbering;
}

// ---------------------------------------------------------------------------
// Single transform
// ---------------------------------------------------------------------------

/**
 * Run a single numbering transform inside a `mutatePart` transaction.
 *
 * The `transform` callback receives the live `NumberingModel` from
 * `converter.numbering`. It should mutate in-place and return any
 * values the caller needs (e.g., allocated numId).
 */
export function mutateNumbering<TResult = void>(
  editor: Editor,
  source: string,
  transform: (numbering: NumberingModel) => TResult,
  options?: { dryRun?: boolean; expectedRevision?: string },
): MutatePartResult<TResult> {
  return mutatePart<unknown, TResult>({
    editor,
    partId: 'word/numbering.xml',
    operation: 'mutate',
    source,
    dryRun: options?.dryRun,
    expectedRevision: options?.expectedRevision,
    mutate({ part }) {
      const numbering = getNumbering(editor);
      const result = transform(numbering);
      syncNumberingToXmlTree(part, numbering);
      return result;
    },
  });
}

// ---------------------------------------------------------------------------
// Batch transforms
// ---------------------------------------------------------------------------

/**
 * Run multiple numbering transforms in a single `mutateParts` transaction.
 *
 * Only one clone, one revision increment, one `afterCommit`. Use this for
 * paste/conversion operations that create many definitions at once.
 */
export function mutateNumberingBatch<TResult = void>(
  editor: Editor,
  source: string,
  transforms: Array<(numbering: NumberingModel) => unknown>,
  options?: { dryRun?: boolean; expectedRevision?: string },
): { changed: boolean; degraded: boolean } {
  return mutateParts({
    editor,
    source,
    dryRun: options?.dryRun,
    expectedRevision: options?.expectedRevision,
    operations: [
      {
        editor,
        partId: 'word/numbering.xml',
        operation: 'mutate' as const,
        source,
        mutate({ part }: { part: unknown; dryRun: boolean }) {
          const numbering = getNumbering(editor);
          for (const transform of transforms) {
            transform(numbering);
          }
          syncNumberingToXmlTree(part, numbering);
        },
      },
    ],
  });
}
