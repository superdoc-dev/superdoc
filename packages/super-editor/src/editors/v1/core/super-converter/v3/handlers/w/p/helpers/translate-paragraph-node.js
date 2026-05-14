import { translateChildNodes } from '@converter/v2/exporter/helpers/index.js';
import { generateParagraphProperties } from './generate-paragraph-properties.js';

const isTrackedChangeWrapper = (el) => el?.name === 'w:ins' || el?.name === 'w:del';

const isCommentMarker = (el) => {
  if (!el) return false;
  if (el.name === 'w:commentRangeStart' || el.name === 'w:commentRangeEnd') return true;
  if (el.name === 'w:r' && el.elements?.length === 1 && el.elements[0]?.name === 'w:commentReference') return true;
  return false;
};

// AIDEV-NOTE: SD-2528. The importer associates a comment with a tracked change
// by walking document.xml and noting commentRangeStart elements that appear
// inside a w:ins/w:del wrapper (see documentCommentsImporter.js'
// extractCommentRangesFromDocument). Word always emits commentRangeStart inside
// the wrapper; emitting it as a sibling silently loses the comment ↔ TC link
// on re-import.
function foldLeadingCommentStartsIntoTrackedChanges(elements) {
  const result = [];
  let i = 0;
  while (i < elements.length) {
    if (elements[i]?.name !== 'w:commentRangeStart') {
      result.push(elements[i]);
      i++;
      continue;
    }
    const leadingStarts = [];
    while (i < elements.length && elements[i]?.name === 'w:commentRangeStart') {
      leadingStarts.push(elements[i]);
      i++;
    }
    const next = elements[i];
    if (isTrackedChangeWrapper(next)) {
      result.push({ ...next, elements: [...leadingStarts, ...(next.elements || [])] });
      i++;
    } else {
      result.push(...leadingStarts);
    }
  }
  return result;
}

/**
 * Merge consecutive tracked change elements (w:ins/w:del) with the same ID,
 * and fold any commentRangeStart that immediately precedes a tracked-change
 * wrapper INTO the wrapper as its first child(ren). Trailing commentRangeEnd
 * and w:r→w:commentReference stay as siblings and are only absorbed when a
 * same-id successor wrapper triggers an SD-1519 merge.
 *
 * @param {Array} elements The translated paragraph elements
 * @returns {Array} Elements with consecutive tracked changes merged
 */
function mergeConsecutiveTrackedChanges(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return elements;

  elements = foldLeadingCommentStartsIntoTrackedChanges(elements);

  const result = [];
  let i = 0;

  while (i < elements.length) {
    const current = elements[i];

    if (isTrackedChangeWrapper(current)) {
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
