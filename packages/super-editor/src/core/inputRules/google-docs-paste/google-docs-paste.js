import { DOMParser } from 'prosemirror-model';
import { convertEmToPt, sanitizeHtml } from '../../InputRule.js';
import { ListHelpers } from '../../helpers/list-numbering-helpers.js';
import { createSingleItemList } from '../html/html-helpers.js';
import { getLvlTextForGoogleList, googleNumDefMap } from '../../helpers/pasteListHelpers.js';
import { wrapTextsInRuns } from '../docx-paste/docx-paste.js';

// Match Google Docs default heading sizes (H1=20pt, H2=18pt, H3=14pt, H4=12pt, H5=11pt).
// Descending order so oversized fonts (e.g. 24pt) still resolve to closest heading.
const headingSizeMap = [
  { minPt: 20, tag: 'h1' },
  { minPt: 16, tag: 'h2' },
  { minPt: 14, tag: 'h3' },
  { minPt: 12, tag: 'h4' },
  { minPt: 10, tag: 'h5' },
];

const boldWeightRegex = /^(bold|700|800|900)$/i;

/**
 * Main handler for pasted Google Docs content.
 *
 * @param {string} html The string being pasted
 * @param {Editor} editor The SuperEditor instance
 * @param {Object} view The ProseMirror view
 * @returns
 */
export const handleGoogleDocsHtml = (html, editor, view) => {
  // convert lists
  const htmlWithPtSizing = convertEmToPt(html);
  const cleanedHtml = sanitizeHtml(htmlWithPtSizing).innerHTML;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;

  const tempDivWithHeadings = convertStyledHeadings(tempDiv);

  const htmlWithMergedLists = mergeSeparateLists(tempDivWithHeadings);
  const flattenHtml = flattenListsInHtml(htmlWithMergedLists, editor);

  let doc = DOMParser.fromSchema(editor.schema).parse(flattenHtml);
  doc = wrapTextsInRuns(doc);
  tempDiv.remove();

  const { dispatch } = editor.view;
  if (!dispatch) return false;

  dispatch(view.state.tr.replaceSelectionWith(doc, true));
  return true;
};

/**
 * Flattens lists to ensure each list contains exactly ONE list item.
 */
function flattenListsInHtml(container, editor) {
  // Keep processing until all lists are flattened
  let foundList;
  while ((foundList = findListToFlatten(container))) {
    flattenFoundList(foundList, editor);
  }

  return container;
}

/**
 * Finds lists to be flattened
 */
function findListToFlatten(container) {
  // First priority: unprocessed lists
  let list = container.querySelector('ol:not([data-list-id]), ul:not([data-list-id])');
  if (list) return list;

  return null;
}

/**
 * Flattens a single list by:
 * 1. Ensuring it has proper data-list-id
 * 2. Splitting multi-item lists into single-item lists
 * 3. Extracting nested lists and processing them recursively
 */
