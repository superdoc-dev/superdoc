import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
  extractBodyPrProperties,
} from './textbox-content-helpers.js';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter';

/**
 * Builds a shapeContainer/shapeTextbox model from a DrawingML textbox payload.
 *
 * @param {Object} options
 * @param {Object} options.params - Translator params (docx, filename, etc.)
 * @param {Object|null} options.drawingNode - The w:drawing XML node (stored for round-trip export)
 * @param {Object} options.textBoxContent - The w:txbxContent element
 * @param {Object} [options.bodyPr] - The wps:bodyPr element (insets, vertical alignment)
 * @param {Object} [options.baseAttrs] - Additional attrs to merge into shapeContainer (size, geometry, etc.)
 * @param {Function} [options.paragraphImporter] - Optional custom paragraph importer
 * @returns {Object|null} shapeContainer PM node or null
 */
/**
 * Strip marks from run nodes only. r-translator puts runLevelMarks on both
 * the run node and its text children. Removing them from run nodes is safe —
 * the marks already live on the text content. Without this, PM view crashes
 * when marked run nodes are inside nested isolating: true containers.
 */
function stripRunNodeMarks(nodes) {
  if (!Array.isArray(nodes)) return nodes;
  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return node;
    const stripped =
      node.type === 'run' && Array.isArray(node.marks) && node.marks.length > 0 ? { ...node, marks: [] } : node;
    if (Array.isArray(stripped.content)) {
      return { ...stripped, content: stripRunNodeMarks(stripped.content) };
    }
    return stripped;
  });
}

export function importDrawingMLTextbox({
  params,
  drawingNode,
  textBoxContent,
  bodyPr,
  baseAttrs = {},
  paragraphImporter,
}) {
  if (!textBoxContent) {
    return null;
  }

  const processedContent = preProcessTextBoxContent(textBoxContent, params);
  const textboxParagraphs = collectTextBoxParagraphs(processedContent?.elements || []);

  const importParagraph =
    typeof paragraphImporter === 'function'
      ? paragraphImporter
      : (paragraph) => {
          const imported = handleParagraphNode({
            ...params,
            nodes: [paragraph],
          });
          return imported?.nodes || [];
        };

  const rawNodes = textboxParagraphs.flatMap((paragraph) => {
    const imported = importParagraph(paragraph);
    return Array.isArray(imported) ? imported : imported ? [imported] : [];
  });

  // r-translator puts runLevelMarks on run nodes AND on their text children.
  // PM view crashes when run nodes have node-level marks inside nested isolating: true
  // containers (shapeContainer > shapeTextbox). Strip marks from run nodes only —
  // the same marks are already on the text content inside, so no formatting is lost.
  const contentNodes = stripRunNodeMarks(rawNodes);

  const { verticalAlign, insets } = extractBodyPrProperties(bodyPr);

  return {
    type: 'shapeContainer',
    attrs: {
      ...baseAttrs,
      drawingContent: drawingNode,
    },
    content: [
      {
        type: 'shapeTextbox',
        attrs: {
          textInsets: { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left },
          textVerticalAlign: verticalAlign,
          attributes: {},
        },
        content: contentNodes,
      },
    ],
  };
}
