import { translateChildNodes } from '@converter/v2/exporter/helpers/index.js';
import { generateParagraphProperties } from './generate-paragraph-properties.js';

const isTrackedChangeWrapper = (el) => el?.name === 'w:ins' || el?.name === 'w:del';
const stableStringify = (value) => JSON.stringify(value ?? null);

const getMergeableTextRunParts = (element) => {
  if (element?.name !== 'w:r' || !Array.isArray(element.elements) || element.elements.length === 0) return null;

  const [first, second, ...rest] = element.elements;
  if (rest.length > 0) return null;

  const runProperties = first?.name === 'w:rPr' ? first : null;
  const textNode = runProperties ? second : first;
  if (textNode?.name !== 'w:t' || !Array.isArray(textNode.elements) || textNode.elements.length !== 1) return null;

  const textChild = textNode.elements[0];
  if (typeof textChild?.text !== 'string') return null;

  return {
    runProperties,
    textNode,
    textChild,
  };
};

function mergeAdjacentFinalTextRuns(elements) {
  if (!Array.isArray(elements) || elements.length < 2) return elements;

  const result = [];

  elements.forEach((element) => {
    const previous = result[result.length - 1];
    const previousParts = getMergeableTextRunParts(previous);
    const currentParts = getMergeableTextRunParts(element);

    const canMerge =
      previousParts &&
      currentParts &&
      stableStringify(previous?.attributes) === stableStringify(element?.attributes) &&
      stableStringify(previousParts.runProperties) === stableStringify(currentParts.runProperties) &&
      stableStringify(previousParts.textNode?.attributes) === stableStringify(currentParts.textNode?.attributes);

    if (!canMerge) {
      result.push(element);
      return;
    }

    previousParts.textChild.text += currentParts.textChild.text;
  });

  return result;
}

const getCommentReferenceNode = (el) => {
  if (el?.name !== 'w:r' || !Array.isArray(el.elements)) return null;
  return el.elements.find((child) => child?.name === 'w:commentReference') ?? null;
};

const isCommentMarker = (el) => {
  if (!el) return false;
  if (el.name === 'w:commentRangeStart' || el.name === 'w:commentRangeEnd') return true;
  return getCommentReferenceNode(el) != null;
};

const getCommentMarkerId = (el) => {
  if (!el) return null;
  if ((el.name === 'w:commentRangeStart' || el.name === 'w:commentRangeEnd') && el.attributes?.['w:id'] != null) {
    return String(el.attributes['w:id']);
  }
  const referenceNode = getCommentReferenceNode(el);
  if (referenceNode?.attributes?.['w:id'] != null) {
    return String(referenceNode.attributes['w:id']);
  }
  return null;
};

const collectLeadingCommentStartIds = (elements = []) => {
  const startedIds = new Set();
  for (const element of elements) {
    if (element?.name !== 'w:commentRangeStart') break;
    const id = getCommentMarkerId(element);
    if (id) startedIds.add(id);
  }
  return startedIds;
};

const shouldAbsorbTrailingMarkersIntoWrapper = (pendingComments = [], startedInsideWrapper = new Set()) => {
  if (!pendingComments.length || !startedInsideWrapper.size) return false;
  return pendingComments.every((marker) => {
    const markerId = getCommentMarkerId(marker);
    return markerId != null && startedInsideWrapper.has(markerId);
  });
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
 * / commentReference markers are absorbed too when they close comments that
 * started inside that wrapper, preserving Word's replacement adjacency.
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

      const startedInsideWrapper = collectLeadingCommentStartIds(mergedElements);
      const absorbTrailingMarkers = shouldAbsorbTrailingMarkersIntoWrapper(pendingComments, startedInsideWrapper);
      if (absorbTrailingMarkers) {
        mergedElements.push(...pendingComments);
        pendingComments.length = 0;
      }

      if (didMerge) {
        result.push({ name: tcName, attributes: { ...current.attributes }, elements: mergedElements });
        result.push(...pendingComments);
      } else {
        result.push(
          absorbTrailingMarkers
            ? { name: tcName, attributes: { ...current.attributes }, elements: mergedElements }
            : current,
        );
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

  if (params.isFinalDoc) {
    elements = mergeAdjacentFinalTextRuns(elements);
  }

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
