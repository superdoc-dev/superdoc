import { parseTagValueJSON } from './parse-tag-value-json';
import { parseMarks } from '@converter/v2/importer/markImporter';
import { generateDocxRandomId } from '@core/helpers/generateDocxRandomId';

/**
 * @param {Object} params
 * @returns {Object|null}
 */
export function handleAnnotationNode(params) {
  const { nodes } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return null;
  }

  const node = nodes[0];
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const sdtContent = node.elements.find((el) => el.name === 'w:sdtContent');

  const sdtId = sdtPr?.elements?.find((el) => el.name === 'w:id');
  const alias = sdtPr?.elements.find((el) => el.name === 'w:alias');
  const tag = sdtPr?.elements.find((el) => el.name === 'w:tag');
  const tagValue = tag?.attributes['w:val'];
  const shouldProcessAsJson = tagValue?.startsWith('{') && tagValue?.endsWith('}');

  let attrs = {};
  const aliasLabel = getSafeString(alias?.attributes?.['w:val']);

  if (shouldProcessAsJson) {
    const parsedAttrs = parseTagValueJSON(tagValue);
    attrs = {
      type: parsedAttrs.fieldTypeShort,
      fieldId: parsedAttrs.fieldId,
      displayLabel: parsedAttrs.displayLabel,
      defaultDisplayLabel: parsedAttrs.defaultDisplayLabel,
      fieldType: parsedAttrs.fieldType,
      fieldColor: parsedAttrs.fieldColor,
      multipleImage: parsedAttrs.fieldMultipleImage,
      fontFamily: parsedAttrs.fieldFontFamily,
      fontSize: parsedAttrs.fieldFontSize,
      textColor: parsedAttrs.fieldTextColor,
      textHighlight: parsedAttrs.fieldTextHighlight,
      hash: parsedAttrs.hash,
    };
  } else {
    // IMPORTANT: FOR BACKWARD COMPATIBILITY.
    attrs = getAttrsFromElements({ sdtPr, tag, alias, sdtId });
  }

  const initialDisplayLabel = getSafeString(attrs.displayLabel);
  const extractedContent = getTextFromSdtContent(sdtContent);
  if (!attrs.defaultDisplayLabel) {
    if (initialDisplayLabel) {
      attrs.defaultDisplayLabel = initialDisplayLabel;
    } else if (aliasLabel) {
      attrs.defaultDisplayLabel = aliasLabel;
    }
  }

  const placeholderLabel = getPlaceholderLabel(attrs, aliasLabel);
  const placeholderText = ensurePlaceholderFormat(placeholderLabel);
  const isAnnotationsEnabled = Boolean(params.editor?.options?.annotations);
  const contentIsDistinct = shouldUseSdtContent(extractedContent, placeholderText);
  const shouldUseContent =
    !isAnnotationsEnabled && contentIsDistinct && (hasMoustache(extractedContent) || !placeholderText);

  if (contentIsDistinct) {
    attrs.displayLabel = extractedContent;
  } else if (!attrs.displayLabel && placeholderLabel) {
    attrs.displayLabel = placeholderLabel;
  }

  const { attrs: marksAsAttrs, marks } = parseAnnotationMarks(sdtContent);
  const allAttrs = { ...attrs, ...marksAsAttrs, ...(sdtPr && { sdtPr }) }; // Include sdtPr for round-trip passthrough only if it exists
  if (!allAttrs.hash) allAttrs.hash = generateDocxRandomId(4);

  // Some w:sdt nodes have attrs.fieldId (coming from GoogleDocs) so we need a secondary check
  // Expecting `type` if its a field annotation
  if (!attrs.fieldId || !attrs.type) {
    return null;
  }

  const textContent = shouldUseContent ? extractedContent : placeholderText;

  let result = {
    type: 'text',
    text: textContent,
    attrs: allAttrs,
    marks,
  };

  if (isAnnotationsEnabled) {
    result = {
      type: 'fieldAnnotation',
      attrs: allAttrs,
    };
  }

  return result;
}

/**
 * Marks for annotations need to be converted to attributes
 * @param {Object} content The sdtContent node
 * @returns {Object} The attributes object
 */
export const parseAnnotationMarks = (content = {}) => {
  let mainContent = content;

  /// if (type === 'html') {
  /// Note: html annotation has a different structure and can include
  /// several paragraphs with different styles. We could find the first paragraph
  /// and take the marks from there, but we take fontFamily and fontSize from the annotation attributes.

  /// Example:
  /// const firstPar = content.elements?.find((el) => el.name === 'w:p');
  /// if (firstPar) mainContent = firstPar;
  // }

  const run = mainContent.elements?.find((el) => el.name === 'w:r');
  const rPr = run?.elements?.find((el) => el.name === 'w:rPr');
  if (!rPr) return {};

  const unknownMarks = [];
  const marks = parseMarks(rPr, unknownMarks) || [];

  const marksWithFlatFontStyles = [];
  marks.forEach((mark) => {
    const { type } = mark;
    if (type === 'textStyle') {
      const { attrs } = mark;
      Object.keys(attrs).forEach((key) => {
        marksWithFlatFontStyles.push({ type: key, attrs: attrs[key] });
      });
    } else {
      marksWithFlatFontStyles.push(mark);
    }
  });

  const attrs = {};
  marksWithFlatFontStyles?.forEach((mark) => {
    const { type } = mark;
    attrs[type] = mark.attrs || true;
  });
  return {
    attrs,
    marks,
  };
};

