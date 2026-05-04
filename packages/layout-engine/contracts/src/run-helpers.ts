/**
 * Pure transformations on inline-run shapes.
 *
 * These helpers operate on `Run[]` shapes defined in this contracts package.
 * They have no upstream dependencies (no pm-adapter, no layout-bridge, no
 * style-engine), so any stage can consume them without creating a reverse
 * dependency back into a downstream package.
 */

import type { FlowBlock, Line, Run, TextRun } from './index.js';

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

/**
 * Extracts the subset of runs that appear in a specific line.
 * Handles partial runs that span multiple lines.
 *
 * @param block - The paragraph block containing the runs
 * @param line - The line to extract runs for
 * @returns Array of runs present in the line
 */
export function sliceRunsForLine(block: FlowBlock, line: Line): Run[] {
  const result: Run[] = [];
  if (block.kind !== 'paragraph') return result;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    if (run.kind === 'tab') {
      result.push(run);
      continue;
    }

    // Images, line breaks, breaks, field annotations, and math runs are atomic
    // units. They occupy a single character of the run sequence and are passed
    // through to the result without slicing.
    if (
      'src' in run ||
      run.kind === 'lineBreak' ||
      run.kind === 'break' ||
      run.kind === 'fieldAnnotation' ||
      run.kind === 'math'
    ) {
      result.push(run);
      continue;
    }

    const text = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;

    if (isFirstRun || isLastRun) {
      const start = isFirstRun ? line.fromChar : 0;
      const end = isLastRun ? line.toChar : text.length;
      const slice = text.slice(start, end);
      if (!slice) continue;
      const pmStart =
        run.pmStart != null ? run.pmStart + start : run.pmEnd != null ? run.pmEnd - (text.length - start) : undefined;
      const pmEnd =
        run.pmStart != null ? run.pmStart + end : run.pmEnd != null ? run.pmEnd - (text.length - end) : undefined;
      result.push({
        ...run,
        text: slice,
        pmStart,
        pmEnd,
      });
    } else {
      result.push(run);
    }
  }

  return result;
}
