/**
 * Converters Module
 *
 * Centralized exports for PM node to FlowBlock converters and handlers:
 * - Text run conversion
 * - Paragraph conversion
 * - List conversion and handler
 * - Image conversion and handler
 * - Shape conversion and handlers
 * - Table conversion and handler
 */

// Paragraphs (converter + handler)
export { paragraphToFlowBlocks, mergeAdjacentRuns, handleParagraphNode } from './paragraph.js';

// Content blocks (converter)
export { contentBlockNodeToDrawingBlock } from './content-block.js';

// Images (converter + handler)
export { imageNodeToBlock, handleImageNode } from './image.js';

// Shapes (converters + handlers)
export {
  vectorShapeNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeContainerNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  handleVectorShapeNode,
  handleShapeGroupNode,
  handleShapeContainerNode,
  handleShapeTextboxNode,
} from './shapes.js';

// Tables (converter + handler)
export { tableNodeToBlock, handleTableNode } from './table.js';

// Block node utilities
export { hydrateImageBlocks } from '../utilities.js';
