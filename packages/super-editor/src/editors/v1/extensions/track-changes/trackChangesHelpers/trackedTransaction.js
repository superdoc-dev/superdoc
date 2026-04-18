import { Mapping, ReplaceStep, AddMarkStep, RemoveMarkStep, ReplaceAroundStep } from 'prosemirror-transform';
import { TextSelection } from 'prosemirror-state';
import { Fragment, Slice } from 'prosemirror-model';
import { ySyncPluginKey } from 'y-prosemirror';
import { replaceStep } from './replaceStep.js';
import { addMarkStep } from './addMarkStep.js';
import { removeMarkStep } from './removeMarkStep.js';
import { replaceAroundStep } from './replaceAroundStep.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { findMark } from '@core/helpers/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';

const COMPOSITION_INPUT_TYPES = new Set(['insertCompositionText', 'deleteCompositionText']);
const COMBINING_MARK_REGEX = /^\p{Mark}$/u;
const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const DEAD_KEY_PLACEHOLDER_MARKS = new Map([
  ['`', '\u0300'],
  ["'", '\u0301'],
  ['´', '\u0301'],
  ['^', '\u0302'],
  ['~', '\u0303'],
  ['¨', '\u0308'],
]);

const getTextNodeAtPos = ({ doc, pos }) => {
  let found = null;

  doc.nodesBetween(Math.max(0, pos - 1), Math.min(doc.content.size, pos + 1), (node, nodePos) => {
    if (found || !node.isText || !node.text) {
      return;
    }

    const from = nodePos;
    const to = nodePos + node.text.length;
    if (pos >= from && pos < to) {
      found = { node, from };
      return false;
    }
  });

  return found;
};

const getFirstGrapheme = (text) => {
  if (!text) {
    return '';
  }

  if (graphemeSegmenter) {
    const iterator = graphemeSegmenter.segment(text)[Symbol.iterator]();
    return iterator.next().value?.segment ?? '';
  }

  const chars = Array.from(text);
  if (!chars.length) {
    return '';
  }

  const grapheme = [chars[0]];
  for (let index = 1; index < chars.length; index += 1) {
    if (!COMBINING_MARK_REGEX.test(chars[index])) {
      break;
    }
    grapheme.push(chars[index]);
  }

  return grapheme.join('');
};

const startsWithCompatibleGrapheme = ({ text, combiningMark }) => {
  const firstGrapheme = getFirstGrapheme(text);
  return Boolean(firstGrapheme) && firstGrapheme.normalize('NFD').includes(combiningMark);
};

const getOwnedDeadKeyPlaceholderInfoAt = ({ doc, pos, user }) => {
  const placeholderChar = doc.textBetween(pos, pos + 1);
  const combiningMark = DEAD_KEY_PLACEHOLDER_MARKS.get(placeholderChar);
  if (!combiningMark) {
    return null;
  }

  const textNodeAtPos = getTextNodeAtPos({ doc, pos });
  const hasOwnTrackedInsert = textNodeAtPos?.node?.marks?.some(
    (mark) => mark.type.name === TrackInsertMarkName && mark.attrs?.authorEmail === user.email,
  );

  return hasOwnTrackedInsert ? { placeholderChar, combiningMark, textNodeAtPos } : null;
};

const getOwnedDeadKeyPlaceholderAt = ({ doc, pos, user, insertedText }) => {
  const placeholder = getOwnedDeadKeyPlaceholderInfoAt({ doc, pos, user });
  if (!placeholder || !startsWithCompatibleGrapheme({ text: insertedText, combiningMark: placeholder.combiningMark })) {
    return null;
  }

  return placeholder;
};

const getLeadingDeadKeyPlaceholderNormalization = (text) => {
  const [placeholderChar] = Array.from(text);
  if (!placeholderChar) {
    return null;
  }

  const combiningMark = DEAD_KEY_PLACEHOLDER_MARKS.get(placeholderChar);
  if (!combiningMark) {
    return null;
  }

  const normalizedText = text.slice(placeholderChar.length);
  if (!normalizedText || !startsWithCompatibleGrapheme({ text: normalizedText, combiningMark })) {
    return null;
  }

  return { placeholderChar, combiningMark, normalizedText };
};

