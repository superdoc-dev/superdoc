import { translateChildNodes } from '@converter/v2/exporter/helpers/index.js';
import { generateParagraphProperties } from './generate-paragraph-properties.js';

/**
 * Merge consecutive tracked change elements (w:ins/w:del) with the same ID.
 * Comment range markers between tracked changes with the same ID are included
 * inside the merged wrapper, matching Word's OOXML structure.
 *
 * AIDEV-NOTE: Comment markers (w:commentRangeStart/End and w:r→w:commentReference)
 * are only absorbed into the wrapper when a same-id merge actually happens.
 * If a tracked change has no matching successor, trailing comment markers are
 * preserved as siblings so the import side can re-pair the comment range with
 * the wrapped text. Otherwise w:commentRangeEnd ends up inside w:del while
 * w:commentRangeStart is outside it, breaking the round-trip (SD-2528).
 *
 * See SD-1519 for details on the ECMA-376 spec compliance.
 *
 * @param {Array} elements The translated paragraph elements
 * @returns {Array} Elements with consecutive tracked changes merged
 */
function mergeConsecutiveTrackedChanges(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return elements;

  const isCommentMarker = (el) => {
    if (!el) return false;
    if (el.name === 'w:commentRangeStart' || el.name === 'w:commentRangeEnd') return true;
    if (el.name === 'w:r' && el.elements?.length === 1 && el.elements[0]?.name === 'w:commentReference') return true;
    return false;
  };

  const result = [];
  let i = 0;

  while (i < elements.length) {
    const current = elements[i];

    if (current?.name === 'w:ins' || current?.name === 'w:del') {
      const tcId = current.attributes?.['w:id'];
      const tcName = current.name;

      const mergedElements = [...(current.elements || [])];
      const pendingComments = [];
      let didMerge = false;
      let j = i + 1;

      while (j < elements.length) {
        const next = elements[j];

        if (isCommentMarker(next)) {
          pendingComments.push(next);
          j++;
          continue;
        }

        if (next?.name === tcName && next.attributes?.['w:id'] === tcId) {
          mergedElements.push(...pendingComments, ...(next.elements || []));
          pendingComments.length = 0;
          didMerge = true;
          j++;
          continue;
        }

        break;
      }

      if (didMerge) {
        result.push({ name: tcName, attributes: { ...current.attributes }, elements: mergedElements });
        result.push(...pendingComments);
      } else {
        result.push(current);
        result.push(...pendingComments);
      }
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
  const exportParams = {
    ...params,
    extraParams: {
      ...params.extraParams,
      paragraphProperties: params.node?.attrs?.paragraphProperties,
    },
  };
  let elements = translateChildNodes(exportParams);

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
