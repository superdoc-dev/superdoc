import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Remove the startOverride for the current list level so the counter continues
 * from where the previous list chain left off.
 *
 * `removeLvlOverride` mutates the numbering XML part. That mutation fires
 * `list-definitions-change` (which flips `numberingPlugin.forceFullRecompute`
 * on) and a `partChanged` event; `handleNumberingInvalidation` then dispatches
 * a fresh empty tr that lets `numberingPlugin.appendTransaction` rewrite the
 * affected `listRendering` attrs. That nested dispatch is the real work.
 *
 * After it runs, `editor.state.doc` has moved on. The tr CommandService
 * captured before the command ran still points at the old doc, so dispatching
 * it would throw "Applying a mismatched transaction" — flag it with
 * `preventDispatch` so CommandService skips the dispatch.
 *
 * In headless mode (no view) `handleNumberingInvalidation` is a silent no-op,
 * so the captured tr stays valid. We must let CommandService dispatch it,
 * otherwise `listRendering` never recomputes and `update`/`transaction`
 * listeners never fire even though the numbering XML did mutate.
 */
export const continueNumbering = ({ editor, tr, state }) => {
  const { node: paragraph } = findParentNode(isList)(state.selection) || {};
  if (!paragraph) return false;

  const { numId, ilvl = 0 } = getResolvedParagraphProperties(paragraph)?.numberingProperties || {};
  if (numId == null) return false;

  ListHelpers.removeLvlOverride(editor, numId, ilvl);
  if (editor.view) tr.setMeta('preventDispatch', true);
  return true;
};
