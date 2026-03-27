import type { MathRun } from '@superdoc/contracts';
import type { InlineConverterParams } from './common.js';

/** Rough width estimate per character for math content (px). */
const MATH_CHAR_WIDTH = 10;
/** Default height for math content (px). */
const MATH_DEFAULT_HEIGHT = 24;

/**
 * Converts a mathInline PM node to a MathRun for the layout engine.
 */
export function mathInlineNodeToRun({ node, positions, sdtMetadata }: InlineConverterParams): MathRun | null {
  const pos = positions.get(node);
  if (!pos) return null;

  const textContent = String(node.attrs?.textContent ?? '');
  const width = Math.max(textContent.length * MATH_CHAR_WIDTH, 20);

  const run: MathRun = {
    kind: 'math',
    ommlJson: node.attrs?.originalXml ?? null,
    textContent,
    width,
    height: MATH_DEFAULT_HEIGHT,
    pmStart: pos.start,
    pmEnd: pos.end,
  };

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}
