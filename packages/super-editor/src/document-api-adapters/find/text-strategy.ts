import type { Editor } from '../../core/Editor.js';
import type {
  MatchContext,
  NodeAddress,
  Query,
  QueryResult,
  TextAddress,
  TextSelector,
  UnknownNodeDiagnostic,
} from '@superdoc/document-api';
import {
  findBlockByPos,
  isTextBlockCandidate,
  toBlockAddress,
  type BlockCandidate,
  type BlockIndex,
} from '../helpers/node-address-resolver.js';
import { addDiagnostic, findCandidateByPos, paginate, resolveWithinScope } from '../helpers/adapter-utils.js';
import { buildTextContext, toTextAddress } from './common.js';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand } from '../helpers/mutation-helpers.js';

/** Shape returned by `editor.commands.search`. */
type SearchMatch = {
  from: number;
  to: number;
  text: string;
  ranges?: Array<{ from: number; to: number }>;
};

function compileRegex(selector: TextSelector, diagnostics: UnknownNodeDiagnostic[]): RegExp | null {
  const flags = selector.caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(selector.pattern, flags);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    addDiagnostic(diagnostics, `Invalid text query regex: ${reason}`);
    return null;
  }
}

function buildSearchPattern(selector: TextSelector, diagnostics: UnknownNodeDiagnostic[]): RegExp | null {
  const mode = selector.mode ?? 'contains';
  if (mode === 'regex') {
    return compileRegex(selector, diagnostics);
  }
  // Compile as an escaped RegExp to guarantee literal matching. Passing a raw
  // string can be reinterpreted by the search command (e.g. slash-delimited
  // strings like "/foo/" are parsed as regex syntax by some implementations).
  const escaped = selector.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = selector.caseSensitive ? 'g' : 'gi';
  return new RegExp(escaped, flags);
}

/**
 * Executes a text-based search query using the editor's search command.
 *
 * @param editor - The editor instance (must expose `commands.search`).
 * @param index - Pre-built block index for position resolution.
 * @param query - The query with a text selector.
 * @param diagnostics - Mutable array to collect diagnostics into.
 * @returns Paginated query result with block matches and snippet context.
 * @throws {DocumentApiAdapterError} If the editor's search command is unavailable.
 */
export function executeTextSelector(
  editor: Editor,
  index: BlockIndex,
  query: Query,
  diagnostics: UnknownNodeDiagnostic[],
): QueryResult {
  if (query.select.type !== 'text') {
    addDiagnostic(diagnostics, `Text strategy received a non-text selector (type="${query.select.type}").`);
    return { matches: [], total: 0 };
  }

  const selector: TextSelector = query.select;
  if (!selector.pattern.length) {
    addDiagnostic(diagnostics, 'Text query pattern must be non-empty.');
    return { matches: [], total: 0 };
  }

  const scope = resolveWithinScope(index, query, diagnostics);
  if (!scope.ok) return { matches: [], total: 0 };

  const pattern = buildSearchPattern(selector, diagnostics);
  if (!pattern) return { matches: [], total: 0 };

  const search = requireEditorCommand(editor.commands?.search, 'find (search)');

  const rawResult = search(pattern, {
    highlight: false,
    caseSensitive: selector.caseSensitive ?? false,
    maxMatches: Infinity,
  });

  if (!Array.isArray(rawResult)) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'Editor search command returned an unexpected result format.',
    );
  }
  const allMatches = rawResult as SearchMatch[];

  const scopeRange = scope.range;
  const matches = scopeRange
    ? allMatches.filter((m) => m.from >= scopeRange.start && m.to <= scopeRange.end)
    : allMatches;

  const textBlocks = index.candidates.filter(isTextBlockCandidate);
  const contexts: MatchContext[] = [];
  const addresses: NodeAddress[] = [];

  for (const match of matches) {
    const ranges = match.ranges?.length ? match.ranges : [{ from: match.from, to: match.to }];
    let source: BlockCandidate | undefined;
    const textRanges = ranges
      .map((range) => {
        const block = findCandidateByPos(textBlocks, range.from);
        if (!block) return undefined;
        if (!source) source = block;
        return toTextAddress(editor, block, range);
      })
      .filter((range): range is TextAddress => Boolean(range));

    if (!source) {
      source = findCandidateByPos(textBlocks, match.from) ?? findBlockByPos(index, match.from);
    }
    if (!source) continue;

    const address = toBlockAddress(source);
    addresses.push(address);
    contexts.push(buildTextContext(editor, address, match.from, match.to, textRanges));
  }

  const paged = paginate(addresses, query.offset, query.limit);
  const pagedContexts = paginate(contexts, query.offset, query.limit).items;

  return {
    matches: paged.items,
    total: paged.total,
    context: pagedContexts.length ? pagedContexts : undefined,
  };
}
