import { Extension } from '@core/Extension.js';
import { Slice } from 'prosemirror-model';
import { Mapping, ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { v4 as uuidv4 } from 'uuid';
import { TrackDeleteMarkName, TrackInsertMarkName, TrackFormatMarkName } from './constants.js';
import { TrackChangesBasePlugin, TrackChangesBasePluginKey } from './plugins/index.js';
import { getTrackChanges } from './trackChangesHelpers/getTrackChanges.js';
import { markDeletion } from './trackChangesHelpers/markDeletion.js';
import { markInsertion } from './trackChangesHelpers/markInsertion.js';
import { collectTrackedChanges, isTrackedChangeActionAllowed } from './permission-helpers.js';
import { CommentsPluginKey } from '../comment/comments-plugin.js';
import { findMarkInRangeBySnapshot } from './trackChangesHelpers/markSnapshotHelpers.js';

export const TrackChanges = Extension.create({
  name: 'trackChanges',

  addCommands() {
    return {
      acceptTrackedChangesBetween:
        (from, to) =>
        ({ state, dispatch, editor }) => {
          const trackedChanges = collectTrackedChanges({ state, from, to });
          if (!isTrackedChangeActionAllowed({ editor, action: 'accept', trackedChanges })) return false;

          let { tr, doc } = state;

          // if (from === to) {
          //   to += 1;
          // }

          // tr.setMeta('acceptReject', true);
          tr.setMeta('inputType', 'acceptReject');

          const map = new Mapping();

          doc.nodesBetween(from, to, (node, pos) => {
            if (node.marks && node.marks.find((mark) => mark.type.name === TrackDeleteMarkName)) {
              const deletionStep = new ReplaceStep(
                map.map(Math.max(pos, from)),
                map.map(Math.min(pos + node.nodeSize, to)),
                Slice.empty,
              );

              tr.step(deletionStep);
              map.appendMap(deletionStep.getMap());
            } else if (node.marks && node.marks.find((mark) => mark.type.name === TrackInsertMarkName)) {
              const insertionMark = node.marks.find((mark) => mark.type.name === TrackInsertMarkName);

              tr.step(
                new RemoveMarkStep(
                  map.map(Math.max(pos, from)),
                  map.map(Math.min(pos + node.nodeSize, to)),
                  insertionMark,
                ),
              );
            } else if (node.marks && node.marks.find((mark) => mark.type.name === TrackFormatMarkName)) {
              const formatChangeMark = node.marks.find((mark) => mark.type.name === TrackFormatMarkName);

              tr.step(
                new RemoveMarkStep(
                  map.map(Math.max(pos, from)),
                  map.map(Math.min(pos + node.nodeSize, to)),
                  formatChangeMark,
                ),
              );
            }
          });

          if (tr.steps.length) {
            dispatch(tr);
          }

          return true;
        },

      rejectTrackedChangesBetween:
        (from, to) =>
        ({ state, dispatch, editor }) => {
          const trackedChanges = collectTrackedChanges({ state, from, to });
          if (!isTrackedChangeActionAllowed({ editor, action: 'reject', trackedChanges })) return false;

          const { tr, doc } = state;

          // tr.setMeta('acceptReject', true);
          tr.setMeta('inputType', 'acceptReject');

          const map = new Mapping();

          doc.nodesBetween(from, to, (node, pos) => {
            if (node.marks && node.marks.find((mark) => mark.type.name === TrackDeleteMarkName)) {
              const deletionMark = node.marks.find((mark) => mark.type.name === TrackDeleteMarkName);

              tr.step(
                new RemoveMarkStep(
                  map.map(Math.max(pos, from)),
                  map.map(Math.min(pos + node.nodeSize, to)),
                  deletionMark,
                ),
              );
            } else if (node.marks && node.marks.find((mark) => mark.type.name === TrackInsertMarkName)) {
              const deletionStep = new ReplaceStep(
                map.map(Math.max(pos, from)),
                map.map(Math.min(pos + node.nodeSize, to)),
                Slice.empty,
              );

              tr.step(deletionStep);
              map.appendMap(deletionStep.getMap());
            } else if (node.marks && node.marks.find((mark) => mark.type.name === TrackFormatMarkName)) {
              const formatChangeMark = node.marks.find((mark) => mark.type.name === TrackFormatMarkName);

              formatChangeMark.attrs.before.forEach((oldMark) => {
                tr.step(
                  new AddMarkStep(
                    map.map(Math.max(pos, from)),
                    map.map(Math.min(pos + node.nodeSize, to)),
                    state.schema.marks[oldMark.type].create(oldMark.attrs),
                  ),
                );
              });

              formatChangeMark.attrs.after.forEach((newMark) => {
                const mappedFrom = map.map(Math.max(pos, from));
                const mappedTo = map.map(Math.min(pos + node.nodeSize, to));
                const liveMark = findMarkInRangeBySnapshot({
                  doc: tr.doc,
                  from: mappedFrom,
                  to: mappedTo,
                  snapshot: newMark,
                });

                if (!liveMark) {
                  return;
                }

                tr.step(new RemoveMarkStep(mappedFrom, mappedTo, liveMark));
              });

              tr.step(
                new RemoveMarkStep(
                  map.map(Math.max(pos, from)),
                  map.map(Math.min(pos + node.nodeSize, to)),
                  formatChangeMark,
                ),
              );
            }
          });

          if (tr.steps.length) {
            dispatch(tr);
          }

          return true;
        },

      acceptTrackedChange:
        ({ trackedChange }) =>
        ({ commands }) => {
          const { start: from, end: to } = trackedChange;
          return commands.acceptTrackedChangesBetween(from, to);
        },

      acceptTrackedChangeBySelection:
        () =>
        ({ state, commands }) => {
          const { from, to } = state.selection;
          return commands.acceptTrackedChangesBetween(from, to);
        },

      acceptTrackedChangeFromToolbar:
        () =>
        ({ state, commands }) => {
          const commentsPluginState = CommentsPluginKey.getState(state);
          const activeThreadId = commentsPluginState?.activeThreadId;

          if (activeThreadId && commentsPluginState?.trackedChanges?.[activeThreadId]) {
            return commands.acceptTrackedChangeById(activeThreadId);
          } else {
            return commands.acceptTrackedChangeBySelection();
          }
        },

      acceptTrackedChangeById:
        (id) =>
        ({ state, tr, commands }) => {
          const toResolve = getChangesByIdToResolve(state, id) || [];

          return toResolve
            .map(({ from, to }) => {
              let mappedFrom = tr.mapping.map(from);
              let mappedTo = tr.mapping.map(to);
              return commands.acceptTrackedChangesBetween(mappedFrom, mappedTo);
            })
            .every((result) => result);
        },

      acceptAllTrackedChanges:
        () =>
        ({ state, commands }) => {
          const from = 0,
            to = state.doc.content.size;
          return commands.acceptTrackedChangesBetween(from, to);
        },

      rejectTrackedChangeById:
        (id) =>
        ({ state, tr, commands }) => {
          const toReject = getChangesByIdToResolve(state, id) || [];

          return toReject
            .map(({ from, to }) => {
              let mappedFrom = tr.mapping.map(from);
              let mappedTo = tr.mapping.map(to);
              return commands.rejectTrackedChangesBetween(mappedFrom, mappedTo);
            })
            .every((result) => result);
        },

      rejectTrackedChange:
        ({ trackedChange }) =>
        ({ commands }) => {
          const { start: from, end: to } = trackedChange;
          return commands.rejectTrackedChangesBetween(from, to);
        },

      rejectTrackedChangeOnSelection:
        () =>
        ({ state, commands }) => {
          const { from, to } = state.selection;
          return commands.rejectTrackedChangesBetween(from, to);
        },

      rejectTrackedChangeFromToolbar:
        () =>
        ({ state, commands }) => {
          const commentsPluginState = CommentsPluginKey.getState(state);
          const activeThreadId = commentsPluginState?.activeThreadId;

          if (activeThreadId && commentsPluginState?.trackedChanges?.[activeThreadId]) {
            return commands.rejectTrackedChangeById(activeThreadId);
          } else {
            return commands.rejectTrackedChangeOnSelection();
          }
        },

      rejectAllTrackedChanges:
        () =>
        ({ state, commands }) => {
          const from = 0,
            to = state.doc.content.size;
          return commands.rejectTrackedChangesBetween(from, to);
        },

      insertTrackedChange:
        (options = {}) =>
        ({ state, dispatch, editor }) => {
          const {
            from = state.selection.from,
            to = state.selection.to,
            text = '',
            id,
            user,
            comment,
            addToHistory = true,
            emitCommentEvent = true,
          } = options;

          // Validate bounds to prevent RangeError
          const docSize = state.doc.content.size;
          if (from < 0 || to > docSize || from > to) {
            console.warn('insertTrackedChange: invalid range', { from, to, docSize });
            return false;
          }

          // Check if there's actually a change to make
          const originalText = state.doc.textBetween(from, to, '', '');
          if (originalText === text) {
            return false;
          }

          if (!dispatch) {
            return true;
          }

          const resolvedUser = user ?? editor?.options?.user ?? {};

          // Warn if user info is missing - marks will have undefined author
          if (!resolvedUser.name && !resolvedUser.email) {
            console.warn('insertTrackedChange: no user name/email provided, track change will have undefined author');
          }
          const date = new Date().toISOString();
          const tr = state.tr;

          // Get marks from original position BEFORE any changes for format preservation
          const marks = state.doc.resolve(from).marks();

          // For replacements (both deletion and insertion), generate a shared ID upfront
          // so the deletion and insertion marks are linked together
          const isReplacement = from !== to && text;
          const sharedId = id ?? (isReplacement ? uuidv4() : null);

          let changeId = sharedId;
          let insertPos = to; // Default insert position is after the selection
          let deletionMark = null;
          let deletionNodes = [];

          // Step 1: Mark the original text as deleted (if there's text to delete)
          if (from !== to) {
            const result = markDeletion({
              tr,
              from,
              to,
              user: resolvedUser,
              date,
              id: sharedId,
            });
            deletionMark = result.deletionMark;
            deletionNodes = result.nodes || [];
            if (!changeId) {
              changeId = deletionMark.attrs.id;
            }
            // Map the insert position through the deletion mapping
            insertPos = result.deletionMap.map(to);
          }

          // Step 2: Insert the new text after the deleted content
          let insertedMark = null;
          let insertedNode = null;
          if (text) {
            insertedNode = state.schema.text(text, marks);
            tr.insert(insertPos, insertedNode);

            // Step 3: Mark the insertion
            const insertedFrom = insertPos;
            const insertedTo = insertPos + insertedNode.nodeSize;
            insertedMark = markInsertion({
              tr,
              from: insertedFrom,
              to: insertedTo,
              user: resolvedUser,
              date,
              id: sharedId,
            });

            if (!changeId) {
              changeId = insertedMark.attrs.id;
            }
          }

          // Store metadata for external consumers (pass full mark objects for comments plugin)
          // Create a mock step with slice for the comments plugin to extract nodes
          const mockStep = insertedNode
            ? {
                slice: { content: { content: [insertedNode] } },
              }
            : null;

          tr.setMeta(TrackChangesBasePluginKey, {
            insertedMark: insertedMark || null,
            deletionMark: deletionMark || null,
            deletionNodes,
            step: mockStep,
            emitCommentEvent,
          });
          tr.setMeta(CommentsPluginKey, { type: 'force' });
          tr.setMeta('skipTrackChanges', true);

          if (!addToHistory) {
            tr.setMeta('addToHistory', false);
          }

          dispatch(tr);

          // Handle comment if provided (guard for editors without comments extension)
          if (comment?.trim() && changeId && editor.commands.addCommentReply) {
            editor.commands.addCommentReply({
              parentId: changeId,
              content: comment,
              author: resolvedUser.name,
              authorEmail: resolvedUser.email,
              authorImage: resolvedUser.image,
            });
          }

          return true;
        },

      toggleTrackChanges:
        () =>
        ({ state }) => {
          const trackChangeState = TrackChangesBasePluginKey.getState(state);
          if (trackChangeState === undefined) return false;
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'TRACK_CHANGES_ENABLE',
            value: !trackChangeState.isTrackChangesActive,
          });
          return true;
        },

      enableTrackChanges:
        () =>
        ({ state }) => {
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'TRACK_CHANGES_ENABLE',
            value: true,
          });
          return true;
        },

      disableTrackChanges:
        () =>
        ({ state }) => {
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'TRACK_CHANGES_ENABLE',
            value: false,
          });
          return true;
        },

      toggleTrackChangesShowOriginal:
        () =>
        ({ state }) => {
          const trackChangeState = TrackChangesBasePluginKey.getState(state);
          if (trackChangeState === undefined) return false;
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'SHOW_ONLY_ORIGINAL',
            value: !trackChangeState.onlyOriginalShown,
          });
          return true;
        },

      enableTrackChangesShowOriginal:
        () =>
        ({ state }) => {
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'SHOW_ONLY_ORIGINAL',
            value: true,
          });
          return true;
        },

      disableTrackChangesShowOriginal:
        () =>
        ({ state }) => {
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'SHOW_ONLY_ORIGINAL',
            value: false,
          });
          return true;
        },

      toggleTrackChangesShowFinal:
        () =>
        ({ state }) => {
          const trackChangeState = TrackChangesBasePluginKey.getState(state);
          if (trackChangeState === undefined) return false;
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'SHOW_ONLY_MODIFIED',
            value: !trackChangeState.onlyModifiedShown,
          });
          return true;
        },

      enableTrackChangesShowFinal:
        () =>
        ({ state }) => {
          state.tr.setMeta(TrackChangesBasePluginKey, {
            type: 'SHOW_ONLY_MODIFIED',
            value: true,
          });
          return true;
        },
    };
  },

  addPmPlugins() {
    return [TrackChangesBasePlugin()];
  },
});

