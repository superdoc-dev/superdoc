import { getNumberOption, getOptionalBooleanOption, getStringOption, resolveJsonInput, type ParsedArgs } from './args';
import { CliError } from './errors';
import { PRETTY_ROW_LIMIT, moreLine, padCol, safeNumber, toSingleLine, truncate } from './pretty-helpers';
import { validateQuery } from './validate';
import type { Query, FindOutput } from './types';

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
  // Three input styles are supported (mutually exclusive):
  //   1. --query-json   → full Query object (with `select` inside)
  //   2. --select-json  → selector object, wrapped into a Query here
  //   3. flat flags     → --type, --pattern, etc., built into a Query
  const queryPayload = await resolveJsonInput(parsed, 'query');
  const selectPayload = await resolveJsonInput(parsed, 'select');
  const withinPayload = await resolveJsonInput(parsed, 'within');
  const hasFlat = hasFlatFindFlags(parsed);
  const hasQueryPayload = queryPayload !== undefined;
  const hasSelectPayload = selectPayload !== undefined;

  const providedCount = [hasQueryPayload, hasSelectPayload, hasFlat].filter((value) => value).length;
  if (providedCount > 1) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'find: use only one of --query-json, --select-json, or flat selector flags (--type/--pattern).',
    );
  }

  let queryDraft: unknown;
  if (hasQueryPayload) {
    queryDraft = queryPayload;
  } else if (hasSelectPayload) {
    queryDraft = { select: selectPayload };
  } else {
    queryDraft = buildFlatFindQueryDraft(parsed);
  }

  const finalDraft =
    withinPayload == null
      ? queryDraft
      : {
          ...(queryDraft as Record<string, unknown>),
          within: withinPayload,
        };

  return validateQuery(finalDraft, 'query');
}

function resolveMatchLabel(address: FindOutput['items'][number]['address'], maxTypeLength: number): string {
  const nodeId = address.kind === 'block' ? address.nodeId : 'inline';
  return `[${padCol(address.nodeType, maxTypeLength)} ${nodeId}]`;
}

function resolveNodeText(item: FindOutput['items'][number]): string | null {
  const snippet = item.context?.snippet;
  if (typeof snippet === 'string' && snippet.length > 0) return snippet;

  const node = item.node;
  if (typeof node !== 'object' || node == null) return null;
  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string' && text.length > 0) return text;
  return null;
}

export function formatFindPretty(result: FindOutput, revision: number): string {
  const total = safeNumber(result.total, result.items.length);
  const suffix = result.items.length !== total ? ` (${total} total)` : '';
  const lines: string[] = [`Revision ${revision}: ${result.items.length} matches${suffix}`];
  if (result.items.length === 0) return lines[0];

  lines.push('');
  const shownCount = Math.min(result.items.length, PRETTY_ROW_LIMIT);
  const shownItems = result.items.slice(0, shownCount);
  const maxTypeLength = Math.max(1, ...shownItems.map((item) => item.address.nodeType.length));

  for (const item of shownItems) {
    const label = resolveMatchLabel(item.address, maxTypeLength);
    const snippet = resolveNodeText(item);
    if (!snippet) {
      lines.push(label);
      continue;
    }
    lines.push(`${label}  "${truncate(toSingleLine(snippet), 50)}"`);
  }

  const remaining = moreLine(shownItems.length, Math.max(total, result.items.length));
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}
