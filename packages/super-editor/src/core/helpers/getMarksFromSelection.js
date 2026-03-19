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

  return getFormattingStateForRange(state, from, to, editor);
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
  const resolvedMarksFromProperties = createMarksFromRunProperties(state, resolvedRunProperties, editor);
  resolvedMarks.push(...mergeResolvedMarksWithInlineFallback(resolvedMarksFromProperties, inlineMarks));
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

export function getFormattingStateForRange(state, from, to, editor) {
  const segments = [];
  const seen = new Set();

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || node.text?.length === 0) return;
    const segmentPos = pos + 1;
    if (seen.has(segmentPos)) return;
    seen.add(segmentPos);
    segments.push(getFormattingStateAtPos(state, segmentPos, editor));
  });

  if (segments.length === 0) {
    return getFormattingStateAtPos(state, from, editor);
  }

  return aggregateFormattingSegments(state, editor, segments);
}

function aggregateFormattingSegments(state, editor, segments) {
  const resolvedRunProperties = intersectRunProperties(segments.map((segment) => segment.resolvedRunProperties));
  const inlineRunProperties = intersectRunProperties(segments.map((segment) => segment.inlineRunProperties));
  const styleRunProperties = intersectRunProperties(segments.map((segment) => segment.styleRunProperties));
  const resolvedMarks = createMarksFromRunProperties(state, resolvedRunProperties, editor);
  const inlineMarks = createMarksFromRunProperties(state, inlineRunProperties, editor);

  return {
    resolvedMarks: mergeResolvedMarksWithInlineFallback(resolvedMarks, inlineMarks),
    inlineMarks,
    resolvedRunProperties,
    inlineRunProperties,
    styleRunProperties,
  };
}

function mergeResolvedMarksWithInlineFallback(resolvedMarks, inlineMarks) {
  if (!resolvedMarks.length) return inlineMarks;
  if (!inlineMarks.length) return resolvedMarks;

  const resolvedMarkNames = new Set(resolvedMarks.map((mark) => mark.type.name));
  const missingInlineMarks = inlineMarks.filter((mark) => !resolvedMarkNames.has(mark.type.name));

  return [...resolvedMarks, ...missingInlineMarks];
}

function intersectRunProperties(runPropertiesList) {
  const filtered = runPropertiesList.filter((props) => props && typeof props === 'object');
  if (filtered.length === 0) return null;

  const first = filtered[0];
  const intersection = {};
  Object.keys(first).forEach((key) => {
    const serialized = JSON.stringify(first[key]);
    if (filtered.every((props) => JSON.stringify(props[key]) === serialized)) {
      intersection[key] = first[key];
    }
  });

  return Object.keys(intersection).length ? intersection : null;
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
  let paragraphNode = null;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'run' && runProperties == null) {
      runProperties = normalizeRunProperties(node.attrs?.runProperties);
    }
    if (node.type.name === 'paragraph') {
      paragraphNode = node;
    } else if (node.type.name === 'tableCell') {
      tableInfo = extractTableInfo($pos, depth);
      if (paragraphNode) break;
    }
  }

  if (runProperties == null) {
    const nodeBefore = $pos.nodeBefore;
    if (nodeBefore?.type.name === 'run') {
      runProperties = normalizeRunProperties(nodeBefore.attrs?.runProperties);
    } else {
      const nodeAfter = $pos.nodeAfter;
      if (nodeAfter?.type.name === 'run') {
        runProperties = normalizeRunProperties(nodeAfter.attrs?.runProperties);
      }
    }
  }

  if (!paragraphNode) {
    return null;
  }

  const paragraphAttrs = paragraphNode.attrs || {};
  const { params, resolvedPpr } = getSafeResolutionContext(editor, paragraphNode, $pos, paragraphAttrs);
  return {
    params,
    isEmpty: paragraphNode.content.size === 0,
    paragraphAttrs,
    runProperties,
    resolvedPpr,
    tableInfo,
    numberingDefinedInline: Boolean(paragraphAttrs.paragraphProperties?.numberingProperties),
  };
}

function normalizeRunProperties(runProperties) {
  if (!runProperties || typeof runProperties !== 'object') return null;
  return Object.keys(runProperties).length > 0 ? runProperties : null;
}

function getSafeResolutionContext(editor, node, $pos, paragraphAttrs) {
  const fallback = {
    params: {
      docx: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {},
    },
    resolvedPpr: paragraphAttrs.paragraphProperties || {},
  };

  if (!editor) return fallback;

  try {
    return {
      params: {
        docx: editor?.converter?.convertedXml ?? {},
        numbering: editor?.converter?.numbering ?? {},
        translatedNumbering: editor?.converter?.translatedNumbering ?? {},
        translatedLinkedStyles: editor?.converter?.translatedLinkedStyles ?? {},
      },
      resolvedPpr: calculateResolvedParagraphProperties(editor, node, $pos) || paragraphAttrs.paragraphProperties || {},
    };
  } catch {
    return fallback;
  }
}

function createMarksFromRunProperties(state, runProperties, editor) {
  const docx = getSafeConvertedXml(editor);
  return encodeMarksFromRPr(runProperties, docx)
    .map((def) => {
      const markType = state.schema.marks[def.type];
      return markType ? markType.create(def.attrs) : null;
    })
    .filter(Boolean);
}

function getSafeConvertedXml(editor) {
  try {
    return editor?.converter?.convertedXml ?? {};
  } catch {
    return {};
  }
}
