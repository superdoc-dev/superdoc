import type { MathRun } from '@superdoc/contracts';
import type { InlineConverterParams } from './common.js';
import { estimateMathDimensions } from '../math-constants.js';

/**
 * Converts a mathInline PM node to a MathRun for the layout engine.
 * Follows the same pattern as imageNodeToRun — position is optional.
 */
export function mathInlineNodeToRun({ node, positions, sdtMetadata }: InlineConverterParams): MathRun | null {
  const textContent = String(node.attrs?.textContent ?? '');
  const ommlJson = node.attrs?.originalXml ?? null;
  const { width, height } = estimateMathDimensions(textContent, ommlJson);

  const run: MathRun = {
    kind: 'math',
    ommlJson: node.attrs?.originalXml ?? null,
    textContent,
    width,
    height,
  };

  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}
