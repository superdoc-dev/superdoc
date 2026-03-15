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
  SelectionStepResolution,
  TextRewriteStep,
  TextInsertStep,
  TextDeleteStep,
  StyleApplyStep,
  StructuralInsertStep,
  StructuralReplaceStep,
  StructuralStepData,
  DomainStepData,
  TableStepData,
  TableMutationResult,
  MutationOptions,
} from '@superdoc/document-api';
import type {
  CompiledTarget,
  CompiledRangeTarget,
  CompiledSpanTarget,
  CompiledSelectionTarget,
  ExecuteContext,
} from './executor-registry.types.js';
import { registerStepExecutor } from './executor-registry.js';
import { planError } from './errors.js';

/** Safely extract blockId from a target (only present on range targets). */
function targetBlockId(t: CompiledTarget | undefined): string {
  return t?.kind === 'range' ? t.blockId : '';
}
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
import { executeStructuralInsert, executeStructuralReplace } from '../structural-write-engine/index.js';
import {
  tablesDeleteAdapter,
  tablesClearContentsAdapter,
  tablesMoveAdapter,
  tablesSetLayoutAdapter,
  tablesSetAltTextAdapter,
  tablesConvertFromTextAdapter,
  tablesSplitAdapter,
  tablesConvertToTextAdapter,
  tablesInsertRowAdapter,
  tablesDeleteRowAdapter,
  tablesSetRowHeightAdapter,
  tablesDistributeRowsAdapter,
  tablesSetRowOptionsAdapter,
  tablesInsertColumnAdapter,
  tablesDeleteColumnAdapter,
  tablesSetColumnWidthAdapter,
  tablesDistributeColumnsAdapter,
  tablesInsertCellAdapter,
  tablesDeleteCellAdapter,
  tablesMergeCellsAdapter,
  tablesUnmergeCellsAdapter,
  tablesSplitCellAdapter,
  tablesSetCellPropertiesAdapter,
  tablesSortAdapter,
  tablesSetStyleAdapter,
  tablesClearStyleAdapter,
  tablesSetStyleOptionAdapter,
  tablesSetBorderAdapter,
  tablesClearBorderAdapter,
  tablesApplyBorderPresetAdapter,
  tablesSetShadingAdapter,
  tablesClearShadingAdapter,
  tablesSetTablePaddingAdapter,
  tablesSetCellPaddingAdapter,
  tablesSetCellSpacingAdapter,
  tablesClearCellSpacingAdapter,
  createTableAdapter,
} from '../tables-adapter.js';

// ---------------------------------------------------------------------------
// Target partitioning
// ---------------------------------------------------------------------------

/**
 * Converts a CompiledSelectionTarget to a CompiledRangeTarget for executor
 * dispatch. Range executors only use absFrom/absTo for PM operations.
 */
function selectionTargetToRange(t: CompiledSelectionTarget): CompiledRangeTarget {
  const startPoint = t.normalizedTarget.start;
  const endPoint = t.normalizedTarget.end;

  // Derive a real blockId from the nearest text point so fallback lookups
  // (e.g. style capture in resolveMarksForRange) never hit a synthetic id.
  const blockId =
    startPoint.kind === 'text' ? startPoint.blockId : endPoint.kind === 'text' ? endPoint.blockId : '__selection__';

  return {
    kind: 'range',
    stepId: t.stepId,
    op: t.op,
    blockId,
    from: 0,
    to: t.absTo - t.absFrom,
    absFrom: t.absFrom,
    absTo: t.absTo,
    text: t.text,
    marks: [],
    capturedStyle: t.capturedStyle,
  };
}

