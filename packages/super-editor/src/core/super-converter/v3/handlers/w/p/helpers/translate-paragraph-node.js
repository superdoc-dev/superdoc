import { translateChildNodes } from '@converter/v2/exporter/helpers/index.js';
import { generateParagraphProperties } from './generate-paragraph-properties.js';

/**
 * Merge consecutive tracked change elements (w:ins/w:del) with the same ID.
 * Comment range markers between tracked changes with the same ID are included
 * inside the merged wrapper, matching Word's OOXML structure.
 *
 * See SD-1519 for details on the ECMA-376 spec compliance.
 *
 * @param {Array} elements The translated paragraph elements
 * @returns {Array} Elements with consecutive tracked changes merged
 */
function mergeConsecutiveTrackedChanges(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return elements;

  const result = [];
  let i = 0;

  while (i < elements.length) {
    const current = elements[i];

    // Check if this is a tracked change wrapper (w:ins or w:del)
    if (current?.name === 'w:ins' || current?.name === 'w:del') {
      const tcId = current.attributes?.['w:id'];
      const tcName = current.name;

      // Collect consecutive elements that belong to this tracked change
      const mergedElements = [...(current.elements || [])];
      let j = i + 1;

      while (j < elements.length) {
        const next = elements[j];

        // Include comment markers - they can sit inside tracked changes per ECMA-376
        if (next?.name === 'w:commentRangeStart' || next?.name === 'w:commentRangeEnd') {
          mergedElements.push(next);
          j++;
          continue;
        }

        // Include comment references (w:r containing w:commentReference)
        if (next?.name === 'w:r') {
          const hasOnlyCommentRef = next.elements?.length === 1 && next.elements[0]?.name === 'w:commentReference';
          if (hasOnlyCommentRef) {
            mergedElements.push(next);
            j++;
            continue;
          }
        }

        // Merge with next tracked change if same type and ID
        if (next?.name === tcName && next.attributes?.['w:id'] === tcId) {
          mergedElements.push(...(next.elements || []));
          j++;
          continue;
        }

        // Stop merging when we hit a different element
        break;
      }

      // Create the merged wrapper
      result.push({
        name: tcName,
        attributes: { ...current.attributes },
        elements: mergedElements,
      });

      i = j;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
}

/**
 * Translate a paragraph node
 *
 * @param {ExportParams} node A prose mirror paragraph node
 * @returns {XmlReadyNode} JSON of the XML-ready paragraph node
 */
export function translateParagraphNode(params) {
  let elements = translateChildNodes(params);

  // Merge consecutive tracked changes with the same ID, including comment markers between them
  elements = mergeConsecutiveTrackedChanges(elements);

  // Replace current paragraph with content of html annotation
  const htmlAnnotationChild = elements.find((element) => element.name === 'htmlAnnotation');
  if (htmlAnnotationChild) {
    return htmlAnnotationChild.elements;
  }

  // Insert paragraph properties at the beginning of the elements array
  const pPr = generateParagraphProperties(params);
  if (pPr) elements.unshift(pPr);

  let attributes = {};
  if (params.node.attrs?.rsidRDefault) {
    attributes['w:rsidRDefault'] = params.node.attrs.rsidRDefault;
  }

  const result = {
    name: 'w:p',
    elements,
    attributes,
  };

  return result;
}
