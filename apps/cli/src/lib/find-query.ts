import { getNumberOption, getOptionalBooleanOption, getStringOption, resolveJsonInput, type ParsedArgs } from './args';
import { CliError } from './errors';
import { PRETTY_ROW_LIMIT, moreLine, padCol, safeNumber, toSingleLine, truncate } from './pretty-helpers';
import { validateQuery } from './validate';
import type { Query, QueryResult } from './types';

const FLAT_FIND_FLAGS = [
  'type',
  'node-type',
  'kind',
  'pattern',
  'mode',
  'case-sensitive',
  'limit',
  'offset',
  'include-nodes',
  'include-unknown',
];

function hasFlatFindFlags(parsed: ParsedArgs): boolean {
  return FLAT_FIND_FLAGS.some((flag) => parsed.options[flag] != null);
}

function buildFlatFindQueryDraft(parsed: ParsedArgs): unknown {
  const selectorType = getStringOption(parsed, 'type');
  if (!selectorType) {
    throw new CliError('MISSING_REQUIRED', 'find: missing required --type, or provide --query-json/--query-file.');
  }

  const includeNodesFlag = getOptionalBooleanOption(parsed, 'include-nodes');
  const includeNodes = typeof includeNodesFlag === 'boolean' ? includeNodesFlag : undefined;
  const includeUnknownFlag = getOptionalBooleanOption(parsed, 'include-unknown');
  const includeUnknown = typeof includeUnknownFlag === 'boolean' ? includeUnknownFlag : undefined;
  const caseSensitive = getOptionalBooleanOption(parsed, 'case-sensitive');

  if (selectorType === 'text') {
    return {
      select: {
        type: 'text',
        pattern: getStringOption(parsed, 'pattern'),
        mode: getStringOption(parsed, 'mode'),
        caseSensitive,
      },
      limit: getNumberOption(parsed, 'limit'),
      offset: getNumberOption(parsed, 'offset'),
      includeNodes,
      includeUnknown,
    };
  }

  if (selectorType === 'node') {
    return {
      select: {
        type: 'node',
        nodeType: getStringOption(parsed, 'node-type'),
        kind: getStringOption(parsed, 'kind'),
      },
      limit: getNumberOption(parsed, 'limit'),
      offset: getNumberOption(parsed, 'offset'),
      includeNodes,
      includeUnknown,
    };
  }

  const kind = getStringOption(parsed, 'kind');
  const select = kind
    ? {
        type: 'node',
        nodeType: selectorType,
        kind,
      }
    : {
        type: selectorType,
      };

  return {
    select,
    limit: getNumberOption(parsed, 'limit'),
    offset: getNumberOption(parsed, 'offset'),
    includeNodes,
    includeUnknown,
  };
}

export async function resolveFindQuery(parsed: ParsedArgs): Promise<Query> {
  // Canonical path: always execute against a normalized Query object.
  // Flat CLI flags are convenience syntax that is converted into Query here.
  const queryPayload = await resolveJsonInput(parsed, 'query');
  const withinPayload = await resolveJsonInput(parsed, 'within');

  if (queryPayload && hasFlatFindFlags(parsed)) {
    throw new CliError('INVALID_ARGUMENT', 'find: do not combine --query-* with flat selector flags.');
  }

  const queryDraft = queryPayload ?? buildFlatFindQueryDraft(parsed);
  const finalDraft =
    withinPayload == null
      ? queryDraft
      : {
          ...(queryDraft as Record<string, unknown>),
          within: withinPayload,
        };

  return validateQuery(finalDraft, 'query');
}

function resolveMatchLabel(match: QueryResult['matches'][number], maxTypeLength: number): string {
  const nodeId = match.kind === 'block' ? match.nodeId : 'inline';
  return `[${padCol(match.nodeType, maxTypeLength)} ${nodeId}]`;
}

function resolveNodeText(result: QueryResult, index: number): string | null {
  const snippet = result.context?.[index]?.snippet;
  if (typeof snippet === 'string' && snippet.length > 0) return snippet;

  const node = result.nodes?.[index];
  if (typeof node !== 'object' || node == null) return null;
  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string' && text.length > 0) return text;
  return null;
}

export function formatFindPretty(result: QueryResult, revision: number): string {
  const total = safeNumber(result.total, result.matches.length);
  const suffix = result.matches.length !== total ? ` (${total} total)` : '';
  const lines: string[] = [`Revision ${revision}: ${result.matches.length} matches${suffix}`];
  if (result.matches.length === 0) return lines[0];

  lines.push('');
  const shownCount = Math.min(result.matches.length, PRETTY_ROW_LIMIT);
  const shownMatches = result.matches.slice(0, shownCount);
  const maxTypeLength = Math.max(1, ...shownMatches.map((match) => match.nodeType.length));

  for (let index = 0; index < shownMatches.length; index += 1) {
    const label = resolveMatchLabel(shownMatches[index], maxTypeLength);
    const snippet = resolveNodeText(result, index);
    if (!snippet) {
      lines.push(label);
      continue;
    }
    lines.push(`${label}  "${truncate(toSingleLine(snippet), 50)}"`);
  }

  const remaining = moreLine(shownMatches.length, Math.max(total, result.matches.length));
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}
