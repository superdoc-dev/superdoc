import { Fragment } from 'prosemirror-model';
import type {
  Fragment as ProseMirrorFragment,
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
  NodeType,
  Schema,
} from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { TrackDeleteMarkName } from '../../extensions/track-changes/constants.js';

/**
 * Build a text-or-fragment suitable for insertion, splitting on '\t' and '\n'
 * and inserting schema `tab` / `lineBreak` nodes at each split.
 *
 * A tab split produces a `tab` node; a newline split produces a `lineBreak`
 * node. Each is only performed when the schema exposes the matching node type
 * (and, for tabs, when the parent admits them; see {@link parentAllowsNodeAt}).
 * A control character that cannot be materialized stays literal inside the
 * surrounding text node so exporters and readers still see it.
 *
 * Newlines must become `lineBreak` nodes (not raw '\n' inside a text node):
 * a literal newline inside `<w:t>` is whitespace that Word collapses on open
 * (it is not the OOXML representation of a line break), so it would drop the
 * visible break while SuperDoc still renders it. The `lineBreak` node
 * round-trips to a Word-native `<w:br/>`. See SD-3278.
 *
 * Returns a plain text node when the text contains no splittable control
 * character (the common case). Callers are responsible for ensuring `text` is
 * non-empty (ProseMirror's `schema.text` throws on empty input).
 */
export function buildTextWithTabs(
  schema: Schema,
  text: string,
  marks: readonly ProseMirrorMark[] | undefined,
  opts: { parentAllowsTab?: boolean; parentAllowsLineBreak?: boolean } = {},
): ProseMirrorNode | ProseMirrorFragment {
  // Normalize CRLF/CR to LF up front so Windows line endings (common in
  // generated/SDK text) are treated as line breaks too. Only allocate when a
  // carriage return is actually present.
  const normalized = text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;

  // Check the cheapest/most selective predicate first; most calls carry neither.
  const hasTab = normalized.includes('\t');
  const hasNewline = normalized.includes('\n');
  if (!hasTab && !hasNewline) return schema.text(normalized, marks);

  // `lineBreak` is a normal inline node, but some textblocks restrict their
  // content to `text*` (e.g. total-page-number) and reject it. Gate on parent
  // admission the same way tabs do: callers that target restrictive parents
  // pass the probe result; others default to allowed. When disallowed or absent
  // we fall back to literal text, and the export safety net still converts any
  // raw newline to `<w:br/>` on export.
  const tabNodeType = hasTab && opts.parentAllowsTab !== false ? schema.nodes?.tab : undefined;
  const lineBreakNodeType = hasNewline && opts.parentAllowsLineBreak !== false ? schema.nodes?.lineBreak : undefined;
  if (!tabNodeType && !lineBreakNodeType) return schema.text(normalized, marks);

  // `NodeType.create` takes `readonly Mark[] | undefined` (not null) for marks.
  const tabMarks: readonly ProseMirrorMark[] | undefined = marks ?? undefined;

  // Split only on the control characters we can replace with a node; any other
  // control character stays literal inside the surrounding text segments.
  const splitPattern = [tabNodeType ? '\\t' : null, lineBreakNodeType ? '\\n' : null].filter(Boolean).join('|');
  const parts = normalized.split(new RegExp(`(${splitPattern})`));

  const nodes: ProseMirrorNode[] = [];
  for (const part of parts) {
    if (part === '') continue; // schema.text throws on empty input
    if (part === '\t' && tabNodeType) {
      // Carry the surrounding marks onto the tab node so the OOXML exporter
      // wraps `<w:tab/>` in a matching `<w:rPr>`, keeping formatting unbroken
      // across the tab (bold-run | tab | bold-run rather than bold | plain | bold).
      nodes.push(tabNodeType.create(null, null, tabMarks));
    } else if (part === '\n' && lineBreakNodeType) {
      // Create the break bare: a soft line break carries no run formatting.
      // (Tracking an inserted break so it exports inside <w:ins> is a separate
      // concern: br-translator does not yet route node.marks the way
      // noBreakHyphen's translator does; see SD-3371. It is not a schema limit:
      // a leaf atom can carry marks, governed by the parent run/paragraph.)
      nodes.push(lineBreakNodeType.create());
    } else {
      nodes.push(schema.text(part, marks));
    }
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
  options: { textModel?: 'raw' | 'visible' } = {},
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
      if (
        options.textModel === 'visible' &&
        node.marks?.some((mark: ProseMirrorMark) => mark.type.name === TrackDeleteMarkName)
      ) {
        return false;
      }
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
        if (
          options.textModel === 'visible' &&
          node.marks?.some((mark: ProseMirrorMark) => mark.type.name === TrackDeleteMarkName)
        ) {
          return false;
        }
        // Honor PM's `leafText` NodeSpec contract: an inline leaf can declare
        // its visible text representation (e.g. noBreakHyphen -> U+2011) so
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
