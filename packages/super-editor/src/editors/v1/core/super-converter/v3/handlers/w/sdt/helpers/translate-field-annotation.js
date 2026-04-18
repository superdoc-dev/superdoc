import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { translator as wDrawingNodeTranslator } from '@converter/v3/handlers/w/drawing';
import { ListHelpers } from '@helpers/list-numbering-helpers';
import { generateDocxRandomId, generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';
import { sanitizeHtml } from '@core/InputRule';
import { getTextNodeForExport } from '@converter/v3/handlers/w/t/helpers/translate-text-node.js';
import he from 'he';
import { translator as wHyperlinkTranslator } from '@converter/v3/handlers/w/hyperlink/index.js';

/**
 * Translate a field annotation node
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateFieldAnnotation(params) {
  const { node, isFinalDoc, fieldsHighlightColor } = params;
  const { attrs = {} } = node;
  const annotationHandler = getTranslationByAnnotationType(attrs.type, attrs.fieldType);
  if (!annotationHandler) return {};

  let processedNode;
  let sdtContentElements;
  let id = attrs.sdtId;

  if ((attrs.type === 'image' || attrs.type === 'signature') && !attrs.hash) {
    attrs.hash = generateDocxRandomId(4);
  }

  if (!attrs.sdtId) {
    id = generateRandomSigned32BitIntStrId();
  }

  if (isFinalDoc) {
    return annotationHandler(params);
  } else {
    processedNode = annotationHandler(params);
    sdtContentElements = [processedNode];

    if (attrs.type === 'html') {
      const runElements = processedNode.elements[0].elements.filter((el) => el.name === 'w:r');
      sdtContentElements = [...runElements];
    }
  }

  sdtContentElements = [...sdtContentElements];

  // Set field background color only if param is provided, default to transparent
  const fieldBackgroundTag = getFieldHighlightJson(fieldsHighlightColor);
  if (fieldBackgroundTag) {
    sdtContentElements.unshift(fieldBackgroundTag);
  }

  // Contains only the main attributes.
  const annotationAttrs = {
    displayLabel: attrs.displayLabel,
    defaultDisplayLabel: attrs.defaultDisplayLabel,
    fieldId: attrs.fieldId,
    fieldType: attrs.fieldType,
    fieldTypeShort: attrs.type,
    fieldColor: attrs.fieldColor,
    fieldMultipleImage: attrs.multipleImage,
    fieldFontFamily: attrs.fontFamily,
    fieldFontSize: attrs.fontSize,
    fieldTextColor: attrs.textColor,
    fieldTextHighlight: attrs.textHighlight,
    hash: attrs.hash,
  };
  const annotationAttrsJson = JSON.stringify(annotationAttrs);

  // Build sdtPr elements with passthrough support
  // Sanitize displayLabel to prevent string "undefined" from being written to DOCX
  const sanitizedDisplayLabel =
    attrs.displayLabel === 'undefined' || attrs.displayLabel === undefined ? '' : attrs.displayLabel;

  const sdtPrElements = [
    { name: 'w:alias', attributes: { 'w:val': sanitizedDisplayLabel } },
    { name: 'w:tag', attributes: { 'w:val': annotationAttrsJson } },
    { name: 'w:id', attributes: { 'w:val': id } },
  ];

  // Passthrough: preserve any sdtPr elements not explicitly managed
  if (attrs.sdtPr?.elements && Array.isArray(attrs.sdtPr.elements)) {
    const elementsToExclude = ['w:alias', 'w:tag', 'w:id'];
    const passthroughElements = attrs.sdtPr.elements.filter(
      (el) => el && el.name && !elementsToExclude.includes(el.name),
    );
    sdtPrElements.push(...passthroughElements);
  }

  const result = {
    name: 'w:sdt',
    elements: [
      {
        name: 'w:sdtPr',
        elements: sdtPrElements,
      },
      {
        name: 'w:sdtContent',
        elements: sdtContentElements,
      },
    ],
  };
  return result;
}

/**
 * Returns node handler based on annotation type
 *
 * @param {String} annotationType
 * @returns {Function} handler for provided annotation type
 */
export function getTranslationByAnnotationType(annotationType, annotationFieldType) {
  // invalid annotation
  if (annotationType === 'text' && annotationFieldType === 'FILEUPLOADER') {
    return null;
  }

  const imageEmuSize = {
    w: 4286250,
    h: 4286250,
  };

  const signatureEmuSize = {
    w: 990000,
    h: 495000,
  };

  const dictionary = {
    text: prepareTextAnnotation,
    image: (params) => prepareImageAnnotation(params, imageEmuSize),
    signature: (params) => prepareImageAnnotation(params, signatureEmuSize),
    checkbox: prepareCheckboxAnnotation,
    html: prepareHtmlAnnotation,
    link: prepareUrlAnnotation,
  };

  return dictionary[annotationType];
}

/**
 * Translates text annotations
 * @param {Object} params
 * @returns {Object}
 */
export function prepareTextAnnotation(params) {
  const {
    node: { attrs = {}, marks = [] },
  } = params;

  const marksFromAttrs = translateFieldAttrsToMarks(attrs);
  return getTextNodeForExport(attrs.displayLabel, [...marks, ...marksFromAttrs], params);
}

/**
 * Translates image annotations
 * @param {Object} params
 * @param {Object} imageSize Object contains width and height for image in EMU
 * @returns {Object} The translated image node
 */
export function prepareImageAnnotation(params, imageSize) {
  return wDrawingNodeTranslator.decode({
    ...params,
    imageSize,
  });
}

/**
 * Translates checkbox annotations
 * @param {Object} params
 * @returns {Object} The translated checkbox node
 */
export function prepareCheckboxAnnotation(params) {
  const {
    node: { attrs = {}, marks = [] },
  } = params;
  const content = he.decode(attrs.displayLabel);
  return getTextNodeForExport(content, marks, params);
}

/**
 * Translates html annotations
 * @param {Object} params
 * @returns {Object} The translated html node
 */
export function prepareHtmlAnnotation(params) {
  const {
    node: { attrs = {}, marks = [] },
    editorSchema,
    editor,
  } = params;

  let html = attrs.rawHtml || attrs.displayLabel;
  const paragraphHtmlContainer = sanitizeHtml(
    html,
    undefined,
    editor?.options?.document ?? editor?.options?.mockDocument,
  );
  const marksFromAttrs = translateFieldAttrsToMarks(attrs);
  const allMarks = [...marks, ...marksFromAttrs];

  let state = EditorState.create({
    doc: PMDOMParser.fromSchema(editorSchema).parse(paragraphHtmlContainer),
  });

  if (allMarks.length) {
    state = applyMarksToHtmlAnnotation(state, allMarks);
  }

  const htmlAnnotationNode = state.doc.toJSON();
  const listTypes = ['bulletList', 'orderedList'];
  const seenLists = new Map();
  state.doc.descendants((node) => {
    if (listTypes.includes(node.type.name)) {
      const listItem = node.firstChild;
      const { attrs } = listItem;
      const { level, numId } = attrs;
      if (!seenLists.has(numId)) {
        const newNumId = ListHelpers.changeNumIdSameAbstract(numId, level, node.type.name, editor);
        listItem.attrs.numId = newNumId;
        seenLists.set(numId, newNumId);
      } else {
        const newNumId = seenLists.get(numId);
        listItem.attrs.numId = newNumId;
      }
    }
  });

  const elements = translateChildNodes({
    ...params,
    node: htmlAnnotationNode,
  });

  return {
    name: 'htmlAnnotation',
    elements,
  };
}

/**
 * Translates URL annotations
 * @param {Object} params
 * @returns {Object} The translated URL node
 */
export function prepareUrlAnnotation(params) {
  const {
    node: { attrs = {}, marks = [] },
  } = params;

  if (!attrs.linkUrl) return prepareTextAnnotation(params);

  const linkTextNode = {
    type: 'text',
    text: attrs.linkUrl,
    marks: [
      ...marks,
      {
        type: 'link',
        attrs: {
          href: attrs.linkUrl,
          history: true,
          text: attrs.linkUrl,
        },
      },
      {
        type: 'textStyle',
        attrs: {
          color: '#467886',
        },
      },
    ],
  };

  return wHyperlinkTranslator.decode({
    ...params,
    node: linkTextNode,
  });
}

export function translateFieldAttrsToMarks(attrs = {}) {
  const { fontFamily, fontSize, bold, underline, italic, textColor, textHighlight } = attrs;

  const marks = [];
  if (fontFamily) marks.push({ type: 'fontFamily', attrs: { fontFamily } });
  if (fontSize) marks.push({ type: 'fontSize', attrs: { fontSize } });
  if (bold) marks.push({ type: 'bold', attrs: {} });
  if (underline) marks.push({ type: 'underline', attrs: {} });
  if (italic) marks.push({ type: 'italic', attrs: {} });
  if (textColor) marks.push({ type: 'color', attrs: { color: textColor } });
  if (textHighlight) marks.push({ type: 'highlight', attrs: { color: textHighlight } });
  return marks;
}

export function applyMarksToHtmlAnnotation(state, marks) {
  const { tr, doc, schema } = state;
  const allowedMarks = ['fontFamily', 'fontSize', 'highlight'];

  if (!marks.some((m) => allowedMarks.includes(m.type))) {
    return state;
  }

  const fontFamily = marks.find((m) => m.type === 'fontFamily');
  const fontSize = marks.find((m) => m.type === 'fontSize');
  const highlight = marks.find((m) => m.type === 'highlight');

  const textStyleType = schema.marks.textStyle;
  const highlightType = schema.marks.highlight;

  doc.descendants((node, pos) => {
    if (!node.isText) return;

    const foundTextStyle = node.marks.find((m) => m.type.name === 'textStyle');
    const foundHighlight = node.marks.find((m) => m.type.name === 'highlight');

    // text style (fontFamily, fontSize)
    if (!foundTextStyle) {
      tr.addMark(
        pos,
        pos + node.nodeSize,
        textStyleType.create({
          ...fontFamily?.attrs,
          ...fontSize?.attrs,
        }),
      );
    } else if (!foundTextStyle?.attrs.fontFamily && fontFamily) {
      tr.addMark(
        pos,
        pos + node.nodeSize,
        textStyleType.create({
          ...foundTextStyle?.attrs,
          ...fontFamily.attrs,
        }),
      );
    } else if (!foundTextStyle?.attrs.fontSize && fontSize) {
      tr.addMark(
        pos,
        pos + node.nodeSize,
        textStyleType.create({
          ...foundTextStyle?.attrs,
          ...fontSize.attrs,
        }),
      );
    }

    // highlight
    if (!foundHighlight) {
      tr.addMark(
        pos,
        pos + node.nodeSize,
        highlightType.create({
          ...highlight?.attrs,
        }),
      );
    }
  });

  return state.apply(tr);
}

/**
 * Get the JSON representation of the field highlight
 * @param {string} fieldsHighlightColor - The highlight color for the field. Must be valid HEX.
 * @returns {Object} The JSON representation of the field highlight
 */
export function getFieldHighlightJson(fieldsHighlightColor) {
  if (!fieldsHighlightColor) return null;

  // Normalize input
  let parsedColor = fieldsHighlightColor.trim();

  // Regex: optional '#' + 3/4/6/8 hex digits
  const hexRegex = /^#?([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;

  if (!hexRegex.test(parsedColor)) {
    console.warn(`Invalid HEX color provided to fieldsHighlightColor export param: ${fieldsHighlightColor}`);
    return null;
  }

  // Remove '#' if present
  if (parsedColor.startsWith('#')) {
    parsedColor = parsedColor.slice(1);
  }

  return {
    name: 'w:rPr',
    elements: [
      {
        name: 'w:shd',
        attributes: {
          'w:fill': `#${parsedColor}`,
          'w:color': 'auto',
          'w:val': 'clear',
        },
      },
    ],
  };
}
