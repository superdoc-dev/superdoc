import { DOMParser, Fragment } from 'prosemirror-model';
import { cleanHtmlUnnecessaryTags, convertEmToPt, handleHtmlPaste } from '../../InputRule.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import {
  extractListLevelStyles,
  extractParagraphStyles,
  numDefByTypeMap,
  numDefMap,
  startHelperMap,
  resolveStyles,
} from '@helpers/pasteListHelpers.js';
import { normalizeLvlTextChar } from '@superdoc/common/list-numbering';
import { pointsToTwips } from '@converter/helpers';
import { decodeRPrFromMarks } from '@converter/styles.js';

/**
 * Main handler for pasted DOCX content.
 *
 * @param {string} html The string being pasted
 * @param {Editor} editor The SuperEditor instance
 * @param {Object} view The ProseMirror view
 * @param {Object} plugin The plugin instance
 * @returns
 */
export const handleDocxPaste = (html, editor, view) => {
  const { converter } = editor;
  if (!converter || !converter.convertedXml) return handleHtmlPaste(html, editor);

  let cleanedHtml = convertEmToPt(html);
  cleanedHtml = cleanHtmlUnnecessaryTags(cleanedHtml);

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;
  tempDiv.querySelectorAll('[data-sd-block-id]').forEach((node) => node.removeAttribute('data-sd-block-id'));

  const data = tempDiv.querySelectorAll('p, li, ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `h${n}`).join(', '));

  const startMap = {};

  data.forEach((item) => {
    let type;
    if (item.localName === 'li') {
      type = 'listItem';
    } else {
      type = 'p';
    }

    const styleAttr = item.getAttribute('style') || '';
    const msoListMatch = styleAttr.match(/mso-list:\s*l(\d+)\s+level(\d+)\s+lfo(\d+)/);
    const css = tempDiv.querySelector('style').innerHTML;
    const normalStyles = extractParagraphStyles(css, '.MsoNormal');
    let styleId = item.getAttribute('class');
    let charStyles = {};
    if (item.localName.startsWith('h') && !styleId) {
      styleId = item.localName;
      const level = styleId.substring(1);
      charStyles = extractParagraphStyles(css, `.Heading${level}Char`);
    } else if (styleId) {
      styleId = `.${styleId}`;
    }
    const paragraphStyles = extractParagraphStyles(css, styleId);
    let styleChain = { ...normalStyles, ...paragraphStyles, ...charStyles };
    const numberingDefinedInline = !paragraphStyles || !paragraphStyles['mso-list'];

    if (msoListMatch) {
      const [, abstractId, level, numId] = msoListMatch;
      const numberingStyles = extractListLevelStyles(css, abstractId, level, numId) || {};
      const markerFontFamily = numberingStyles?.['font-family'] ?? normalStyles?.['font-family'];
      delete numberingStyles['font-family'];
      if (numberingDefinedInline) {
        styleChain = { ...normalStyles, ...paragraphStyles, ...numberingStyles };
      } else {
        styleChain = { ...normalStyles, ...numberingStyles, ...paragraphStyles };
      }
      let start, numFmt, lvlText;

      if (type === 'listItem') {
        const listType = item.parentNode.getAttribute('type');
        const startAttr = item.parentNode.getAttribute('start');
        if (!startMap[numId]) startMap[numId] = startAttr;
        start = startMap[numId];
        numFmt = numDefByTypeMap.get(listType);
        lvlText = `%${level}.`;
      } else {
        // Get numbering format from Word styles
        const msoNumFormat = numberingStyles['mso-level-number-format'] || 'decimal';
        numFmt = numDefMap.get(msoNumFormat);
        const punc = item.innerText?.match(/^\s*[a-zA-Z0-9]+([.()])/i)?.[1] || '.';
        lvlText = numFmt === 'bullet' ? normalizeLvlTextChar(numberingStyles['mso-level-text']) : `%${level}${punc}`;

        const startGetter = startHelperMap.get(numFmt);
        if (!startMap[numId]) startMap[numId] = startGetter(item.children[0]?.innerText || '1');
        start = startMap[numId];
      }

      item.setAttribute('data-marker-font-family', markerFontFamily);
      item.setAttribute('data-num-id', numId);
      item.setAttribute('data-list-level', parseInt(level) - 1);
      item.setAttribute('data-start', start);
      item.setAttribute('data-lvl-text', lvlText);
      item.setAttribute('data-num-fmt', numFmt);
    }

    // Handle paragraph properties
    const resolvedStyle = resolveStyles(styleChain, item.getAttribute('style'));

    //   Indentation
    const left = pointsToTwips(parseInt(resolvedStyle['margin-left'] ?? 0));
    const hangingFirstLine = pointsToTwips(parseInt(resolvedStyle['text-indent'] ?? 0));
    let hanging, firstLine;
    if (hangingFirstLine < 0) {
      hanging = Math.abs(hangingFirstLine);
    } else {
      firstLine = hangingFirstLine;
    }

    if (left || hanging || firstLine) {
      const indent = {};
      if (left != null) indent.left = left;
      if (hanging != null) indent.hanging = hanging;
      if (firstLine != null) indent.firstLine = firstLine;
      item.setAttribute('data-indent', JSON.stringify(indent));
    }

    //  Spacing
    const after = pointsToTwips(parseInt(resolvedStyle['margin-bottom'] ?? 0));
    const before = pointsToTwips(parseInt(resolvedStyle['margin-top'] ?? 0));
    if (after || before) {
      const spacing = {};
      if (after != null) spacing.after = after;
      if (before != null) spacing.before = before;
      item.setAttribute('data-spacing', JSON.stringify(spacing));
    }

    //   Text styles
    const textStyles = {};

    if (resolvedStyle['font-size']) {
      textStyles['font-size'] = resolvedStyle['font-size'];
    }
    if (resolvedStyle['font-family']) {
      textStyles['font-family'] = resolvedStyle['font-family'];
    }
    if (resolvedStyle['text-transform']) {
      textStyles['text-transform'] = resolvedStyle['text-transform'];
    }
    if (Object.keys(textStyles).length) {
      Object.keys(textStyles).forEach((key) => {
        const styleValue = textStyles[key];
        if (styleValue) {
          item.style.setProperty(key, styleValue);
        }
      });
      item.setAttribute('data-text-styles', JSON.stringify(textStyles));

      for (const child of item.children) {
        if (child.style) {
          Object.keys(textStyles).forEach((key) => {
            const styleValue = textStyles[key];
            if (styleValue) {
              child.style.setProperty(key, styleValue);
            }
          });
        }
      }
    }

    // Marks
    if (resolvedStyle['font-weight'] === 'bold') {
      item.style.setProperty('font-weight', 'bold');
      for (const child of item.children) {
        if (child.style) {
          child.style.setProperty('font-weight', 'bold');
        }
      }
    }

    // Strip literal prefix inside conditional span
    extractAndRemoveConditionalPrefix(item);
  });

  transformWordLists(tempDiv, editor);
  let doc = DOMParser.fromSchema(editor.schema).parse(tempDiv);
  doc = wrapTextsInRuns(doc);

  tempDiv.remove();

  const { dispatch } = editor.view;
  if (!dispatch) return false;

  dispatch(view.state.tr.replaceSelectionWith(doc, true));
  return true;
};

export const wrapTextsInRuns = (doc) => {
  const runType = doc.type?.schema?.nodes?.run;
  if (!runType) return doc;

  const wrapNode = (node, parent) => {
    if (node.isText) {
      if (parent?.type?.name === 'run') return node;
      const runProperties = decodeRPrFromMarks(node.marks);
      return runType.create({ runProperties }, [node]);
    }

    if (!node.childCount) return node;

    let changed = false;
    const wrappedChildren = [];
    node.forEach((child) => {
      const wrappedChild = wrapNode(child, node);
      if (wrappedChild !== child) changed = true;
      wrappedChildren.push(wrappedChild);
    });

    if (!changed) return node;

    return node.copy(Fragment.fromArray(wrappedChildren));
  };

  return wrapNode(doc, null);
};

const transformWordLists = (container, editor) => {
  const listItems = Array.from(container.querySelectorAll('[data-num-id]'));

  const lists = {};
  const mappedLists = {};

  for (const item of listItems) {
    const level = parseInt(item.getAttribute('data-list-level'));
    const numFmt = item.getAttribute('data-num-fmt');
    const start = item.getAttribute('data-start');
    const lvlText = item.getAttribute('data-lvl-text');
    const markerFontFamily = item.getAttribute('data-marker-font-family');

    // MS Word copy-pasted lists always start with num Id 1 and increment from there.
    // Which way not match the target documents numbering.xml lists
    // We will generate new definitions for all pasted lists
    // But keep track of a map of original ID to new ID so that we can keep lists together
    const importedId = item.getAttribute('data-num-id');
    if (!mappedLists[importedId]) mappedLists[importedId] = ListHelpers.getNewListId(editor);
    const id = mappedLists[importedId];
    const listType = numFmt === 'bullet' ? 'bulletList' : 'orderedList';
    ListHelpers.generateNewListDefinition({
      numId: id,
      listType,
      level: level.toString(),
      start,
      fmt: numFmt,
      text: lvlText,
      editor,
      markerFontFamily,
    });

    if (!lists[id]) lists[id] = { levels: {} };
    const currentListByNumId = lists[id];

    if (!currentListByNumId.levels[level]) currentListByNumId.levels[level] = Number(start) || 1;
    else currentListByNumId.levels[level]++;

    // Reset deeper levels when this level is updated
    Object.keys(currentListByNumId.levels).forEach((key) => {
      const level1 = Number(key);
      if (level1 > level) {
        delete currentListByNumId.levels[level1];
      }
    });

    const path = generateListPath(level, currentListByNumId.levels, start);
    if (!path.length) path.push(currentListByNumId.levels[level]);

    const pElement = document.createElement('p');
    pElement.innerHTML = item.innerHTML;
    pElement.setAttribute('data-num-id', id);
    pElement.setAttribute('data-list-level', JSON.stringify(path));
    pElement.setAttribute('data-level', level);
    pElement.setAttribute('data-lvl-text', lvlText);
    pElement.setAttribute('data-num-fmt', numFmt);

    if (item.hasAttribute('data-indent')) {
      pElement.setAttribute('data-indent', item.getAttribute('data-indent'));
    }
    if (item.hasAttribute('data-spacing')) {
      pElement.setAttribute('data-spacing', item.getAttribute('data-spacing'));
    }
    if (item.hasAttribute('data-text-styles')) {
      const textStyles = JSON.parse(item.getAttribute('data-text-styles'));
      Object.keys(textStyles).forEach((key) => {
        const styleValue = textStyles[key];
        if (styleValue) {
          pElement.style.setProperty(key, styleValue);
          for (const child of pElement.children) {
            if (child.style) {
              child.style.setProperty(key, styleValue);
            }
          }
        }
      });
    }
    const parentNode = item.parentNode;
    parentNode.appendChild(pElement);

    let listForLevel;
    const newList = numFmt === 'bullet' ? document.createElement('ul') : document.createElement('ol');
    newList.setAttribute('data-list-id', id);
    newList.level = level;

    parentNode.insertBefore(newList, item);
    listForLevel = newList;

    listForLevel.appendChild(pElement);
    item.remove();
  }
};

export const generateListPath = (level, levels, start) => {
  const iLvl = Number(level);
  const path = [];
  if (iLvl > 0) {
    for (let i = iLvl; i >= 0; i--) {
      if (!levels[i]) levels[i] = Number(start);
      path.unshift(levels[i]);
    }
  }
  return path;
};

function extractAndRemoveConditionalPrefix(item) {
  const nodes = Array.from(item.childNodes);
  let fontFamily = null;
  let fontSize = null;

  let start = -1,
    end = -1;
  nodes.forEach((node, index) => {
    if (node.nodeType === Node.COMMENT_NODE && node.nodeValue.includes('[if !supportLists]')) {
      start = index;
    }
    if (start !== -1 && node.nodeType === Node.COMMENT_NODE && node.nodeValue.includes('[endif]')) {
      end = index;
    }
  });

  if (start !== -1 && end !== -1) {
    for (let i = start + 1; i < end; i++) {
      const node = nodes[i];
      if (node.nodeType === Node.ELEMENT_NODE && node.style) {
        fontFamily = fontFamily || node.style.fontFamily;
        fontSize = fontSize || node.style.fontSize;
      }
    }

    // Remove all nodes in that range
    for (let i = end; i >= start; i--) {
      item.removeChild(item.childNodes[i]);
    }

    // Store on <p> as attributes
    if (fontFamily) item.setAttribute('data-font-family', fontFamily);
    if (fontSize) item.setAttribute('data-font-size', fontSize);
  }
}
