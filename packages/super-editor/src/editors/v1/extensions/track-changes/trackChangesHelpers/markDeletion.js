// @ts-check
import { Mapping, ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../constants.js';
import { findTrackedMarkBetween } from './findTrackedMarkBetween.js';

/**
 * Mark deletion.
 * @param {object} options Mark deletion options.
 * @param {import('prosemirror-state').Transaction} options.tr Transaction.
 * @param {number} options.from From position.
 * @param {number} options.to To position.
 * @param {import('../../../core/types/EditorConfig.js').User} options.user User object ({ name, email }).
 * @param {string} options.date Date.
 * @param {string} [options.id] Optional ID to use (for replace operations where insertion and deletion share the same ID).
 * @returns {{ deletionMark: import('prosemirror-model').Mark, deletionMap: Mapping, nodes: import('prosemirror-model').Node[] }} Deletion map and deletion mark.
 */
export const markDeletion = ({ tr, from, to, user, date, id: providedId }) => {
  /**
   * @param {unknown} value
   */
  const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  const userEmail = normalizeEmail(user?.email);
  /**
   * @param {import('prosemirror-model').Mark | null | undefined} mark
   */
  const isOwnInsertion = (mark) => {
    const authorEmail = normalizeEmail(mark?.attrs?.authorEmail);
    // Word imports often omit authorEmail, treat missing as "own" to allow deletion.
    if (!authorEmail || !userEmail) return true;
    return authorEmail === userEmail;
  };

  const trackedMark =
    /** @type {{ from: number, to: number, mark: import('prosemirror-model').Mark } | null | undefined} */ (
      findTrackedMarkBetween({
        tr,
        from,
        to,
        markName: TrackDeleteMarkName,
        attrs: { authorEmail: user.email || '' },
      })
    );

  let id;
  if (providedId) {
    // Use the provided ID (for replace operations)
    id = providedId;
  } else if (trackedMark) {
    id = trackedMark.mark.attrs.id;
  } else {
    id = uuidv4();
  }

  const deletionMark = tr.doc.type.schema.marks[TrackDeleteMarkName].create({
    id,
    author: user.name || '',
    authorEmail: user.email || '',
    authorImage: user.image || '',
    date,
  });

  const deletionMap = new Mapping();
  const shouldReassignExistingDeletions = Boolean(providedId);

  // Add deletion mark to inline nodes in range.
  // Behavior when replacing over existing tracked changes:
  // - Own insertions are removed (collapsed).
  // - Existing deletions are reassigned to the new deletion mark ID.
  // - Non-deleted inline nodes are marked as deleted.
  /** @type {import('prosemirror-model').Node[]} */
  let nodes = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name.includes('table')) {
      return;
    }

    // Skip inline containers (e.g. run), operate on leaf inline nodes only.
    if (!node.isInline || !node.isLeaf) {
      return;
    }

    const mappedFrom = deletionMap.map(Math.max(from, pos));
    const mappedTo = deletionMap.map(Math.min(to, pos + node.nodeSize));
    if (mappedFrom >= mappedTo) {
      return;
    }

    const insertMark = node.marks.find((mark) => mark.type.name === TrackInsertMarkName);
    const existingDeleteMarks = node.marks.filter((mark) => mark.type.name === TrackDeleteMarkName);

    if (insertMark && isOwnInsertion(insertMark)) {
      const removeStep = new ReplaceStep(mappedFrom, mappedTo, Slice.empty);
      if (!tr.maybeStep(removeStep).failed) {
        deletionMap.appendMap(removeStep.getMap());
      }
      return;
    }

    if (existingDeleteMarks.length > 0) {
      if (shouldReassignExistingDeletions) {
        nodes.push(node);
        existingDeleteMarks.forEach((existingDeleteMark) => {
          tr.removeMark(mappedFrom, mappedTo, existingDeleteMark);
        });
        tr.addMark(mappedFrom, mappedTo, deletionMark);
      }
      return;
    }

    nodes.push(node);
    tr.addMark(mappedFrom, mappedTo, deletionMark);
  });

  return { deletionMark, deletionMap, nodes };
};
