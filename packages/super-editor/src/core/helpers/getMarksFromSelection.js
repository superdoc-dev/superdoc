import { extractTableInfo } from '@extensions/run/calculateInlineRunPropertiesPlugin.js';
import { calculateResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { decodeRPrFromMarks, encodeMarksFromRPr } from '@converter/styles.js';

import { resolveRunProperties } from '@superdoc/style-engine/ooxml';

export function getMarksFromSelection(state, editor) {
  return getSelectionFormattingState(state, editor).resolvedMarks;
}

export function getSelectionFormattingState(state, editor) {
  const { from, to, empty } = state.selection;

  if (empty) {
    return getFormattingStateAtPos(state, state.selection.$head.pos, editor, {
      storedMarks: state.storedMarks || null,
      includeCursorMarksWithStoredMarks: true,
    });
  }

  const resolvedMarks = [];
  const inlineMarks = [];
  state.doc.nodesBetween(from, to, (node) => {
    resolvedMarks.push(...node.marks);
    inlineMarks.push(...node.marks);
  });

  return {
    resolvedMarks,
    inlineMarks,
    resolvedRunProperties: decodeRPrFromMarks(inlineMarks),
    inlineRunProperties: decodeRPrFromMarks(inlineMarks),
    styleRunProperties: null,
  };
}

export function getFormattingStateAtPos(state, pos, editor, options = {}) {
  const {
    storedMarks = null,
    includeCursorMarksWithStoredMarks = false,
    preferParagraphRunProperties = false,
  } = options;
  const $pos = state.doc.resolve(pos);
  const context = getParagraphRunContext($pos, editor);
  const currentRunProperties = context?.runProperties || null;
  const cursorMarks = $pos.marks();
  const resolvedMarks = [];
  const inlineMarks = [];

  let inlineRunProperties = null;
  if (preferParagraphRunProperties) {
    inlineRunProperties = context?.paragraphAttrs?.paragraphProperties?.runProperties || null;
    inlineMarks.push(...createMarksFromRunProperties(state, inlineRunProperties, editor));
  } else if (storedMarks) {
    inlineMarks.push(...storedMarks);
    inlineRunProperties = decodeRPrFromMarks(storedMarks);
  } else if (context?.isEmpty) {
    inlineRunProperties = context?.paragraphAttrs?.paragraphProperties?.runProperties || null;
    inlineMarks.push(...createMarksFromRunProperties(state, inlineRunProperties, editor));
  } else if (currentRunProperties) {
    inlineRunProperties = currentRunProperties;
    inlineMarks.push(...createMarksFromRunProperties(state, inlineRunProperties, editor));
  } else {
    inlineMarks.push(...cursorMarks);
    inlineRunProperties = decodeRPrFromMarks(inlineMarks);
  }

  const resolvedFromSelection = getInheritedRunProperties(
    $pos,
    editor,
    preferParagraphRunProperties || (!storedMarks && context?.isEmpty)
      ? context?.paragraphAttrs?.paragraphProperties?.runProperties || null
      : inlineRunProperties,
  );
  const resolvedRunProperties = resolvedFromSelection?.resolvedRunProperties ?? inlineRunProperties;
  const styleRunProperties = resolvedFromSelection?.styleRunProperties ?? null;
  resolvedMarks.push(...inlineMarks);
  if (storedMarks && includeCursorMarksWithStoredMarks) {
    resolvedMarks.push(...cursorMarks);
  }

  return {
    resolvedMarks,
    inlineMarks,
    resolvedRunProperties,
    inlineRunProperties,
    styleRunProperties,
  };
}

/**
 * Resolve inherited run properties for the current position, returning:
 * - resolvedRunProperties: the full cascade used for toolbar state / first-char visuals
 * - inlineRunProperties: only explicit inline properties that may be serialized
 * - styleRunProperties: style/default-derived properties without direct overrides
 */
export function getInheritedRunProperties($pos, editor, inlineRunProperties) {
  if (!editor) {
    return {
      resolvedRunProperties: null,
      inlineRunProperties: null,
      styleRunProperties: null,
    };
  }

  const context = getParagraphRunContext($pos, editor);
  if (!context) {
    return {
      resolvedRunProperties: null,
      inlineRunProperties: null,
      styleRunProperties: null,
    };
  }

  try {
    const { params, resolvedPpr, tableInfo, numberingDefinedInline } = context;
    const styleSeed =
      inlineRunProperties && inlineRunProperties.styleId != null ? { styleId: inlineRunProperties.styleId } : {};

    return {
      resolvedRunProperties: resolveRunProperties(
        params,
        inlineRunProperties,
        resolvedPpr || {},
        tableInfo,
        false,
        numberingDefinedInline,
      ),
      inlineRunProperties: inlineRunProperties,
      styleRunProperties: resolveRunProperties(
        params,
        styleSeed,
        resolvedPpr || {},
        tableInfo,
        false,
        numberingDefinedInline,
      ),
    };
  } catch {
    return {
      resolvedRunProperties: null,
      inlineRunProperties: null,
      styleRunProperties: null,
    };
  }
}

function getParagraphRunContext($pos, editor) {
  let tableInfo = null;
  let runProperties = null;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'run' && runProperties == null) {
      runProperties = node.attrs?.runProperties || {};
    }
    if (node.type.name === 'paragraph') {
      const params = {
        docx: editor?.converter?.convertedXml ?? {},
        numbering: editor?.converter?.numbering ?? {},
        translatedNumbering: editor?.converter?.translatedNumbering ?? {},
        translatedLinkedStyles: editor?.converter?.translatedLinkedStyles ?? {},
      };
      const paragraphAttrs = node.attrs || {};
      return {
        params,
        isEmpty: node.content.size === 0,
        paragraphAttrs,
        runProperties,
        resolvedPpr: editor
          ? calculateResolvedParagraphProperties(editor, node, $pos)
          : paragraphAttrs.paragraphProperties || {},
        tableInfo,
        numberingDefinedInline: Boolean(paragraphAttrs.paragraphProperties?.numberingProperties),
      };
    } else if (node.type.name === 'tableCell') {
      tableInfo = extractTableInfo($pos, depth);
    }
  }
  return null;
}

function createMarksFromRunProperties(state, runProperties, editor) {
  const docx = editor?.converter?.convertedXml ?? {};
  return encodeMarksFromRPr(runProperties, docx)
    .map((def) => {
      const markType = state.schema.marks[def.type];
      return markType ? markType.create(def.attrs) : null;
    })
    .filter(Boolean);
}
