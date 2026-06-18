/**
 * Shared split-run / nearby-thread hit sampling offsets.
 *
 * The v1 pointer pipeline uses this exact 5-point pattern when a click lands
 * in the narrow gap between painted comment-highlight runs. Review
 * targeting must consume the same helper rather than inventing a second
 * sampling radius or axis.
 */

export const COMMENT_THREAD_HIT_TOLERANCE_PX = 3;

export const COMMENT_THREAD_HIT_SAMPLE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-COMMENT_THREAD_HIT_TOLERANCE_PX, 0],
  [COMMENT_THREAD_HIT_TOLERANCE_PX, 0],
  [0, -COMMENT_THREAD_HIT_TOLERANCE_PX],
  [0, COMMENT_THREAD_HIT_TOLERANCE_PX],
];
