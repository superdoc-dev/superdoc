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
  require: 'first' | 'exactlyOne' | 'all';
};

export type StepWhere = SelectWhere | RefWhere;

export type AssertWhere = {
  by: 'select';
  select: TextSelector | NodeSelector;
  within?: NodeAddress;
};

// ---------------------------------------------------------------------------
// Step types (first registered step family)
// ---------------------------------------------------------------------------

export type TextRewriteStep = {
  id: string;
  op: 'text.rewrite';
  where: SelectWhere;
  args: {
    replacement: { text: string };
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
  where: SelectWhere;
  args: Record<string, never>;
};

export type StyleApplyStep = {
  id: string;
  op: 'style.apply';
  where: SelectWhere;
  args: {
    marks: SetMarks;
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

export type StepEffect = 'changed' | 'noop' | 'assert_passed' | 'assert_failed';

export type TextStepResolution = {
  target: TextAddress;
  range: { from: number; to: number };
  text: string;
};

export type TextStepData = {
  domain: 'text';
  resolutions: TextStepResolution[];
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
