import { SCEncoderConfig } from '@translator';
import { parseInlineStyles } from './parse-inline-styles';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter';
import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
} from '@converter/v3/handlers/wp/helpers/textbox-content-helpers.js';
import { OpenXmlNode } from '@converter/v2/types';
import type { ShapeContainerAttrs, ShapeTextboxAttrs } from '@extensions/types/node-attributes';
import type { NodeHandlerResult, PmNodeJson } from '@converter/v2/importer/types';

export function handleShapeTextboxImport({ params, pict }: { params: SCEncoderConfig; pict: OpenXmlNode }) {
  const shape = pict.elements?.find((el) => el.name === 'v:shape');
  if (!shape) {
    console.error('Missing v:shape in v:pict');
    return null;
  }

  const schemaAttrs: ShapeContainerAttrs = {};
  const schemaTextboxAttrs: ShapeTextboxAttrs = {};
  const shapeAttrs: Record<string, string> = shape.attributes || {};

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

  const content: Array<NodeHandlerResult> = textboxParagraphs.map((elem) =>
    handleParagraphNode({
      ...params,
      nodes: [elem],
      docx: params.docx,
    }),
  );
  const contentNodes = content.reduce<Array<PmNodeJson>>((acc, current) => [...acc, ...current.nodes], []);

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
