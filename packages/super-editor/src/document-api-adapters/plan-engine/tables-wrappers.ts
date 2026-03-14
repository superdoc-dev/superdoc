/**
 * Plan-engine wrappers for all tables.* operations.
 *
 * Each wrapper delegates to executeCompiledPlan via a table-specific
 * step executor, eliminating the Layer A direct-call bypass.
 * The underlying adapter functions are invoked through the step's
 * _handler closure and are self-dispatching.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../../core/Editor.js';
import type {
  MutationOptions,
  MutationStep,
  TableLocator,
  TableMutationResult,
  TablesMoveInput,
  TablesSetLayoutInput,
  TablesSetAltTextInput,
  TablesConvertFromTextInput,
  TablesSplitInput,
  TablesConvertToTextInput,
  TablesInsertRowInput,
  TablesDeleteRowInput,
  TablesSetRowHeightInput,
  TablesDistributeRowsInput,
  TablesSetRowOptionsInput,
  TablesInsertColumnInput,
  TablesDeleteColumnInput,
  TablesSetColumnWidthInput,
  TablesDistributeColumnsInput,
  TablesInsertCellInput,
  TablesDeleteCellInput,
  TablesMergeCellsInput,
  TablesUnmergeCellsInput,
  TablesSplitCellInput,
  TablesSetCellPropertiesInput,
  TablesSortInput,
  TablesSetStyleInput,
  TablesClearStyleInput,
  TablesSetStyleOptionInput,
  TablesSetBorderInput,
  TablesClearBorderInput,
  TablesApplyBorderPresetInput,
  TablesSetShadingInput,
  TablesClearShadingInput,
  TablesSetTablePaddingInput,
  TablesSetCellPaddingInput,
  TablesSetCellSpacingInput,
  TablesClearCellSpacingInput,
} from '@superdoc/document-api';

import type { CompiledPlan } from './compiler.js';
import { executeCompiledPlan } from './executor.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { STUB_WHERE } from './plan-wrappers.js';

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
} from '../tables-adapter.js';

// ---------------------------------------------------------------------------
// Plan-engine table command helper
// ---------------------------------------------------------------------------

/**
 * Execute a table operation through the plan engine. Builds a single-step
 * CompiledPlan with a table-domain executor that delegates to the adapter
 * function via the step's _handler closure.
 *
 * The adapter function is self-dispatching, so the plan engine's shared
 * transaction (ctx.tr) stays untouched — same pattern as domain.command.
 */
