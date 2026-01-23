import { getInitialJSON } from '../docxHelper.js';
import { carbonCopy } from '../../../utilities/carbonCopy.js';
import { twipsToInches, resolveOpcTargetPath } from '../../helpers.js';
import { DEFAULT_LINKED_STYLES } from '../../exporter-docx-defs.js';
import { drawingNodeHandlerEntity } from './imageImporter.js';
import { trackChangeNodeHandlerEntity } from './trackChangesImporter.js';
import { hyperlinkNodeHandlerEntity } from './hyperlinkImporter.js';
import { runNodeHandlerEntity } from './runNodeImporter.js';
import { textNodeHandlerEntity } from './textNodeImporter.js';
import { paragraphNodeHandlerEntity } from './paragraphNodeImporter.js';
import { sdtNodeHandlerEntity } from './sdtNodeImporter.js';
import { passthroughNodeHandlerEntity } from './passthroughNodeImporter.js';
import { lineBreakNodeHandlerEntity } from './lineBreakImporter.js';
import { bookmarkStartNodeHandlerEntity } from './bookmarkStartImporter.js';
import { bookmarkEndNodeHandlerEntity } from './bookmarkEndImporter.js';
import { alternateChoiceHandler } from './alternateChoiceImporter.js';
import { autoPageHandlerEntity, autoTotalPageCountEntity } from './autoPageNumberImporter.js';
import { pageReferenceEntity } from './pageReferenceImporter.js';
import { pictNodeHandlerEntity } from './pictNodeImporter.js';
import { importCommentData } from './documentCommentsImporter.js';
import { importFootnoteData } from './documentFootnotesImporter.js';
import { getDefaultStyleDefinition } from '@converter/docx-helpers/index.js';
import { pruneIgnoredNodes } from './ignoredNodes.js';
import { tabNodeEntityHandler } from './tabImporter.js';
import { footnoteReferenceHandlerEntity } from './footnoteReferenceImporter.js';
import { tableNodeHandlerEntity } from './tableImporter.js';
import { tableOfContentsHandlerEntity } from './tableOfContentsImporter.js';
import { indexHandlerEntity, indexEntryHandlerEntity } from './indexImporter.js';
import { preProcessNodesForFldChar } from '../../field-references';
import { preProcessPageFieldsOnly } from '../../field-references/preProcessPageFieldsOnly.js';
import { ensureNumberingCache } from './numberingCache.js';
import { commentRangeStartHandlerEntity, commentRangeEndHandlerEntity } from './commentRangeImporter.js';
import { permStartHandlerEntity } from './permStartImporter.js';
import { permEndHandlerEntity } from './permEndImporter.js';
import bookmarkStartAttrConfigs from '@converter/v3/handlers/w/bookmark-start/attributes/index.js';
import bookmarkEndAttrConfigs from '@converter/v3/handlers/w/bookmark-end/attributes/index.js';
import { translator as wStylesTranslator } from '@converter/v3/handlers/w/styles/index.js';
import { translator as wNumberingTranslator } from '@converter/v3/handlers/w/numbering/index.js';
import { baseNumbering } from '@converter/v2/exporter/helpers/base-list.definitions.js';

/**
 * @typedef {import()} XmlNode
 * @typedef {{type: string, content: *, text: *, marks: *, attrs: {},}} PmNodeJson
 * @typedef {{type: string, attrs: {}}} PmMarkJson
 *
 * @typedef {(nodes: XmlNode[], docx: ParsedDocx, insideTrackChange: boolean) => PmNodeJson[]} NodeListHandlerFn
 * @typedef {{handler: NodeListHandlerFn, handlerEntities: NodeHandlerEntry[]}} NodeListHandler
 *
 * @typedef {(nodes: XmlNode[], docx: ParsedDocx, nodeListHandler: NodeListHandler, insideTrackChange: boolean) => {nodes: PmNodeJson[], consumed: number}} NodeHandler
 * @typedef {{handlerName: string, handler: NodeHandler}} NodeHandlerEntry
 */

/**
 *
 * @param {ParsedDocx} docx
 * @param {SuperConverter} converter instance.
 * @param {Editor} editor instance.
 * @returns {{pmDoc: PmNodeJson, savedTagsToRestore: XmlNode, pageStyles: *}|null}
 */
