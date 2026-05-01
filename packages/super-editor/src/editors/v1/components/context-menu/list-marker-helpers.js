import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Resolve the list item that the menu was opened over to the document-api
 * `ListItemAddress` shape required by `editor.doc.lists.*` calls.
 *
 * Mirrors the paragraph branch of `resolveBlockNodeId` in the doc-api: paraId
 * (preserved across DOCX round-trips) takes precedence over sdBlockId.
 *
 * @param {Object} context - Menu context containing `editor` and the click `pos`.
 * @returns {{ kind: 'block', nodeType: 'listItem', nodeId: string } | null}
 */
export function getListItemAddressFromContext(context) {
  const result = findListParagraphFromContext(context);
  if (!result) return null;
  const attrs = result.node.attrs ?? {};
  const nodeId = attrs.paraId ?? attrs.sdBlockId ?? null;
  if (!nodeId) return null;
  return { kind: 'block', nodeType: 'listItem', nodeId };
}

/**
 * Returns the resolved indent level (0-8) for the list item under the menu,
 * or null if the cursor isn't over a list paragraph.
 *
 * @param {Object} context - Menu context containing `editor` and the click `pos`.
 * @returns {number | null}
 */
export function getListItemLevelFromContext(context) {
  const result = findListParagraphFromContext(context);
  if (!result) return null;
  const props = getResolvedParagraphProperties(result.node)?.numberingProperties;
  return typeof props?.ilvl === 'number' ? props.ilvl : 0;
}

function findListParagraphFromContext(context) {
  const editor = context?.editor;
  const state = editor?.state;
  if (!state) return null;

  const selection = synthesizeSelection(state, context?.pos);
  if (!selection) return null;
  return findParentNode(isList)(selection) ?? null;
}

function synthesizeSelection(state, pos) {
  if (typeof pos === 'number' && Number.isFinite(pos)) {
    try {
      const $pos = state.doc.resolve(pos);
      return { $from: $pos, $to: $pos };
    } catch {
      // pos was out of range; fall through to live selection
    }
  }
  return state.selection ?? null;
}