function partitionTargets(targets: CompiledTarget[]): {
  range: CompiledRangeTarget[];
  span: CompiledSpanTarget[];
  selection: CompiledSelectionTarget[];
} {
  const range: CompiledRangeTarget[] = [];
  const span: CompiledSpanTarget[] = [];
  const selection: CompiledSelectionTarget[] = [];
  for (const t of targets) {
    if (t.kind === 'range') range.push(t);
    else if (t.kind === 'selection') selection.push(t);
    else span.push(t);
  }
  return { range, span, selection };
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

function buildSelectionResolution(target: CompiledSelectionTarget): SelectionStepResolution {
  return {
    selectionTarget: target.normalizedTarget,
    range: { from: target.absFrom, to: target.absTo },
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
  const { range, span, selection } = partitionTargets(targets);
  let overallChanged = false;
  const resolutions: TextStepResolution[] = [];
  const spanResolutions: SpanStepResolution[] = [];
  const selectionResolutions: SelectionStepResolution[] = [];

  // Execute range targets in document order
  for (const target of sortRangeTargets(range)) {
    resolutions.push(buildRangeResolution(target));
    const { changed } = rangeExecutor(ctx.editor, ctx.tr, target, step, ctx.mapping);
    if (changed) overallChanged = true;
  }

  // Execute selection targets — convert to range for the executor, but
  // produce proper SelectionStepResolution instead of bogus TextStepResolution.
  for (const selTarget of selection) {
    selectionResolutions.push(buildSelectionResolution(selTarget));
    const rangeTarget = selectionTargetToRange(selTarget);
    const { changed } = rangeExecutor(ctx.editor, ctx.tr, rangeTarget, step, ctx.mapping);
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
    ...(selectionResolutions.length > 0 ? { selectionResolutions } : {}),
  };

  return { stepId: step.id, op: step.op, effect, matchCount: targets.length, data };
}

// ---------------------------------------------------------------------------
// Table adapter dispatch — enables mutations.apply with raw step args
// ---------------------------------------------------------------------------

/**
 * Maps table step op names to their adapter functions. Used when a table
 * step arrives through mutations.apply (no _handler closure) and the
 * executor needs to construct the adapter call from targets + args.
 */
const TABLE_ADAPTER_DISPATCH: Record<
  string,
  (editor: ExecuteContext['editor'], input: any, options?: MutationOptions) => TableMutationResult
> = {
  'tables.delete': (e, i, o) => tablesDeleteAdapter(e, i, o),
  'tables.clearContents': (e, i, o) => tablesClearContentsAdapter(e, i, o),
  'tables.move': (e, i, o) => tablesMoveAdapter(e, i, o),
  'tables.split': (e, i, o) => tablesSplitAdapter(e, i, o),
  'tables.convertFromText': (e, i, o) => tablesConvertFromTextAdapter(e, i, o),
  'tables.convertToText': (e, i, o) => tablesConvertToTextAdapter(e, i, o),
  'tables.setLayout': (e, i, o) => tablesSetLayoutAdapter(e, i, o),
  'tables.insertRow': (e, i, o) => tablesInsertRowAdapter(e, i, o),
  'tables.deleteRow': (e, i, o) => tablesDeleteRowAdapter(e, i, o),
  'tables.setRowHeight': (e, i, o) => tablesSetRowHeightAdapter(e, i, o),
  'tables.distributeRows': (e, i, o) => tablesDistributeRowsAdapter(e, i, o),
  'tables.setRowOptions': (e, i, o) => tablesSetRowOptionsAdapter(e, i, o),
  'tables.insertColumn': (e, i, o) => tablesInsertColumnAdapter(e, i, o),
  'tables.deleteColumn': (e, i, o) => tablesDeleteColumnAdapter(e, i, o),
  'tables.setColumnWidth': (e, i, o) => tablesSetColumnWidthAdapter(e, i, o),
  'tables.distributeColumns': (e, i, o) => tablesDistributeColumnsAdapter(e, i, o),
  'tables.insertCell': (e, i, o) => tablesInsertCellAdapter(e, i, o),
  'tables.deleteCell': (e, i, o) => tablesDeleteCellAdapter(e, i, o),
  'tables.mergeCells': (e, i, o) => tablesMergeCellsAdapter(e, i, o),
  'tables.unmergeCells': (e, i, o) => tablesUnmergeCellsAdapter(e, i, o),
  'tables.splitCell': (e, i, o) => tablesSplitCellAdapter(e, i, o),
  'tables.setCellProperties': (e, i, o) => tablesSetCellPropertiesAdapter(e, i, o),
  'tables.sort': (e, i, o) => tablesSortAdapter(e, i, o),
  'tables.setAltText': (e, i, o) => tablesSetAltTextAdapter(e, i, o),
  'tables.setStyle': (e, i, o) => tablesSetStyleAdapter(e, i, o),
  'tables.clearStyle': (e, i, o) => tablesClearStyleAdapter(e, i, o),
  'tables.setStyleOption': (e, i, o) => tablesSetStyleOptionAdapter(e, i, o),
  'tables.setBorder': (e, i, o) => tablesSetBorderAdapter(e, i, o),
  'tables.clearBorder': (e, i, o) => tablesClearBorderAdapter(e, i, o),
  'tables.applyBorderPreset': (e, i, o) => tablesApplyBorderPresetAdapter(e, i, o),
  'tables.setShading': (e, i, o) => tablesSetShadingAdapter(e, i, o),
  'tables.clearShading': (e, i, o) => tablesClearShadingAdapter(e, i, o),
  'tables.setTablePadding': (e, i, o) => tablesSetTablePaddingAdapter(e, i, o),
  'tables.setCellPadding': (e, i, o) => tablesSetCellPaddingAdapter(e, i, o),
  'tables.setCellSpacing': (e, i, o) => tablesSetCellSpacingAdapter(e, i, o),
  'tables.clearCellSpacing': (e, i, o) => tablesClearCellSpacingAdapter(e, i, o),
};

/**
 * Ops that use table-scoped locators (tableNodeId) instead of simple
 * table locators (nodeId). When the ref target is a table, the
 * executor sets `tableNodeId` for these ops.
 */
/** Row operations that support both table-scoped and direct row locator modes. */
const ROW_OPS = new Set(['tables.insertRow', 'tables.deleteRow', 'tables.setRowHeight', 'tables.setRowOptions']);

const TABLE_SCOPED_OPS = new Set([
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.setRowOptions',
  'tables.insertColumn',
  'tables.deleteColumn',
  'tables.setColumnWidth',
  'tables.mergeCells',
]);

/**
 * Constructs adapter input from a compiled target's blockId + step args.
 * Maps the ref-resolved blockId to the appropriate locator field.
 */
/** @internal Exported for testing only. */
export function buildTableInput(op: string, blockId: string, args: Record<string, unknown>): Record<string, unknown> {
  // Strip locator fields from args to prevent override of compiler-resolved target
  const { target: _target, nodeId: _n, tableTarget: _tableTarget, tableNodeId: _t, ...safeArgs } = args;
  if (TABLE_SCOPED_OPS.has(op)) {
    // Row ops support two addressing modes: table-scoped (tableNodeId + rowIndex)
    // or direct row locator (nodeId pointing at the row). When rowIndex is absent
    // the blockId refers to the row itself, not the parent table.
    if (ROW_OPS.has(op) && safeArgs.rowIndex == null) {
      return { ...safeArgs, nodeId: blockId };
    }
    return { ...safeArgs, tableNodeId: blockId };
  }
  return { ...safeArgs, nodeId: blockId };
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

  // Table operations — delegate to adapter functions.
  // Two code paths:
  // 1. Wrapper path: step carries a _handler closure (pre-bound adapter call)
  // 2. mutations.apply path: no _handler, executor constructs adapter call from targets + args
  registerStepExecutor('tables', {
    execute(ctx, targets, step) {
      // Table operations are single-target — reject multi-target to prevent silent data loss
      if (targets.length > 1) {
        throw planError(
          'INVALID_INPUT',
          `table operation "${step.op}" requires exactly one target, got ${targets.length}`,
          step.id,
        );
      }

      // Self-dispatching — must not execute in preview mode
      if (ctx.isPreview) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: targets.length,
          data: { domain: 'table', tableId: targetBlockId(targets[0]) } as TableStepData,
        };
      }

      const handler = (step as any)._handler as (() => { success: boolean; tableId?: string }) | undefined;
      if (handler) {
        const result = handler();
        if (result.success) ctx.commandDispatched = true;
        return {
          stepId: step.id,
          op: step.op,
          effect: (result.success ? 'changed' : 'noop') as StepEffect,
          matchCount: result.success ? 1 : 0,
          data: { domain: 'table', tableId: result.tableId ?? '' } as TableStepData,
        };
      }

      // Raw step from mutations.apply — construct adapter call from targets + args
      const adapterFn = TABLE_ADAPTER_DISPATCH[step.op];
      if (!adapterFn || !targets[0]) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: 0,
          data: { domain: 'table', tableId: '' } as TableStepData,
        };
      }

      const input = buildTableInput(step.op, targetBlockId(targets[0]), step.args as Record<string, unknown>);
      const result = adapterFn(ctx.editor, input, { changeMode: ctx.changeMode });
      if (result.success) ctx.commandDispatched = true;
      return {
        stepId: step.id,
        op: step.op,
        effect: (result.success ? 'changed' : 'noop') as StepEffect,
        matchCount: result.success ? 1 : 0,
        data: { domain: 'table', tableId: targetBlockId(targets[0]) } as TableStepData,
      };
    },
  });

  // Structural insert — materializes SDFragment content at a target position
  registerStepExecutor('structural.insert', {
    execute(ctx, targets, step) {
      if (ctx.isPreview) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: targets.length,
          data: { domain: 'structural' } as StructuralStepData,
        };
      }

      const structuralStep = step as StructuralInsertStep;

      // Structural insert is single-target — reject multi-target to prevent silent data loss
      if (targets.length > 1) {
        throw planError(
          'INVALID_INPUT',
          `structural.insert requires at most one target, got ${targets.length}`,
          step.id,
        );
      }

      // Guard: if the step's where clause expected targets but none resolved,
      // return noop rather than silently falling back to document-end insertion.
      if (targets.length === 0) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: 0,
          data: { domain: 'structural' } as StructuralStepData,
        };
      }

      const target = targets[0];
      const targetAddress =
        target?.kind === 'range'
          ? {
              kind: 'text' as const,
              blockId: target.blockId,
              range: { start: target.from, end: target.to },
            }
          : undefined;

      const result = executeStructuralInsert(ctx.editor, {
        target: targetAddress,
        content: structuralStep.args.content,
        placement: structuralStep.args.placement,
        nestingPolicy: structuralStep.args.nestingPolicy,
        changeMode: ctx.changeMode,
      });

      if (result.success) ctx.commandDispatched = true;

      return {
        stepId: step.id,
        op: step.op,
        effect: result.success ? ('changed' as StepEffect) : ('noop' as StepEffect),
        matchCount: result.success ? 1 : 0,
        data: { domain: 'structural', insertedBlockIds: result.insertedBlockIds } as StructuralStepData,
      };
    },
  });

  // Structural replace — materializes SDFragment and replaces target range
  registerStepExecutor('structural.replace', {
    execute(ctx, targets, step) {
      if (ctx.isPreview) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: targets.length,
          data: { domain: 'structural' } as StructuralStepData,
        };
      }

      const structuralStep = step as StructuralReplaceStep;

      // Structural replace is single-target — reject multi-target to prevent silent data loss
      if (targets.length > 1) {
        throw planError(
          'INVALID_INPUT',
          `structural.replace requires exactly one target, got ${targets.length}`,
          step.id,
        );
      }

      const target = targets[0];
      if (!target || target.kind !== 'range') {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: 0,
          data: { domain: 'structural' } as StructuralStepData,
        };
      }

      const result = executeStructuralReplace(ctx.editor, {
        target: {
          kind: 'text',
          blockId: target.blockId,
          range: { start: target.from, end: target.to },
        },
        content: structuralStep.args.content,
        nestingPolicy: structuralStep.args.nestingPolicy,
        changeMode: ctx.changeMode,
      });

      if (result.success) ctx.commandDispatched = true;

      return {
        stepId: step.id,
        op: step.op,
        effect: result.success ? ('changed' as StepEffect) : ('noop' as StepEffect),
        matchCount: result.success ? 1 : 0,
        data: { domain: 'structural', insertedBlockIds: result.insertedBlockIds } as StructuralStepData,
      };
    },
  });

  // create.table — uses handler or constructs adapter call from args
  registerStepExecutor('create.table', {
    execute(ctx, _targets, step) {
      // Table creation is single-target — reject multi-target to prevent silent data loss
      if (_targets.length > 1) {
        throw planError('INVALID_INPUT', `create.table requires exactly one target, got ${_targets.length}`, step.id);
      }

      // Self-dispatching — must not execute in preview mode
      if (ctx.isPreview) {
        return {
          stepId: step.id,
          op: step.op,
          effect: 'noop' as StepEffect,
          matchCount: _targets.length,
          data: { domain: 'table', tableId: targetBlockId(_targets[0]) } as TableStepData,
        };
      }

      const handler = (step as any)._handler as (() => { success: boolean; nodeId?: string }) | undefined;
      if (handler) {
        const result = handler();
        if (result.success) ctx.commandDispatched = true;
        return {
          stepId: step.id,
          op: step.op,
          effect: (result.success ? 'changed' : 'noop') as StepEffect,
          matchCount: result.success ? 1 : 0,
          data: { domain: 'table', tableId: result.nodeId ?? '' } as TableStepData,
        };
      }

      // Raw step from mutations.apply — call createTableAdapter directly
      const args = step.args as Record<string, unknown>;
      const input = { rows: args.rows as number, columns: args.columns as number, at: args.at as any };
      const result = createTableAdapter(ctx.editor, input, { changeMode: ctx.changeMode });
      if (result.success) ctx.commandDispatched = true;
      return {
        stepId: step.id,
        op: step.op,
        effect: (result.success ? 'changed' : 'noop') as StepEffect,
        matchCount: result.success ? 1 : 0,
        data: {
          domain: 'table',
          tableId: result.success ? ((result as any).table?.nodeId ?? '') : '',
        } as TableStepData,
      };
    },
  });
}
