import { Fragment } from 'prosemirror-model';
import type {
  Fragment as ProseMirrorFragment,
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
  NodeType,
  Schema,
} from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

/**
 * Build a text-or-fragment suitable for insertion, splitting on '\t' and
 * inserting schema `tab` nodes at each split.
 *
 * Returns a plain text node when the schema has no `tab` node type, when the
 * parent disallows tab nodes (see {@link parentAllowsTabAt}), or when the text
 * contains no tab characters. The raw '\t' is preserved inside the text node
 * so exporters and readers still see the character.
 *
 * Callers are responsible for ensuring `text` is non-empty (ProseMirror's
 * `schema.text` throws on empty input).
 */
export function buildTextWithTabs(
  schema: Schema,
  text: string,
  marks: readonly ProseMirrorMark[] | undefined,
  opts: { parentAllowsTab?: boolean } = {},
): ProseMirrorNode | ProseMirrorFragment {
  // Check the cheapest/most selective predicate first — most calls carry no '\t'.
  if (!text.includes('\t')) return schema.text(text, marks);

  const tabNodeType = schema.nodes?.tab;
  if (!tabNodeType || opts.parentAllowsTab === false) return schema.text(text, marks);

  const tabMarks = (marks ?? null) as ProseMirrorMark[] | null;
  const parts = text.split('\t');
  const nodes: ProseMirrorNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) nodes.push(schema.text(parts[i], marks));
    // Carry the surrounding marks onto the tab node so the OOXML exporter
    // wraps `<w:tab/>` in a matching `<w:rPr>` — keeps formatting unbroken
    // across the tab (bold-run | tab | bold-run rather than bold | plain | bold).
    if (i < parts.length - 1) nodes.push(tabNodeType.create(null, null, tabMarks));
  }
  return Fragment.from(nodes);
}

/**
 * Check whether the parent node at `absPos` in `tr.doc` admits a node of
 * `nodeType` according to its content expression.
 *
 * Returns `true` when the parent cannot be probed (e.g. mocked test docs),
 * preserving pre-existing behavior for call sites that lack a full PM schema.
 */
export function parentAllowsNodeAt(tr: Transaction, absPos: number, nodeType: NodeType): boolean {
  const $pos = tr.doc.resolve(absPos);
  const contentMatch = $pos?.parent?.type?.contentMatch;
  if (!contentMatch || typeof contentMatch.matchType !== 'function') return true;
  return contentMatch.matchType(nodeType) != null;
}

/**
 * Tab-aware analogue of ProseMirror's `Node.textBetween`.
 *
 * The built-in `textBetween` cannot surface `tab` nodes because the tab node
 * schema defines `content: 'inline*'` (on purpose, to stop PM from auto-
 * inserting a separator after it during export), which means `isLeaf` is
 * `false` and any `leafText` callback is never invoked for tabs. This helper
 * walks the range directly, emitting a literal '\t' for every tab node so
 * reads round-trip with the input text.
 *
 * Non-tab inline leaves fall back to `leafFallback`, matching the placeholder
 * that the caller would have passed to `textBetween` (e.g. '' for plain text
 * extraction, '\ufffc' for offset-preserving reads, '\n' for get-text-adapter).
 */
export function textBetweenWithTabs(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  blockSeparator: string,
  leafFallback: string,
): string {
  // Defensive path for mocked docs: when `nodesBetween` isn't available, fall
  // back to the legacy `textBetween` semantics with no tab handling. Real PM
  // docs always expose `nodesBetween`, so only synthetic test shims hit this.
  const anyDoc = doc as unknown as {
    nodesBetween?: (from: number, to: number, cb: (node: any, pos: number) => any) => void;
    textBetween?: (from: number, to: number, blockSeparator: string, leafText: string) => string;
  };
  if (typeof anyDoc.nodesBetween !== 'function') {
    if (typeof anyDoc.textBetween === 'function') {
      return anyDoc.textBetween(from, to, blockSeparator, leafFallback);
    }
    return '';
  }

  let out = '';
  let emitted = false;
  const seenBlocks = new Set<number>();

  doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (pos >= to) return false;
    if (!node) return false;

    if (node.type?.name === 'tab') {
      out += '\t';
      emitted = true;
      return false;
    }
    if (node.isText) {
      const start = Math.max(from, pos) - pos;
      const end = Math.min(to, pos + node.nodeSize) - pos;
      // In real PM, node.text is always a string of length nodeSize. Some tests
      // mock text nodes without a `.text` property; fall back to a placeholder
      // of the correct length so downstream position math still matches.
      const text = typeof node.text === 'string' ? node.text : '\ufffc'.repeat(node.nodeSize);
      out += text.slice(start, end);
      emitted = true;
      return false;
    }
    if (node.isLeaf) {
      if (node.isInline) {
        // Honor PM's `leafText` NodeSpec contract: an inline leaf can declare
        // its visible text representation (e.g. noBreakHyphen → U+2011) so
        // flattened reads match the rendered glyph instead of producing the
        // generic placeholder. Falls back to `leafFallback` when undefined.
        const leafTextFn = node.type?.spec?.leafText;
        if (typeof leafTextFn === 'function') {
          out += leafTextFn(node);
        } else {
          out += leafFallback;
        }
        emitted = true;
      }
      return false;
    }
    if (node.isBlock && emitted && !seenBlocks.has(pos) && pos > from) {
      out += blockSeparator;
      seenBlocks.add(pos);
    }
    return true;
  });

  return out;
}
