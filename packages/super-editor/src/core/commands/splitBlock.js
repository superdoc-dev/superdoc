import { NodeSelection, TextSelection } from 'prosemirror-state';
import { canSplit } from 'prosemirror-transform';
import { defaultBlockAt } from '../helpers/defaultBlockAt.js';
import { Attribute } from '../Attribute.js';

const isHeadingStyleId = (styleId) => typeof styleId === 'string' && /^heading\s*[1-6]$/i.test(styleId.trim());

const clearHeadingStyleId = (attrs) => {
  if (!attrs || typeof attrs !== 'object') return attrs;
  const paragraphProperties = attrs.paragraphProperties;
  const styleId = paragraphProperties?.styleId;
  if (!isHeadingStyleId(styleId)) return attrs;

  const nextParagraphProperties = { ...paragraphProperties };
  delete nextParagraphProperties.styleId;

  return {
    ...attrs,
    paragraphProperties: nextParagraphProperties,
  };
};

const ensureMarks = (state, splittableMarks) => {
  const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
  if (marks) {
    const filtered = marks.filter((m) => splittableMarks?.includes(m.type.name));
    state.tr.ensureMarks(filtered);
  }
};

/**
 * Will split the current node into two nodes. If the selection is not
 * splittable, the command will be ignored.
 * @param options.keepMarks Keep marks from prev node.
 *
 * The command is a slightly modified version of the original
 * `splitBlockAs` command to better manage attributes and marks.
 * https://github.com/ProseMirror/prosemirror-commands/blob/master/src/commands.ts#L357
 */
export const splitBlock =
  ({ keepMarks = true, attrsToRemoveOverride = [] } = {}) =>
  (props) => {
    const { tr, state, dispatch, editor } = props;
    const { selection, doc } = tr;
    const { $from, $to } = selection;

    const extensionAttrs = editor.extensionService.attributes;
    let newAttrs = Attribute.getSplittedAttributes(extensionAttrs, $from.node().type.name, $from.node().attrs);

    // Remove any overridden attributes
    if (attrsToRemoveOverride.length > 0) {
      newAttrs = deleteAttributes(newAttrs, attrsToRemoveOverride);
    }

    if (selection instanceof NodeSelection && selection.node.isBlock) {
      if (!$from.parentOffset || !canSplit(doc, $from.pos)) return false;
      if (dispatch) {
        if (keepMarks) ensureMarks(state, editor.extensionService.splittableMarks);
        tr.split($from.pos).scrollIntoView();
      }
      return true;
    }

    if (!$from.parent.isBlock) return false;

    if (dispatch) {
      const atEnd = $to.parentOffset === $to.parent.content.size;
      if (selection instanceof TextSelection) tr.deleteSelection();
      const deflt = $from.depth === 0 ? null : defaultBlockAt($from.node(-1).contentMatchAt($from.indexAfter(-1)));

      let types = atEnd && deflt ? [{ type: deflt, attrs: newAttrs }] : undefined;
      let can = canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);

      if (!types && !can && canSplit(tr.doc, tr.mapping.map($from.pos), 1, deflt ? [{ type: deflt }] : undefined)) {
        can = true;
        types = deflt ? [{ type: deflt, attrs: newAttrs }] : undefined;
      }

      if (can) {
        tr.split(tr.mapping.map($from.pos), 1, types);

        if (deflt && !atEnd && !$from.parentOffset) {
          const first = tr.mapping.map($from.before());
          const $first = tr.doc.resolve(first);
          const shouldChangeType = $from.parent.type !== deflt;
          const normalizedAttrs = clearHeadingStyleId($from.parent.attrs);
          const shouldNormalizeAttrs = normalizedAttrs !== $from.parent.attrs;

          if (
            $from.node(-1).canReplaceWith($first.index(), $first.index() + 1, deflt) &&
            (shouldChangeType || shouldNormalizeAttrs)
          ) {
            tr.setNodeMarkup(first, deflt, normalizedAttrs);
          }
        }
      }

      if (keepMarks) ensureMarks(state, editor.extensionService.splittableMarks);
      tr.scrollIntoView();
    }

    return true;
  };

function deleteAttributes(attrs, attrsToRemove) {
  let nextAttrs = { ...attrs };
  for (const attrName of attrsToRemove) {
    const parts = attrName.split('.');
    if (parts.length === 1) {
      delete nextAttrs[attrName];
      continue;
    }

    let source = nextAttrs;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (source == null || typeof source !== 'object') {
        source = null;
        break;
      }
      source = source[parts[i]];
    }

    if (source == null || typeof source !== 'object') continue;

    let target = nextAttrs;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      const value = target[key];
      target[key] = { ...value };
      target = target[key];
    }

    delete target[parts[parts.length - 1]];
  }
  return nextAttrs;
}
