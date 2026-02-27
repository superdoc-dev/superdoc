/**
 * query.match adapter — deterministic matching with cardinality contracts.
 *
 * Reuses the same search infrastructure as `find` but applies strict
 * cardinality rules and returns mutation-ready refs.
 */

import type {
  QueryMatchInput,
  QueryMatchOutput,
  MatchResult,
  MatchStyleSummary,
  CardinalityRequirement,
  TextAddress,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { findAdapter } from '../find-adapter.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { captureRunsInRange, type CapturedStyle } from './style-resolver.js';
import { getRevision } from './revision-tracker.js';
import { planError } from './errors.js';

// ---------------------------------------------------------------------------
// Style introspection helpers
// ---------------------------------------------------------------------------

const CORE_MARK_NAMES = ['bold', 'italic', 'underline', 'strike'] as const;

/**
 * Builds a MatchStyleSummary from captured style data.
 * Reports each core mark as true if it appears on the majority of characters.
 */
export function buildStyleSummary(captured: CapturedStyle): MatchStyleSummary {
  const totalChars = captured.runs.reduce((sum, r) => sum + r.charCount, 0);
  const marks: Record<string, boolean> = {};

  for (const markName of CORE_MARK_NAMES) {
    let activeChars = 0;
    for (const run of captured.runs) {
      if (run.marks.some((m) => m.type.name === markName)) {
        activeChars += run.charCount;
      }
    }
    // Only include mark if it's active on any character
    if (activeChars > 0) {
      marks[markName] = totalChars > 0 && activeChars > totalChars / 2;
    }
  }

  return { marks, isUniform: captured.isUniform };
}

/**
 * Captures style for a match's text ranges and produces a summary.
 */
function captureMatchStyle(editor: Editor, textRanges: TextAddress[]): MatchStyleSummary | undefined {
  if (!textRanges.length) return undefined;

  const index = getBlockIndex(editor);

  // Merge captured runs across all ranges in the match
  const allRuns: CapturedStyle['runs'] = [];
  let allUniform = true;

  for (const range of textRanges) {
    const candidate = index.candidates.find((c) => c.nodeId === range.blockId);
    if (!candidate) continue;

    const captured = captureRunsInRange(editor, candidate.pos, range.range.start, range.range.end);
    allRuns.push(...captured.runs);
    if (!captured.isUniform) allUniform = false;
  }

  // Check cross-range uniformity using full mark equality (attrs + eq)
  if (allUniform && allRuns.length > 1) {
    const ref = allRuns[0].marks;
    for (let i = 1; i < allRuns.length; i++) {
      const cur = allRuns[i].marks;
      if (ref.length !== cur.length || !ref.every((m, j) => cur[j] && m.eq(cur[j]))) {
        allUniform = false;
        break;
      }
    }
  }

  return buildStyleSummary({ runs: allRuns, isUniform: allUniform });
}

// ---------------------------------------------------------------------------

export function queryMatchAdapter(editor: Editor, input: QueryMatchInput): QueryMatchOutput {
  const evaluatedRevision = getRevision(editor);
  const require: CardinalityRequirement = input.require ?? 'any';

  // Validate pagination + cardinality interaction
  if ((require === 'first' || require === 'exactlyOne') && (input.limit !== undefined || input.offset !== undefined)) {
    throw planError('INVALID_INPUT', `limit/offset are not valid when require is "${require}"`);
  }

  // Execute search using the find adapter infrastructure
  const query = {
    select: input.select,
    within: input.within,
    includeNodes: input.includeNodes,
    limit: input.limit,
    offset: input.offset,
  };

  const result = findAdapter(editor, query);
  const totalMatches = result.total;

  // Apply cardinality checks
  if (require === 'first') {
    if (totalMatches === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges');
    }
  } else if (require === 'exactlyOne') {
    if (totalMatches === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges');
    }
    if (totalMatches > 1) {
      throw planError('AMBIGUOUS_MATCH', `selector matched ${totalMatches} ranges, expected exactly one`, undefined, {
        matchCount: totalMatches,
      });
    }
  } else if (require === 'all') {
    if (totalMatches === 0) {
      throw planError('MATCH_NOT_FOUND', 'selector matched zero ranges');
    }
  }

  // Build match results
  const matchResults: MatchResult[] = result.matches.map((address, idx) => {
    const matchResult: MatchResult = { address };

    // Include text ranges from context
    const ctx = result.context?.[idx];
    if (ctx?.textRanges?.length) {
      matchResult.textRanges = ctx.textRanges;
    }

    // Include style summary when requested
    if (input.includeStyle && matchResult.textRanges?.length) {
      matchResult.style = captureMatchStyle(editor, matchResult.textRanges);
    }

    // Generate mutation-ready ref
    if (input.select.type === 'text') {
      // Text refs are ephemeral (revision-scoped)
      const refData = {
        rev: evaluatedRevision,
        addr: address,
        ranges: ctx?.textRanges,
      };
      matchResult.ref = `text:${btoa(JSON.stringify(refData))}`;
      matchResult.refStability = 'ephemeral';
    } else {
      // Entity/structural refs are stable
      if (address.kind === 'block') {
        matchResult.ref = address.nodeId;
        matchResult.refStability = 'stable';
      }
    }

    return matchResult;
  });

  // Apply cardinality truncation for 'first'
  const truncated = require === 'first' ? matchResults.slice(0, 1) : matchResults;

  return {
    evaluatedRevision,
    matches: truncated,
    totalMatches,
  };
}
