import type { Run, TabRun, TabStop } from '@superdoc/contracts';
import { applyMarksToRun } from '../../marks/index.js';
import { type InlineConverterParams } from './common.js';

/**
 * Converts a tab PM node to a TabRun.
 *
 * @param node - PM tab node to convert
 * @param positions - Position map for PM node tracking
 * @param tabIndex - Index of this tab in the paragraph
 * @param paragraph - Parent paragraph node (for tab stops and indent)
 * @param inheritedMarks - Marks inherited from parent nodes (e.g., underline for signature lines)
 * @returns TabRun block or null if position not found
 */
export function tabNodeToRun({
  node,
  positions,
  tabOrdinal,
  paragraphAttrs,
  inheritedMarks,
}: InlineConverterParams): Run | null {
  const pos = positions.get(node);
  if (!pos) return null;
  const tabStops: TabStop[] | undefined = paragraphAttrs.tabs;
  const indent = paragraphAttrs.indent;
  const run: TabRun = {
    kind: 'tab',
    text: '\t',
    pmStart: pos.start,
    pmEnd: pos.end,
    tabIndex: tabOrdinal,
    tabStops,
    indent,
    leader: (node.attrs?.leader as TabRun['leader']) ?? null,
  };

  // Apply marks (e.g., underline) to the tab run
  const marks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
  if (marks.length > 0) {
    applyMarksToRun(run, marks);
  }

  return run;
}
