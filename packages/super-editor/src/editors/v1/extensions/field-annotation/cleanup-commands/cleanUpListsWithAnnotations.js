import { getAllFieldAnnotations } from '../fieldAnnotationHelpers/index.js';
import { findParentNodeClosestToPos } from '@core/helpers/index.js';
import { isList as isParagraphList } from '@core/commands/list-helpers';

const summarizeListContent = (node, fieldsToDeleteSet) => {
  const summary = {
    totalFieldAnnotations: 0,
    deletableFieldAnnotations: 0,
    hasOtherInlineContent: false,
  };

  if (typeof node?.descendants !== 'function') {
    return summary;
  }

  node.descendants((child) => {
    if (!child) return true;

    if (child.type?.name === 'fieldAnnotation') {
      summary.totalFieldAnnotations += 1;
      const fieldId = child.attrs?.fieldId;
      if (fieldId && fieldsToDeleteSet.has(fieldId)) {
        summary.deletableFieldAnnotations += 1;
      } else {
        summary.hasOtherInlineContent = true;
      }
      return false;
    }

    if (child.isText) {
      if (child.text?.trim()) {
        summary.hasOtherInlineContent = true;
      }
      return false;
    }

    if (child.isInline || child.isAtom) {
      summary.hasOtherInlineContent = true;
      return false;
    }

    return true;
  });

  return summary;
};

/**
 * Clean up lists that contain field annotations if there are annotations
 * being deleted.
 * @param {string[]} fieldsToDelete - Array of field IDs to delete.
 * @returns {function} A ProseMirror command function.
 */
export const cleanUpListsWithAnnotations =
  (fieldsToDelete = []) =>
  ({ dispatch, tr, state }) => {
    if (!dispatch) return true;

    if (!Array.isArray(fieldsToDelete)) fieldsToDelete = [fieldsToDelete];
    const fieldsToDeleteSet = new Set(fieldsToDelete);
    const { doc } = state;
    const docxAnnotations = getAllFieldAnnotations(state) || [];

    const nodesToDelete = [];

    fieldsToDelete.forEach((fieldId) => {
      const matched = docxAnnotations.find((a) => a.node.attrs.fieldId === fieldId);
      if (!matched) return;

      // find the nearest paragraph-based list node
      const listItem = findParentNodeClosestToPos(doc.resolve(matched.pos), isParagraphList);
      if (!listItem) return;

      const { totalFieldAnnotations, deletableFieldAnnotations, hasOtherInlineContent } = summarizeListContent(
        listItem.node,
        fieldsToDeleteSet,
      );

      if (!totalFieldAnnotations) return;
      if (hasOtherInlineContent) return;
      if (totalFieldAnnotations !== deletableFieldAnnotations) return;

      // now “bubble up” as long as each parent has exactly one child
      let { pos, node, depth } = listItem;
      let $pos = doc.resolve(pos);

      while (depth > 0) {
        const parent = $pos.node(depth - 1);
        if (parent.childCount === 1) {
          // climb one level
          depth -= 1;
          pos = $pos.before(depth);
          node = parent;
          $pos = doc.resolve(pos);
        } else {
          break;
        }
      }

      // dedupe
      if (!nodesToDelete.some((n) => n.pos === pos)) {
        nodesToDelete.push({ pos, node });
      }
    });

    if (!nodesToDelete.length) return true;

    // delete from back to front
    nodesToDelete
      .sort((a, b) => b.pos - a.pos)
      .forEach(({ pos, node }) => {
        tr.delete(pos, pos + node.nodeSize);
      });

    // Ensure sync lists updates after this transaction
    tr.setMeta('updateListSync', true);
    return true;
  };