/**
 * Detect document origin (Word vs Google Docs) based on XML structure
 * @param {ParsedDocx} docx The parsed docx object
 * @returns {'word' | 'google-docs' | 'unknown'} The detected origin
 */
const detectDocumentOrigin = (docx) => {
  const commentsExtended = docx['word/commentsExtended.xml'];
  if (commentsExtended) {
    const { elements: initialElements = [] } = commentsExtended;
    if (initialElements?.length > 0) {
      const { elements = [] } = initialElements[0] ?? {};
      const commentEx = elements.filter((el) => el.name === 'w15:commentEx');
      if (commentEx.length > 0) {
        return 'word';
      }
    }
  }

  // Check for comments.xml - if it exists but no commentsExtended.xml, likely Google Docs
  const comments = docx['word/comments.xml'];
  if (comments && !commentsExtended) {
    // Google Docs often exports without commentsExtended.xml, using range-based threading
    return 'google-docs';
  }

  return 'unknown';
};

/**
 * Detect the document-level threading profile for comments based on file structure.
 * @param {ParsedDocx} docx The parsed docx object
 * @returns {import('@superdoc/common').CommentThreadingProfile}
 */
const detectCommentThreadingProfile = (docx) => {
  const hasCommentsExtended = !!docx['word/commentsExtended.xml'];
  const hasCommentsExtensible = !!docx['word/commentsExtensible.xml'];
  const hasCommentsIds = !!docx['word/commentsIds.xml'];

  return {
    defaultStyle: hasCommentsExtended ? 'commentsExtended' : 'range-based',
    mixed: false,
    fileSet: {
      hasCommentsExtended,
      hasCommentsExtensible,
      hasCommentsIds,
    },
  };
};

export const createDocumentJson = (docx, converter, editor) => {
  const json = carbonCopy(getInitialJSON(docx));
  if (!json) return null;

  if (converter) {
    importFootnotePropertiesFromSettings(docx, converter);
    converter.documentOrigin = detectDocumentOrigin(docx);
    converter.commentThreadingProfile = detectCommentThreadingProfile(docx);
  }

  const nodeListHandler = defaultNodeListHandler();
  const bodyNode = json.elements[0].elements.find((el) => el.name === 'w:body');

  if (bodyNode) {
    ensureSectionProperties(bodyNode);
    const node = bodyNode;

    // Pre-processing step for replacing fldChar sequences with SD-specific elements
    const { processedNodes } = preProcessNodesForFldChar(node.elements ?? [], docx);
    node.elements = processedNodes;

    // Extract body-level sectPr before filtering it out from content
    const bodySectPr = node.elements?.find((n) => n.name === 'w:sectPr');
    const bodySectPrElements = bodySectPr?.elements ?? [];
    if (converter) {
      converter.importedBodyHasHeaderRef = bodySectPrElements.some((el) => el?.name === 'w:headerReference');
      converter.importedBodyHasFooterRef = bodySectPrElements.some((el) => el?.name === 'w:footerReference');
    }

    const contentElements = node.elements?.filter((n) => n.name !== 'w:sectPr') ?? [];
    const content = pruneIgnoredNodes(contentElements);

    // Track imported lists
    const lists = {};
    const inlineDocumentFonts = [];

    const numbering = getNumberingDefinitions(docx);
    const comments = importCommentData({ docx, nodeListHandler, converter, editor });
    const footnotes = importFootnoteData({ docx, nodeListHandler, converter, editor, numbering });

    const translatedLinkedStyles = translateStyleDefinitions(docx);
    const translatedNumbering = translateNumberingDefinitions(docx);

    let parsedContent = nodeListHandler.handler({
      nodes: content,
      nodeListHandler,
      docx,
      converter,
      numbering,
      translatedNumbering,
      translatedLinkedStyles,
      editor,
      inlineDocumentFonts,
      lists,
      path: [],
    });

    // Safety: drop any inline-only nodes that accidentally landed at the doc root
    parsedContent = filterOutRootInlineNodes(parsedContent);
    collapseWhitespaceNextToInlinePassthrough(parsedContent);

    const result = {
      type: 'doc',
      content: parsedContent,
      attrs: {
        attributes: json.elements[0].attributes,
        // Attach body-level sectPr if it exists
        ...(bodySectPr ? { bodySectPr } : {}),
      },
    };

    return {
      pmDoc: result,
      savedTagsToRestore: node,
      pageStyles: getDocumentStyles(
        node,
        docx,
        converter,
        editor,
        numbering,
        translatedNumbering,
        translatedLinkedStyles,
      ),
      comments,
      footnotes,
      inlineDocumentFonts,
      linkedStyles: getStyleDefinitions(docx, converter, editor),
      translatedLinkedStyles,
      numbering: getNumberingDefinitions(docx, converter),
      translatedNumbering,
      themeColors: getThemeColorPalette(docx),
    };
  }
  return null;
};