// For reference.
// const trackChangesCallback = (action, acceptedChanges, revertedChanges, editor) => {
//   const id = acceptedChanges.modifiers[0]?.id || revertedChanges.modifiers[0]?.id;
//   if (action === 'accept') {
//     editor.emit('trackedChangesUpdate', { action, id });
//   } else {
//     editor.emit('trackedChangesUpdate', { action, id });
//   }
// };

const getChangesByIdToResolve = (state, id) => {
  const trackedChanges = getTrackChanges(state);
  const changeIndex = trackedChanges.findIndex(({ mark }) => mark.attrs.id === id);
  if (changeIndex === -1) return;

  const matchingChange = trackedChanges[changeIndex];
  const matchingId = matchingChange.mark.attrs.id;

  const getSegmentSize = ({ from, to }) => to - from;
  const areDirectlyConnected = (left, right) => {
    if (!left || !right) {
      return false;
    }

    if (left.to !== right.from) {
      return false;
    }

    const hasContentBetween =
      state.doc.textBetween(left.from, right.to, '\n').length > getSegmentSize(left) + getSegmentSize(right);

    return !hasContentBetween;
  };

  const isComplementaryPair = (firstType, secondType) =>
    (firstType === TrackDeleteMarkName && secondType === TrackInsertMarkName) ||
    (firstType === TrackInsertMarkName && secondType === TrackDeleteMarkName);

  const linkedBefore = [];
  const linkedAfter = [];

  const collectDirection = (direction, collection) => {
    let currentIndex = changeIndex;
    let currentChange = matchingChange;

    while (true) {
      const neighborIndex = currentIndex + direction;
      const neighbor = trackedChanges[neighborIndex];

      if (!neighbor) {
        break;
      }

      const [left, right] = direction < 0 ? [neighbor, currentChange] : [currentChange, neighbor];
      const sharesId = neighbor.mark.attrs.id === matchingId;
      const complementary = isComplementaryPair(currentChange.mark.type.name, neighbor.mark.type.name);

      if (!sharesId && !areDirectlyConnected(left, right)) {
        break;
      }

      if (!sharesId && !complementary) {
        break;
      }

      collection.push(neighbor);

      currentIndex = neighborIndex;
      currentChange = neighbor;

      if (!sharesId) {
        break;
      }
    }
  };

  collectDirection(-1, linkedBefore);
  collectDirection(1, linkedAfter);

  return [matchingChange, ...linkedAfter, ...linkedBefore];
};
