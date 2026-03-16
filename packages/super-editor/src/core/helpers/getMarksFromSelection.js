import { extractTableInfo } from '@extensions/run/calculateInlineRunPropertiesPlugin.js';
import { calculateResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { encodeMarksFromRPr } from '@converter/styles.js';

import { resolveRunProperties } from '@superdoc/style-engine/ooxml';

export function getMarksFromSelection(state, editor) {
  const { from, to, empty } = state.selection;
  const marks = [];

  if (empty) {
    if (state.storedMarks) {
      marks.push(...state.storedMarks);
    }

    marks.push(...state.selection.$head.marks());

    // Empty paragraphs may have inherited run properties from a split.
    // Convert those to marks so that toggle commands see the inherited formatting.
    if (marks.length === 0) {
      const runProperties = getInheritedRunProperties(state.selection.$head, editor);
      if (runProperties) {
        const docx = editor?.converter?.convertedXml ?? {};
        const markDefs = encodeMarksFromRPr(runProperties, docx);
        for (const def of markDefs) {
          const markType = state.schema.marks[def.type];
          if (markType) marks.push(markType.create(def.attrs));
        }
      }
    }
  } else {
    state.doc.nodesBetween(from, to, (node) => {
      marks.push(...node.marks);
    });
  }
  return marks;
}

/**
 * Walks up from the resolved position to find a paragraph ancestor
 * and returns its inherited runProperties if the paragraph is empty.
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {Object} editor
 * @returns {Record<string, unknown> | null}
 */
export function getInheritedRunProperties($pos, editor, checkEmpty = true) {
  let tableInfo = null;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      if (checkEmpty && node.content.size > 0) return null;

      const params = {
        docx: editor?.converter?.convertedXml ?? {},
        numbering: editor?.converter?.numbering ?? {},
        translatedNumbering: editor?.converter?.translatedNumbering ?? {},
        translatedLinkedStyles: editor?.converter?.translatedLinkedStyles ?? {},
      };
      const paragraphAttrs = node.attrs || {};
      const resolvedPpr = calculateResolvedParagraphProperties(editor, node, $pos);
      const runProperties = resolveRunProperties(
        params,
        paragraphAttrs?.paragraphProperties?.runProperties || {},
        resolvedPpr || {},
        tableInfo,
        false,
        Boolean(paragraphAttrs.paragraphProperties?.numberingProperties),
      );
      return runProperties || null;
    } else if (node.type.name === 'tableCell') {
      tableInfo = extractTableInfo($pos, depth);
    }
  }
  return null;
}