function flattenFoundList(listElem, editor) {
  const tag = listElem.tagName.toLowerCase();
  const baseLevel = getBaseLevel(listElem);
  const items = Array.from(listElem.children).filter((c) => c.tagName?.toLowerCase() === 'li');
  if (!items.length) return;

  const counters = {};
  const levelStarts = {};

  const rootNumId = ListHelpers.getNewListId(editor);
  const newNodes = [];

  items.forEach((li) => {
    const level = getEffectiveLevel(li, baseLevel);
    const styleType = getListStyleType(li, tag);
    const numFmt = googleNumDefMap.get(styleType) || (tag === 'ol' ? 'decimal' : 'bullet');
    const lvlText = getLvlTextForGoogleList(styleType, level + 1, editor);

    if (levelStarts[level] == null) {
      levelStarts[level] = getInitialStartValue({ li, listElem, level, baseLevel });
    }

    const currentValue = incrementLevelCounter(counters, level, levelStarts[level]);
    const path = buildListPath(level, counters);

    const paragraph = createSingleItemList({
      li: li.childNodes.length && li.childNodes[0].tagName === 'P' ? li.childNodes[0] : li,
      rootNumId,
      level,
      listNumberingType: numFmt,
    });

    paragraph.setAttribute('data-num-fmt', numFmt);
    paragraph.setAttribute('data-lvl-text', lvlText);
    paragraph.setAttribute('data-list-level', JSON.stringify(path.length ? path : [currentValue]));

    ListHelpers.generateNewListDefinition({
      numId: rootNumId,
      listType: numFmt === 'bullet' ? 'bulletList' : 'orderedList',
      editor,
      fmt: numFmt,
      level: level.toString(),
      start: levelStarts[level],
      text: lvlText,
    });

    newNodes.push(paragraph);

    const nestedLists = getNestedLists([li.nextSibling]);
    const nestedList = nestedLists[0];
    if (nestedList) {
      const cloned = nestedList.cloneNode(true);
      cloned.setAttribute('data-level', String(level + 1));
      newNodes.push(cloned);
      if (['OL', 'UL'].includes(li.nextSibling?.tagName)) {
        li.nextSibling.remove();
      }
    }
  });

  const parent = listElem.parentNode;
  const nextSibling = listElem.nextSibling;
  parent.removeChild(listElem);

  newNodes.forEach((node) => {
    parent.insertBefore(node, nextSibling);
  });
}

/**
 * Recursive helper to find all nested lists for the list item
 */
function getNestedLists(nodes) {
  let result = [];

  const nodesArray = Array.from(nodes).filter((n) => n !== null);

  for (let item of nodesArray) {
    if (item.tagName === 'OL' || item.tagName === 'UL') {
      result.push(item);
    }
  }

  return result;
}

/**
 * Method that combines separate lists with sequential start attribute into one list
 * Google Docs list items could be presented as separate lists with sequential start attribute
 */
function mergeSeparateLists(container) {
  const tempCont = container.cloneNode(true);

  // Find root-level ordered lists (not nested inside other lists)
  // Note: Using filter instead of complex :not() selectors for better browser compatibility
  const allOls = Array.from(tempCont.querySelectorAll('ol') || []);
  const rootLevelLists = allOls.filter((ol) => !ol.parentElement?.closest('ol, ul'));
  const mainList = rootLevelLists.find((list) => !list.getAttribute('start')) || rootLevelLists[0];
  const hasStartAttr = rootLevelLists.some((list) => list.getAttribute('start') !== null);

  if (hasStartAttr && mainList) {
    const listsWithStartAttr = rootLevelLists.filter(
      (list) => list !== mainList && list.getAttribute('start') !== null,
    );
    listsWithStartAttr
      .sort((a, b) => Number(a.getAttribute('start')) - Number(b.getAttribute('start')))
      .forEach((item) => {
        mainList.append(...item.childNodes);
        item.remove();
      });
  }

  return tempCont;
}

function getBaseLevel(listElem) {
  const explicitLevel = Number(listElem.getAttribute('data-level'));
  if (!Number.isNaN(explicitLevel)) return explicitLevel;

  let level = 0;
  let ancestor = listElem.parentElement;
  while (ancestor && ancestor.tagName) {
    if (ancestor.tagName.toLowerCase() === 'li') level++;
    ancestor = ancestor.parentElement;
  }

  return level;
}

function getEffectiveLevel(li, baseLevel) {
  const ariaLevel = Number(li.getAttribute('aria-level'));
  if (Number.isNaN(ariaLevel)) {
    return baseLevel;
  }
  return Math.max(ariaLevel - 1, baseLevel);
}

function getListStyleType(li, fallbackTag) {
  return li.style?.['list-style-type'] || (fallbackTag === 'ol' ? 'decimal' : 'bullet');
}

function getInitialStartValue({ li, listElem, level, baseLevel }) {
  const valueAttr = Number(li.getAttribute('value'));
  if (!Number.isNaN(valueAttr)) {
    return valueAttr;
  }

  if (level === baseLevel) {
    const listStart = Number(listElem.getAttribute('start'));
    if (!Number.isNaN(listStart)) {
      return listStart;
    }
  }

  return 1;
}

