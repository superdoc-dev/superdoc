/**
 * Built-in step executor registration — registers all core step executors
 * with the executor registry.
 *
 * Called once from adapter assembly to wire the dispatch table.
 */

import type {
  MutationStep,
  StepOutcome,
  StepEffect,
  TextStepData,
  TextStepResolution,
  TextRewriteStep,
  TextInsertStep,
  TextDeleteStep,
  StyleApplyStep,
  DomainStepData,
} from '@superdoc/document-api';
import type { CompiledTarget, ExecuteContext } from './executor-registry.types.js';
import { registerStepExecutor } from './executor-registry.js';
import {
  executeTextRewrite,
  executeTextInsert,
  executeTextDelete,
  executeStyleApply,
  executeCreateStep,
} from './executor.js';

// ---------------------------------------------------------------------------
// Shared helpers for target iteration
// ---------------------------------------------------------------------------

function sortTargetsByPosition(targets: CompiledTarget[]): CompiledTarget[] {
  return [...targets].sort((a, b) => {
    if (a.blockId === b.blockId) return a.from - b.from;
    return a.blockId < b.blockId ? -1 : 1;
  });
}

function buildTextResolution(target: CompiledTarget): TextStepResolution {
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

function executeWithTargetIteration(
  ctx: ExecuteContext,
  targets: CompiledTarget[],
  step: MutationStep,
  executeFn: (editor: any, tr: any, target: CompiledTarget, step: any, mapping: any) => { changed: boolean },
): StepOutcome {
  const sortedTargets = sortTargetsByPosition(targets);
  let overallChanged = false;
  const resolutions: TextStepResolution[] = [];

  for (const target of sortedTargets) {
    resolutions.push(buildTextResolution(target));
    const { changed } = executeFn(ctx.editor, ctx.tr, target, step, ctx.mapping);
    if (changed) overallChanged = true;
  }

  const effect: StepEffect = overallChanged ? 'changed' : 'noop';
  const data: TextStepData = { domain: 'text', resolutions };
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
      executeWithTargetIteration(ctx, targets, step, (e, tr, t, s, m) =>
        executeTextRewrite(e, tr, t, s as TextRewriteStep, m),
      ),
  });

  registerStepExecutor('text.insert', {
    execute: (ctx, targets, step) =>
      executeWithTargetIteration(ctx, targets, step, (e, tr, t, s, m) =>
        executeTextInsert(e, tr, t, s as TextInsertStep, m),
      ),
  });

  registerStepExecutor('text.delete', {
    execute: (ctx, targets, step) =>
      executeWithTargetIteration(ctx, targets, step, (e, tr, t, s, m) =>
        executeTextDelete(e, tr, t, s as TextDeleteStep, m),
      ),
  });

  registerStepExecutor('style.apply', {
    execute: (ctx, targets, step) =>
      executeWithTargetIteration(ctx, targets, step, (e, tr, t, s, m) =>
        executeStyleApply(e, tr, t, s as StyleApplyStep, m),
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
      const handler = (step as any)._handler as (() => boolean) | undefined;
      if (!handler) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: 0,
          data: { domain: 'command', commandDispatched: false } as DomainStepData,
        };
      }
      const success = handler();
      if (success) ctx.commandDispatched = true;
      return {
        stepId: step.id,
        op: step.op,
        effect: (success ? 'changed' : 'noop') as StepEffect,
        matchCount: success ? 1 : 0,
        data: { domain: 'command', commandDispatched: success } as DomainStepData,
      };
    },
  });
}
