/**
 * Types for the `query.match` operation — deterministic matching with
 * strict cardinality semantics for mutation targeting and agent planning.
 */

import type { NodeAddress } from './base.js';
import type { TextAddress } from './address.js';
import type { TextSelector, NodeSelector } from './query.js';
import type { SetMarks } from './style-policy.types.js';

export type CardinalityRequirement = 'any' | 'first' | 'exactlyOne' | 'all';

export type RefStability = 'ephemeral' | 'stable';

export interface QueryMatchInput {
  select: TextSelector | NodeSelector;
  within?: NodeAddress;
  require?: CardinalityRequirement;
  includeNodes?: boolean;
  includeStyle?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Summary of inline marks active on a matched text range.
 * Returned when `includeStyle: true` is set on the query input.
 */
export interface MatchStyleSummary {
  /** Which core marks are active (true = present on majority of matched text). */
  marks: SetMarks;
  /** True when all runs in the matched range share the same mark set. */
  isUniform: boolean;
}

export interface MatchResult {
  address: NodeAddress;
  textRanges?: TextAddress[];
  ref?: string;
  refStability?: RefStability;
  /** Inline style summary for the matched range. Present when `includeStyle: true`. */
  style?: MatchStyleSummary;
}

export interface QueryMatchOutput {
  evaluatedRevision: string;
  matches: MatchResult[];
  totalMatches: number;
}