function executeTableCommand<I>(
  editor: Editor,
  op: string,
  adapterFn: (editor: Editor, input: I, options?: MutationOptions) => TableMutationResult,
  input: I,
  options?: MutationOptions,
): TableMutationResult {
  // Dry-run bypasses plan execution — validate only
  if (options?.dryRun) {
    checkRevision(editor, options?.expectedRevision);
    return adapterFn(editor, input, options);
  }

  let adapterResult: TableMutationResult | undefined;
  const step = {
    id: uuidv4(),
    op,
    where: STUB_WHERE,
    args: {},
    _handler: () => {
      adapterResult = adapterFn(editor, input, options);
      return { success: adapterResult.success };
    },
  } as unknown as MutationStep;

  const compiled: CompiledPlan = {
    mutationSteps: [{ step, targets: [] }],
    assertSteps: [],
    compiledRevision: getRevision(editor),
  };

  executeCompiledPlan(editor, compiled, {
    expectedRevision: options?.expectedRevision,
    changeMode: options?.changeMode,
  });

  // The adapter result was captured by the handler closure
  return adapterResult!;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function tablesDeleteWrapper(
  editor: Editor,
  input: TableLocator,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.delete', tablesDeleteAdapter, input, options);
}

export function tablesClearContentsWrapper(
  editor: Editor,
  input: TableLocator,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.clearContents', tablesClearContentsAdapter, input, options);
}

export function tablesMoveWrapper(
  editor: Editor,
  input: TablesMoveInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.move', tablesMoveAdapter, input, options);
}

export function tablesConvertFromTextWrapper(
  editor: Editor,
  input: TablesConvertFromTextInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.convertFromText', tablesConvertFromTextAdapter, input, options);
}

export function tablesSplitWrapper(
  editor: Editor,
  input: TablesSplitInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.split', tablesSplitAdapter, input, options);
}

export function tablesConvertToTextWrapper(
  editor: Editor,
  input: TablesConvertToTextInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.convertToText', tablesConvertToTextAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function tablesSetLayoutWrapper(
  editor: Editor,
  input: TablesSetLayoutInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setLayout', tablesSetLayoutAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Row structure
// ---------------------------------------------------------------------------

export function tablesInsertRowWrapper(
  editor: Editor,
  input: TablesInsertRowInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.insertRow', tablesInsertRowAdapter, input, options);
}

export function tablesDeleteRowWrapper(
  editor: Editor,
  input: TablesDeleteRowInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.deleteRow', tablesDeleteRowAdapter, input, options);
}

export function tablesSetRowHeightWrapper(
  editor: Editor,
  input: TablesSetRowHeightInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setRowHeight', tablesSetRowHeightAdapter, input, options);
}

export function tablesDistributeRowsWrapper(
  editor: Editor,
  input: TablesDistributeRowsInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.distributeRows', tablesDistributeRowsAdapter, input, options);
}

export function tablesSetRowOptionsWrapper(
  editor: Editor,
  input: TablesSetRowOptionsInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setRowOptions', tablesSetRowOptionsAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Column structure
// ---------------------------------------------------------------------------

export function tablesInsertColumnWrapper(
  editor: Editor,
  input: TablesInsertColumnInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.insertColumn', tablesInsertColumnAdapter, input, options);
}

export function tablesDeleteColumnWrapper(
  editor: Editor,
  input: TablesDeleteColumnInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.deleteColumn', tablesDeleteColumnAdapter, input, options);
}

export function tablesSetColumnWidthWrapper(
  editor: Editor,
  input: TablesSetColumnWidthInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setColumnWidth', tablesSetColumnWidthAdapter, input, options);
}

export function tablesDistributeColumnsWrapper(
  editor: Editor,
  input: TablesDistributeColumnsInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.distributeColumns', tablesDistributeColumnsAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Cell structure
// ---------------------------------------------------------------------------

export function tablesInsertCellWrapper(
  editor: Editor,
  input: TablesInsertCellInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.insertCell', tablesInsertCellAdapter, input, options);
}

export function tablesDeleteCellWrapper(
  editor: Editor,
  input: TablesDeleteCellInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.deleteCell', tablesDeleteCellAdapter, input, options);
}

export function tablesMergeCellsWrapper(
  editor: Editor,
  input: TablesMergeCellsInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.mergeCells', tablesMergeCellsAdapter, input, options);
}

export function tablesUnmergeCellsWrapper(
  editor: Editor,
  input: TablesUnmergeCellsInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.unmergeCells', tablesUnmergeCellsAdapter, input, options);
}

export function tablesSplitCellWrapper(
  editor: Editor,
  input: TablesSplitCellInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.splitCell', tablesSplitCellAdapter, input, options);
}

export function tablesSetCellPropertiesWrapper(
  editor: Editor,
  input: TablesSetCellPropertiesInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setCellProperties', tablesSetCellPropertiesAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Data + accessibility
// ---------------------------------------------------------------------------

export function tablesSortWrapper(
  editor: Editor,
  input: TablesSortInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.sort', tablesSortAdapter, input, options);
}

export function tablesSetAltTextWrapper(
  editor: Editor,
  input: TablesSetAltTextInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setAltText', tablesSetAltTextAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

export function tablesSetStyleWrapper(
  editor: Editor,
  input: TablesSetStyleInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setStyle', tablesSetStyleAdapter, input, options);
}

export function tablesClearStyleWrapper(
  editor: Editor,
  input: TablesClearStyleInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.clearStyle', tablesClearStyleAdapter, input, options);
}

export function tablesSetStyleOptionWrapper(
  editor: Editor,
  input: TablesSetStyleOptionInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setStyleOption', tablesSetStyleOptionAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

export function tablesSetBorderWrapper(
  editor: Editor,
  input: TablesSetBorderInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setBorder', tablesSetBorderAdapter, input, options);
}

export function tablesClearBorderWrapper(
  editor: Editor,
  input: TablesClearBorderInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.clearBorder', tablesClearBorderAdapter, input, options);
}

export function tablesApplyBorderPresetWrapper(
  editor: Editor,
  input: TablesApplyBorderPresetInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.applyBorderPreset', tablesApplyBorderPresetAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Shading
// ---------------------------------------------------------------------------

export function tablesSetShadingWrapper(
  editor: Editor,
  input: TablesSetShadingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setShading', tablesSetShadingAdapter, input, options);
}

export function tablesClearShadingWrapper(
  editor: Editor,
  input: TablesClearShadingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.clearShading', tablesClearShadingAdapter, input, options);
}

// ---------------------------------------------------------------------------
// Padding + spacing
// ---------------------------------------------------------------------------

export function tablesSetTablePaddingWrapper(
  editor: Editor,
  input: TablesSetTablePaddingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setTablePadding', tablesSetTablePaddingAdapter, input, options);
}

export function tablesSetCellPaddingWrapper(
  editor: Editor,
  input: TablesSetCellPaddingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setCellPadding', tablesSetCellPaddingAdapter, input, options);
}

export function tablesSetCellSpacingWrapper(
  editor: Editor,
  input: TablesSetCellSpacingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.setCellSpacing', tablesSetCellSpacingAdapter, input, options);
}

export function tablesClearCellSpacingWrapper(
  editor: Editor,
  input: TablesClearCellSpacingInput,
  options?: MutationOptions,
): TableMutationResult {
  return executeTableCommand(editor, 'tables.clearCellSpacing', tablesClearCellSpacingAdapter, input, options);
}
