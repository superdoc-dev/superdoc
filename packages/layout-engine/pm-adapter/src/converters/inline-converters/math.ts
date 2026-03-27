import type { MathRun } from '@superdoc/contracts';
import type { InlineConverterParams } from './common.js';
import { estimateMathDimensions } from '../math-constants.js';

/**
 * Converts a mathInline PM node to a MathRun for the layout engine.
 */
export function mathInlineNodeToRun({ node, positions, sdtMetadata }: InlineConverterParams): MathRun | null {
  const pos = positions.get(node);
  if (!pos) return null;

  const textContent = String(node.attrs?.textContent ?? '');
  const { width, height } = estimateMathDimensions(textContent);

  const run: MathRun = {
    kind: 'math',
    ommlJson: node.attrs?.originalXml ?? null,
    textContent,
    width,
    height,
    pmStart: pos.start,
    pmEnd: pos.end,
  };

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}