export const defaultNodeListHandler = () => {
  const entities = [
    alternateChoiceHandler,
    runNodeHandlerEntity,
    pictNodeHandlerEntity,
    paragraphNodeHandlerEntity,
    textNodeHandlerEntity,
    lineBreakNodeHandlerEntity,
    sdtNodeHandlerEntity,
    bookmarkStartNodeHandlerEntity,
    bookmarkEndNodeHandlerEntity,
    hyperlinkNodeHandlerEntity,
    commentRangeStartHandlerEntity,
    commentRangeEndHandlerEntity,
    drawingNodeHandlerEntity,
    trackChangeNodeHandlerEntity,
    tableNodeHandlerEntity,
    footnoteReferenceHandlerEntity,
    tabNodeEntityHandler,
    tableOfContentsHandlerEntity,
    indexHandlerEntity,
    indexEntryHandlerEntity,
    autoPageHandlerEntity,
    autoTotalPageCountEntity,
    pageReferenceEntity,
    permStartHandlerEntity,
    permEndHandlerEntity,
    passthroughNodeHandlerEntity,
  ];

  const handler = createNodeListHandler(entities);
  return {
    handler,
    handlerEntities: entities,
  };
};

/**
 *
 * @param {NodeHandlerEntry[]} nodeHandlers
 */
const createNodeListHandler = (nodeHandlers) => {
  /**
   * Gets safe element context even if index is out of bounds
   * @param {Array} elements Array of elements
   * @param {number} index Index to check
   * @param {Object} processedNode result node
   * @param {String} path Occurrence filename
   * @returns {Object} Safe context object
   */
  const getSafeElementContext = (elements, index, processedNode, path) => {
    if (!elements || index < 0 || index >= elements.length) {
      return {
        elementIndex: index,
        error: 'index_out_of_bounds',
        arrayLength: elements?.length,
      };
    }

    const element = elements[index];
    return {
      elementName: element?.name,
      attributes: processedNode?.attrs,
      marks: processedNode?.marks,
      elementPath: path,
      type: processedNode?.type,
      content: processedNode?.content,
    };
  };

  const nodeListHandlerFn = ({
    nodes: elements,
    docx,
    insideTrackChange,
    converter,
    numbering,
    translatedNumbering,
    translatedLinkedStyles,
    editor,
    filename,
    parentStyleId,
    lists,
    inlineDocumentFonts,
    path = [],
    extraParams = {},
  }) => {
    if (!elements || !elements.length) return [];
    const filteredElements = pruneIgnoredNodes(elements);
    if (!filteredElements.length) return [];

    const processedElements = [];

    try {
      for (let index = 0; index < filteredElements.length; index++) {
        try {
          const nodesToHandle = filteredElements.slice(index);
          if (!nodesToHandle || nodesToHandle.length === 0) {
            continue;
          }

          const { nodes, consumed, unhandled } = nodeHandlers.reduce(
            (res, handler) => {
              if (res.consumed > 0) return res;

              return handler.handler({
                nodes: nodesToHandle,
                docx,
                nodeListHandler: { handler: nodeListHandlerFn, handlerEntities: nodeHandlers },
                insideTrackChange,
                converter,
                numbering,
                translatedNumbering,
                translatedLinkedStyles,
                editor,
                filename,
                parentStyleId,
                lists,
                inlineDocumentFonts,
                path,
                extraParams,
              });
            },
            { nodes: [], consumed: 0 },
          );

          // Only track unhandled nodes that should have been handled
          const context = getSafeElementContext(
            filteredElements,
            index,
            nodes[0],
            `/word/${filename || 'document.xml'}`,
          );
          if (unhandled) {
            if (!context.elementName) continue;
            continue;
          } else {
            const hasHighlightMark = nodes[0]?.marks?.find((mark) => mark.type === 'highlight');
            if (hasHighlightMark) {
              converter?.docHiglightColors.add(hasHighlightMark.attrs.color.toUpperCase());
            }
          }

          if (consumed > 0) {
            index += consumed - 1;
          }

          // Process and store nodes (no tracking needed for success)
          if (nodes) {
            nodes.forEach((node) => {
              if (node?.type && !['runProperties'].includes(node.type)) {
                if (node.type === 'text' && Array.isArray(node.content) && !node.content.length) {
                  return;
                }
                processedElements.push(node);
              }
            });
          }
        } catch (error) {
          console.debug('Import error', error);
          editor?.emit('exception', { error, editor });
        }
      }

      return processedElements;
    } catch (error) {
      console.debug('Error during import', error);
      editor?.emit('exception', { error, editor });

      throw error;
    }
  };
  return nodeListHandlerFn;
};

