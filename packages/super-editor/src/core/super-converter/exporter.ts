import { SuperConverter } from './SuperConverter.js';
import { inchesToTwips, linesToTwips, rgbToHex } from './helpers.js';
import { DEFAULT_DOCX_DEFS } from './exporter-docx-defs.js';
import { translateChildNodes } from './v2/exporter/helpers/index.js';
import { translator as wBrNodeTranslator } from './v3/handlers/w/br/br-translator.js';
import { translator as wHighlightTranslator } from './v3/handlers/w/highlight/highlight-translator.js';
import { translator as wTabNodeTranslator } from './v3/handlers/w/tab/tab-translator.js';
import { translator as wPNodeTranslator } from './v3/handlers/w/p/p-translator.js';
import { translator as wRNodeTranslator } from './v3/handlers/w/r/r-translator.js';
import { translator as wTcNodeTranslator } from './v3/handlers/w/tc/tc-translator';
import { translator as wTrNodeTranslator } from './v3/handlers/w/tr/tr-translator.js';
import { translator as wSdtNodeTranslator } from './v3/handlers/w/sdt/sdt-translator';
import { translator as wTblNodeTranslator } from './v3/handlers/w/tbl/tbl-translator.js';
import { translator as wUnderlineTranslator } from './v3/handlers/w/u/u-translator.js';
import { translator as wDrawingNodeTranslator } from './v3/handlers/w/drawing/drawing-translator.js';
import { translator as wBookmarkStartTranslator } from './v3/handlers/w/bookmark-start/index.js';
import { translator as wBookmarkEndTranslator } from './v3/handlers/w/bookmark-end/index.js';
import {
  commentRangeStartTranslator as wCommentRangeStartTranslator,
  commentRangeEndTranslator as wCommentRangeEndTranslator,
} from './v3/handlers/w/commentRange/index.js';
import { translator as wPermStartTranslator } from './v3/handlers/w/perm-start/index.js';
import { translator as wPermEndTranslator } from './v3/handlers/w/perm-end/index.js';
import { translator as sdPageReferenceTranslator } from '@converter/v3/handlers/sd/pageReference';
import { translator as sdTableOfContentsTranslator } from '@converter/v3/handlers/sd/tableOfContents';
import { translator as sdIndexTranslator } from '@converter/v3/handlers/sd/index';
import { translator as sdIndexEntryTranslator } from '@converter/v3/handlers/sd/indexEntry';
import { translator as sdAutoPageNumberTranslator } from '@converter/v3/handlers/sd/autoPageNumber';
import { translator as sdTotalPageNumberTranslator } from '@converter/v3/handlers/sd/totalPageNumber';
import { translator as wPictNodeTranslator } from './v3/handlers/w/pict/pict-translator';
import { translateVectorShape, translateShapeGroup } from '@converter/v3/handlers/wp/helpers/decode-image-node-helpers';
import { translator as wTextTranslator } from '@converter/v3/handlers/w/t';
import { translator as wFootnoteReferenceTranslator } from './v3/handlers/w/footnoteReference/footnoteReference-translator.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import type { NodeTranslator, SCDecoderConfig } from '@translator';
import type { OpenXmlNode } from '@converter/v2/types';
import type { Editor } from '@core/Editor';

const DEFAULT_SECTION_PROPS_TWIPS = Object.freeze({
  pageSize: Object.freeze({ width: '12240', height: '15840' }),
  pageMargins: Object.freeze({
    top: '1440',
    right: '1440',
    bottom: '1440',
    left: '1440',
    header: '720',
    footer: '720',
    gutter: '0',
  }),
});

