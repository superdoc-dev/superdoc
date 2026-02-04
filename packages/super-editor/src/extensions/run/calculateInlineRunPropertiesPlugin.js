import { Plugin } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
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
    /**
     * Recompute inline run properties and split runs when adjacent text carries different inline overrides.
     *
     * @param {import('prosemirror-state').Transaction[]} transactions
     * @param {import('prosemirror-state').EditorState} _oldState
     * @param {import('prosemirror-state').EditorState} newState
     * @returns {import('prosemirror-state').Transaction|null}
     */
    appendTransaction(transactions, _oldState, newState) {
      const tr = newState.tr;
      if (!transactions.some((t) => t.docChanged)) return null;

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

        const { segments, firstInlineProps } = segmentRunByInlineProps(runNode, paragraphNode, $pos, editor);
        const runProperties = firstInlineProps ?? null;

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

        if (segments.length === 1) {
          if (JSON.stringify(runProperties) === JSON.stringify(runNode.attrs.runProperties)) return;
          tr.setNodeMarkup(pos, runNode.type, { ...runNode.attrs, runProperties }, runNode.marks);
          return;
        }

        const newRuns = segments.map((segment) => {
          const props = segment.inlineProps ?? null;
          return runType.create({ runProperties: props }, Fragment.fromArray(segment.content));
        });
        tr.replaceWith(pos, pos + runNode.nodeSize, Fragment.fromArray(newRuns));
      });

      return tr.docChanged ? tr : null;
    },
  });

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

/**
 * Split a run node into segments whose inline runProperties match for adjacent content.
 *
 * @param {import('prosemirror-model').Node} runNode
 * @param {import('prosemirror-model').Node} paragraphNode
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {object} editor
 * @returns {{ segments: Array<{ inlineProps: Record<string, any>|null, inlineKey: string, content: import('prosemirror-model').Node[] }>, firstInlineProps: Record<string, any>|null }}
 */
function segmentRunByInlineProps(runNode, paragraphNode, $pos, editor) {
  const segments = [];
  let lastKey = null;
  let boundaryCounter = 0;

  runNode.forEach((child) => {
    if (child.isText) {
      const { inlineProps, inlineKey } = computeInlineRunProps(child.marks, paragraphNode, $pos, editor);
      const last = segments[segments.length - 1];
      if (last && inlineKey === lastKey) {
        last.content.push(child);
      } else {
        segments.push({ inlineProps, inlineKey, content: [child] });
        lastKey = inlineKey;
      }
      return;
    }

    const inlineProps = null;
    const inlineKey = `__boundary__${boundaryCounter++}`;
    segments.push({ inlineProps, inlineKey, content: [child] });
    lastKey = inlineKey;
  });

  const firstInlineProps = segments[0]?.inlineProps ?? null;
  return { segments, firstInlineProps };
}

/**
 * Compute the inline runProperties for a set of marks at a paragraph position.
 *
 * @param {import('prosemirror-model').Mark[]} marks
 * @param {import('prosemirror-model').Node} paragraphNode
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {object} editor
 * @returns {{ inlineProps: Record<string, any>|null, inlineKey: string }}
 */
function computeInlineRunProps(marks, paragraphNode, $pos, editor) {
  const runPropertiesFromMarks = decodeRPrFromMarks(marks);
  const paragraphProperties =
    getResolvedParagraphProperties(paragraphNode) || calculateResolvedParagraphProperties(editor, paragraphNode, $pos);
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
  const inlineProps = Object.keys(inlineRunProperties).length ? inlineRunProperties : null;
  const inlineKey = stableStringifyInlineProps(inlineProps);
  return { inlineProps, inlineKey };
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
 * Create a stable string key for inline runProperties for grouping.
 *
 * @param {Record<string, any>|null} inlineProps
 * @returns {string}
 */
function stableStringifyInlineProps(inlineProps) {
  if (!inlineProps || !Object.keys(inlineProps).length) return '__none__';
  const sortedKeys = Object.keys(inlineProps).sort();
  const sorted = {};
  sortedKeys.forEach((key) => {
    sorted[key] = inlineProps[key];
  });
  return JSON.stringify(sorted);
}
