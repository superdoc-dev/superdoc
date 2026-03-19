/**
 * Paragraph Borders — rendering feature module
 *
 * Handles all aspects of paragraph border rendering:
 * - Border group detection (between-border analysis)
 * - Border/shading DOM layer creation
 * - CSS border style application
 *
 * @ooxml w:pPr/w:pBdr — paragraph border properties
 * @ooxml w:pPr/w:pBdr/w:top, w:bottom, w:left, w:right — side borders
 * @ooxml w:pPr/w:pBdr/w:between — between border for grouped paragraphs
 * @ooxml w:pPr/w:pBdr/w:bar — bar border (vertical line)
 * @ooxml w:pPr/w:shd — paragraph shading
 * @spec  ECMA-376 §17.3.1.24 (pBdr), §17.3.1.31 (shd)
 */

// Group analysis
export { computeBetweenBorderFlags, getFragmentParagraphBorders, getFragmentHeight } from './group-analysis.js';
export type { BetweenBorderInfo } from './group-analysis.js';

// DOM layers and CSS
export {
  createParagraphDecorationLayers,
  applyParagraphBorderStyles,
  applyParagraphShadingStyles,
  getParagraphBorderBox,
  stampBetweenBorderDataset,
  computeBorderSpaceExpansion,
} from './border-layer.js';

// Shared types
export type { BlockLookup, BlockLookupEntry } from './types.js';
