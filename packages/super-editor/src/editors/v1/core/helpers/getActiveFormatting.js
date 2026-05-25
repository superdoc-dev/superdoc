import { getMarksFromSelection } from './getMarksFromSelection.js';
import { findMark } from './findMark.js';

/**
 * Result entry from `getActiveFormatting`. Discriminated union: the
 * synthetic `copyFormat` flag uses `attrs: true`; every other entry
 * carries a `Record<string, unknown>` attribute object.
 *
 * @typedef {{ name: 'copyFormat'; attrs: true }
 *           | { name: string; attrs: Record<string, unknown> }} ActiveFormattingEntry
 */

/**
 * Narrow structural editor shape consumed by `getActiveFormatting`.
 * Only `state` (PM EditorState) + `storage.formatCommands.storedStyle`
 * are needed. Avoids resurfacing SD-3240 debt through full Editor.
 *
 * @typedef {{
 *   state: import('prosemirror-state').EditorState;
 *   storage: { formatCommands?: { storedStyle?: unknown } };
 * }} ActiveFormattingEditorLike
 */

/**
 * Compute the active formatting at the current selection. SD-3213 /
 * SD-3245: typed signature replaces previous `(editor: any): any`.
 *
 * @param {ActiveFormattingEditorLike} editor
 * @returns {ActiveFormattingEntry[]}
 */
export function getActiveFormatting(editor) {
  const { state } = editor;
  const { selection } = state;

  const marks = selection.empty && state.storedMarks != null ? state.storedMarks : getMarksFromSelection(state, editor);
  const markAttrs = selection.$head.parent.attrs.marksAttrs;

  const marksToProcess = marks
    .filter((mark) => !['textStyle', 'link'].includes(mark.type.name))
    .map((mark) => ({ name: mark.type.name, attrs: mark.attrs }));

  const textStyleMarks = marks.filter((mark) => mark.type.name === 'textStyle');
  marksToProcess.push(...textStyleMarks.flatMap(unwrapTextMarks));

  // Empty paragraphs could have marks defined as attributes
  if (markAttrs) {
    const marksFromAttrs = markAttrs
      .filter((mark) => !['textStyle', 'link'].includes(mark.type))
      .map((mark) => ({ name: mark.type, attrs: mark.attrs || {} }));

    const textStyleMarksFromAttrs = markAttrs.filter((mark) => mark.type === 'textStyle');

    marksToProcess.push(...marksFromAttrs);
    marksToProcess.push(...textStyleMarksFromAttrs.flatMap(unwrapTextMarks));
  }

  const linkMarkType = state.schema.marks['link'];
  const linkMark = findMark(state, linkMarkType);

  if (linkMark) {
    let { from, to, attrs } = linkMark;

    if (selection.from >= from && selection.to <= to) {
      marksToProcess.push({ name: 'link', attrs });
    }
  }

  const ignoreKeys = ['paragraphSpacing'];
  const attributes = getActiveAttributes(state);
  Object.keys(attributes).forEach((key) => {
    if (ignoreKeys.includes(key)) return;
    const attrs = {};
    attrs[key] = attributes[key];
    marksToProcess.push({ name: key, attrs });
  });

  // For fieldAnnotation.
  const textColor = marksToProcess.find((i) => i.name === 'textColor');
  const textHightlight = marksToProcess.find((i) => i.name === 'textHighlight');

  if (textColor) {
    marksToProcess.push({
      name: 'color',
      attrs: { color: textColor.attrs?.textColor },
    });
  }
  if (textHightlight) {
    marksToProcess.push({
      name: 'highlight',
      attrs: { color: textHightlight.attrs?.textHighlight },
    });
  }

  const hasPendingFormatting = !!editor.storage.formatCommands?.storedStyle;
  if (hasPendingFormatting) marksToProcess.push({ name: 'copyFormat', attrs: true });

  return marksToProcess;
}

function unwrapTextMarks(textStyleMark) {
  const processedMarks = [];
  const { attrs } = textStyleMark;
  Object.keys(attrs).forEach((key) => {
    if (!attrs[key]) return;
    processedMarks.push({ name: key, attrs: { [key]: attrs[key] } });
  });
  return processedMarks;
}

function getActiveAttributes(state) {
  try {
    const { from, to, empty } = state.selection;
    const attributes = {};
    const getAttrs = (node) => {
      Object.keys(node.attrs).forEach((key) => {
        const value = node.attrs[key];
        if (value) {
          attributes[key] = value;
        }
      });
    };

    let start = from;
    let end = to;
    if (empty) state.doc.nodesBetween(start, end + 1, (node) => getAttrs(node));
    else state.doc.nodesBetween(from, to, (node) => getAttrs(node));
    return attributes;
  } catch {
    return {};
  }
}