export const ensureSectionLayoutDefaults = (sectPr, converter): OpenXmlNode => {
  if (!sectPr) {
    return {
      type: 'element',
      name: 'w:sectPr',
      elements: [],
    };
  }

  if (!sectPr.elements) sectPr.elements = [];

  const ensureChild = (name) => {
    let child = sectPr.elements.find((n) => n.name === name);
    if (!child) {
      child = {
        type: 'element',
        name,
        elements: [],
        attributes: {},
      };
      sectPr.elements.push(child);
    } else {
      if (!child.elements) child.elements = [];
      if (!child.attributes) child.attributes = {};
    }
    return child;
  };

  const pageSize = converter?.pageStyles?.pageSize;
  const pgSz = ensureChild('w:pgSz');
  if (pageSize?.width != null) pgSz.attributes['w:w'] = String(inchesToTwips(pageSize.width));
  if (pageSize?.height != null) pgSz.attributes['w:h'] = String(inchesToTwips(pageSize.height));
  if (pgSz.attributes['w:w'] == null) pgSz.attributes['w:w'] = DEFAULT_SECTION_PROPS_TWIPS.pageSize.width;
  if (pgSz.attributes['w:h'] == null) pgSz.attributes['w:h'] = DEFAULT_SECTION_PROPS_TWIPS.pageSize.height;

  const pageMargins = converter?.pageStyles?.pageMargins;
  const pgMar = ensureChild('w:pgMar');
  if (pageMargins) {
    Object.entries(pageMargins).forEach(([key, value]) => {
      const converted = inchesToTwips(value);
      if (converted != null) pgMar.attributes[`w:${key}`] = String(converted);
    });
  }
  Object.entries(DEFAULT_SECTION_PROPS_TWIPS.pageMargins).forEach(([key, value]) => {
    const attrKey = `w:${key}`;
    if (pgMar.attributes[attrKey] == null) pgMar.attributes[attrKey] = value;
  });

  return sectPr;
};

export const isLineBreakOnlyRun = (node) => {
  if (!node) return false;
  if (node.type === 'lineBreak' || node.type === 'hardBreak') return true;
  if (node.type !== 'run') return false;
  const runContent = Array.isArray(node.content) ? node.content : [];
  if (!runContent.length) return false;
  return runContent.every((child) => child?.type === 'lineBreak' || child?.type === 'hardBreak');
};

export type ExportParams = SCDecoderConfig & {
  bodyNode?: OpenXmlNode;
  converter?: SuperConverter;
  editor: Editor;
  isHeaderFooter?: boolean;
};

/** Key value pairs representing the node attributes from prose mirror */
type SchemaAttributes = Record<string, any>;

/** Key value pairs representing the node attributes to export to XML format */
type XmlAttributes = Record<string, any>;

type MarkType = {
  /** The mark type */
  type: string;
  /** Any attributes for this mark */
  attrs: Record<string, any>;
};

type Router = {
  [k: string]:
    | NodeTranslator
    | NodeTranslator[]
    | ((params: ExportParams) => OpenXmlNode | null | [OpenXmlNode, ExportParams]);
};

export function exportSchemaToJson(params: ExportParams & { node: { type: 'doc' } }): [OpenXmlNode, ExportParams];
export function exportSchemaToJson(params: ExportParams & { node: { type: 'body' } }): OpenXmlNode;
export function exportSchemaToJson(
  params: ExportParams & { node: { type: Exclude<ExportParams['node']['type'], 'doc' | 'body'> } },
): OpenXmlNode | null;

/**
 * Main export function. It expects the prose mirror data as JSON (ie: a doc node)
 *
 * @param params - The parameters object, containing a node and possibly a body node
 * @returns - The complete document node in XML-ready format
 */
