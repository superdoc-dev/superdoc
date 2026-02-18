import type { Editor } from '../../core/Editor.js';
import type {
  MatchContext,
  NodeAddress,
  NodeType,
  Query,
  TextAddress,
  UnknownNodeDiagnostic,
} from '@superdoc/document-api';
import { toId } from '../helpers/value-utils.js';
import { getInlineIndex } from '../helpers/index-cache.js';
import {
  findBlockById,
  toBlockAddress,
  type BlockCandidate,
  type BlockIndex,
} from '../helpers/node-address-resolver.js';
import { findInlineByAnchor, isInlineQueryType } from '../helpers/inline-address-resolver.js';
import { findCandidateByPos } from '../helpers/adapter-utils.js';

/** Characters of document text to include before and after a match in snippet context. */
const SNIPPET_PADDING = 30;
const DUAL_KIND_TYPES = new Set<NodeType>(['sdt', 'image']);

const KNOWN_BLOCK_PM_NODE_TYPES = new Set<string>([
  'paragraph',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'structuredContentBlock',
  'sdt',
  'image',
]);

const KNOWN_INLINE_PM_NODE_TYPES = new Set<string>([
  'text',
  'run',
  'structuredContent',
  'image',
  'tab',
  'lineBreak',
  'hardBreak',
  'hard_break',
  'footnoteReference',
  'bookmarkStart',
  'bookmarkEnd',
  'commentRangeStart',
  'commentRangeEnd',
]);

function resolveUnknownBlockId(attrs: Record<string, unknown> | undefined): string | undefined {
  if (!attrs) return undefined;
  return toId(attrs.sdBlockId) ?? toId(attrs.paraId) ?? toId(attrs.blockId) ?? toId(attrs.id) ?? toId(attrs.uuid);
}

function isDualKindType(nodeType: NodeType | undefined): boolean {
  return Boolean(nodeType && DUAL_KIND_TYPES.has(nodeType));
}

function getAddressStartPos(editor: Editor, index: BlockIndex, address: NodeAddress): number {
  if (address.kind === 'block') {
    const block = findBlockById(index, address);
    return block?.pos ?? Number.MAX_SAFE_INTEGER;
  }

  const inlineIndex = getInlineIndex(editor);
  const inline = findInlineByAnchor(inlineIndex, address);
  return inline?.pos ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Builds a snippet context for a text match, including surrounding text and highlight offsets.
 *
 * @param editor - The editor instance.
 * @param address - The address of the block containing the match.
 * @param matchFrom - Absolute document position of the match start.
 * @param matchTo - Absolute document position of the match end.
 * @param textRanges - Optional block-relative text ranges for the match.
 * @returns A {@link MatchContext} with snippet, highlight range, and text ranges.
 */
export function buildTextContext(
  editor: Editor,
  address: NodeAddress,
  matchFrom: number,
  matchTo: number,
  textRanges?: TextAddress[],
): MatchContext {
  const docSize = editor.state.doc.content.size;
  const snippetFrom = Math.max(0, matchFrom - SNIPPET_PADDING);
  const snippetTo = Math.min(docSize, matchTo + SNIPPET_PADDING);
  const rawSnippet = editor.state.doc.textBetween(snippetFrom, snippetTo, ' ');
  const snippet = rawSnippet.replace(/ {2,}/g, ' ');

  const rawPrefix = editor.state.doc.textBetween(snippetFrom, matchFrom, ' ');
  const rawMatch = editor.state.doc.textBetween(matchFrom, matchTo, ' ');
  const prefix = rawPrefix.replace(/ {2,}/g, ' ');
  const matchNormalized = rawMatch.replace(/ {2,}/g, ' ');

  return {
    address,
    snippet,
    highlightRange: {
      start: prefix.length,
      end: prefix.length + matchNormalized.length,
    },
    textRanges: textRanges?.length ? textRanges : undefined,
  };
}

/**
 * Converts an absolute document range to a block-relative {@link TextAddress}.
 *
 * @param editor - The editor instance.
 * @param block - The block candidate containing the range.
 * @param range - Absolute document positions.
 * @returns A text address, or `undefined` if the range falls outside the block.
 */
export function toTextAddress(
  editor: Editor,
  block: BlockCandidate,
  range: { from: number; to: number },
): TextAddress | undefined {
  const blockStart = block.pos + 1;
  const blockEnd = block.end - 1;
  if (range.from < blockStart || range.to > blockEnd) return undefined;

  const start = editor.state.doc.textBetween(blockStart, range.from, '\n', '\ufffc').length;
  const end = editor.state.doc.textBetween(blockStart, range.to, '\n', '\ufffc').length;

  return {
    kind: 'text',
    blockId: block.nodeId,
    range: { start, end },
  };
}

/**
 * Returns `true` if the selector targets a node type that exists as both block and inline
 * and no explicit `kind` is specified, requiring a dual-kind query.
 *
 * @param select - The query selector.
 */
export function shouldQueryBothKinds(select: Query['select']): boolean {
  if (select.type === 'node') {
    return !select.kind && isDualKindType(select.nodeType);
  }
  return false;
}

/**
 * Sorts node addresses by their absolute document position (ascending).
 * Block addresses are ordered before inline addresses at the same position.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index for position lookup.
 * @param addresses - The addresses to sort.
 * @returns A new sorted array.
 */
export function sortAddressesByPosition(editor: Editor, index: BlockIndex, addresses: NodeAddress[]): NodeAddress[] {
  return [...addresses].sort((a, b) => {
    const aPos = getAddressStartPos(editor, index, a);
    const bPos = getAddressStartPos(editor, index, b);
    if (aPos !== bPos) return aPos - bPos;
    if (a.kind === b.kind) return 0;
    return a.kind === 'block' ? -1 : 1;
  });
}

/**
 * Walks the document and pushes diagnostics for block/inline nodes that are
 * not part of the stable Document API match set.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index (used to resolve containing blocks for inline nodes).
 * @param diagnostics - Mutable array to push diagnostics into.
 */
export function collectUnknownNodeDiagnostics(
  editor: Editor,
  index: BlockIndex,
  diagnostics: UnknownNodeDiagnostic[],
): void {
  editor.state.doc.descendants((node, pos) => {
    if (node.isBlock && !KNOWN_BLOCK_PM_NODE_TYPES.has(node.type.name)) {
      const blockId = resolveUnknownBlockId((node.attrs ?? {}) as Record<string, unknown>);
      diagnostics.push({
        message: `Unknown block node type "${node.type.name}" is not part of the stable Document API match set.`,
        hint: blockId
          ? `Skipped unknown block with stable id "${blockId}".`
          : 'Skipped unknown block with no stable id available.',
      });
      return;
    }

    if (node.isInline && !KNOWN_INLINE_PM_NODE_TYPES.has(node.type.name)) {
      const container = findCandidateByPos(index.candidates, pos);
      diagnostics.push({
        message: `Unknown inline node type "${node.type.name}" is not part of the stable Document API match set.`,
        address: container ? toBlockAddress(container) : undefined,
        hint: container
          ? `Skipped unknown inline node inside block "${container.nodeType}" with id "${container.nodeId}".`
          : 'Skipped unknown inline node outside resolvable block scope.',
      });
    }
  });
}

/**
 * Returns `true` if the selector exclusively targets inline nodes.
 *
 * @param select - The query selector.
 */
export function isInlineQuery(select: Query['select']): boolean {
  if (select.type === 'node') {
    if (select.kind) return select.kind === 'inline';
    return Boolean(select.nodeType && isInlineQueryType(select.nodeType));
  }
  return false;
}
