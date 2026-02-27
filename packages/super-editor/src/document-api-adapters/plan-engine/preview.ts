/**
 * Preview engine — evaluates a mutation plan on an ephemeral transaction
 * without dispatching it. Reports what would happen.
 *
 * Runs the full two-phase evaluation (compile + execute) on an ephemeral
 * transaction that is never dispatched.
 */

import type {
  MutationsPreviewInput,
  MutationsPreviewOutput,
  StepPreview,
  PreviewFailure,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { compilePlan } from './compiler.js';
import { runMutationsOnTransaction } from './executor.js';
import { planError, PlanError } from './errors.js';

export function previewPlan(editor: Editor, input: MutationsPreviewInput): MutationsPreviewOutput {
  const evaluatedRevision = getRevision(editor);

  // Revision guard
  checkRevision(editor, input.expectedRevision);

  if (!input.steps?.length) {
    throw planError('INVALID_INPUT', 'plan must contain at least one step');
  }

  const failures: PreviewFailure[] = [];
  const stepPreviews: StepPreview[] = [];
  let currentPhase: 'compile' | 'execute' = 'compile';

  try {
    // Phase 1: Compile — resolve selectors against pre-mutation snapshot
    const compiled = compilePlan(editor, input.steps);
    currentPhase = 'execute';

    // Phase 2: Execute on ephemeral transaction (never dispatched)
    const tr = editor.state.tr;

    // Run mutations without throwing on assert failure — collect failures instead
    const { stepOutcomes, assertFailures } = runMutationsOnTransaction(editor, tr, compiled, {
      throwOnAssertFailure: false,
    });

    // Build step previews from outcomes
    for (const outcome of stepOutcomes) {
      const preview: StepPreview = {
        stepId: outcome.stepId,
        op: outcome.op,
      };

      if (outcome.data && 'resolutions' in outcome.data && outcome.data.domain === 'text') {
        preview.resolutions = outcome.data.resolutions;
      }

      stepPreviews.push(preview);
    }

    // Report assert failures
    for (const failure of assertFailures) {
      failures.push({
        code: 'PRECONDITION_FAILED',
        stepId: failure.stepId,
        phase: 'assert',
        message: `assert "${failure.stepId}" expected ${failure.expectedCount} matches but found ${failure.actualCount}`,
        details: { expectedCount: failure.expectedCount, actualCount: failure.actualCount },
      });
    }

    // Transaction is discarded — never dispatched
  } catch (error) {
    if (error instanceof PlanError) {
      failures.push({
        code: error.code,
        stepId: error.stepId ?? '',
        phase: currentPhase,
        message: error.message,
        details: error.details,
      });
    } else {
      throw error;
    }
  }

  return {
    evaluatedRevision,
    steps: stepPreviews,
    valid: failures.length === 0,
    failures: failures.length > 0 ? failures : undefined,
  };
}
