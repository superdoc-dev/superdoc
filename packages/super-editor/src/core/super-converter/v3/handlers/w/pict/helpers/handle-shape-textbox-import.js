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

  if (shapeStyle) {
    schemaAttrs.style = shapeStyle;
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