const createNormalizedSlice = ({ step, normalizedText, doc }) => {
  const { schema } = doc.type;
  const firstChild = step.slice.content.firstChild;
  if (!firstChild) {
    return null;
  }

  if (firstChild.isText) {
    return new Slice(
      Fragment.from(schema.text(normalizedText, firstChild.marks)),
      step.slice.openStart,
      step.slice.openEnd,
    );
  }

  if (firstChild.childCount === 1 && firstChild.firstChild?.isText) {
    const textChild = firstChild.firstChild;
    const normalizedFirstChild = firstChild.copy(Fragment.from(schema.text(normalizedText, textChild.marks)));
    return new Slice(Fragment.from(normalizedFirstChild), step.slice.openStart, step.slice.openEnd);
  }

  return null;
};

const isCompositionTransaction = (tr) =>
  tr.getMeta('composition') !== undefined || COMPOSITION_INPUT_TYPES.has(tr.getMeta('inputType'));

const getCandidatePlaceholderPositions = ({ step, pendingDeadKeyPlaceholder, isReplacement }) => {
  if (pendingDeadKeyPlaceholder?.pos !== undefined) {
    return [pendingDeadKeyPlaceholder.pos, pendingDeadKeyPlaceholder.pos - 1, pendingDeadKeyPlaceholder.pos + 1];
  }

  return isReplacement ? [step.from] : [step.from, step.from - 1];
};

const findCompatibleOwnedDeadKeyPlaceholder = ({ doc, positions, user, insertedText }) => {
  for (const pos of positions) {
    if (pos < 1 || pos >= doc.content.size) {
      continue;
    }

    const placeholder = getOwnedDeadKeyPlaceholderAt({ doc, pos, user, insertedText });
    if (placeholder) {
      return { ...placeholder, pos };
    }
  }

  return null;
};

const foldCollapsedPlaceholderInsertion = ({ step, doc, user, insertedText, pendingDeadKeyPlaceholder }) => {
  const placeholder = findCompatibleOwnedDeadKeyPlaceholder({
    doc,
    positions: getCandidatePlaceholderPositions({ step, pendingDeadKeyPlaceholder, isReplacement: false }),
    user,
    insertedText,
  });

  if (!placeholder) {
    return null;
  }

  try {
    const candidate = new ReplaceStep(placeholder.pos, placeholder.pos + 1, step.slice, step.structure);
    if (!candidate.apply(doc).failed) {
      return candidate;
    }
  } catch {
    // Ignore invalid normalization attempts and keep the original step.
  }

  return null;
};

const getInsertedText = (step) => step.slice.content.textBetween(0, step.slice.content.size);

const normalizeCompositionInsertStep = ({ step, doc, tr, user, pendingDeadKeyPlaceholder }) => {
  if (!(step instanceof ReplaceStep)) {
    return step;
  }

  const insertedText = getInsertedText(step);
  if (!insertedText) {
    return step;
  }

  const hasCompositionContext = isCompositionTransaction(tr) || Boolean(pendingDeadKeyPlaceholder);
  const leadingPlaceholderNormalization = hasCompositionContext
    ? getLeadingDeadKeyPlaceholderNormalization(insertedText)
    : null;

  if (leadingPlaceholderNormalization) {
    const { normalizedText } = leadingPlaceholderNormalization;
    const normalizedSlice = createNormalizedSlice({ step, normalizedText, doc });

    if (normalizedSlice) {
      const placeholder = findCompatibleOwnedDeadKeyPlaceholder({
        doc,
        positions: getCandidatePlaceholderPositions({
          step,
          pendingDeadKeyPlaceholder,
          isReplacement: step.from !== step.to,
        }),
        user,
        insertedText: normalizedText,
      });

      if (placeholder) {
        try {
          const candidate =
            step.from !== step.to
              ? new ReplaceStep(step.from, step.to, normalizedSlice, step.structure)
              : new ReplaceStep(placeholder.pos, placeholder.pos + 1, normalizedSlice, step.structure);
          if (!candidate.apply(doc).failed) {
            return candidate;
          }
        } catch {
          // Ignore invalid normalization attempts and keep the original step.
        }
      }
    }
  }

  if (step.from === step.to && hasCompositionContext) {
    const folded = foldCollapsedPlaceholderInsertion({
      step,
      doc,
      user,
      insertedText,
      pendingDeadKeyPlaceholder,
    });

    if (folded) {
      return folded;
    }
  }
  return step;
};

