export {
  captureSnapshot,
  compareToSnapshot,
  applyDiffPayload,
  DiffServiceError,
  type DiffServiceEditor,
  type DiffServiceErrorCode,
  type ApplyOptions,
  type ApplyDiffResult,
} from './diff-service';
export { buildCanonicalDiffableState, stableStringify, type CanonicalDiffableState } from './canonicalize';
export { computeFingerprint } from './fingerprint';
export { buildDiffSummary } from './summary';
export { V1_COVERAGE, coverageEquals } from './coverage';
