/**
 * Diff summary generation.
 *
 * Produces a stable public DiffSummary from an internal DiffResult.
 */

import type { DiffResult } from '../computeDiff';
import type { DiffSummary } from '@superdoc/document-api';

/**
 * Builds a coarse-grained summary from raw diff results.
 */
export function buildDiffSummary(diff: DiffResult): DiffSummary {
  const bodyHasChanges = diff.docDiffs.length > 0;
  const commentsHasChanges = diff.commentDiffs.length > 0;
  const stylesHasChanges = diff.stylesDiff !== null;
  const numberingHasChanges = diff.numberingDiff !== null;
  const headerFootersHasChanges = diff.headerFootersDiff !== null;
  const partsHasChanges = diff.partsDiff !== null;

  const changedComponents: DiffSummary['changedComponents'] = [];
  if (bodyHasChanges) changedComponents.push('body');
  if (commentsHasChanges) changedComponents.push('comments');
  if (stylesHasChanges) changedComponents.push('styles');
  if (numberingHasChanges) changedComponents.push('numbering');
  if (headerFootersHasChanges) changedComponents.push('headerFooters');
  if (partsHasChanges) changedComponents.push('parts');

  return {
    hasChanges: changedComponents.length > 0,
    changedComponents,
    body: { hasChanges: bodyHasChanges },
    comments: { hasChanges: commentsHasChanges },
    styles: { hasChanges: stylesHasChanges },
    numbering: { hasChanges: numberingHasChanges },
    headerFooters: { hasChanges: headerFootersHasChanges },
    parts: { hasChanges: partsHasChanges },
  };
}
