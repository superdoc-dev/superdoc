/**
 * Generic replay result summary used by helper handlers.
 */
export type ReplayResult = {
  applied: number;
  skipped: number;
  warnings: string[];
};