export function exportSchemaToJson(
  params: ExportParams,
): OpenXmlNode | OpenXmlNode[] | null | [OpenXmlNode, ExportParams] {
  const { type } = params.node || {};

  // Node handlers for each node type that we can export
  const router: Router = {
    doc: translateDocumentNode,
    body: translateBodyNode,
    heading: translateHeadingNode,
    paragraph: wPNodeTranslator,
    run: wRNodeTranslator,
    text: wTextTranslator,
    lineBreak: wBrNodeTranslator,
    table: wTblNodeTranslator,
    tableRow: wTrNodeTranslator,
    tableCell: wTcNodeTranslator,
    tableHeader: wTcNodeTranslator,
    bookmarkStart: wBookmarkStartTranslator,
    bookmarkEnd: wBookmarkEndTranslator,
    fieldAnnotation: wSdtNodeTranslator,
    tab: wTabNodeTranslator,
    image: [wDrawingNodeTranslator, wPictNodeTranslator],
    hardBreak: wBrNodeTranslator,
    commentRangeStart: wCommentRangeStartTranslator,
    commentRangeEnd: wCommentRangeEndTranslator,
    permStart: wPermStartTranslator,
    permEnd: wPermEndTranslator,
    commentReference: [],
    footnoteReference: wFootnoteReferenceTranslator,
    shapeContainer: wPictNodeTranslator,
    shapeTextbox: wPictNodeTranslator,
    contentBlock: wPictNodeTranslator,
    vectorShape: translateVectorShape,
    shapeGroup: translateShapeGroup,
    structuredContent: wSdtNodeTranslator,
    structuredContentBlock: wSdtNodeTranslator,
    documentPartObject: wSdtNodeTranslator,
    documentSection: wSdtNodeTranslator,
    'page-number': sdAutoPageNumberTranslator,
    'total-page-number': sdTotalPageNumberTranslator,
    pageReference: sdPageReferenceTranslator,
    tableOfContents: sdTableOfContentsTranslator,
    index: sdIndexTranslator,
    indexEntry: sdIndexEntryTranslator,
    passthroughBlock: translatePassthroughNode,
    passthroughInline: translatePassthroughNode,
  };

  const entry = router[type];

  if (!entry) {
    console.error('No translation function found for node type:', type);
    return null;
  }

  const handlers = Array.isArray(entry) ? entry : [entry];
  for (const handler of handlers) {
    let result;
    if (handler && 'decode' in handler && typeof handler.decode === 'function') {
      result = handler.decode(params);
    } else if (typeof handler === 'function') {
      result = handler(params);
    }

    if (result) {
      return result;
    }
  }

  return null;
}

export function translatePassthroughNode(params: SCDecoderConfig) {
  const original = params?.node?.attrs?.originalXml;
  if (!original) return null;
  return carbonCopy(original);
}

/**
 * There is no body node in the prose mirror schema, so it is stored separately
 * and needs to be restored here.
 *
 * @returns - JSON of the XML-ready body node
 */
function translateBodyNode(params: ExportParams): OpenXmlNode {
  let sectPr = params.bodyNode?.elements?.find((n) => n.name === 'w:sectPr');
  if (!sectPr) {
    sectPr = {
      type: 'element',
      name: 'w:sectPr',
      elements: [],
    };
  } else if (!sectPr.elements) {
    sectPr = { ...sectPr, elements: [] };
  }

  sectPr = ensureSectionLayoutDefaults(sectPr, params.converter);

  if (params.converter) {
    const canExportHeaderRef = params.converter.importedBodyHasHeaderRef || params.converter.headerFooterModified;
    const canExportFooterRef = params.converter.importedBodyHasFooterRef || params.converter.headerFooterModified;
    const hasHeader = sectPr.elements?.some((n) => n.name === 'w:headerReference');
    const hasDefaultHeader = params.converter.headerIds?.default;
    if (!hasHeader && hasDefaultHeader && !params.editor.options.isHeaderOrFooter && canExportHeaderRef) {
      const defaultHeader = generateDefaultHeaderFooter('header', params.converter.headerIds?.default);
      sectPr.elements.push(defaultHeader);
    }

    const hasFooter = sectPr.elements?.some((n) => n.name === 'w:footerReference');
    const hasDefaultFooter = params.converter.footerIds?.default;
    if (!hasFooter && hasDefaultFooter && !params.editor.options.isHeaderOrFooter && canExportFooterRef) {
      const defaultFooter = generateDefaultHeaderFooter('footer', params.converter.footerIds?.default);
      sectPr.elements.push(defaultFooter);
    }

    // Re-emit footnote properties if they were parsed during import
    const hasFootnotePr = sectPr.elements?.some((n) => n.name === 'w:footnotePr');
    const footnoteProperties = params.converter.footnoteProperties;
    if (!hasFootnotePr && footnoteProperties?.source === 'sectPr' && footnoteProperties.originalXml) {
      sectPr.elements.push(carbonCopy(footnoteProperties.originalXml));
    }
  }

  const elements = translateChildNodes(params);

  if (params.isHeaderFooter) {
    return {
      name: 'w:body',
      elements: [...elements],
    };
  }

  return {
    name: 'w:body',
    elements: [...elements, sectPr],
  };
}

const generateDefaultHeaderFooter = (type, id) => {
  return {
    type: 'element',
    name: `w:${type}Reference`,
    attributes: {
      'w:type': 'default',
      'r:id': id,
    },
  };
};

/**
 * Translate a heading node to a paragraph with Word heading style
 *
 * @param params - The parameters object containing the heading node
 * @returns - JSON of the XML-ready paragraph node with heading style
 */
