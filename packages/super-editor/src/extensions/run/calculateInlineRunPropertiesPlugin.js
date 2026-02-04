import { Plugin, TextSelection } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import { decodeRPrFromMarks, encodeMarksFromRPr, resolveRunProperties } from '@converter/styles.js';
import {
  calculateResolvedParagraphProperties,
  getResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { carbonCopy } from '@core/utilities/carbonCopy';
import { collectChangedRangesThroughTransactions } from '@utils/rangeUtils.js';

const RUN_PROPERTIES_DERIVED_FROM_MARKS = new Set([
  'strike',
  'italic',
  'bold',
  'underline',
  'highlight',
  'textTransform',
  'color',
  'fontSize',
  'letterSpacing',
  'fontFamily',
  'vertAlign',
  'position',
]);

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
      const changedRanges = collectChangedRangesThroughTransactions(transactions, newState.doc.content.size);

      const runPositions = new Set();
      changedRanges.forEach(({ from, to }) => {
        newState.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type === runType) runPositions.add(pos);
        });
      });

      if (!runPositions.size) return null;

      const selectionPreserver = createSelectionPreserver(tr, newState.selection);

      const sortedRunPositions = Array.from(runPositions).sort((a, b) => b - a);

      sortedRunPositions.forEach((pos) => {
        const mappedPos = tr.mapping.map(pos);
        const runNode = tr.doc.nodeAt(mappedPos);
        if (!runNode) return;

        const $pos = tr.doc.resolve(mappedPos);
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
          tr.setNodeMarkup(mappedPos, runNode.type, { ...runNode.attrs, runProperties }, runNode.marks);
        } else {
          const newRuns = segments.map((segment) => {
            const props = segment.inlineProps ?? null;
            return runType.create(
              { ...(runNode.attrs ?? {}), runProperties: props },
              Fragment.fromArray(segment.content),
              runNode.marks,
            );
          });
          const replacement = Fragment.fromArray(newRuns);
          tr.replaceWith(mappedPos, mappedPos + runNode.nodeSize, replacement);

          selectionPreserver?.mapReplacement(mappedPos, runNode.nodeSize, replacement);
        }
      });

      selectionPreserver?.finalize();

      return tr.docChanged ? tr : null;
    },
  });

/**
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
      const { inlineProps, inlineKey } = computeInlineRunProps(child.marks, runNode.attrs?.runProperties, paragraphNode, $pos, editor);
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
 * @param {Record<string, any>|null} existingRunProperties
 * @param {import('prosemirror-model').Node} paragraphNode
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {object} editor
 * @returns {{ inlineProps: Record<string, any>|null, inlineKey: string }}
 */
function computeInlineRunProps(marks, existingRunProperties, paragraphNode, $pos, editor) {
  const runPropertiesFromMarks = decodeRPrFromMarks(marks);
  const paragraphProperties =
    getResolvedParagraphProperties(paragraphNode) || calculateResolvedParagraphProperties(editor, paragraphNode, $pos);
  const runPropertiesFromStyles = resolveRunProperties(
    {
      translatedNumbering: editor.converter?.translatedNumbering ?? {},
      translatedLinkedStyles: editor.converter?.translatedLinkedStyles ?? {},
    },
    existingRunProperties?.styleId != null ? {styleId: existingRunProperties?.styleId} : {},
    paragraphProperties,
    false,
    Boolean(paragraphNode.attrs.paragraphProperties?.numberingProperties),
  );
  const inlineRunProperties = getInlineRunProperties(
    runPropertiesFromMarks,
    runPropertiesFromStyles,
    existingRunProperties,
    editor,
  );
  const inlineProps = Object.keys(inlineRunProperties).length ? inlineRunProperties : null;
  const inlineKey = stableStringifyInlineProps(inlineProps);
  return { inlineProps, inlineKey };
}

/**
 * Picks only the run properties that differ from resolved styles so they can be stored inline.
 *
 * @param {Record<string, any>} runPropertiesFromMarks Properties decoded from marks.
 * @param {Record<string, any>} runPropertiesFromStyles Properties resolved from styles and paragraphs.
 * @param {Record<string, any>|null} existingRunProperties Existing runProperties on the run node.
 * @returns {Record<string, any>} Inline run properties that override styled defaults.
 */
