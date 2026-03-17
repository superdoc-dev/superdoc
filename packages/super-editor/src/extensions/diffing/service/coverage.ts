/**
 * Coverage metadata for the diff engine.
 *
 * v1 always covers body, comments, styles, and numbering.
 * Header/footer diffing is not supported in v1.
 */

import type { DiffCoverage } from '@superdoc/document-api';

/** Default v1 coverage — all supported components enabled. */
export const V1_COVERAGE: DiffCoverage = Object.freeze({
  body: true,
  comments: true,
  styles: true,
  numbering: true,
  headerFooters: false,
});

/**
 * Returns true when two coverage objects are structurally equal.
 */
export function coverageEquals(a: DiffCoverage, b: DiffCoverage): boolean {
  return (
    a.body === b.body &&
    a.comments === b.comments &&
    a.styles === b.styles &&
    a.numbering === b.numbering &&
    a.headerFooters === b.headerFooters
  );
}