function incrementLevelCounter(map, level, start) {
  const numericLevel = Number(level);
  Object.keys(map).forEach((key) => {
    if (Number(key) > numericLevel) {
      delete map[key];
    }
  });

  if (map[numericLevel] == null) {
    map[numericLevel] = Number(start) || 1;
  } else {
    map[numericLevel] += 1;
  }

  return map[numericLevel];
}

function buildListPath(level, map) {
  const numericLevel = Number(level);
  if (Number.isNaN(numericLevel)) {
    return [];
  }

  const path = [];
  for (let i = 0; i <= numericLevel; i++) {
    if (map[i] != null) {
      path.push(map[i]);
    }
  }
  return path;
}

/**
 * Converts Google Docs styled <p> elements that represent headings into proper
 * <h1>–<h5> tags before ProseMirror parsing.
 *
 * Google Docs converts heading levels to <p> tags with inline font-size /
 * font-weight styling instead of semantic heading tags. This function detects
 * that pattern and replaces the elements in-place.
 *
 * @param {HTMLElement} container
 */
function convertStyledHeadings(container) {
  const paragraphs = Array.from(container.querySelectorAll('p')).filter((p) => !p.closest('li'));

  paragraphs.forEach((p) => {
    const { fontSize, isBold } = getHeadingStyleProps(p);
    if (!isBold || fontSize === null) return;

    const match = headingSizeMap.find(({ minPt }) => fontSize >= minPt);
    if (!match) return;

    const heading = document.createElement(match.tag);
    heading.innerHTML = p.innerHTML;
    Array.from(p.attributes).forEach((attr) => heading.setAttribute(attr.name, attr.value));
    p.replaceWith(heading);
  });

  return container;
}

/**
 * Reads font-size (in pt) and bold status from an element's inline style.
 * When font-size is on the root element, bold is accepted from the root or
 * all child spans. When font-size is only on child spans, all spans must
 * share the same size, and bold is from the root or all child spans.
 *
 * @param {HTMLElement} el
 * @returns {{ fontSize: number|null, isBold: boolean }}
 */
function getHeadingStyleProps(el) {
  const elFontSize = parsePtValue(el.style.fontSize);
  const elIsBold = boldWeightRegex.test(el.style.fontWeight || '');
  const spans = Array.from(el.querySelectorAll('span'));
  const spanIsBold = (span) => boldWeightRegex.test(span.style.fontWeight || '');
  const notHeading = { fontSize: null, isBold: false };

  // font-size declared on root element: bold from itself or if all child spans are bold
  const fromElement = () => {
    const isBold = elIsBold || (spans.length > 0 && spans.every(spanIsBold));
    return { fontSize: elFontSize, isBold };
  };

  // font-size only on child spans: all must be same size, then bold from root or all spans
  const fromSpans = () => {
    // no span children, size is indeterminate
    if (spans.length === 0) return notHeading;

    // if not all spans declare a font-size, not a heading
    const sizes = spans.map((span) => parsePtValue(span.style.fontSize));
    if (sizes.some((size) => size === null)) return notHeading;

    // if inconsistent sizes, mixed body text, not a heading
    const [firstSpanSize] = sizes;
    if (sizes.some((size) => size !== firstSpanSize)) return notHeading;

    // otherwise, first span size, and root element or all spans bold
    const isBold = elIsBold || spans.every(spanIsBold);
    return { fontSize: firstSpanSize, isBold };
  };

  return elFontSize !== null ? fromElement() : fromSpans();
}

/**
 * Parses a CSS font-size value in pt units, e.g. "20pt" → 20. Returns null
 * for any other format.
 *
 * @param {string|undefined} cssValue
 * @returns {number|null}
 */
function parsePtValue(cssValue) {
  if (!cssValue) return null;
  const m = cssValue.match(/^([\d.]+)pt$/i);
  return m ? parseFloat(m[1]) : null;
}
