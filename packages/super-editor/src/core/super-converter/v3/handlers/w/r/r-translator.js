// @ts-check
import { NodeTranslator } from '@translator';
import { translateChildNodes } from '../../../../v2/exporter/helpers/index.js';
import { cloneMark, cloneXmlNode, applyRunPropertiesTemplate, resolveFontFamily } from './helpers/helpers.js';
import { ensureTrackedWrapper, prepareRunTrackingContext } from './helpers/track-change-helpers.js';
import { appendTrackFormatChangeToRunProperties, findTrackFormatMark } from '../../helpers.js';
import { translator as wHyperlinkTranslator } from '../hyperlink/hyperlink-translator.js';
import { translator as wRPrTranslator } from '../rpr';
import validXmlAttributes from './attributes/index.js';
import { handleStyleChangeMarksV2 } from '../../../../v2/importer/markImporter.js';
import { encodeMarksFromRPr, resolveRunProperties } from '../../../../styles.js';
/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:r';

/**
 * Represent OOXML <w:r> as a SuperDoc inline node named 'run'.
 * Content within the run is preserved as node children with applied marks.
 */
/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_KEY_NAME = 'run';

const REFERENCE_RUN_STYLE_BY_XML_NAME = {
  'w:footnoteReference': 'FootnoteReference',
  'w:endnoteReference': 'EndnoteReference',
};

const hasXmlNodeNamed = (node, targetName) => {
  if (!node || typeof node !== 'object') return false;
  if (node.name === targetName) return true;
  if (!Array.isArray(node.elements)) return false;
  return node.elements.some((child) => hasXmlNodeNamed(child, targetName));
};

const getRunPropertiesNode = (runNode) => {
  if (!runNode) return null;
  if (!Array.isArray(runNode.elements)) runNode.elements = [];

  let runPropertiesNode = runNode.elements.find((element) => element?.name === 'w:rPr');
  if (!runPropertiesNode) {
    runPropertiesNode = { type: 'element', name: 'w:rPr', elements: [] };
    runNode.elements.unshift(runPropertiesNode);
  }

  if (!Array.isArray(runPropertiesNode.elements)) {
    runPropertiesNode.elements = [];
  }

  return runPropertiesNode;
};

const collectRunPropertyChanges = (runNode) => {
  const runPropertiesNode = runNode?.elements?.find((element) => element?.name === 'w:rPr');
  if (!Array.isArray(runPropertiesNode?.elements)) return [];

  return runPropertiesNode.elements
    .filter((element) => element?.name === 'w:rPrChange')
    .map((element) => cloneXmlNode(element));
};

const restoreRunPropertyChanges = (runNode, runPropertyChanges = []) => {
  if (!runPropertyChanges.length) return;

  const runPropertiesNode = getRunPropertiesNode(runNode);
  const existingNames = new Set(runPropertiesNode.elements.map((element) => element?.name));

  runPropertyChanges.forEach((changeElement) => {
    if (!changeElement?.name || existingNames.has(changeElement.name)) return;
    runPropertiesNode.elements.push(changeElement);
    existingNames.add(changeElement.name);
  });
};

const ensureReferenceRunFormatting = (runNode, referenceXmlName) => {
  const styleId = REFERENCE_RUN_STYLE_BY_XML_NAME[referenceXmlName];
  if (!styleId) return;

  if (!Array.isArray(runNode.elements)) runNode.elements = [];
  let runProps = runNode.elements.find((el) => el?.name === 'w:rPr');
  if (!runProps) {
    runProps = { name: 'w:rPr', elements: [] };
    runNode.elements.unshift(runProps);
  }

  if (!Array.isArray(runProps.elements)) runProps.elements = [];

  const hasStyle = runProps.elements.some((el) => el?.name === 'w:rStyle');
  if (!hasStyle) {
    runProps.elements.push({ name: 'w:rStyle', attributes: { 'w:val': styleId } });
  }

  const hasVertAlign = runProps.elements.some((el) => el?.name === 'w:vertAlign');
  if (!hasVertAlign) {
    runProps.elements.push({ name: 'w:vertAlign', attributes: { 'w:val': 'superscript' } });
  }
};

/*
 * Wraps the provided content in a SuperDoc run node.
 */
const createRunNodeWithContent = (content, encodedAttrs, runLevelMarks, runProperties) => {
  const node = {
    type: SD_KEY_NAME,
    content,
    attrs: { ...encodedAttrs, runProperties },
  };
  if (runLevelMarks.length) {
    node.marks = runLevelMarks.map((mark) => cloneMark(mark));
  }
  return node;
};

