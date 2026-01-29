import { Plugin } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { decodeRPrFromMarks, resolveRunProperties } from '@converter/styles.js';
import {
  calculateResolvedParagraphProperties,
  getResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { carbonCopy } from '@core/utilities/carbonCopy';

/**
 * ProseMirror plugin that recalculates inline `runProperties` whenever marks change on run nodes,
 * ensuring run attributes stay aligned with decoded mark styles and resolved paragraph styles.
 *
 * @param {object} editor Editor instance containing schema, converter data, and paragraph helpers.
 * @returns {Plugin} Plugin that updates run node attributes when mark changes occur.
 */
export const calculateInlineRunPropertiesPlugin = (editor) =>
  new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      const tr = newState.tr;
      if (!transactions.some((t) => t.docChanged)) return null;

      // Check if any AddMarkStep or RemoveMarkStep exists
      if (
        !transactions.some((tr) =>
          tr.steps.some((step) => step instanceof AddMarkStep || step instanceof RemoveMarkStep),
        )
      ) {
        return null;
      }

      const runType = newState.schema.nodes.run;
      if (!runType) return null;

      // Find all runs affected by changes, regardless of step type
      const changedRanges = [];
      transactions.forEach((tr) => {
        tr.steps.forEach((step) => {
          const from = tr.mapping.map(step.from, 1);
          const to = tr.mapping.map(step.to, -1);
          changedRanges.push({ from, to });
        });
      });

      const runPositions = new Set();
      mergeRanges(changedRanges, newState.doc.content.size).forEach(({ from, to }) => {
        newState.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type === runType) runPositions.add(pos);
        });
      });

      if (!runPositions.size) return null;

      runPositions.forEach((pos) => {
        const runNode = tr.doc.nodeAt(pos);
        if (!runNode) return;

        const $pos = tr.doc.resolve(pos);
        let paragraphNode = null;
        for (let depth = $pos.depth; depth >= 0; depth--) {
          const node = $pos.node(depth);
          if (node.type.name === 'paragraph') {
            paragraphNode = node;
            break;
          }
        }
        if (!paragraphNode) return;

        const marks = getMarksFromRun(runNode);
        const runPropertiesFromMarks = decodeRPrFromMarks(marks);
        const paragraphProperties =
          getResolvedParagraphProperties(paragraphNode) ||
          calculateResolvedParagraphProperties(editor, paragraphNode, $pos);
        const runPropertiesFromStyles = resolveRunProperties(
          {
            translatedNumbering: editor.converter?.translatedNumbering ?? {},
            translatedLinkedStyles: editor.converter?.translatedLinkedStyles ?? {},
          },
          {},
          paragraphProperties,
          false,
          Boolean(paragraphNode.attrs.paragraphProperties?.numberingProperties),
        );
        const inlineRunProperties = getInlineRunProperties(runPropertiesFromMarks, runPropertiesFromStyles);
        const runProperties = Object.keys(inlineRunProperties).length ? inlineRunProperties : null;

        const isFirstInParagraph = $pos.parent.firstChild === runNode;

        if (isFirstInParagraph) {
          // Keep paragraph's default runProperties in sync for the first run
          const inlineParagraphProperties = carbonCopy(paragraphNode.attrs.paragraphProperties) || {};
          inlineParagraphProperties.runProperties = runProperties;
          tr.setNodeMarkup($pos.before(), paragraphNode.type, {
            ...paragraphNode.attrs,
            paragraphProperties: inlineParagraphProperties,
          });
        }

        if (JSON.stringify(runProperties) === JSON.stringify(runNode.attrs.runProperties)) return;
        tr.setNodeMarkup(pos, runNode.type, { ...runNode.attrs, runProperties }, runNode.marks);
      });

      return tr.docChanged ? tr : null;
    },
  });

/**
 * Returns the marks applied to the first text child in a run node.
 *
 * @param {import('prosemirror-model').Node} runNode ProseMirror run node.
 * @returns {import('prosemirror-model').Mark[]} Marks present on the first text child, or an empty array.
 */
function getMarksFromRun(runNode) {
  let marks = [];
  runNode.forEach((child) => {
    if (!marks.length && child.isText) {
      marks = child.marks;
    }
  });
  return marks;
}

/**
 * Picks only the run properties that differ from resolved styles so they can be stored inline.
 *
 * @param {Record<string, any>} runPropertiesFromMarks Properties decoded from marks.
 * @param {Record<string, any>} runPropertiesFromStyles Properties resolved from styles and paragraphs.
 * @returns {Record<string, any>} Inline run properties that override styled defaults.
 */
function getInlineRunProperties(runPropertiesFromMarks, runPropertiesFromStyles) {
  const inlineRunProperties = {};
  for (const key in runPropertiesFromMarks) {
    const valueFromMarks = runPropertiesFromMarks[key];
    const valueFromStyles = runPropertiesFromStyles[key];
    if (JSON.stringify(valueFromMarks) !== JSON.stringify(valueFromStyles)) {
      inlineRunProperties[key] = valueFromMarks;
    }
  }
  return inlineRunProperties;
}

/**
 * Merges overlapping ranges while clamping bounds to the document size.
 *
 * @param {{ from: number, to: number }[]} ranges Ranges to merge.
 * @param {number} docSize Size of the document to constrain ranges within.
 * @returns {{ from: number, to: number }[]} Sorted, non-overlapping ranges.
 */
function mergeRanges(ranges, docSize) {
  if (!ranges.length) return [];
  const sorted = ranges
    .map(({ from, to }) => ({
      from: Math.max(0, from),
      to: Math.min(docSize, to),
    }))
    .filter(({ from, to }) => from < to)
    .sort((a, b) => a.from - b.from);

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
