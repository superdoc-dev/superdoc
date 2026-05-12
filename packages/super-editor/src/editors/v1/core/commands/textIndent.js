import {
  getResolvedParagraphProperties,
  calculateResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { ptToTwips } from '@converter/helpers';

const defaultIncrementPoints = 36;

/**
 * Increase text indentation
 * @category Command
 * @returns {Function} Command function
 * @example
 * increaseTextIndent()
 * @note Increments by the default value (36 points by default)
 * @note Creates initial indent if none exists
 */
export const increaseTextIndent = () =>
  modifyIndentation((node, resolvedProps) => calculateNewIndentation(node, 1, resolvedProps), {
    resolveProps: true,
  });

/**
 * Decrease text indentation
 * @category Command
 * @returns {Function} Command function
 * @example
 * decreaseTextIndent()
 * @note Decrements by the default value (36 points by default)
 * @note Removes indentation completely if it reaches 0 or below
 */
export const decreaseTextIndent = () =>
  modifyIndentation((node, resolvedProps) => calculateNewIndentation(node, -1, resolvedProps), {
    resolveProps: true,
  });

/**
 * Set text indentation
 * @category Command
 * @param {number} points - Indentation value in points
 * @returns {Function} Command function
 * @example
 * // Set to 72 points (1 inch)
 * setTextIndentation(72)
 * @note Accepts indentation value in points
 */
export const setTextIndentation = (points) => modifyIndentation(() => ptToTwips(points));

/**
 * Remove text indentation
 * @category Command
 * @returns {Function} Command function
 * @example
 * unsetTextIndentation()
 * @note Removes inline indentation from the selected nodes
 */
export const unsetTextIndentation = () => modifyIndentation(() => null);

/**
 * Calculate new indentation based on delta
 * @param {import('prosemirror-model').Node} node - The paragraph node
 * @param {number} delta - The delta to apply (positive to increase, negative to decrease)
 * @param {object} resolvedProps - Resolved paragraph properties (cache hit or freshly computed)
 * @returns {number|null} New left indentation in twips, or null if no indentation
 */
function calculateNewIndentation(node, delta, resolvedProps) {
  let { indent } = resolvedProps ?? {};
  let { left } = indent || {};

  const increment = ptToTwips(delta * defaultIncrementPoints);
  if (!left) {
    left = increment;
  } else {
    left += increment;
  }

  if (left <= 0) {
    left = null;
  }
  return left;
}

/** * Modify indentation of selected paragraph nodes
 * @param {Function} calcFunc - Function to calculate new indentation
 * @param {object} [options]
 * @param {boolean} [options.resolveProps=false] - When true, resolve paragraph
 *   properties (cache hit or compute on miss) and pass them to calcFunc. Only
 *   needed by commands that read the current indent (increase/decrease).
 * @returns {Function} Command function
 */
function modifyIndentation(calcFunc, { resolveProps = false } = {}) {
  return ({ editor, state, dispatch }) => {
    const tr = state.tr;

    const { from, to } = state.selection;
    const results = [];

    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        // For increase/decrease, we need the resolved value (style cascade
        // included) to compute a correct delta. The cache misses on paragraphs
        // the rendering pass hasn't visited yet (fresh load, freshly-inserted
        // nodes), so fall back to computing on demand. A bare `?? {}` guard
        // would stop the crash but silently drop any style-derived indent
        // baseline, turning a crash into a wrong delta.
        const resolvedProps = resolveProps
          ? getResolvedParagraphProperties(node) ||
            calculateResolvedParagraphProperties(editor ?? {}, node, state.doc.resolve(pos))
          : undefined;

        let left = calcFunc(node, resolvedProps);
        if (Number.isNaN(left)) {
          results.push(false);
          return false;
        }

        const newAttrs = {
          ...node.attrs,
          paragraphProperties: {
            ...(node.attrs.paragraphProperties || {}),
            indent: {
              ...(node.attrs.paragraphProperties?.indent || {}),
              left,
            },
          },
        };

        if (left == null) {
          delete newAttrs.paragraphProperties.indent.left;
          if (Object.keys(newAttrs.paragraphProperties.indent).length === 0) {
            delete newAttrs.paragraphProperties.indent;
          }
        }
        tr.setNodeMarkup(pos, undefined, newAttrs);

        results.push(true);

        return false;
      }
      return true;
    });

    const success = results.every((result) => result);
    if (dispatch && success) {
      dispatch(tr);
    }
    return success;
  };
}