/**
 * Parse w:footnotePr element to extract footnote properties.
 * These properties control footnote numbering format, starting number, restart behavior, and position.
 *
 * @param {Object} footnotePrElement The w:footnotePr XML element
 * @returns {Object|null} Parsed footnote properties or null if none found
 */
function parseFootnoteProperties(footnotePrElement, source) {
  if (!footnotePrElement) return null;

  const props = { source };
  const elements = Array.isArray(footnotePrElement.elements) ? footnotePrElement.elements : [];

  elements.forEach((el) => {
    const val = el?.attributes?.['w:val'];
    switch (el.name) {
      case 'w:numFmt':
        // Numbering format: decimal, lowerRoman, upperRoman, lowerLetter, upperLetter, etc.
        if (val) props.numFmt = val;
        break;
      case 'w:numStart':
        // Starting number for footnotes
        if (val) props.numStart = val;
        break;
      case 'w:numRestart':
        // Restart behavior: continuous, eachSect, eachPage
        if (val) props.numRestart = val;
        break;
      case 'w:pos':
        // Position: pageBottom, beneathText, sectEnd, docEnd
        if (val) props.pos = val;
        break;
    }
  });

  // Also preserve the original XML for complete roundtrip fidelity
  props.originalXml = carbonCopy(footnotePrElement);

  return props;
}

function importFootnotePropertiesFromSettings(docx, converter) {
  if (!docx || !converter || converter.footnoteProperties) return;
  const settings = docx['word/settings.xml'];
  const settingsRoot = settings?.elements?.[0];
  const elements = Array.isArray(settingsRoot?.elements) ? settingsRoot.elements : [];
  const footnotePr = elements.find((el) => el?.name === 'w:footnotePr');
  if (!footnotePr) return;
  converter.footnoteProperties = parseFootnoteProperties(footnotePr, 'settings');
}

/**
 *
 * @param {XmlNode} node
 * @param {ParsedDocx} docx
 * @param {SuperConverter} converter instance.
 * @param {Editor} editor instance.
 * @returns {Object} The document styles object
 */
function getDocumentStyles(node, docx, converter, editor, numbering, translatedNumbering, translatedLinkedStyles) {
  const sectPr = node.elements?.find((n) => n.name === 'w:sectPr');
  const styles = {};

  sectPr?.elements?.forEach((el) => {
    const { name, attributes } = el;
    switch (name) {
      case 'w:pgSz':
        styles['pageSize'] = {
          width: twipsToInches(attributes['w:w']),
          height: twipsToInches(attributes['w:h']),
        };
        break;
      case 'w:pgMar':
        styles['pageMargins'] = {
          top: twipsToInches(attributes['w:top']),
          right: twipsToInches(attributes['w:right']),
          bottom: twipsToInches(attributes['w:bottom']),
          left: twipsToInches(attributes['w:left']),
          header: twipsToInches(attributes['w:header']),
          footer: twipsToInches(attributes['w:footer']),
          gutter: twipsToInches(attributes['w:gutter']),
        };
        break;
      case 'w:cols':
        styles['columns'] = {
          space: twipsToInches(attributes['w:space']),
          num: attributes['w:num'],
          equalWidth: attributes['w:equalWidth'],
        };
        break;
      case 'w:docGrid':
        styles['docGrid'] = {
          linePitch: twipsToInches(attributes['w:linePitch']),
          type: attributes['w:type'],
        };
        break;
      case 'w:titlePg':
        converter.headerIds.titlePg = true;
        break;
      case 'w:footnotePr':
        if (!converter.footnoteProperties) {
          converter.footnoteProperties = parseFootnoteProperties(el, 'sectPr');
        }
        break;
    }
  });

  // Import headers and footers. Stores them in converter.headers and converter.footers
  importHeadersFooters(docx, converter, editor, numbering, translatedNumbering, translatedLinkedStyles);
  styles.alternateHeaders = isAlternatingHeadersOddEven(docx);
  return styles;
}

