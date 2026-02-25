/**
 * Built-in step executor registration — registers all core step executors
 * with the executor registry.
 *
 * Called once from adapter assembly to wire the dispatch table.
 *
 * Handles both single-block (range) and cross-block (span) targets via the
 * CompiledTarget discriminated union. Each target kind has its own executor
 * function; this module partitions targets and dispatches accordingly.
 */

import type {
  MutationStep,
  StepOutcome,
  StepEffect,
  TextStepData,
  TextStepResolution,
  SpanStepResolution,
  TextRewriteStep,
  TextInsertStep,
  TextDeleteStep,
  StyleApplyStep,
  DomainStepData,
} from '@superdoc/document-api';
import type {
  CompiledTarget,
  CompiledRangeTarget,
  CompiledSpanTarget,
  ExecuteContext,
} from './executor-registry.types.js';
import { registerStepExecutor } from './executor-registry.js';
import { planError } from './errors.js';
import {
  executeTextRewrite,
  executeTextInsert,
  executeTextDelete,
  executeStyleApply,
  executeSpanTextRewrite,
  executeSpanTextDelete,
  executeSpanStyleApply,
  executeCreateStep,
} from './executor.js';

// ---------------------------------------------------------------------------
// Target partitioning
// ---------------------------------------------------------------------------

function partitionTargets(targets: CompiledTarget[]): {
  range: CompiledRangeTarget[];
  span: CompiledSpanTarget[];
} {
  const range: CompiledRangeTarget[] = [];
  const span: CompiledSpanTarget[] = [];
  for (const t of targets) {
    if (t.kind === 'range') range.push(t);
    else span.push(t);
  }
  return { range, span };
}

// ---------------------------------------------------------------------------
// Resolution builders
// ---------------------------------------------------------------------------

function sortRangeTargets(targets: CompiledRangeTarget[]): CompiledRangeTarget[] {
  return [...targets].sort((a, b) => {
    if (a.blockId === b.blockId) return a.from - b.from;
    return a.absFrom - b.absFrom;
  });
}

function buildRangeResolution(target: CompiledRangeTarget): TextStepResolution {
  return {
    target: {
      kind: 'text',
      blockId: target.blockId,
      range: { start: target.from, end: target.to },
    },
    range: { from: target.from, to: target.to },
    text: target.text,
  };
}

function buildSpanResolution(target: CompiledSpanTarget): SpanStepResolution {
  return {
    targets: target.segments.map((seg) => ({
      kind: 'text' as const,
      blockId: seg.blockId,
      range: { start: seg.from, end: seg.to },
    })),
    matchId: target.matchId,
    text: target.text,
  };
}

// ---------------------------------------------------------------------------
// Unified step execution — dispatches range and span targets
// ---------------------------------------------------------------------------

type RangeExecutorFn = (
  editor: ExecuteContext['editor'],
  tr: ExecuteContext['tr'],
  target: CompiledRangeTarget,
  step: MutationStep,
  mapping: ExecuteContext['mapping'],
) => { changed: boolean };

type SpanExecutorFn = (
  editor: ExecuteContext['editor'],
  tr: ExecuteContext['tr'],
  target: CompiledSpanTarget,
  step: MutationStep,
  mapping: ExecuteContext['mapping'],
) => { changed: boolean };

function resolveDomainHandler(step: MutationStep): (() => boolean) | undefined {
  const maybeHandler = (step as Record<string, unknown>)._handler;
  return typeof maybeHandler === 'function' ? (maybeHandler as () => boolean) : undefined;
}

function executeTextStep(
  ctx: ExecuteContext,
  targets: CompiledTarget[],
  step: MutationStep,
  rangeExecutor: RangeExecutorFn,
  spanExecutor?: SpanExecutorFn,
): StepOutcome {
  const { range, span } = partitionTargets(targets);
  let overallChanged = false;
  const resolutions: TextStepResolution[] = [];
  const spanResolutions: SpanStepResolution[] = [];

  // Execute range targets in document order
  for (const target of sortRangeTargets(range)) {
    resolutions.push(buildRangeResolution(target));
    const { changed } = rangeExecutor(ctx.editor, ctx.tr, target, step, ctx.mapping);
    if (changed) overallChanged = true;
  }

  // Execute span targets
  for (const target of span) {
    spanResolutions.push(buildSpanResolution(target));
    if (!spanExecutor) {
      throw planError('INVALID_INPUT', `step op "${step.op}" does not support cross-block targets`, step.id);
    }
    const { changed } = spanExecutor(ctx.editor, ctx.tr, target, step, ctx.mapping);
    if (changed) overallChanged = true;
  }

  const effect: StepEffect = overallChanged ? 'changed' : 'noop';
  const data: TextStepData = {
    domain: 'text',
    resolutions,
    ...(spanResolutions.length > 0 ? { spanResolutions } : {}),
  };

  return { stepId: step.id, op: step.op, effect, matchCount: targets.length, data };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerBuiltInExecutors(): void {
  if (registered) return;
  registered = true;

  registerStepExecutor('text.rewrite', {
    execute: (ctx, targets, step) =>
      executeTextStep(
        ctx,
        targets,
        step,
        (e, tr, t, s, m) => executeTextRewrite(e, tr, t, s as TextRewriteStep, m),
        (e, tr, t, s, m) => executeSpanTextRewrite(e, tr, t, s as TextRewriteStep, m),
      ),
  });

  registerStepExecutor('text.insert', {
    execute: (ctx, targets, step) =>
      executeTextStep(ctx, targets, step, (e, tr, t, s, m) => executeTextInsert(e, tr, t, s as TextInsertStep, m)),
  });

  registerStepExecutor('text.delete', {
    execute: (ctx, targets, step) =>
      executeTextStep(
        ctx,
        targets,
        step,
        (e, tr, t, s, m) => executeTextDelete(e, tr, t, s as TextDeleteStep, m),
        (e, tr, t, s, m) => executeSpanTextDelete(e, tr, t, s as TextDeleteStep, m),
      ),
  });

  registerStepExecutor('format.apply', {
    execute: (ctx, targets, step) =>
      executeTextStep(
        ctx,
        targets,
        step,
        (e, tr, t, s, m) => executeStyleApply(e, tr, t, s as StyleApplyStep, m),
        (e, tr, t, s, m) => executeSpanStyleApply(e, tr, t, s as StyleApplyStep, m),
      ),
  });

  registerStepExecutor('create.paragraph', {
    execute: (ctx, targets, step) => executeCreateStep(ctx.editor, ctx.tr, step, targets, ctx.mapping),
  });

  registerStepExecutor('create.heading', {
    execute: (ctx, targets, step) => executeCreateStep(ctx.editor, ctx.tr, step, targets, ctx.mapping),
  });

  registerStepExecutor('domain.command', {
    execute(ctx, _targets, step) {
      const handler = resolveDomainHandler(step);
      if (!handler) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop',
          matchCount: 0,
          data: { domain: 'command', commandDispatched: false },
        };
      }
      const success = handler();
      if (success) ctx.commandDispatched = true;
      const effect: StepEffect = success ? 'changed' : 'noop';
      const data: DomainStepData = { domain: 'command', commandDispatched: success };
      return {
        stepId: step.id,
        op: step.op,
        effect,
        matchCount: success ? 1 : 0,
        data,
      };
    },
  });
}
