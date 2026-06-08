import { parseInlineStyles } from './parse-inline-styles';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter';
import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
} from '@converter/v3/handlers/wp/helpers/textbox-content-helpers.js';

/**
 * @param {Object} options
 * @returns {Object}
 */
export function handleShapeTextboxImport({ params, pict }) {
  const shape = pict.elements?.find((el) => el.name === 'v:shape');

  const schemaAttrs = {};
  const schemaTextboxAttrs = {};
  const shapeAttrs = shape.attributes || {};

  schemaAttrs.attributes = shapeAttrs;

  if (shapeAttrs.fillcolor) {
    schemaAttrs.fillcolor = shapeAttrs.fillcolor;
  }

  const parsedStyle = parseInlineStyles(shapeAttrs.style);
  const shapeStyle = buildStyles(parsedStyle);
  const positionData = extractPositionData(parsedStyle);

  if (shapeStyle) {
    schemaAttrs.style = shapeStyle;
  }

  if (positionData.anchorData) {
    schemaAttrs.anchorData = positionData.anchorData;
  }

  if (positionData.marginOffset) {
    schemaAttrs.marginOffset = positionData.marginOffset;
  }

  const textbox = shape.elements?.find((el) => el.name === 'v:textbox');
  const wrap = shape.elements?.find((el) => el.name === 'w10:wrap');

  if (wrap?.attributes) {
    schemaAttrs.wrapAttributes = wrap.attributes;
  }

  if (textbox?.attributes) {
    schemaTextboxAttrs.attributes = textbox.attributes;
  }

  const textboxContent = textbox?.elements?.find((el) => el.name === 'w:txbxContent');
  const processedContent = preProcessTextBoxContent(textboxContent, params);
  const textboxParagraphs = collectTextBoxParagraphs(processedContent?.elements || []);

  const content = textboxParagraphs.map((elem) =>
    handleParagraphNode({
      nodes: [elem],
      docx: params.docx,
      nodeListHandler: defaultNodeListHandler(),
    }),
  );
  const contentNodes = content.reduce((acc, current) => [...acc, ...current.nodes], []);

  const shapeTextbox = {
    type: 'shapeTextbox',
    attrs: schemaTextboxAttrs,
    content: contentNodes,
  };

  const shapeContainer = {
    type: 'shapeContainer',
    attrs: schemaAttrs,
    content: [shapeTextbox],
  };

  return shapeContainer;
}

/**
 * @param {Object} styleObject
 * @returns {string}
 */
function buildStyles(styleObject) {
  const allowed = [
    'width',
    'height',

    // these styles should probably work relative to the page,
    // since in the doc it is positioned absolutely.
    // 'margin-left',
    // 'margin-right',

    // causes pagination issues.
    // 'margin-top',
    // 'margin-bottom',

    // styleObject - also contains other word styles (mso-).
  ];

  let style = '';
  for (const [prop, value] of Object.entries(styleObject)) {
    if (allowed.includes(prop)) {
      style += `${prop}: ${value};`;
    }
  }

  return style;
}

/**
 * @param {Record<string, string>} styleObject
 * @returns {{ anchorData?: Record<string, string>, marginOffset?: { horizontal?: number, top?: number } }}
 */
function extractPositionData(styleObject) {
  const anchorData = {};
  const marginOffset = {};

  if (styleObject['mso-position-horizontal']) {
    anchorData.alignH = styleObject['mso-position-horizontal'];
  }

  if (styleObject['mso-position-horizontal-relative']) {
    anchorData.hRelativeFrom = styleObject['mso-position-horizontal-relative'];
  }

  if (styleObject['mso-position-vertical']) {
    anchorData.alignV = styleObject['mso-position-vertical'];
  }

  if (styleObject['mso-position-vertical-relative']) {
    anchorData.vRelativeFrom = styleObject['mso-position-vertical-relative'];
  }

  if (styleObject['margin-left'] != null) {
    marginOffset.horizontal = convertToPixels(styleObject['margin-left']);
  }

  if (styleObject['margin-top'] != null) {
    marginOffset.top = convertToPixels(styleObject['margin-top']);
  }

  return {
    ...(Object.keys(anchorData).length > 0 ? { anchorData } : {}),
    ...(Object.keys(marginOffset).length > 0 ? { marginOffset } : {}),
  };
}

/**
 * @param {string} value
 * @returns {number}
 */
function convertToPixels(value) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 0;

  if (value.endsWith('pt')) return (num * 96) / 72;
  if (value.endsWith('in')) return num * 96;
  if (value.endsWith('px')) return num;

  return num;
}
