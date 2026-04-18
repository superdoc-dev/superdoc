import {
  calculateResolvedParagraphProperties,
  getResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { resolveRunProperties, encodeCSSFromPPr, encodeCSSFromRPr } from '@converter/styles.js';
import { extractParagraphContext, calculateTabStyle } from '@extensions/tab/helpers/tabDecorations.js';
import { isList } from '@core/commands/list-helpers';

const pickParagraphProps = (resolved = {}) => {
  const { indent, spacing, tabStops, styleId, framePr, borders, shading, numberingProperties, justification } =
    resolved;
  return {
    indent,
    spacing,
    tabStops,
    styleId,
    framePr,
    borders,
    shading,
    numberingProperties,
    justification,
  };
};

const pickRunProps = (resolved = {}) => {
  const { fontFamily, color, highlight, bold, italic, underline, strike, size, letterSpacing } = resolved;
  return { fontFamily, color, highlight, bold, italic, underline, strike, size, letterSpacing };
};

/**
 * Compute a reference snapshot of how ParagraphNodeView resolves paragraph and marker styling.
 * This mirrors the logic used in the ProseMirror node view so layout-engine parity tests can
 * compare against the editor rendering pipeline.
 *
 * @param {import('@core/Editor').Editor} editor Editor instance with a PM view and converter data.
 * @param {import('prosemirror-model').Node} paragraphNode Paragraph node to inspect.
 * @param {number} pos Position before the paragraph node (same value provided by ProseMirror getPos()).
 */
export const computeParagraphReferenceSnapshot = (editor, paragraphNode, pos) => {
  const $pos = editor.state.doc.resolve(pos);
  const start = $pos.start(Math.min($pos.depth + 1, editor.state.doc.type.content ? $pos.depth + 1 : $pos.depth));

  calculateResolvedParagraphProperties(editor, paragraphNode, $pos);
  const resolvedPPr = getResolvedParagraphProperties(paragraphNode) || {};
  const cssFromPPr = encodeCSSFromPPr(resolvedPPr) || {};

  const snapshot = {
    paragraphProperties: pickParagraphProps(resolvedPPr),
    cssFromPPr,
    list: null,
  };

  if (!isList(paragraphNode)) {
    return snapshot;
  }

  const listRendering = paragraphNode.attrs.listRendering || {};
  const resolverContext = {
    docx: editor.converter?.convertedXml,
    numbering: editor.converter?.numbering,
  };
  const runProps = resolveRunProperties(
    resolverContext,
    resolvedPPr.runProperties || {},
    resolvedPPr,
    true,
    Boolean(paragraphNode.attrs.paragraphProperties?.numberingProperties),
  );
  const markerCss = encodeCSSFromRPr(runProps, editor.converter?.convertedXml) || {};

  let tabStyle;
  const suffix = listRendering.suffix ?? 'tab';
  if (suffix === 'tab') {
    const paragraphContext = extractParagraphContext(paragraphNode, start, editor.helpers);
    paragraphContext.accumulatedTabWidth = 0;
    const tabNode = editor.schema.nodes.tab.create(null);
    tabStyle = calculateTabStyle(tabNode.nodeSize, editor.view, start, paragraphNode, paragraphContext);
  }

  snapshot.list = {
    markerText: listRendering.markerText,
    justification: listRendering.justification,
    suffix,
    markerRunProps: pickRunProps(runProps),
    markerCss,
    tabStyle,
  };

  return snapshot;
};