function translateHeadingNode(params: ExportParams): OpenXmlNode | undefined {
  const { node } = params;
  const { level = 1, ...otherAttrs } = node.attrs;

  // Convert heading to paragraph with appropriate Word heading style
  const paragraphNode = {
    type: 'paragraph',
    content: node.content,
    attrs: {
      ...otherAttrs,
      styleId: `Heading${level}`, // Maps to Heading1, Heading2, etc. in Word
    },
  };

  // Use existing paragraph translator with the modified node
  return wPNodeTranslator.decode({ ...params, node: paragraphNode });
}

/**
 * Merge mc:Ignorable lists from two attribute objects, deduplicating entries.
 *
 * @param {string} defaultIgnorable - The default mc:Ignorable string
 * @param {string} originalIgnorable - The original mc:Ignorable string from import
 * @returns {string} Merged and deduplicated mc:Ignorable string
 */
function mergeMcIgnorable(defaultIgnorable: string = '', originalIgnorable: string = ''): string {
  const merged = [
    ...new Set([...defaultIgnorable.split(/\s+/).filter(Boolean), ...originalIgnorable.split(/\s+/).filter(Boolean)]),
  ];
  return merged.join(' ');
}

/**
 * Translate a document node
 *
 * @param  params The parameters object
 * @returns - JSON of the XML-ready document node
 */
function translateDocumentNode(params: ExportParams): [OpenXmlNode, ExportParams] {
  const bodyNode = {
    type: 'body',
    content: params.node.content,
  } as const;

  const translatedBodyNode: OpenXmlNode = exportSchemaToJson({ ...params, node: bodyNode });

  // Merge original document attributes with defaults to preserve custom namespaces
  const originalAttrs = params.converter?.documentAttributes || {};
  const attributes = {
    ...DEFAULT_DOCX_DEFS,
    ...originalAttrs,
  };

  // Merge mc:Ignorable lists - combine both default and original ignorable namespaces
  // @ts-expect-error FIXME: originalAttrs['mc:Ignorable'] could be a number
  const mergedIgnorable = mergeMcIgnorable(DEFAULT_DOCX_DEFS['mc:Ignorable'], originalAttrs['mc:Ignorable']);
  if (mergedIgnorable) {
    attributes['mc:Ignorable'] = mergedIgnorable;
  }

  const node = {
    name: 'w:document',
    elements: [translatedBodyNode],
    attributes,
  };

  return [node, params];
}

/**
 * Wrap a text node in a run
 *
 * @param {OpenXmlNode} node
 * @returns {OpenXmlNode} The wrapped run node
 */
export function wrapTextInRun(nodeOrNodes, marks): OpenXmlNode {
  let elements = [];
  if (Array.isArray(nodeOrNodes)) elements = nodeOrNodes;
  else elements = [nodeOrNodes];

  if (marks && marks.length) elements.unshift(generateRunProps(marks));
  return {
    name: 'w:r',
    elements,
  };
}

/**
 * Generate a w:rPr node (run properties) from marks
 *
 * @param {Object[]} marks The marks to add to the run properties
 * @returns
 */
export function generateRunProps(marks: object[] = []) {
  return {
    name: 'w:rPr',
    elements: marks.filter((mark) => !!Object.keys(mark).length),
  };
}

/**
 * Get all marks as a list of MarkType objects
 */
export function processOutputMarks(marks: MarkType[] = []) {
  return marks.flatMap((mark) => {
    if (mark.type === 'textStyle') {
      return Object.entries(mark.attrs)
        .filter(([, value]) => value)
        .map(([key]) => {
          const unwrappedMark = { type: key, attrs: mark.attrs };
          return translateMark(unwrappedMark);
        });
    } else {
      return translateMark(mark);
    }
  });
}

/**
 * Translate a mark to an XML ready attribute
 *
 * @param {MarkType} mark
 */