const mergeTrackChangesMeta = (tr, extraMeta) => {
  const existingMeta = tr.getMeta(TrackChangesBasePluginKey) || {};
  tr.setMeta(TrackChangesBasePluginKey, { ...existingMeta, ...extraMeta });
};

const getPendingDeadKeyPlaceholder = ({ tr, newTr, user }) => {
  if (!isCompositionTransaction(tr) || tr.steps.length !== 1) {
    return null;
  }

  const [originalStep] = tr.steps;
  if (!(originalStep instanceof ReplaceStep) || originalStep.from !== originalStep.to) {
    return null;
  }

  const insertedText = getInsertedText(originalStep);
  if (!DEAD_KEY_PLACEHOLDER_MARKS.has(insertedText)) {
    return null;
  }

  const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);
  const anchorPos = typeof trackMeta?.insertedTo === 'number' ? trackMeta.insertedTo : newTr.selection.from;
  const matches = [];

  newTr.doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(insertedText)) {
      return;
    }

    for (let index = 0; index < node.text.length; index += 1) {
      if (node.text[index] === insertedText) {
        matches.push(pos + index);
      }
    }
  });

  const pos = matches.sort((left, right) => Math.abs(left - anchorPos) - Math.abs(right - anchorPos))[0];
  if (pos === undefined) {
    return null;
  }

  return {
    pos,
    placeholderChar: insertedText,
    authorEmail: user.email,
  };
};

/**
 * Tracked transaction to track changes.
 * @param {{ tr: import('prosemirror-state').Transaction; state: import('prosemirror-state').EditorState; user: import('@core/types/EditorConfig.js').User }} params
 * @returns {import('prosemirror-state').Transaction} Modified transaction.
 */
