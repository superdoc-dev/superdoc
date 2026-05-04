/**
 * Pure transformations on inline-run shapes.
 *
 * These helpers operate on `Run[]` shapes defined in this contracts package.
 * They have no upstream dependencies (no pm-adapter, no layout-bridge, no
 * style-engine), so any stage can consume them without creating a reverse
 * dependency back into a downstream package.
 */

import type { Run, TextRun } from './index.js';

/**
 * Expands text runs that contain inline newlines into multiple runs.
 *
 * @param {Run[]} runs - The runs to expand
 * @returns {Run[]} The expanded runs
 */
export function expandRunsForInlineNewlines(runs: Run[]): Run[] {
  const result: Run[] = [];
  for (const run of runs) {
    const textRun = run as TextRun;
    if ('text' in run && typeof textRun.text === 'string' && textRun.text.includes('\n')) {
      const segments = textRun.text.split('\n');
      let cursor = textRun.pmStart ?? 0;
      segments.forEach((segment, idx) => {
        if (segment.length > 0) {
          result.push({ ...textRun, text: segment, pmStart: cursor, pmEnd: cursor + segment.length });
          cursor += segment.length;
        }
        if (idx !== segments.length - 1) {
          result.push({
            kind: 'break',
            breakType: 'line',
            pmStart: cursor,
            pmEnd: cursor + 1,
            sdt: textRun.sdt,
            trackedChange: textRun.trackedChange,
          });
          cursor += 1;
        }
      });
    } else {
      result.push(run);
    }
  }
  return result;
}
