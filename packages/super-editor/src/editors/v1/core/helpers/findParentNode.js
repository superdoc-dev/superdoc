// @ts-check
import { findParentNodeClosestToPos } from './findParentNodeClosestToPos';

/**
 * @typedef {import("./findParentNodeClosestToPos").ParentNodeInfo} ParentNodeInfo
 */

/**
 * Find the closest parent node to the current selection that matches a predicate.
 * @param {function(import("prosemirror-model").Node): boolean} predicate - A function that takes a node and returns true if it matches the desired condition.
 * @returns {function(Object): ParentNodeInfo|null} A function that takes a ProseMirror selection and returns the closest matching parent node, or null if none is found.
 *
 * https://github.com/atlassian/prosemirror-utils/blob/master/src/selection.ts#L17
 */
export const findParentNode = (predicate) => {
  return ({ $from }) => findParentNodeClosestToPos($from, predicate);
};
