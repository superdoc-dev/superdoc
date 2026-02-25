/**
 * Mutation plan types — core input model for the plan engine.
 *
 * All mutating behavior executes through `mutations.apply`. Every operation
 * that changes document state is a step dispatched by the plan engine.
 */

import type { NodeAddress } from './base.js';
import type { TextAddress, TrackedChangeAddress } from './address.js';
import type { TextSelector, NodeSelector } from './query.js';
import type { InsertStylePolicy, StylePolicy, SetMarks } from './style-policy.types.js';

// ---------------------------------------------------------------------------
// Universal targeting model
// ---------------------------------------------------------------------------

export type SelectWhere = {
  by: 'select';
  select: TextSelector | NodeSelector;
  within?: NodeAddress;
  require: 'first' | 'exactlyOne' | 'all';
};

export type RefWhere = {
  by: 'ref';
  ref: string;
  within?: NodeAddress;
  /**
   * Legacy field — kept for backward compatibility during migration.
   * Only `'exactlyOne'` is accepted; other values fail with INVALID_INPUT.
   * A ref already identifies one logical target, so cardinality is implicit.
   * @deprecated Will be removed in the next major contract version.
   */
  require?: 'exactlyOne';
};

export type StepWhere = SelectWhere | RefWhere;

export type AssertWhere = {
  by: 'select';
  select: TextSelector | NodeSelector;
  within?: NodeAddress;
};

// ---------------------------------------------------------------------------
// Replacement content model
// ---------------------------------------------------------------------------

/**
 * A single replacement block for structured multi-paragraph replacements.
 * In this workstream, per-block inline style overrides are not supported;
 * step-level `style` policy applies uniformly to all replacement blocks.
 */
export type ReplacementBlock = {
  text: string;
};

/**
 * Replacement payload for text.rewrite steps.
 *
 * - `{ text }` — flat string. For single-block (range) targets, used as-is.
 *   For cross-block (span) targets, normalized via deterministic paragraph
 *   boundary detection (\n\n+).
 * - `{ blocks }` — structured multi-paragraph payload, authoritative when provided.
 *   Use this for explicit control over paragraph structure.
 *
 * Exactly one of `text` or `blocks` must be provided.
 */
export type ReplacementPayload =
  | { text: string; blocks?: undefined }
  | { text?: undefined; blocks: ReplacementBlock[] };

// ---------------------------------------------------------------------------
// Step types (first registered step family)
// ---------------------------------------------------------------------------

export type TextRewriteStep = {
  id: string;
  op: 'text.rewrite';
  where: StepWhere;
  args: {
    replacement: ReplacementPayload;
    /**
     * Style policy for the replacement text.
     * When omitted, defaults to preserve mode:
     *   inline: { mode: 'preserve', onNonUniform: 'majority' }
     *   paragraph: { mode: 'preserve' }
     */
    style?: StylePolicy;
  };
};

export type TextInsertStep = {
  id: string;
  op: 'text.insert';
  where: {
    by: 'select';
    select: TextSelector | NodeSelector;
    within?: NodeAddress;
    require: 'first' | 'exactlyOne';
  };
  args: {
    position: 'before' | 'after';
    content: { text: string };
    style?: InsertStylePolicy;
  };
};

export type TextDeleteStep = {
  id: string;
  op: 'text.delete';
  where: StepWhere;
  args: Record<string, never>;
};

export type StyleApplyStep = {
  id: string;
  op: 'format.apply';
  where: StepWhere;
  args: {
    inline: SetMarks;
  };
};

export type AssertStep = {
  id: string;
  op: 'assert';
  where: AssertWhere;
  args: {
    expectCount: number;
  };
};

export type DomainStep = {
  id: string;
  op: string;
  where: StepWhere;
  args: Record<string, unknown>;
};

export type MutationStep = TextRewriteStep | TextInsertStep | TextDeleteStep | StyleApplyStep | AssertStep | DomainStep;

// ---------------------------------------------------------------------------
// Plan input
// ---------------------------------------------------------------------------

export type ChangeMode = 'direct' | 'tracked';

export type MutationsApplyInput = {
  expectedRevision: string;
  atomic: true;
  changeMode: ChangeMode;
  steps: MutationStep[];
};

export type MutationsPreviewInput = {
  expectedRevision: string;
  atomic: true;
  changeMode: ChangeMode;
  steps: MutationStep[];
};

// ---------------------------------------------------------------------------
// Plan output — receipts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------

/** Maximum number of steps per mutation plan. */
export const MAX_PLAN_STEPS = 200;

/** Maximum total resolved targets across all steps in a plan. */
export const MAX_PLAN_RESOLVED_TARGETS = 500;

// ---------------------------------------------------------------------------
// Plan output — receipts
// ---------------------------------------------------------------------------

export type StepEffect = 'changed' | 'noop' | 'assert_passed' | 'assert_failed';

/** Resolution for a single-block (range) target. */
export type TextStepResolution = {
  target: TextAddress;
  range: { from: number; to: number };
  text: string;
};

/** Resolution for a cross-block (span) target. */
export type SpanStepResolution = {
  targets: TextAddress[];
  matchId: string;
  text: string;
};

export type TextStepData = {
  domain: 'text';
  resolutions: TextStepResolution[];
  spanResolutions?: SpanStepResolution[];
};

export type AssertStepData = {
  domain: 'assert';
  expectedCount: number;
  actualCount: number;
};

export type DomainStepData = { domain: 'command'; commandDispatched: boolean };

export type StepOutcomeData = TextStepData | AssertStepData | DomainStepData;

export type StepOutcome = {
  stepId: string;
  op: string;
  effect: StepEffect;
  matchCount: number;
  trackedChangeIds?: string[];
  data: StepOutcomeData;
};

export type PlanReceipt = {
  success: true;
  revision: {
    before: string;
    after: string;
  };
  steps: StepOutcome[];
  trackedChanges?: TrackedChangeAddress[];
  timing: {
    totalMs: number;
  };
};

// ---------------------------------------------------------------------------
// Preview output
// ---------------------------------------------------------------------------

export type PreviewFailurePhase = 'compile' | 'execute' | 'assert';

export type PreviewFailure = {
  code: string;
  stepId: string;
  phase: PreviewFailurePhase;
  message: string;
  details?: unknown;
};

export type StepPreview = {
  stepId: string;
  op: string;
  resolutions?: TextStepResolution[];
  spanResolutions?: SpanStepResolution[];
  style?: unknown;
};

export type MutationsPreviewOutput = {
  evaluatedRevision: string;
  steps: StepPreview[];
  valid: boolean;
  failures?: PreviewFailure[];
};

// ---------------------------------------------------------------------------
// Plan execution error
// ---------------------------------------------------------------------------

export type PlanExecutionError = {
  code: string;
  message: string;
  stepId?: string;
  details?: unknown;
};

// ---------------------------------------------------------------------------
// Revision guard options
// ---------------------------------------------------------------------------

export type RevisionGuardOptions = {
  expectedRevision?: string;
};

export type MutationOptions = RevisionGuardOptions & {
  changeMode?: ChangeMode;
  dryRun?: boolean;
};