const encode = (params, encodedAttrs = {}) => {
  const { nodes = [], nodeListHandler } = params || {};
  const runNode = nodes[0];
  if (!runNode) return undefined;

  const elements = Array.isArray(runNode.elements) ? runNode.elements : [];

  // Parsing run properties
  const rPrNode = elements.find((child) => child?.name === 'w:rPr');
  const runProperties = rPrNode ? wRPrTranslator.encode({ ...params, nodes: [rPrNode] }) : {};

  // Resolving run properties following style hierarchy
  const paragraphProperties = params?.extraParams?.paragraphProperties || {};
  let tableInfo = null;
  if (
    params?.extraParams?.rowIndex != null &&
    params?.extraParams?.columnIndex != null &&
    params?.extraParams?.tableProperties != null &&
    params?.extraParams?.totalColumns != null &&
    params?.extraParams?.totalRows != null
  ) {
    tableInfo = {
      rowIndex: params.extraParams.rowIndex,
      cellIndex: params.extraParams.columnIndex,
      tableProperties: params.extraParams.tableProperties,
      numCells: params.extraParams.totalColumns,
      numRows: params.extraParams.totalRows,
    };
  }
  const resolvedRunProperties = resolveRunProperties(
    params,
    runProperties ?? {},
    paragraphProperties,
    tableInfo,
    false,
    params?.extraParams?.numberingDefinedInline,
  );

  // Parsing marks from run properties
  const marksResult = encodeMarksFromRPr(resolvedRunProperties, params?.docx);
  const marks = Array.isArray(marksResult) ? marksResult : [];
  const rPrChange = rPrNode?.elements?.find((el) => el.name === 'w:rPrChange');
  const styleChangeMarks = handleStyleChangeMarksV2(rPrChange, marks, params) || [];

  // Handling direct marks on the run node
  let runLevelMarks = Array.isArray(runNode.marks) ? runNode.marks.map((mark) => cloneMark(mark)) : [];
  if (styleChangeMarks?.length) {
    runLevelMarks = [...runLevelMarks, ...styleChangeMarks.map((mark) => cloneMark(mark))];
  }

  // Encoding child nodes within the run
  const contentElements = rPrNode ? elements.filter((el) => el !== rPrNode) : elements;
  const childParams = { ...params, nodes: contentElements };
  const content = nodeListHandler?.handler(childParams) || [];

  // Applying marks to child nodes
  const contentWithRunMarks = (Array.isArray(content) ? content : []).map((child) => {
    if (!child || typeof child !== 'object') return child;

    if (child.type === 'passthroughInline') {
      return { ...child, marks: [] };
    }

    // Preserve existing marks on child nodes
    const baseMarks = Array.isArray(child.marks) ? child.marks : [];

    let childMarks = [...marks, ...baseMarks, ...runLevelMarks].map((mark) => cloneMark(mark));

    // De-duplicate marks by type, preserving order (later marks override earlier ones)
    const seenTypes = new Set();
    let textStyleMark;
    childMarks = childMarks.filter((mark) => {
      if (!mark || !mark.type) return false;
      if (seenTypes.has(mark.type)) {
        if (mark.type === 'textStyle') {
          // Merge textStyle attributes
          textStyleMark.attrs = { ...(textStyleMark.attrs || {}), ...(mark.attrs || {}) };
          textStyleMark.attrs = resolveFontFamily(textStyleMark.attrs, child?.text);
        }
        return false;
      }
      if (mark.type === 'textStyle') {
        textStyleMark = mark;
      }
      seenTypes.add(mark.type);
      return true;
    });

    // Apply marks to child nodes
    return { ...child, marks: childMarks };
  });

  const filtered = contentWithRunMarks.filter(Boolean);

  const containsBreakNodes = filtered.some((child) => child?.type === 'lineBreak');
  if (!containsBreakNodes) {
    const defaultNode = createRunNodeWithContent(filtered, encodedAttrs, runLevelMarks, runProperties);
    return defaultNode;
  }

  const splitRuns = [];
  let currentChunk = [];
  /**
   * OOXML sometimes bundles multiple <w:t> siblings and <w:br/> tags inside one <w:r>.
   * Our renderer expects each break to be wrapped in its own run, so we finalize
   * the accumulated text chunk before emitting a break run.
   */
  const finalizeTextChunk = () => {
    if (!currentChunk.length) return;
    const chunkNode = createRunNodeWithContent(currentChunk, encodedAttrs, runLevelMarks, runProperties);
    if (chunkNode) splitRuns.push(chunkNode);
    currentChunk = [];
  };

  filtered.forEach((child) => {
    if (child?.type === 'lineBreak') {
      finalizeTextChunk();
      const breakNode = createRunNodeWithContent([child], encodedAttrs, runLevelMarks, runProperties);
      if (breakNode) splitRuns.push(breakNode);
    } else {
      currentChunk.push(child);
    }
  });
  finalizeTextChunk();

  return splitRuns;
};

