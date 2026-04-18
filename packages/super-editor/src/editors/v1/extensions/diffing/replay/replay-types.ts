/**
 * Generic replay result summary used by helper handlers.
 *
 * @property applied Number of diffs applied by the helper.
 * @property skipped Number of diffs skipped by the helper.
 * @property warnings Non-fatal warnings recorded by the helper.
 */
export type ReplayResult = {
  applied: number;
  skipped: number;
  warnings: string[];
};