export function getAttrsFromElements({ sdtPr, tag, alias, sdtId }) {
  const type = sdtPr?.elements.find((el) => el.name === 'w:fieldTypeShort')?.attributes['w:val'];
  const fieldType = sdtPr?.elements.find((el) => el.name === 'w:fieldType')?.attributes['w:val'];
  const fieldColor = sdtPr?.elements.find((el) => el.name === 'w:fieldColor')?.attributes['w:val'];
  const isMultipleImage = sdtPr?.elements.find((el) => el.name === 'w:fieldMultipleImage')?.attributes['w:val'];
  const fontFamily = sdtPr?.elements.find((el) => el.name === 'w:fieldFontFamily')?.attributes['w:val'];
  const fontSize = sdtPr?.elements.find((el) => el.name === 'w:fieldFontSize')?.attributes['w:val'];
  const textColor = sdtPr?.elements.find((el) => el.name === 'w:fieldTextColor')?.attributes['w:val'];
  const textHighlight = sdtPr?.elements.find((el) => el.name === 'w:fieldTextHighlight')?.attributes['w:val'];
  const attrs = {
    type,
    fieldId: tag?.attributes['w:val'],
    displayLabel: alias?.attributes['w:val'],
    fieldType,
    fieldColor,
    multipleImage: isMultipleImage === 'true',
    fontFamily: fontFamily !== 'null' ? fontFamily : null,
    fontSize: fontSize !== 'null' ? fontSize : null,
    textColor: textColor !== 'null' ? textColor : null,
    textHighlight: textHighlight !== 'null' ? textHighlight : null,
    sdtId: sdtId?.attributes['w:val'],
  };
  return attrs;
}

function getTextFromSdtContent(sdtContent) {
  if (!sdtContent?.elements?.length) return '';

  const chunks = [];
  collectTextChunks(sdtContent.elements, chunks);

  // Remove trailing newline if it was added due to paragraph handling
  if (chunks.length && chunks[chunks.length - 1] === '\n') {
    chunks.pop();
  }

  const text = chunks.join('');
  return text.replace(/\u00a0/g, ' ');
}

function getPlaceholderLabel(attrs, aliasValue) {
  const displayLabel = trimSafeString(attrs.displayLabel);
  if (displayLabel) return displayLabel;

  const defaultLabel = trimSafeString(attrs.defaultDisplayLabel);
  if (defaultLabel) return defaultLabel;

  return trimSafeString(aliasValue);
}

function shouldUseSdtContent(extractedContent, placeholderText) {
  const normalizedContent = normalizePlaceholderText(extractedContent);
  if (!normalizedContent) return false;

  const normalizedPlaceholder = normalizePlaceholderText(placeholderText);
  return normalizedContent !== normalizedPlaceholder;
}

function ensurePlaceholderFormat(label) {
  const trimmed = trimSafeString(label);
  if (!trimmed) return '';
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed;
  }
  return `{{${trimmed}}}`;
}

function normalizePlaceholderText(value = '') {
  const trimmed = trimSafeString(value);
  if (!trimmed) return '';
  return stripPlaceholderBraces(trimmed).toLowerCase();
}

function stripPlaceholderBraces(value = '') {
  if (value.startsWith('{{') && value.endsWith('}}')) {
    return trimSafeString(value.slice(2, -2));
  }
  return value;
}

function hasMoustache(value = '') {
  return /\{\{\s*.+?\s*\}\}/.test(getSafeString(value));
}

function collectTextChunks(elements, chunks) {
  if (!elements) return;

  elements.forEach((element) => {
    if (!element) return;

    if (element.type === 'text') {
      chunks.push(element.text || '');
      return;
    }

    if (element.name === 'w:tab') {
      chunks.push('\t');
      return;
    }

    if (element.name === 'w:br') {
      chunks.push('\n');
      return;
    }

    const isParagraph = element.name === 'w:p';
    const initialLength = chunks.length;
    if (element.elements?.length) {
      collectTextChunks(element.elements, chunks);
    }

    if (isParagraph && chunks.length > initialLength) {
      chunks.push('\n');
    }
  });
}

function getSafeString(value) {
  if (typeof value !== 'string') return '';
  return value;
}

function trimSafeString(value) {
  return getSafeString(value)
    .replace(/\u00a0/g, ' ')
    .trim();
}
