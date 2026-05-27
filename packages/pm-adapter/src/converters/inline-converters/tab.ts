import type { Run, TabRun, TabStop } from '@superdoc/contracts';
import { applyMarksToRun } from '../../marks/index.js';
import { applyInlineRunProperties, type InlineConverterParams } from './common.js';

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
  storyKey,
  tabOrdinal,
  paragraphAttrs,
  inheritedMarks,
  sdtMetadata,
  runProperties,
  converterContext,
  inlineRunProperties,
}: InlineConverterParams): Run | null {
  const pos = positions.get(node);
  if (!pos) return null;
  const tabStops: TabStop[] | undefined = paragraphAttrs.tabs;
  const indent = paragraphAttrs.indent;
  let run: TabRun = {
    kind: 'tab',
    text: '\t',
    pmStart: pos.start,
    pmEnd: pos.end,
    tabIndex: tabOrdinal,
    tabStops,
    indent,
    leader: (node.attrs?.leader as TabRun['leader']) ?? null,
  };

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  // Align tab formatting with text runs: hydrate from resolved runProperties first.
  // This survives Yjs element-node mark loss; explicit marks below still override.
  if (runProperties) {
    run = applyInlineRunProperties(
      run as any,
      runProperties,
      converterContext,
      inlineRunProperties,
    ) as unknown as TabRun;
  }

  // Apply marks (e.g., underline) to the tab run
  const marks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
  if (marks.length > 0) {
    applyMarksToRun(run, marks, undefined, undefined, undefined, true, storyKey);
  }

  return run;
}