const decode = (params, decodedAttrs = {}) => {
  const { node } = params || {};
  if (!node) return undefined;

  // Separate links from regular text
  const isLinkNode = node.marks?.some((m) => m.type === 'link');
  if (isLinkNode) {
    const extraParams = {
      ...params.extraParams,
      linkProcessed: true,
    };
    return wHyperlinkTranslator.decode({ ...params, extraParams });
  }

  // Separate out tracking marks
  const { runNode: runNodeForExport, trackingMarksByType } = prepareRunTrackingContext(node);
  const runTrackFormatMark = findTrackFormatMark(runNodeForExport.marks);

  const runAttrs = runNodeForExport.attrs || {};
  const runProperties = runAttrs.runProperties || {};

  // Decode child nodes within the run
  const exportParams = {
    ...params,
    node: runNodeForExport,
    extraParams: { ...params?.extraParams, runProperties: runProperties },
  };
  if (!exportParams.editor) {
    exportParams.editor = { extensionService: { extensions: [] } };
  }
  const childElements = translateChildNodes(exportParams) || [];

  // Parse marks back into run properties
  // and combine with any direct run properties
  let runPropertiesElement = wRPrTranslator.decode({
    ...params,
    node: { attrs: { runProperties: runProperties } },
  });

  const runPropsTemplate = runPropertiesElement ? cloneXmlNode(runPropertiesElement) : null;
  const applyBaseRunProps = (runNode) => applyRunPropertiesTemplate(runNode, runPropsTemplate);
  const replaceRunProps = (runNode) => {
    const existingRunPropertyChanges = collectRunPropertyChanges(runNode);

    // Remove existing rPr if any
    if (Array.isArray(runNode.elements)) {
      runNode.elements = runNode.elements.filter((el) => el?.name !== 'w:rPr');
    } else {
      runNode.elements = [];
    }
    if (runPropsTemplate) {
      runNode.elements.unshift(cloneXmlNode(runPropsTemplate));
    }

    restoreRunPropertyChanges(runNode, existingRunPropertyChanges);

    if (!existingRunPropertyChanges.length && runTrackFormatMark) {
      const runPropertiesNode = getRunPropertiesNode(runNode);
      appendTrackFormatChangeToRunProperties(runPropertiesNode, [runTrackFormatMark]);
    }
  };

  const runs = [];

  childElements.forEach((child) => {
    if (!child) return;
    if (child.name === 'w:r') {
      const clonedRun = cloneXmlNode(child);
      replaceRunProps(clonedRun);
      if (hasXmlNodeNamed(clonedRun, 'w:footnoteReference')) {
        ensureReferenceRunFormatting(clonedRun, 'w:footnoteReference');
      } else if (hasXmlNodeNamed(clonedRun, 'w:endnoteReference')) {
        ensureReferenceRunFormatting(clonedRun, 'w:endnoteReference');
      }
      runs.push(clonedRun);
      return;
    }

    if (child.name === 'w:hyperlink') {
      const hyperlinkClone = cloneXmlNode(child);
      if (Array.isArray(hyperlinkClone.elements)) {
        hyperlinkClone.elements.forEach((run) => applyBaseRunProps(run));
      }
      runs.push(hyperlinkClone);
      return;
    }

    if (child.name === 'w:ins' || child.name === 'w:del') {
      const trackedClone = cloneXmlNode(child);
      if (Array.isArray(trackedClone.elements)) {
        trackedClone.elements.forEach((element) => {
          if (element?.name === 'w:r') replaceRunProps(element);
        });
      }
      runs.push(trackedClone);
      return;
    }

    if (child.name === 'w:commentRangeStart' || child.name === 'w:commentRangeEnd') {
      const commentRangeClone = cloneXmlNode(child);
      runs.push(commentRangeClone);
      return;
    }

    // Run-level SDTs are paragraph siblings in OOXML (not children of w:r).
    // Emit them directly so Word does not need to normalize invalid nesting.
    if (child.name === 'w:sdt') {
      const sdtClone = cloneXmlNode(child);
      runs.push(sdtClone);
      return;
    }

    const runWrapper = { name: XML_NODE_NAME, elements: [] };
    applyBaseRunProps(runWrapper);
    if (!Array.isArray(runWrapper.elements)) runWrapper.elements = [];
    if (child.name === 'w:footnoteReference' || child.name === 'w:endnoteReference') {
      ensureReferenceRunFormatting(runWrapper, child.name);
    }
    runWrapper.elements.push(cloneXmlNode(child));
    runs.push(runWrapper);
  });

  const trackedRuns = ensureTrackedWrapper(runs, trackingMarksByType);

  if (!trackedRuns.length) {
    const emptyRun = { name: XML_NODE_NAME, elements: [] };
    applyBaseRunProps(emptyRun);
    trackedRuns.push(emptyRun);
  }

  if (decodedAttrs && Object.keys(decodedAttrs).length) {
    trackedRuns.forEach((run) => {
      run.attributes = { ...(run.attributes || {}), ...decodedAttrs };
    });
  }

  if (trackedRuns.length === 1) {
    return trackedRuns[0];
  }

  return trackedRuns;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_KEY_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/** @type {import('@translator').NodeTranslator} */
export const translator = NodeTranslator.from(config);