function translateMark(mark: MarkType) {
  const xmlMark = SuperConverter.markTypes.find((m) => m.type === mark.type);
  if (!xmlMark) {
    return {};
  }

  // FIXME: properly type markElement
  const markElement: Record<string, any> = { name: xmlMark.name, attributes: {} };

  const { attrs } = mark;
  let value;

  switch (mark.type) {
    case 'bold':
      if (attrs?.value) {
        markElement.attributes['w:val'] = attrs.value;
      } else {
        delete markElement.attributes;
      }
      markElement.type = 'element';
      break;

    case 'italic':
      if (attrs?.value && attrs.value !== '1' && attrs.value !== true) {
        markElement.attributes['w:val'] = attrs.value;
      } else {
        delete markElement.attributes;
      }
      markElement.type = 'element';
      break;

    case 'underline': {
      const translated = wUnderlineTranslator.decode({
        // @ts-expect-error FIXME: missing "type"
        node: {
          attrs: {
            underlineType: attrs.underlineType ?? attrs.underline ?? null,
            underlineColor: attrs.underlineColor ?? attrs.color ?? null,
            underlineThemeColor: attrs.underlineThemeColor ?? attrs.themeColor ?? null,
            underlineThemeTint: attrs.underlineThemeTint ?? attrs.themeTint ?? null,
            underlineThemeShade: attrs.underlineThemeShade ?? attrs.themeShade ?? null,
          },
        },
      });
      return translated || {};
    }

    // Text style cases
    case 'fontSize':
      value = attrs.fontSize;
      markElement.attributes['w:val'] = value.slice(0, -2) * 2; // Convert to half-points
      break;

    case 'fontFamily':
      value = attrs.fontFamily;
      ['w:ascii', 'w:eastAsia', 'w:hAnsi', 'w:cs'].forEach((attr) => {
        const parsedValue = value.split(', ');
        markElement.attributes[attr] = parsedValue[0] ? parsedValue[0] : value;
      });
      break;

    // Add ability to get run styleIds from textStyle marks and inject to run properties in word
    case 'styleId':
      markElement.name = 'w:rStyle';
      markElement.attributes['w:val'] = attrs.styleId;
      break;

    case 'color': {
      const rawColor = attrs.color;
      if (!rawColor) break;

      const normalized = String(rawColor).trim().toLowerCase();
      if (normalized === 'inherit') {
        markElement.attributes['w:val'] = 'auto';
        break;
      }

      let processedColor = String(rawColor).replace(/^#/, '').replace(/;$/, ''); // Remove `#` and `;` if present
      if (processedColor.startsWith('rgb')) {
        processedColor = rgbToHex(processedColor);
      }
      markElement.attributes['w:val'] = processedColor;
      break;
    }

    case 'textAlign':
      markElement.attributes['w:val'] = attrs.textAlign;
      break;

    case 'textIndent':
      markElement.attributes['w:firstline'] = inchesToTwips(attrs.textIndent);
      break;

    case 'textTransform':
      if (attrs?.textTransform === 'none') {
        markElement.attributes['w:val'] = '0';
      } else {
        delete markElement.attributes;
      }
      markElement.type = 'element';
      break;

    case 'lineHeight':
      markElement.attributes['w:line'] = linesToTwips(attrs.lineHeight);
      break;
    case 'highlight': {
      const highlightValue = attrs.color ?? attrs.highlight ?? null;
      // @ts-expect-error FIXME: missing "type"
      const translated = wHighlightTranslator.decode({ node: { attrs: { highlight: highlightValue } } });
      return translated || {};
    }
    case 'strike':
      if (attrs?.value === '0') markElement.attributes['w:val'] = attrs.value;
      break;

    case 'link':
      return {};
  }

  return markElement;
}

export class DocxExporter {
  converter: SuperConverter;

  constructor(converter: SuperConverter) {
    this.converter = converter;
  }

  schemaToXml(data, debug = false) {
    const result = this.#generate_xml_as_list(data, debug);
    return result.join('');
  }

  #generate_xml_as_list(data, debug = false) {
    const json = JSON.parse(JSON.stringify(data));
    const declaration = this.converter.declaration.attributes;
    const xmlTag = `<?xml${Object.entries(declaration)
      .map(([key, value]) => ` ${key}="${value}"`)
      .join('')}?>`;
    // @ts-expect-error FIXME: "debug" isn't used by #generateXml
    const result = this.#generateXml(json, debug);
    const final = [xmlTag, ...result];
    return final;
  }

  #replaceSpecialCharacters(text) {
    if (text === undefined || text === null) return text;
    return String(text)
      .replace(/&(?!#\d+;|#x[0-9a-fA-F]+;|(?:amp|lt|gt|quot|apos);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Recursively generates XML string representation from a JSON node structure.
   * Handles special processing for different element types to maintain Word document integrity.
   *
   * Processing behavior by element type:
   * - Text nodes (type='text'): Escapes special XML characters (&, <, >, ", ')
   * - w:instrText: Joins child text nodes and escapes special characters; preserves field instruction syntax
   * - w:t, w:delText, wp:posOffset: Removes [[sdspace]] placeholders that were added during import to preserve
   *   whitespace, then escapes special characters. These placeholders are temporary markers used internally.
   * - Other elements: Recursively processes child elements
   *
   * @param {Object} node - The JSON node to convert to XML
   * @param {string} node.name - The XML element name (e.g., 'w:t', 'w:p')
   * @param {Object} [node.attributes] - Key-value pairs of XML attributes
   * @param {Array} [node.elements] - Array of child nodes to process recursively
   * @param {string} [node.type] - Node type ('text' for text nodes, 'element' for XML elements)
   * @param {string} [node.text] - The text content (only present when type='text')
   * @returns {string[]|string|null} Array of XML string fragments for elements, string for text nodes, or null for invalid nodes
   * @throws {Error} Logs error to console if text element processing fails, then continues processing
   *
   * @example
   * // Simple text element
   * const node = {
   *   name: 'w:t',
   *   elements: [{ type: 'text', text: 'Hello World' }]
   * };
   * // Returns: ['<w:t>', 'Hello World', '</w:t>']
   *
   * @example
   * // Element with placeholder removal
   * const node = {
   *   name: 'w:t',
   *   elements: [{ type: 'text', text: 'Text[[sdspace]]content' }]
   * };
   * // Returns: ['<w:t>', 'Textcontent', '</w:t>']
   */
  #generateXml(node: {
    name: string;
    attributes?: object;
    elements?: Array<any>;
    type?: string;
    text?: string;
  }): string[] | string | null {
    if (!node) return null;
    const { name } = node;
    const { elements, attributes } = node;

    let tag = `<${name}`;

    for (const attr in attributes) {
      const parsedAttrName =
        typeof attributes[attr] === 'string' ? this.#replaceSpecialCharacters(attributes[attr]) : attributes[attr];
      tag += ` ${attr}="${parsedAttrName}"`;
    }

    const selfClosing = name && (!elements || !elements.length);
    if (selfClosing) tag += ' />';
    else tag += '>';
    const tags = [tag];

    if (!name && node.type === 'text') {
      return this.#replaceSpecialCharacters(node.text ?? '');
    }

    if (elements) {
      if (name === 'w:instrText') {
        const textContent = (elements || [])
          .map((child) => (typeof child?.text === 'string' ? child.text : ''))
          .join('');
        tags.push(this.#replaceSpecialCharacters(textContent));
      } else if (name === 'w:t' || name === 'w:delText' || name === 'wp:posOffset') {
        // Validate that the first child element has valid text content
        if (elements.length === 0) {
          // Empty elements array - will be handled as self-closing tag, which is an error state
          console.error(`${name} element has no child elements. Expected text node. Element will be self-closing.`);
        } else if (elements[0] == null || typeof elements[0].text !== 'string') {
          // Invalid or missing text content - push empty string to maintain XML structure
          console.error(
            `${name} element's first child is missing or does not have a valid text property. ` +
              `Received: ${JSON.stringify(elements[0])}. Pushing empty string to maintain XML structure.`,
          );
          tags.push('');
        } else {
          // Valid text content - remove [[sdspace]] placeholders that were added during XML import
          // to preserve whitespace, then escape special XML characters
          let text = elements[0].text.replace(/\[\[sdspace\]\]/g, '');
          text = this.#replaceSpecialCharacters(text);
          tags.push(text);
        }
      } else {
        if (elements) {
          for (const child of elements) {
            const newElements = this.#generateXml(child);
            if (!newElements) {
              continue;
            }

            if (typeof newElements === 'string') {
              tags.push(newElements);
              continue;
            }

            const removeUndefined = newElements.filter((el) => {
              const isUndefined = el === '<undefined>' || el === '</undefined>';
              return !isUndefined;
            });

            for (const element of removeUndefined) {
              tags.push(element);
            }
          }
        }
      }
    }

    if (!selfClosing) tags.push(`</${name}>`);
    return tags;
  }
}