const DEFAULT_SECTION_PROPS = Object.freeze({
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

function ensureSectionProperties(bodyNode) {
  if (!bodyNode.elements) bodyNode.elements = [];

  let sectPr = bodyNode.elements.find((el) => el.name === 'w:sectPr');
  if (!sectPr) {
    sectPr = {
      type: 'element',
      name: 'w:sectPr',
      elements: [],
    };
    bodyNode.elements.push(sectPr);
  } else if (!sectPr.elements) {
    sectPr.elements = [];
  }

  const ensureChild = (name, factory) => {
    let child = sectPr.elements.find((el) => el.name === name);
    if (!child) {
      child = factory();
      sectPr.elements.push(child);
    } else if (!child.attributes) {
      child.attributes = {};
    }
    return child;
  };

  const pgSz = ensureChild('w:pgSz', () => ({
    type: 'element',
    name: 'w:pgSz',
    attributes: {},
  }));
  pgSz.attributes['w:w'] = pgSz.attributes['w:w'] ?? DEFAULT_SECTION_PROPS.pageSize.width;
  pgSz.attributes['w:h'] = pgSz.attributes['w:h'] ?? DEFAULT_SECTION_PROPS.pageSize.height;

  const pgMar = ensureChild('w:pgMar', () => ({
    type: 'element',
    name: 'w:pgMar',
    attributes: {},
  }));
  Object.entries(DEFAULT_SECTION_PROPS.pageMargins).forEach(([key, value]) => {
    const attrKey = `w:${key}`;
    if (pgMar.attributes[attrKey] == null) pgMar.attributes[attrKey] = value;
  });

  return sectPr;
}

/**
 * Import style definitions from the document
 *
 * @param {Object} docx The parsed docx object
 * @returns {Object[]} The style definitions
 */
function getStyleDefinitions(docx) {
  const styles = docx['word/styles.xml'];
  if (!styles) return [];

  const elements = styles.elements?.[0]?.elements ?? [];
  const styleDefinitions = elements.filter((el) => el.name === 'w:style');

  // Track latent style exceptions
  const latentStyles = elements.find((el) => el.name === 'w:latentStyles');
  const matchedLatentStyles = [];
  (latentStyles?.elements ?? []).forEach((el) => {
    const { attributes } = el;
    const match = styleDefinitions.find((style) => style.attributes['w:styleId'] === attributes['w:name']);
    if (match) matchedLatentStyles.push(el);
  });

  // Parse all styles
  const allParsedStyles = [];
  styleDefinitions.forEach((style) => {
    const id = style.attributes['w:styleId'];
    const parsedStyle = getDefaultStyleDefinition(id, docx);

    const importedStyle = {
      id: style.attributes['w:styleId'],
      type: style.attributes['w:type'],
      definition: parsedStyle,
      attributes: {},
    };

    allParsedStyles.push(importedStyle);
  });

  return allParsedStyles;
}

export function translateStyleDefinitions(docx) {
  const styles = docx['word/styles.xml'];
  if (!styles) return [];
  const stylesElement = styles.elements[0];
  const parsedStyles = wStylesTranslator.encode({ nodes: [stylesElement] });
  return parsedStyles;
}

function translateNumberingDefinitions(docx) {
  const numbering = docx['word/numbering.xml'] ?? baseNumbering;
  const numberingElement = numbering.elements[0];
  const parsedNumbering = wNumberingTranslator.encode({ nodes: [numberingElement] });
  return parsedNumbering;
}

/**
 * Add default styles if missing. Default styles are:
 *
 * Normal, Title, Subtitle, Heading1, Heading2, Heading3
 *
 * Does not mutate the original docx object
 * @param {Object} styles The parsed docx styles [word/styles.xml]
 * @returns {Object | null} The updated styles object with default styles
 */
export function addDefaultStylesIfMissing(styles) {
  // Do not mutate the original docx object
  if (!styles) return null;
  const updatedStyles = carbonCopy(styles);
  const { elements } = updatedStyles.elements[0];

  Object.keys(DEFAULT_LINKED_STYLES).forEach((styleId) => {
    const existsOnDoc = elements.some((el) => el.attributes?.['w:styleId'] === styleId);
    if (!existsOnDoc) {
      const missingStyle = DEFAULT_LINKED_STYLES[styleId];
      updatedStyles.elements[0].elements.push(missingStyle);
    }
  });

  return updatedStyles;
}

/**
 * Import all header and footer definitions
 *
 * @param {Object} docx The parsed docx object
 * @param {Object} converter The converter instance
 * @param {Editor} mainEditor The editor instance
 */
const importHeadersFooters = (docx, converter, mainEditor, numbering, translatedNumbering, translatedLinkedStyles) => {
  const rels = docx['word/_rels/document.xml.rels'];
  const relationships = rels?.elements.find((el) => el.name === 'Relationships');
  const { elements } = relationships || { elements: [] };

  const headerType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
  const footerType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
  const headers = elements.filter((el) => el.attributes['Type'] === headerType);
  const footers = elements.filter((el) => el.attributes['Type'] === footerType);

  const sectPr = findSectPr(docx['word/document.xml']) || [];
  const allSectPrElements = sectPr.flatMap((el) => el.elements);
  if (!mainEditor) return;

  // Copy class instance(private fields and inherited methods won't work)
  const editor = { ...mainEditor };
  editor.options.annotations = true;

  headers.forEach((header) => {
    const { rId, referenceFile, currentFileName } = getHeaderFooterSectionData(header, docx);

    // Pre-process PAGE and NUMPAGES field codes in headers
    // Uses the targeted version that preserves other field types (DOCPROPERTY, etc.)
    const headerNodes = carbonCopy(referenceFile.elements[0].elements ?? []);
    const { processedNodes: headerProcessedNodes } = preProcessPageFieldsOnly(headerNodes);

    const sectPrHeader = allSectPrElements.find(
      (el) => el.name === 'w:headerReference' && el.attributes['r:id'] === rId,
    );
    let sectionType = sectPrHeader?.attributes['w:type'];
    if (converter.headerIds[sectionType]) sectionType = null;
    const nodeListHandler = defaultNodeListHandler();
    let schema = nodeListHandler.handler({
      nodes: headerProcessedNodes,
      nodeListHandler,
      docx,
      converter,
      numbering,
      translatedNumbering,
      translatedLinkedStyles,
      editor,
      filename: currentFileName,
      path: [],
    });

    // Safety: drop inline-only nodes at the root of header docs
    schema = filterOutRootInlineNodes(schema);

    if (!converter.headerIds.ids) converter.headerIds.ids = [];
    converter.headerIds.ids.push(rId);
    converter.headers[rId] = { type: 'doc', content: [...schema] };
    if (sectionType) {
      converter.headerIds[sectionType] = rId;
    }
  });

  const titlePg = allSectPrElements?.find((el) => el.name === 'w:titlePg');
  if (titlePg) converter.headerIds.titlePg = true;

  footers.forEach((footer) => {
    const { rId, referenceFile, currentFileName } = getHeaderFooterSectionData(footer, docx);

    // Pre-process PAGE and NUMPAGES field codes in footers
    // Uses the targeted version that preserves other field types (DOCPROPERTY, etc.)
    const footerNodes = carbonCopy(referenceFile.elements[0].elements ?? []);
    const { processedNodes: footerProcessedNodes } = preProcessPageFieldsOnly(footerNodes);

    const sectPrFooter = allSectPrElements.find(
      (el) => el.name === 'w:footerReference' && el.attributes['r:id'] === rId,
    );
    const sectionType = sectPrFooter?.attributes['w:type'];

    const nodeListHandler = defaultNodeListHandler();
    let schema = nodeListHandler.handler({
      nodes: footerProcessedNodes,
      nodeListHandler,
      docx,
      converter,
      numbering,
      editor,
      filename: currentFileName,
      path: [],
    });

    // Safety: drop inline-only nodes at the root of footer docs
    schema = filterOutRootInlineNodes(schema);

    if (!converter.footerIds.ids) converter.footerIds.ids = [];
    converter.footerIds.ids.push(rId);
    converter.footers[rId] = { type: 'doc', content: [...schema] };
    if (sectionType) {
      converter.footerIds[sectionType] = rId;
    }
  });
};

const findSectPr = (obj, result = []) => {
  for (const key in obj) {
    if (obj[key] === 'w:sectPr') {
      result.push(obj);
    } else if (typeof obj[key] === 'object') {
      findSectPr(obj[key], result);
    }
  }
  return result;
};

/**
 * Get section data from the header or footer
 *
 * @param {Object} sectionData The section data (header or footer)
 * @param {Object} docx The parsed docx object
 * @returns {Object} The section data
 */
const getHeaderFooterSectionData = (sectionData, docx) => {
  const rId = sectionData.attributes.Id;
  const target = sectionData.attributes.Target;
  const filePath = resolveOpcTargetPath(target, 'word');
  const referenceFile = filePath ? docx[filePath] : undefined;
  const currentFileName = target;
  return {
    rId,
    referenceFile,
    currentFileName,
  };
};

/**
 * Remove any nodes that belong to the inline group when they appear at the root.
 * ProseMirror's doc node only accepts block-level content; inline nodes here cause
 * Invalid content for node doc errors. This is a conservative filter that only
 * drops clearly inline node types if they somehow escape their paragraph.
 *
 * @param {Array<{type: string, content?: any, attrs?: any, marks?: any[]}>} content
 * @returns {Array}
 */
export function filterOutRootInlineNodes(content = []) {
  if (!Array.isArray(content) || content.length === 0) return content;

  const INLINE_TYPES = new Set([
    'text',
    'bookmarkStart',
    'bookmarkEnd',
    'lineBreak',
    'hardBreak',
    'pageNumber',
    'totalPageCount',
    'runItem',
    'image',
    'tab',
    'fieldAnnotation',
    'mention',
    'contentBlock',
    'aiLoaderNode',
    'commentRangeStart',
    'commentRangeEnd',
    'commentReference',
    'footnoteReference',
    'structuredContent',
  ]);

  const PRESERVABLE_INLINE_XML_NAMES = {
    bookmarkStart: 'w:bookmarkStart',
    bookmarkEnd: 'w:bookmarkEnd',
  };

  const result = [];

  content.forEach((node) => {
    if (!node || typeof node.type !== 'string') return;
    const type = node.type;
    const preservableNodeName = PRESERVABLE_INLINE_XML_NAMES[type];

    // Anchored images are inline nodes; wrap them to satisfy doc's block-only root.
    if (type === 'image' && node.attrs?.isAnchor) {
      result.push({
        type: 'paragraph',
        content: [node],
        attrs: {},
        marks: [],
      });
      return;
    }

    if (!INLINE_TYPES.has(type)) {
      result.push(node);
    } else if (preservableNodeName) {
      const originalXml = buildOriginalXml(type, node.attrs, PRESERVABLE_INLINE_XML_NAMES);
      result.push({
        type: 'passthroughBlock',
        attrs: {
          originalName: preservableNodeName,
          ...(originalXml ? { originalXml } : {}),
        },
      });
    }
  });

  return result;
}

/**
 * Reconstruct original OOXML for preservable inline nodes using their attribute decoders.
 *
 * @param {'bookmarkStart'|'bookmarkEnd'} type
 * @param {Record<string, any>} attrs
 * @returns {{name: string, attributes?: Object, elements: []}|null}
 */
const buildOriginalXml = (type, attrs, preservableTags) => {
  const attrConfigsByType = {
    bookmarkStart: bookmarkStartAttrConfigs,
    bookmarkEnd: bookmarkEndAttrConfigs,
  };

  const configs = attrConfigsByType[type];
  if (!configs) return null;
  const xmlAttrs = {};
  configs.forEach((cfg) => {
    const val = cfg.decode(attrs || {});
    if (val !== undefined) {
      xmlAttrs[cfg.xmlName] = val;
    }
  });
  const attributes = Object.keys(xmlAttrs).length ? xmlAttrs : undefined;
  const name = preservableTags[type];
  return { name, ...(attributes ? { attributes } : {}), elements: [] };
};

/**
 * Inline passthrough nodes render as zero-width spans. If the text before ends
 * with a space and the text after starts with a space we will see a visible
 * double space once the passthrough is hidden. Collapse that edge to a single
 * trailing space on the left and trim the leading whitespace on the right.
 *
 * @param {Array} content
 */
export function collapseWhitespaceNextToInlinePassthrough(content = []) {
  if (!Array.isArray(content) || content.length === 0) return;

  const sequence = collectInlineSequence(content);
  sequence.forEach((entry, index) => {
    if (entry.kind !== 'passthrough') return;
    const prev = findNeighborText(sequence, index, -1);
    const next = findNeighborText(sequence, index, 1);
    if (!prev || !next) return;
    if (!prev.node.text.endsWith(' ') || !next.node.text.startsWith(' ')) return;

    prev.node.text = prev.node.text.replace(/ +$/, ' ');
    next.node.text = next.node.text.replace(/^ +/, '');
    if (next.node.text.length === 0) {
      next.parent.splice(next.index, 1);
    }
  });
}

function collectInlineSequence(nodes, result = [], insidePassthrough = false) {
  if (!Array.isArray(nodes) || nodes.length === 0) return result;
  nodes.forEach((node, index) => {
    if (!node) return;
    const isPassthrough = node.type === 'passthroughInline';
    if (isPassthrough && !insidePassthrough) {
      result.push({ kind: 'passthrough', parent: nodes, index });
    }
    if (node.type === 'text' && typeof node.text === 'string' && !insidePassthrough) {
      result.push({ kind: 'text', node, parent: nodes, index });
    }
    if (Array.isArray(node.content) && node.content.length) {
      const nextInside = insidePassthrough || isPassthrough;
      collectInlineSequence(node.content, result, nextInside);
    }
  });
  return result;
}

function findNeighborText(sequence, startIndex, direction) {
  let cursor = startIndex + direction;
  while (cursor >= 0 && cursor < sequence.length) {
    const entry = sequence[cursor];
    if (entry.kind === 'text') {
      return entry;
    }
    cursor += direction;
  }
  return null;
}

/**
 * Extracts the document theme color palette from a parsed theme XML part.
 * Returns a map like { accent1: '#4F81BD', hyperlink: '#0000FF', ... }.
 */
function getThemeColorPalette(docx) {
  const themePart = docx?.['word/theme/theme1.xml'];
  if (!themePart || !Array.isArray(themePart.elements)) return undefined;
  const themeNode = themePart.elements.find((el) => el.name === 'a:theme');
  const themeElements = themeNode?.elements?.find((el) => el.name === 'a:themeElements');
  const clrScheme = themeElements?.elements?.find((el) => el.name === 'a:clrScheme');
  if (!clrScheme || !Array.isArray(clrScheme.elements)) return undefined;

  const palette = {};
  clrScheme.elements.forEach((colorNode) => {
    const rawName = colorNode?.name;
    if (!rawName) return;
    const colorName = rawName.replace(/^a:/, '');
    if (!colorName) return;
    const valueNode = Array.isArray(colorNode.elements)
      ? colorNode.elements.find((el) => el.attributes && (el.attributes.val || el.attributes.lastClr))
      : undefined;
    const colorValue = valueNode?.attributes?.val || valueNode?.attributes?.lastClr;
    if (!colorValue) return;
    const normalized = String(colorValue).trim();
    if (!normalized) return;
    palette[colorName] = `#${normalized.toUpperCase()}`;
  });

  return Object.keys(palette).length ? palette : undefined;
}

/**
 * Import this document's numbering.xml definitions
 * They will be stored into converter.numbering
 *
 * @param {Object} docx The parsed docx
 * @param {Object} converter The SuperConverter instance
 * @returns {Object} The numbering definitions
 */
function getNumberingDefinitions(docx, converter) {
  const cache = ensureNumberingCache(docx, converter);

  const abstractDefinitions = {};
  cache.abstractById.forEach((value, key) => {
    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      abstractDefinitions[numericKey] = value;
    }
  });

  let importListDefs = {};
  cache.numNodesById.forEach((value, key) => {
    const numericKey = Number(key);
    if (Number.isInteger(numericKey)) {
      importListDefs[numericKey] = value;
    }
  });

  return {
    abstracts: abstractDefinitions,
    definitions: importListDefs,
  };
}

/**
 * Check if the document has alternating headers and footers.
 *
 * @param {Object} docx The parsed docx object
 * @returns {Boolean} True if the document has alternating headers and footers, false otherwise
 */
const isAlternatingHeadersOddEven = (docx) => {
  const settings = docx['word/settings.xml'];
  if (!settings || !settings.elements?.length) return false;

  const { elements = [] } = settings.elements[0];
  const evenOdd = elements.find((el) => el.name === 'w:evenAndOddHeaders');
  return !!evenOdd;
};