export const trackedTransaction = ({ tr, state, user }) => {
  const onlyInputTypeMeta = ['inputType', 'uiEvent', 'paste', 'pointer', 'composition'];
  const notAllowedMeta = ['historyUndo', 'historyRedo', 'acceptReject'];
  const isProgrammaticInput = tr.getMeta('inputType') === 'programmatic';
  const ySyncMeta = tr.getMeta(ySyncPluginKey);
  const pendingDeadKeyPlaceholder = TrackChangesBasePluginKey.getState(state)?.pendingDeadKeyPlaceholder ?? null;
  const allowedMeta = new Set([...onlyInputTypeMeta, ySyncPluginKey.key, 'forceTrackChanges']);
  const hasDisallowedMeta = tr.meta && Object.keys(tr.meta).some((meta) => !allowedMeta.has(meta));

  if (
    ySyncMeta?.isChangeOrigin || // Skip Yjs-origin transactions (remote/rehydration).
    !tr.steps.length ||
    (hasDisallowedMeta && !isProgrammaticInput) ||
    notAllowedMeta.includes(tr.getMeta('inputType')) ||
    tr.getMeta(CommentsPluginKey) // Skip if it's a comment transaction.
  ) {
    if (pendingDeadKeyPlaceholder && !isCompositionTransaction(tr)) {
      mergeTrackChangesMeta(tr, { pendingDeadKeyPlaceholder: null });
    }
    return tr;
  }

  const newTr = state.tr;
  const map = new Mapping();
  const fixedTimeTo10Mins = Math.floor(Date.now() / 600000) * 600000;
  const date = new Date(fixedTimeTo10Mins).toISOString();

  tr.steps.forEach((originalStep, originalStepIndex) => {
    const { doc } = newTr;
    let step = originalStep.map(map);

    if (!step) {
      return;
    }

    step = normalizeCompositionInsertStep({ step, doc, tr, user, pendingDeadKeyPlaceholder });

    if (step instanceof ReplaceStep) {
      replaceStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
        originalStep,
        originalStepIndex,
      });
    } else if (step instanceof AddMarkStep) {
      addMarkStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
      });
    } else if (step instanceof RemoveMarkStep) {
      removeMarkStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
      });
    } else if (step instanceof ReplaceAroundStep) {
      replaceAroundStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
        originalStep,
        originalStepIndex,
      });
    } else {
      // Non-structural steps (AttrStep, SetNodeMarkupStep) are typically
      // metadata updates from plugins (e.g. listRendering, sdBlockRev).
      // These are safe to apply without tracking.
      newTr.step(step);
    }
  });

  if (tr.getMeta('inputType')) {
    newTr.setMeta('inputType', tr.getMeta('inputType'));
  }

  if (tr.getMeta('uiEvent')) {
    newTr.setMeta('uiEvent', tr.getMeta('uiEvent'));
  }

  if (tr.getMeta('composition') !== undefined) {
    newTr.setMeta('composition', tr.getMeta('composition'));
  }

  if (tr.getMeta('addToHistory') !== undefined) {
    newTr.setMeta('addToHistory', tr.getMeta('addToHistory'));
  }

  mergeTrackChangesMeta(newTr, {
    pendingDeadKeyPlaceholder: getPendingDeadKeyPlaceholder({ tr, newTr, user }),
  });

  // Get the track changes meta to check if we have an adjusted insertion position (SD-1624).
  const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);

  // selectionPos is an explicit cursor override from tracked change handlers (e.g.
  // replaceAroundStep converting a structural step to a character deletion). It must
  // be honored regardless of tr.selectionSet, because the original transaction may
  // not have set a selection (e.g. ReplaceAroundStep transactions).
  if (trackMeta?.selectionPos !== undefined && trackMeta?.selectionPos !== null) {
    const boundedPos = Math.max(0, Math.min(trackMeta.selectionPos, newTr.doc.content.size));
    const $pos = newTr.doc.resolve(boundedPos);
    if ($pos.parent.inlineContent) {
      newTr.setSelection(TextSelection.create(newTr.doc, boundedPos));
    } else {
      newTr.setSelection(TextSelection.near($pos, -1));
    }
  } else if (tr.selectionSet) {
    if (
      tr.selection instanceof TextSelection &&
      (tr.selection.from < state.selection.from || tr.getMeta('inputType') === 'deleteContentBackward')
    ) {
      const caretPos = map.map(tr.selection.from, -1);
      newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
    } else if (trackMeta?.insertedTo !== undefined) {
      const boundedInsertedTo = Math.max(0, Math.min(trackMeta.insertedTo, newTr.doc.content.size));
      const $insertPos = newTr.doc.resolve(boundedInsertedTo);
      // Near is used here because its safer than an exact position
      // exact is not guaranteed to be a valid cursor position
      newTr.setSelection(TextSelection.near($insertPos, 1));
    } else {
      const deletionMarkSchema = state.schema.marks[TrackDeleteMarkName];
      const deletionMark = findMark(state, deletionMarkSchema, false);

      if (tr.selection.from > state.selection.from && deletionMark) {
        const caretPos = map.map(deletionMark.to + 1, 1);
        newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
      } else {
        newTr.setSelection(tr.selection.map(newTr.doc, map));
      }
    }
  } else if (state.selection.from - tr.selection.from > 1 && tr.selection.$head.depth > 1) {
    const caretPos = map.map(tr.selection.from - 2, -1);
    newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
  }

  if (tr.storedMarksSet) {
    newTr.setStoredMarks(tr.storedMarks);
  }

  if (tr.scrolledIntoView) {
    newTr.scrollIntoView();
  }

  return newTr;
};