function getInlineRunProperties(runPropertiesFromMarks, runPropertiesFromStyles, existingRunProperties, editor) {
  const inlineRunProperties = {};
  for (const key in runPropertiesFromMarks) {
    const valueFromMarks = runPropertiesFromMarks[key];
    const valueFromStyles = runPropertiesFromStyles[key];
    if (JSON.stringify(valueFromMarks) !== JSON.stringify(valueFromStyles)) {
      if (key === 'fontFamily') {
        const markFromStyles = encodeMarksFromRPr({ [key]: valueFromStyles }, editor.converter?.convertedXml ?? {})[0];
        const markFromMarks = encodeMarksFromRPr({ [key]: valueFromMarks }, editor.converter?.convertedXml ?? {})[0];
        if (JSON.stringify(markFromMarks?.attrs) !== JSON.stringify(markFromStyles?.attrs)) {
          inlineRunProperties[key] = valueFromMarks;
        }
      } else {
        inlineRunProperties[key] = valueFromMarks;
      }
    }
  }

  if (existingRunProperties != null) {
    Object.keys(existingRunProperties).forEach((key) => {
      if (RUN_PROPERTIES_DERIVED_FROM_MARKS.has(key)) return;
      if (key in inlineRunProperties) return;
      if (existingRunProperties[key] === undefined) return;
      inlineRunProperties[key] = existingRunProperties[key];
    });
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

/**
 * Track and reapply selection across run replacements.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {import('prosemirror-state').Selection} originalSelection
 * @returns {{ mapReplacement: (startPos: number, nodeSize: number, replacement: Fragment) => void, finalize: () => void }|null}
 */
function createSelectionPreserver(tr, originalSelection) {
  if (!originalSelection) return null;

  const isTextSelection = originalSelection instanceof TextSelection;
  let preservedAnchor = isTextSelection ? originalSelection.anchor : null;
  let preservedHead = isTextSelection ? originalSelection.head : null;
  const anchorAssoc = preservedAnchor != null && preservedHead != null && preservedAnchor <= preservedHead ? -1 : 1;
  const headAssoc = preservedAnchor != null && preservedHead != null && preservedHead >= preservedAnchor ? 1 : -1;

  /**
   * Map an offset inside a run's content to a position in the replacement fragment.
   *
   * @param {number} startPos
   * @param {Fragment} replacement
   * @param {number} offset
   * @returns {number}
   */
  function mapOffsetThroughReplacement(startPos, replacement, offset) {
    let currentPos = startPos;
    let remaining = offset;
    let mapped = null;

    replacement.forEach((node) => {
      if (mapped != null) return;
      const contentSize = node.content.size;
      if (remaining <= contentSize) {
        mapped = currentPos + 1 + remaining;
        return;
      }
      remaining -= contentSize;
      currentPos += node.nodeSize;
    });

    return mapped ?? currentPos;
  }

  /**
   * Remap preserved selection positions through a run replacement.
   *
   * @param {number} startPos
   * @param {number} nodeSize
   * @param {Fragment} replacement
   * @returns {void}
   */
  const mapReplacement = (startPos, nodeSize, replacement) => {
    if (!isTextSelection || preservedAnchor == null || preservedHead == null) return;

    const stepMap = tr.mapping.maps[tr.mapping.maps.length - 1];
    /**
     * Map a selection endpoint through the replacement while preserving association.
     *
     * @param {number|null} posToMap
     * @param {number} assoc
     * @returns {number|null}
     */
    const mapSelectionPos = (posToMap, assoc) => {
      if (posToMap == null) return null;
      if (posToMap < startPos || posToMap > startPos + nodeSize) {
        return stepMap.map(posToMap, assoc);
      }
      const offsetInRun = posToMap - (startPos + 1);
      return mapOffsetThroughReplacement(startPos, replacement, offsetInRun);
    };

    preservedAnchor = mapSelectionPos(preservedAnchor, anchorAssoc);
    preservedHead = mapSelectionPos(preservedHead, headAssoc);
  };

  /**
   * Apply the preserved selection after all replacements are complete.
   *
   * @returns {void}
   */
  const finalize = () => {
    if (!tr.docChanged) return;
    if (isTextSelection && preservedAnchor != null && preservedHead != null) {
      tr.setSelection(TextSelection.create(tr.doc, preservedAnchor, preservedHead));
      return;
    }
    tr.setSelection(originalSelection.map(tr.doc, tr.mapping));
  };

  return { mapReplacement, finalize };
}
