import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import { buildWorkflowDocIndex } from '../doc-index.js';
import {
  runWorkflowEngine,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from '../engine.js';
import {
  resolveWorkflowTargetFromUnknown,
  type WorkflowResolvedTarget,
  type WorkflowTargetRequest,
} from '../resolve.js';

const TABLE_TRANSFORM_ACTIONS = [
  'split_table',
  'insert_column',
  'insert_row',
  'create_table',
  'preview_insert_row',
  'set_shading',
] as const;
const PREVIEW_POSITIONS = ['before', 'after'] as const;
const DOCUMENT_PLACEMENTS = ['document_start', 'document_end'] as const;
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

type SuperdocTableTransformAction = (typeof TABLE_TRANSFORM_ACTIONS)[number];
type SuperdocTableTransformPreviewPosition = (typeof PREVIEW_POSITIONS)[number];
type SuperdocTableTransformDocumentPlacement = (typeof DOCUMENT_PLACEMENTS)[number];
type TableAddress = NonNullable<Parameters<BoundDocApi['tables']['split']>[0]['target']>;
type TableCreateLocation = NonNullable<Parameters<BoundDocApi['create']['table']>[0]['at']>;
type TableSetCellTextParams = {
  target?: TableAddress | { kind: 'block'; nodeType: 'tableCell'; nodeId: string };
  nodeId?: string;
  rowIndex?: number;
  columnIndex?: number;
  text: string;
};
type TableCellText = {
  rowIndex: number;
  columnIndex: number;
  text: string;
};

type ExtractedTableBlock = {
  nodeId: string;
  type?: string;
  text?: string;
  tableContext?: {
    tableOrdinal?: number;
    rowIndex?: number;
    columnIndex?: number;
    colspan?: number;
    rowspan?: number;
  };
};

type SuperdocTableTransformPlacement =
  | {
      mode: 'document';
      at: SuperdocTableTransformDocumentPlacement;
      source: 'default' | 'provided';
    }
  | {
      mode: 'relative';
      position: 'before' | 'after';
      target: WorkflowResolvedTarget;
      request: WorkflowTargetRequest;
      source: 'provided';
    };

type SuperdocTableTransformResolvedBase = {
  action: SuperdocTableTransformAction;
  target: TableAddress;
  targetNodeId: string;
  targetTableOrdinal?: number;
  targetSource: 'provided' | 'auto_single_table';
  deterministicTarget: boolean;
  request?: WorkflowTargetRequest;
  resolvedTarget?: WorkflowResolvedTarget;
};

type SuperdocTableTransformResolvedSplit = SuperdocTableTransformResolvedBase & {
  action: 'split_table';
  afterRow: number;
  rowIndex: number;
  separatorText?: string;
};

type SuperdocTableTransformResolvedInsertColumn = SuperdocTableTransformResolvedBase & {
  action: 'insert_column';
  afterColumn: number;
  columnIndex: number;
  headerColumnIndex: number;
  headerText?: string;
};

type SuperdocTableTransformResolvedPreviewInsertRow = SuperdocTableTransformResolvedBase & {
  action: 'preview_insert_row';
  rowOrdinal: number;
  rowIndex: number;
  position: SuperdocTableTransformPreviewPosition;
  tableInsertPosition: 'above' | 'below';
};

type SuperdocTableTransformResolvedInsertRow = SuperdocTableTransformResolvedBase & {
  action: 'insert_row';
  rowOrdinal?: number;
  rowIndex?: number;
  position: SuperdocTableTransformPreviewPosition;
  tableInsertPosition: 'above' | 'below';
  cellTexts: TableCellText[];
};

type SuperdocTableTransformResolvedCreateTable = {
  action: 'create_table';
  rows: number;
  columns: number;
  placement: SuperdocTableTransformPlacement;
  cellTexts: TableCellText[];
};

type SuperdocTableTransformResolvedSetShading = SuperdocTableTransformResolvedBase & {
  action: 'set_shading';
  color: string;
};

type SuperdocTableTransformResolved =
  | SuperdocTableTransformResolvedSplit
  | SuperdocTableTransformResolvedInsertColumn
  | SuperdocTableTransformResolvedInsertRow
  | SuperdocTableTransformResolvedCreateTable
  | SuperdocTableTransformResolvedPreviewInsertRow
  | SuperdocTableTransformResolvedSetShading;

type SuperdocTableTransformPlanSplit = {
  action: 'split_table';
  targetNodeId: string;
  splitParams: Parameters<BoundDocApi['tables']['split']>[0];
  separatorText?: string;
  separatorParagraphParams?: Parameters<BoundDocApi['create']['paragraph']>[0];
  afterRow: number;
  rowIndex: number;
};

type SuperdocTableTransformPlanInsertColumn = {
  action: 'insert_column';
  targetNodeId: string;
  insertColumnParams: Parameters<BoundDocApi['tables']['insertColumn']>[0];
  afterColumn: number;
  columnIndex: number;
  headerColumnIndex: number;
  headerText?: string;
};

type SuperdocTableTransformPlanPreviewInsertRow = {
  action: 'preview_insert_row';
  targetNodeId: string;
  insertRowParams: Parameters<BoundDocApi['tables']['insertRow']>[0];
  rowOrdinal: number;
  rowIndex: number;
  position: SuperdocTableTransformPreviewPosition;
};

type SuperdocTableTransformPlanInsertRow = {
  action: 'insert_row';
  targetNodeId: string;
  insertRowParams: Parameters<BoundDocApi['tables']['insertRow']>[0];
  rowOrdinal?: number;
  rowIndex?: number;
  insertedRowIndex?: number;
  position: SuperdocTableTransformPreviewPosition;
  cellTextParams: TableSetCellTextParams[];
};

type SuperdocTableTransformPlanCreateTable = {
  action: 'create_table';
  createTableParams: Parameters<BoundDocApi['create']['table']>[0];
  rows: number;
  columns: number;
  placement: SuperdocTableTransformPlacement;
  cellTexts: TableCellText[];
};

type SuperdocTableTransformPlanSetShading = {
  action: 'set_shading';
  targetNodeId: string;
  setShadingParams: Parameters<BoundDocApi['tables']['setShading']>[0];
  color: string;
};

type SuperdocTableTransformPlan =
  | SuperdocTableTransformPlanSplit
  | SuperdocTableTransformPlanInsertColumn
  | SuperdocTableTransformPlanInsertRow
  | SuperdocTableTransformPlanCreateTable
  | SuperdocTableTransformPlanPreviewInsertRow
  | SuperdocTableTransformPlanSetShading;

type WorkflowRevision = {
  before: string;
  after: string;
  unchanged: boolean;
};

type SuperdocTableTransformExecutionSplit = {
  action: 'split_table';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  afterRow: number;
  rowIndex: number;
  separatorText?: string;
};

type SuperdocTableTransformExecutionInsertColumn = {
  action: 'insert_column';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  idempotentSkip?: boolean;
  afterColumn: number;
  columnIndex: number;
  headerColumnIndex: number;
  headerText?: string;
  columnCountBefore?: number;
  columnCountAfter?: number;
};

type SuperdocTableTransformExecutionPreviewInsertRow = {
  action: 'preview_insert_row';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  rowOrdinal: number;
  rowIndex: number;
  position: SuperdocTableTransformPreviewPosition;
  rowCountBefore?: number;
  rowCountAfter?: number;
  textBefore: string;
  textAfter: string;
};

type SuperdocTableTransformExecutionInsertRow = {
  action: 'insert_row';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  idempotentSkip?: boolean;
  rowOrdinal?: number;
  rowIndex?: number;
  insertedRowIndex?: number;
  position: SuperdocTableTransformPreviewPosition;
  rowCountBefore?: number;
  rowCountAfter?: number;
  cellTexts: TableCellText[];
};

type SuperdocTableTransformExecutionCreateTable = {
  action: 'create_table';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  idempotentSkip?: boolean;
  rows: number;
  columns: number;
  tableCountBefore: number;
  tableCountAfter?: number;
  cellTexts: TableCellText[];
};

type SuperdocTableTransformExecutionSetShading = {
  action: 'set_shading';
  targetTableNodeId: string;
  revision: WorkflowRevision;
  color: string;
  success: boolean;
};

type SuperdocTableTransformExecution =
  | SuperdocTableTransformExecutionSplit
  | SuperdocTableTransformExecutionInsertColumn
  | SuperdocTableTransformExecutionInsertRow
  | SuperdocTableTransformExecutionCreateTable
  | SuperdocTableTransformExecutionPreviewInsertRow
  | SuperdocTableTransformExecutionSetShading;

type SuperdocTableTransformVerification = {
  action: SuperdocTableTransformAction;
  targetTableNodeId: string;
  passed: boolean;
  summary: string;
  checks: Record<string, unknown>;
};

export type RunSuperdocTableTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocTableTransformAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return TABLE_TRANSFORM_ACTIONS.find((action) => action === raw);
}

function parsePositiveOrdinal(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return undefined;
  }
  return raw;
}

function parseOptionalString(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return raw;
}

function parseColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'lightgrey' || normalized === 'lightgray') {
    return 'F2F2F2';
  }
  if (normalized === 'grey' || normalized === 'gray') {
    return 'D9D9D9';
  }
  if (normalized === 'white') {
    return 'FFFFFF';
  }
  if (normalized === 'black') {
    return '000000';
  }
  if (normalized === 'yellow') {
    return 'FFFF00';
  }

  const match = HEX_COLOR_PATTERN.exec(raw.trim());
  return match == null ? undefined : match[1]!.toUpperCase();
}

function parsePositiveInteger(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return undefined;
  }
  return raw;
}

function parseZeroBasedInteger(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}

function parseCellTexts(raw: unknown): TableCellText[] | undefined {
  if (raw == null) {
    return [];
  }

  const cells: TableCellText[] = [];
  if (Array.isArray(raw) && raw.every((row) => Array.isArray(row))) {
    raw.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value == null) return;
        const text = String(value);
        if (text.length === 0) return;
        cells.push({ rowIndex, columnIndex, text });
      });
    });
    return cells;
  }

  if (!Array.isArray(raw)) {
    return undefined;
  }

  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return undefined;
    }
    const record = entry as Record<string, unknown>;
    const rowIndex = parseZeroBasedInteger(record.rowIndex);
    const columnIndex = parseZeroBasedInteger(record.columnIndex);
    const text = parseOptionalString(record.text);
    if (rowIndex == null || columnIndex == null || text == null) {
      return undefined;
    }
    cells.push({ rowIndex, columnIndex, text });
  }
  return cells;
}

function parsePreviewPosition(raw: unknown): SuperdocTableTransformPreviewPosition | undefined {
  if (raw == null) {
    return 'before';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return PREVIEW_POSITIONS.find((position) => position === raw);
}

function resolvePlacement(context: WorkflowEngineContext): WorkflowStepResult<SuperdocTableTransformPlacement> {
  const rawPlacement = context.args.placement;
  if (rawPlacement == null) {
    return workflowStepSuccess({
      mode: 'document',
      at: 'document_end',
      source: 'default',
    });
  }

  if (typeof rawPlacement === 'string') {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === rawPlacement);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_PLACEMENT_INVALID',
        message: 'placement must be document_start, document_end, or {position,target}.',
        details: { received: rawPlacement },
      });
    }
    return workflowStepSuccess({ mode: 'document', at, source: 'provided' });
  }

  if (typeof rawPlacement !== 'object' || rawPlacement == null || Array.isArray(rawPlacement)) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_PLACEMENT_INVALID',
      message: 'placement must be a string or object.',
      details: { receivedType: typeof rawPlacement },
    });
  }

  const placement = rawPlacement as Record<string, unknown>;
  if (typeof placement.at === 'string') {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === placement.at);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_PLACEMENT_INVALID',
        message: 'placement.at must be document_start or document_end.',
        details: { received: placement.at },
      });
    }
    return workflowStepSuccess({ mode: 'document', at, source: 'provided' });
  }

  const position = PREVIEW_POSITIONS.find((value) => value === placement.position);
  if (position == null || placement.target == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_PLACEMENT_INVALID',
      message: 'Relative table placement requires {position,target}.',
      details: { position: placement.position, hasTarget: placement.target != null },
    });
  }

  const resolved = resolveWorkflowTargetFromUnknown(context.index, placement.target);
  if (!resolved.ok) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: `WORKFLOW_${resolved.code}`,
      message: resolved.message,
      details: {
        targetArgKey: 'placement.target',
        ...resolved.details,
      },
    });
  }

  return workflowStepSuccess({
    mode: 'relative',
    position,
    target: resolved.target,
    request: resolved.request,
    source: 'provided',
  });
}

function toCreateLocation(placement: SuperdocTableTransformPlacement): TableCreateLocation {
  if (placement.mode === 'document') {
    return { kind: placement.at === 'document_start' ? 'documentStart' : 'documentEnd' };
  }

  if (placement.target.entity.kind === 'table') {
    return {
      kind: placement.position,
      target: {
        kind: 'block',
        nodeType: 'table',
        nodeId: placement.target.entity.nodeId,
      },
    } as TableCreateLocation;
  }

  if (placement.target.entity.kind === 'listItem') {
    return {
      kind: placement.position,
      target: {
        kind: 'block',
        nodeType: 'listItem',
        nodeId: placement.target.entity.nodeId,
      },
    } as TableCreateLocation;
  }

  return {
    kind: placement.position,
    target: {
      kind: 'block',
      nodeType: placement.target.entity.nodeType,
      nodeId: placement.target.entity.nodeId,
    },
  } as TableCreateLocation;
}

function resolveTableTarget(
  context: WorkflowEngineContext,
  resolvedTarget: WorkflowResolvedTarget,
): WorkflowStepResult<{ target: TableAddress; tableOrdinal?: number }> {
  if (resolvedTarget.entity.kind === 'table') {
    return workflowStepSuccess({
      target: {
        kind: 'block',
        nodeType: 'table',
        nodeId: resolvedTarget.entity.nodeId,
      },
      tableOrdinal: resolvedTarget.entity.tableOrdinal,
    });
  }

  if (resolvedTarget.entity.kind === 'block' && resolvedTarget.entity.nodeType === 'table') {
    const table = context.index.tables.find((entry) => entry.nodeId === resolvedTarget.entity.nodeId);
    return workflowStepSuccess({
      target: {
        kind: 'block',
        nodeType: 'table',
        nodeId: resolvedTarget.entity.nodeId,
      },
      tableOrdinal: table?.tableOrdinal ?? resolvedTarget.entity.tableOrdinal,
    });
  }

  return workflowStepFailure({
    status: 'failed',
    phase: 'resolve',
    code: 'WORKFLOW_TARGET_KIND_UNSUPPORTED',
    message: `superdoc_table_transform requires a table target but resolved to ${resolvedTarget.entity.kind}.`,
    details: {
      entityKind: resolvedTarget.entity.kind,
      ...(resolvedTarget.entity.kind === 'block' ? { nodeType: resolvedTarget.entity.nodeType } : {}),
    },
  });
}

function resolveSingleTableTarget(context: WorkflowEngineContext): WorkflowStepResult<{
  target: TableAddress;
  tableOrdinal: number;
}> {
  if (context.index.tables.length !== 1) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_TARGET_REQUIRED',
      message: 'superdoc_table_transform requires target when the document does not contain exactly one table.',
      details: {
        tableCount: context.index.tables.length,
      },
    });
  }

  const onlyTable = context.index.tables[0];
  if (onlyTable == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_TARGET_REQUIRED',
      message: 'superdoc_table_transform requires target when no tables are indexed.',
      details: {
        tableCount: 0,
      },
    });
  }

  return workflowStepSuccess({
    target: {
      kind: 'block',
      nodeType: 'table',
      nodeId: onlyTable.nodeId,
    },
    tableOrdinal: onlyTable.tableOrdinal,
  });
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocTableTransformResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_TRANSFORM_ACTION_INVALID',
      message:
        'superdoc_table_transform requires action to be one of split_table, insert_column, insert_row, create_table, preview_insert_row, set_shading.',
    });
  }

  if (action === 'create_table') {
    const rows = parsePositiveInteger(context.args.rows);
    const columns = parsePositiveInteger(context.args.columns);
    if (rows == null || columns == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_CREATE_SHAPE_REQUIRED',
        message: 'create_table requires positive integer rows and columns.',
        details: { rows: context.args.rows, columns: context.args.columns },
      });
    }

    const cellTexts = parseCellTexts(context.args.cellTexts);
    if (cellTexts == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_CELL_TEXTS_INVALID',
        message: 'cellTexts must be a 2D string array or array of {rowIndex,columnIndex,text}.',
      });
    }

    const placement = resolvePlacement(context);
    if (!placement.ok) {
      return placement;
    }

    return workflowStepSuccess({
      action,
      rows,
      columns,
      placement: placement.value,
      cellTexts,
    });
  }

  let target: TableAddress;
  let targetTableOrdinal: number | undefined;
  let targetSource: SuperdocTableTransformResolvedBase['targetSource'];
  let deterministicTarget: boolean;
  let request: WorkflowTargetRequest | undefined;
  let resolvedTarget: WorkflowResolvedTarget | undefined;

  if (context.args.target == null) {
    const autoTarget = resolveSingleTableTarget(context);
    if (!autoTarget.ok) {
      return autoTarget;
    }
    target = autoTarget.value.target;
    targetTableOrdinal = autoTarget.value.tableOrdinal;
    targetSource = 'auto_single_table';
    deterministicTarget = false;
  } else {
    const resolved = resolveWorkflowTargetFromUnknown(context.index, context.args.target);
    if (!resolved.ok) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: `WORKFLOW_${resolved.code}`,
        message: resolved.message,
        details: {
          targetArgKey: 'target',
          ...resolved.details,
        },
      });
    }

    const targetAddress = resolveTableTarget(context, resolved.target);
    if (!targetAddress.ok) {
      return targetAddress;
    }

    target = targetAddress.value.target;
    targetTableOrdinal = targetAddress.value.tableOrdinal;
    targetSource = 'provided';
    deterministicTarget = true;
    request = resolved.request;
    resolvedTarget = resolved.target;
  }

  const resolvedBase: SuperdocTableTransformResolvedBase = {
    action,
    target,
    targetNodeId: target.nodeId,
    targetTableOrdinal,
    targetSource,
    deterministicTarget,
    request,
    resolvedTarget,
  };

  if (action === 'split_table') {
    const afterRow = parsePositiveOrdinal(context.args.afterRow);
    if (afterRow == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_AFTER_ROW_REQUIRED',
        message: 'split_table requires afterRow as a 1-based integer.',
        details: { received: context.args.afterRow },
      });
    }

    const separatorText = parseOptionalString(context.args.separatorText);
    if (context.args.separatorText != null && separatorText == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_SEPARATOR_TEXT_INVALID',
        message: 'separatorText must be a string when provided.',
        details: { receivedType: typeof context.args.separatorText },
      });
    }

    return workflowStepSuccess({
      ...resolvedBase,
      action,
      afterRow,
      rowIndex: afterRow - 1,
      separatorText,
    });
  }

  if (action === 'insert_column') {
    const afterColumn = parsePositiveOrdinal(context.args.afterColumn);
    if (afterColumn == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_AFTER_COLUMN_REQUIRED',
        message: 'insert_column requires afterColumn as a 1-based integer.',
        details: { received: context.args.afterColumn },
      });
    }

    const headerText = parseOptionalString(context.args.headerText);
    if (context.args.headerText != null && headerText == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_HEADER_TEXT_INVALID',
        message: 'headerText must be a string when provided.',
        details: { receivedType: typeof context.args.headerText },
      });
    }

    const columnIndex = afterColumn - 1;
    return workflowStepSuccess({
      ...resolvedBase,
      action,
      afterColumn,
      columnIndex,
      headerColumnIndex: columnIndex + 1,
      headerText,
    });
  }

  if (action === 'insert_row') {
    const rowOrdinal = parsePositiveOrdinal(context.args.rowOrdinal);
    const position = context.args.position == null ? 'after' : parsePreviewPosition(context.args.position);
    const fallbackCellTexts =
      context.args.cellTexts == null && typeof context.args.text === 'string'
        ? [{ rowIndex: 0, columnIndex: 0, text: context.args.text }]
        : context.args.cellTexts;
    const cellTexts = parseCellTexts(fallbackCellTexts);
    if (position == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_ROW_POSITION_INVALID',
        message: 'insert_row position must be "before" or "after".',
        details: { received: context.args.position },
      });
    }
    if (cellTexts == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_CELL_TEXTS_INVALID',
        message: 'cellTexts must be a 2D string array or array of {rowIndex,columnIndex,text}.',
      });
    }

    return workflowStepSuccess({
      ...resolvedBase,
      action,
      rowOrdinal,
      rowIndex: rowOrdinal == null ? undefined : rowOrdinal - 1,
      position,
      tableInsertPosition: position === 'before' ? 'above' : 'below',
      cellTexts,
    });
  }

  if (action === 'set_shading') {
    const color = parseColor(context.args.color);
    if (color == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TABLE_SHADING_COLOR_REQUIRED',
        message: 'set_shading requires color as a 6-digit hex value or common color name such as light grey.',
        details: { received: context.args.color },
      });
    }

    return workflowStepSuccess({
      ...resolvedBase,
      action,
      color,
    });
  }

  const rowOrdinal = parsePositiveOrdinal(context.args.rowOrdinal);
  if (rowOrdinal == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_ROW_ORDINAL_REQUIRED',
      message: 'preview_insert_row requires rowOrdinal as a 1-based integer.',
      details: { received: context.args.rowOrdinal },
    });
  }

  const position = parsePreviewPosition(context.args.position);
  if (position == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TABLE_PREVIEW_POSITION_INVALID',
      message: 'preview_insert_row position must be "before" or "after".',
      details: { received: context.args.position },
    });
  }

  return workflowStepSuccess({
    ...resolvedBase,
    action,
    rowOrdinal,
    rowIndex: rowOrdinal - 1,
    position,
    tableInsertPosition: position === 'before' ? 'above' : 'below',
  });
}

function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocTableTransformResolved,
): WorkflowStepResult<SuperdocTableTransformPlan> {
  if (resolved.action === 'create_table') {
    return workflowStepSuccess({
      action: resolved.action,
      createTableParams: {
        rows: resolved.rows,
        columns: resolved.columns,
        at: toCreateLocation(resolved.placement),
      },
      rows: resolved.rows,
      columns: resolved.columns,
      placement: resolved.placement,
      cellTexts: resolved.cellTexts,
    });
  }

  if (resolved.action === 'split_table') {
    return workflowStepSuccess({
      action: resolved.action,
      targetNodeId: resolved.targetNodeId,
      splitParams: {
        target: resolved.target,
        rowIndex: resolved.rowIndex,
      },
      separatorText: resolved.separatorText,
      separatorParagraphParams:
        resolved.separatorText == null
          ? undefined
          : {
              at: {
                kind: 'after',
                target: resolved.target,
              },
              text: resolved.separatorText,
            },
      afterRow: resolved.afterRow,
      rowIndex: resolved.rowIndex,
    });
  }

  if (resolved.action === 'insert_column') {
    return workflowStepSuccess({
      action: resolved.action,
      targetNodeId: resolved.targetNodeId,
      insertColumnParams: {
        target: resolved.target,
        columnIndex: resolved.columnIndex,
        position: 'right',
      },
      afterColumn: resolved.afterColumn,
      columnIndex: resolved.columnIndex,
      headerColumnIndex: resolved.headerColumnIndex,
      headerText: resolved.headerText,
    });
  }

  if (resolved.action === 'insert_row') {
    const indexedTable =
      resolved.targetTableOrdinal == null
        ? undefined
        : context.index.lookup.byTableOrdinal.get(resolved.targetTableOrdinal);
    const lastRowIndex =
      typeof indexedTable?.rows === 'number' && indexedTable.rows > 0 ? indexedTable.rows - 1 : undefined;
    const rowIndex =
      resolved.rowIndex == null
        ? lastRowIndex
        : lastRowIndex == null
          ? resolved.rowIndex
          : Math.min(resolved.rowIndex, lastRowIndex);

    if (rowIndex == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'plan',
        code: 'WORKFLOW_TABLE_ROW_INDEX_UNAVAILABLE',
        message: 'insert_row needs rowOrdinal, or an indexed table row count for bottom insertion.',
        details: {
          targetTableOrdinal: resolved.targetTableOrdinal,
        },
      });
    }

    const insertedRowIndex = resolved.position === 'after' ? rowIndex + 1 : rowIndex;
    return workflowStepSuccess({
      action: resolved.action,
      targetNodeId: resolved.targetNodeId,
      insertRowParams: {
        target: resolved.target,
        rowIndex,
        position: resolved.tableInsertPosition,
      },
      rowOrdinal: resolved.rowOrdinal,
      rowIndex,
      insertedRowIndex,
      position: resolved.position,
      cellTextParams: resolved.cellTexts.map((cell) => ({
        nodeId: resolved.targetNodeId,
        rowIndex: insertedRowIndex,
        columnIndex: cell.columnIndex,
        text: cell.text,
      })),
    });
  }

  if (resolved.action === 'set_shading') {
    return workflowStepSuccess({
      action: resolved.action,
      targetNodeId: resolved.targetNodeId,
      setShadingParams: {
        target: resolved.target,
        color: resolved.color,
      },
      color: resolved.color,
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    targetNodeId: resolved.targetNodeId,
    insertRowParams: {
      target: resolved.target,
      rowIndex: resolved.rowIndex,
      position: resolved.tableInsertPosition,
      dryRun: true,
    },
    rowOrdinal: resolved.rowOrdinal,
    rowIndex: resolved.rowIndex,
    position: resolved.position,
  });
}

function findExtractedCellBlock(
  blocks: ExtractedTableBlock[],
  rowIndex: number,
  columnIndex: number,
): ExtractedTableBlock | undefined {
  return (
    blocks.find(
      (block) => block.tableContext?.rowIndex === rowIndex && block.tableContext?.columnIndex === columnIndex,
    ) ??
    blocks.find((block) => {
      const context = block.tableContext;
      if (context == null || context.rowIndex == null || context.columnIndex == null) return false;
      const rowEnd = context.rowIndex + Math.max(1, context.rowspan ?? 1);
      const columnEnd = context.columnIndex + Math.max(1, context.colspan ?? 1);
      return (
        rowIndex >= context.rowIndex &&
        rowIndex < rowEnd &&
        columnIndex >= context.columnIndex &&
        columnIndex < columnEnd
      );
    })
  );
}

async function setTableCellTexts(
  context: WorkflowEngineContext,
  tableNodeId: string,
  cellTexts: TableCellText[],
): Promise<WorkflowStepResult<TableCellText[]>> {
  const nonEmptyCells = cellTexts.filter((cell) => cell.text.trim().length > 0);
  if (nonEmptyCells.length === 0) {
    return workflowStepSuccess([]);
  }

  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });
  const table =
    postIndex.tables.find((entry) => entry.nodeId === tableNodeId) ??
    postIndex.lookup.byNodeId.get(tableNodeId)?.find((entity) => entity.kind === 'table');
  if (table == null || table.kind !== 'table') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_TABLE_POST_INDEX_MISSING',
      message: 'Unable to locate edited table in the post-mutation document index.',
      details: { targetTableNodeId: tableNodeId },
    });
  }

  const extracted = await context.documentHandle.extract({}, context.invokeOptions);
  const blocks = ((extracted as { blocks?: ExtractedTableBlock[] }).blocks ?? []).filter(
    (block) => block.tableContext?.tableOrdinal === table.tableOrdinal - 1,
  );

  const applied: TableCellText[] = [];
  const steps: Parameters<BoundDocApi['mutations']['apply']>[0]['steps'] = [];
  for (const cell of nonEmptyCells) {
    const block = findExtractedCellBlock(blocks, cell.rowIndex, cell.columnIndex);
    if (block == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'execute',
        code: 'WORKFLOW_TABLE_CELL_BLOCK_MISSING',
        message: 'Unable to locate a paragraph block for the requested table cell.',
        details: {
          targetTableNodeId: tableNodeId,
          tableOrdinal: table.tableOrdinal,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
        },
      });
    }
    steps.push({
      id: `set-cell-text-${steps.length + 1}`,
      op: 'text.rewrite',
      where: {
        by: 'block',
        nodeType: (block.type ?? 'paragraph') as 'paragraph',
        nodeId: block.nodeId,
      },
      args: {
        replacement: { text: cell.text },
      },
    });
    applied.push(cell);
  }

  try {
    await context.documentHandle.mutations.apply(
      {
        atomic: true,
        changeMode: 'direct',
        steps,
      },
      context.invokeOptions,
    );
  } catch (error) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_TABLE_SET_CELL_TEXT_FAILED',
      message: 'Cell text rewrite failed after a table structure edit.',
      details: {
        targetTableNodeId: tableNodeId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return workflowStepSuccess(applied);
}

async function documentContainsAll(context: WorkflowEngineContext, texts: string[]): Promise<boolean> {
  const nonEmptyTexts = [...new Set(texts.map((text) => text.trim()).filter((text) => text.length > 0))];
  if (nonEmptyTexts.length === 0) {
    return false;
  }
  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  return nonEmptyTexts.every((text) => currentText.includes(text));
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocTableTransformResolved,
  plan: SuperdocTableTransformPlan,
): Promise<WorkflowStepResult<SuperdocTableTransformExecution>> {
  const beforeRevision = context.info.revision;

  if (plan.action === 'create_table') {
    const tableCountBefore = context.index.tables.length;
    const requestedTexts = plan.cellTexts.map((cell) => cell.text);
    if (await documentContainsAll(context, requestedTexts)) {
      return workflowStepSuccess({
        action: plan.action,
        targetTableNodeId: 'existing-table-with-requested-text',
        revision: {
          before: beforeRevision,
          after: beforeRevision,
          unchanged: true,
        },
        idempotentSkip: true,
        rows: plan.rows,
        columns: plan.columns,
        tableCountBefore,
        tableCountAfter: tableCountBefore,
        cellTexts: plan.cellTexts,
      });
    }

    const createResult = await context.documentHandle.create.table(plan.createTableParams, context.invokeOptions);
    const targetTableNodeId = createResult.table.nodeId;
    const setCells = await setTableCellTexts(context, targetTableNodeId, plan.cellTexts);
    if (!setCells.ok) {
      return workflowStepFailure(setCells.failure);
    }

    const postIndex = await buildWorkflowDocIndex({
      documentHandle: context.documentHandle,
      documentKey: context.sessionState.documentKey,
      invokeOptions: context.invokeOptions,
    });
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      targetTableNodeId,
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      rows: plan.rows,
      columns: plan.columns,
      tableCountBefore,
      tableCountAfter: postIndex.tables.length,
      cellTexts: setCells.value,
    });
  }

  if (plan.action === 'split_table') {
    await context.documentHandle.tables.split(plan.splitParams, context.invokeOptions);
    if (plan.separatorParagraphParams != null) {
      await context.documentHandle.create.paragraph(plan.separatorParagraphParams, context.invokeOptions);
    }

    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      targetTableNodeId: plan.targetNodeId,
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      afterRow: plan.afterRow,
      rowIndex: plan.rowIndex,
      separatorText: plan.separatorText,
    });
  }

  if (plan.action === 'insert_column') {
    const beforeShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
    if (plan.headerText != null && (await documentContainsAll(context, [plan.headerText]))) {
      return workflowStepSuccess({
        action: plan.action,
        targetTableNodeId: plan.targetNodeId,
        revision: {
          before: beforeRevision,
          after: beforeRevision,
          unchanged: true,
        },
        idempotentSkip: true,
        afterColumn: plan.afterColumn,
        columnIndex: plan.columnIndex,
        headerColumnIndex: plan.headerColumnIndex,
        headerText: plan.headerText,
        columnCountBefore: beforeShape.columns,
        columnCountAfter: beforeShape.columns,
      });
    }

    await context.documentHandle.tables.insertColumn(plan.insertColumnParams, context.invokeOptions);

    if (plan.headerText != null) {
      const setCells = await setTableCellTexts(context, plan.targetNodeId, [
        { rowIndex: 0, columnIndex: plan.headerColumnIndex, text: plan.headerText },
      ]);
      if (!setCells.ok) {
        return workflowStepFailure(setCells.failure);
      }
    }

    const afterShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      targetTableNodeId: plan.targetNodeId,
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      afterColumn: plan.afterColumn,
      columnIndex: plan.columnIndex,
      headerColumnIndex: plan.headerColumnIndex,
      headerText: plan.headerText,
      columnCountBefore: beforeShape.columns,
      columnCountAfter: afterShape.columns,
    });
  }

  if (plan.action === 'insert_row') {
    const beforeShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
    const requestedTexts = plan.cellTextParams.map((cell) => cell.text);
    if (await documentContainsAll(context, requestedTexts)) {
      return workflowStepSuccess({
        action: plan.action,
        targetTableNodeId: plan.targetNodeId,
        revision: {
          before: beforeRevision,
          after: beforeRevision,
          unchanged: true,
        },
        idempotentSkip: true,
        rowOrdinal: plan.rowOrdinal,
        rowIndex: plan.rowIndex,
        insertedRowIndex: plan.insertedRowIndex,
        position: plan.position,
        rowCountBefore: beforeShape.rows,
        rowCountAfter: beforeShape.rows,
        cellTexts: plan.cellTextParams
          .filter((cell): cell is TableSetCellTextParams & { rowIndex: number; columnIndex: number } => {
            return typeof cell.rowIndex === 'number' && typeof cell.columnIndex === 'number';
          })
          .map((cell) => ({ rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, text: cell.text })),
      });
    }

    await context.documentHandle.tables.insertRow(plan.insertRowParams, context.invokeOptions);

    const setCells = await setTableCellTexts(
      context,
      plan.targetNodeId,
      plan.cellTextParams
        .filter((cell): cell is TableSetCellTextParams & { rowIndex: number; columnIndex: number } => {
          return typeof cell.rowIndex === 'number' && typeof cell.columnIndex === 'number';
        })
        .map((cell) => ({ rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, text: cell.text })),
    );
    if (!setCells.ok) {
      return workflowStepFailure(setCells.failure);
    }

    const afterShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      targetTableNodeId: plan.targetNodeId,
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      rowOrdinal: plan.rowOrdinal,
      rowIndex: plan.rowIndex,
      insertedRowIndex: plan.insertedRowIndex,
      position: plan.position,
      rowCountBefore: beforeShape.rows,
      rowCountAfter: afterShape.rows,
      cellTexts: setCells.value,
    });
  }

  if (plan.action === 'set_shading') {
    const result = await context.documentHandle.tables.setShading(plan.setShadingParams, context.invokeOptions);
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      targetTableNodeId: plan.targetNodeId,
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      color: plan.color,
      success: (result as { success?: unknown }).success === true,
    });
  }

  const beforeText = await context.documentHandle.getText({}, context.invokeOptions);
  const beforeShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
  await context.documentHandle.tables.insertRow(plan.insertRowParams, context.invokeOptions);
  const afterText = await context.documentHandle.getText({}, context.invokeOptions);
  const afterShape = await context.documentHandle.tables.get({ nodeId: plan.targetNodeId }, context.invokeOptions);
  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

  return workflowStepSuccess({
    action: plan.action,
    targetTableNodeId: plan.targetNodeId,
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    rowOrdinal: plan.rowOrdinal,
    rowIndex: plan.rowIndex,
    position: plan.position,
    rowCountBefore: beforeShape.rows,
    rowCountAfter: afterShape.rows,
    textBefore: beforeText,
    textAfter: afterText,
  });
}

async function verifySplit(
  context: WorkflowEngineContext,
  execution: SuperdocTableTransformExecutionSplit,
): Promise<WorkflowStepResult<SuperdocTableTransformVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const tableCountBefore = context.index.tables.length;
  const tableCountAfter = postIndex.tables.length;
  const tableCountIncreased = tableCountAfter > tableCountBefore;

  let separatorPresent: boolean | undefined;
  if (execution.separatorText != null) {
    const currentText = await context.documentHandle.getText({}, context.invokeOptions);
    separatorPresent = currentText.includes(execution.separatorText);
  }

  const passed = tableCountIncreased && (separatorPresent ?? true);
  const summary =
    execution.separatorText == null
      ? `split_table checks tableCount=${tableCountBefore}->${tableCountAfter}.`
      : `split_table checks tableCount=${tableCountBefore}->${tableCountAfter}; separatorPresent=${separatorPresent}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'split_table verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        tableCountBefore,
        tableCountAfter,
        tableCountIncreased,
        separatorPresent,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      tableCountBefore,
      tableCountAfter,
      tableCountIncreased,
      separatorProvided: execution.separatorText != null,
      separatorPresent,
    },
  });
}

async function verifyInsertColumn(
  context: WorkflowEngineContext,
  execution: SuperdocTableTransformExecutionInsertColumn,
): Promise<WorkflowStepResult<SuperdocTableTransformVerification>> {
  const columnCountIncreased =
    execution.columnCountBefore != null &&
    execution.columnCountAfter != null &&
    execution.columnCountAfter > execution.columnCountBefore;

  let headerTextPresent = true;
  if (execution.headerText != null) {
    const currentText = await context.documentHandle.getText({}, context.invokeOptions);
    headerTextPresent = currentText.includes(execution.headerText);
  }

  const passed = (execution.idempotentSkip === true || columnCountIncreased) && headerTextPresent;
  const summary = `insert_column checks columns=${execution.columnCountBefore ?? 'n/a'}->${
    execution.columnCountAfter ?? 'n/a'
  }; headerTextPresent=${headerTextPresent}; idempotentSkip=${execution.idempotentSkip === true}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'insert_column verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        columnCountBefore: execution.columnCountBefore,
        columnCountAfter: execution.columnCountAfter,
        columnCountIncreased,
        idempotentSkip: execution.idempotentSkip === true,
        headerTextPresent,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      columnCountBefore: execution.columnCountBefore,
      columnCountAfter: execution.columnCountAfter,
      columnCountIncreased,
      idempotentSkip: execution.idempotentSkip === true,
      headerTextProvided: execution.headerText != null,
      headerTextPresent,
    },
  });
}

function verifyPreviewInsertRow(
  execution: SuperdocTableTransformExecutionPreviewInsertRow,
): WorkflowStepResult<SuperdocTableTransformVerification> {
  const revisionUnchanged = execution.revision.unchanged;
  const textUnchanged = execution.textBefore === execution.textAfter;
  const rowCountUnchanged =
    execution.rowCountBefore == null || execution.rowCountAfter == null
      ? true
      : execution.rowCountBefore === execution.rowCountAfter;
  const passed = textUnchanged && rowCountUnchanged;
  const summary = `preview_insert_row checks revisionUnchanged=${revisionUnchanged}; textUnchanged=${textUnchanged}; rowCountUnchanged=${rowCountUnchanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'preview_insert_row verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        revision: execution.revision,
        rowCountBefore: execution.rowCountBefore,
        rowCountAfter: execution.rowCountAfter,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      revisionUnchanged,
      textUnchanged,
      rowCountBefore: execution.rowCountBefore,
      rowCountAfter: execution.rowCountAfter,
      rowCountUnchanged,
    },
  });
}

async function verifyInsertRow(
  context: WorkflowEngineContext,
  execution: SuperdocTableTransformExecutionInsertRow,
): Promise<WorkflowStepResult<SuperdocTableTransformVerification>> {
  const rowCountIncreased =
    execution.rowCountBefore != null &&
    execution.rowCountAfter != null &&
    execution.rowCountAfter > execution.rowCountBefore;
  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  const cellTextsPresent = execution.cellTexts.filter((cell) => currentText.includes(cell.text)).length;
  const passed =
    (execution.idempotentSkip === true || rowCountIncreased) && cellTextsPresent === execution.cellTexts.length;
  const summary = `insert_row checks rows=${execution.rowCountBefore ?? 'n/a'}->${
    execution.rowCountAfter ?? 'n/a'
  }; cellTextsPresent=${cellTextsPresent}/${execution.cellTexts.length}; idempotentSkip=${execution.idempotentSkip === true}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'insert_row verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        rowCountBefore: execution.rowCountBefore,
        rowCountAfter: execution.rowCountAfter,
        rowCountIncreased,
        idempotentSkip: execution.idempotentSkip === true,
        cellTextsPresent,
        cellTextsExpected: execution.cellTexts.length,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      rowCountBefore: execution.rowCountBefore,
      rowCountAfter: execution.rowCountAfter,
      rowCountIncreased,
      idempotentSkip: execution.idempotentSkip === true,
      cellTextsPresent,
      cellTextsExpected: execution.cellTexts.length,
    },
  });
}

async function verifyCreateTable(
  context: WorkflowEngineContext,
  execution: SuperdocTableTransformExecutionCreateTable,
): Promise<WorkflowStepResult<SuperdocTableTransformVerification>> {
  const tableCountIncreased =
    execution.tableCountAfter != null && execution.tableCountAfter > execution.tableCountBefore;
  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  const cellTextsPresent = execution.cellTexts.filter((cell) => currentText.includes(cell.text)).length;
  let shapeMatches = true;
  try {
    const shape = await context.documentHandle.tables.get(
      { nodeId: execution.targetTableNodeId },
      context.invokeOptions,
    );
    shapeMatches = shape.rows === execution.rows && shape.columns === execution.columns;
  } catch {
    shapeMatches = false;
  }
  const passed =
    cellTextsPresent === execution.cellTexts.length &&
    (execution.idempotentSkip === true || (tableCountIncreased && shapeMatches));
  const summary = `create_table checks tableCount=${execution.tableCountBefore}->${execution.tableCountAfter ?? 'n/a'}; shape=${shapeMatches}; cellTextsPresent=${cellTextsPresent}/${execution.cellTexts.length}; idempotentSkip=${execution.idempotentSkip === true}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'create_table verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        tableCountBefore: execution.tableCountBefore,
        tableCountAfter: execution.tableCountAfter,
        tableCountIncreased,
        idempotentSkip: execution.idempotentSkip === true,
        shapeMatches,
        cellTextsPresent,
        cellTextsExpected: execution.cellTexts.length,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      tableCountBefore: execution.tableCountBefore,
      tableCountAfter: execution.tableCountAfter,
      tableCountIncreased,
      idempotentSkip: execution.idempotentSkip === true,
      shapeMatches,
      cellTextsPresent,
      cellTextsExpected: execution.cellTexts.length,
    },
  });
}

function verifySetShading(
  execution: SuperdocTableTransformExecutionSetShading,
): WorkflowStepResult<SuperdocTableTransformVerification> {
  const passed = execution.success;
  const summary = `set_shading checks success=${execution.success}; color=${execution.color}; revisionChanged=${!execution.revision.unchanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TABLE_TRANSFORM_VERIFICATION_FAILED',
      message: 'set_shading verification failed.',
      details: {
        summary,
        targetTableNodeId: execution.targetTableNodeId,
        color: execution.color,
        revision: execution.revision,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    targetTableNodeId: execution.targetTableNodeId,
    passed,
    summary,
    checks: {
      success: execution.success,
      color: execution.color,
      revisionChanged: !execution.revision.unchanged,
    },
  });
}

async function verifyStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocTableTransformResolved,
  _plan: SuperdocTableTransformPlan,
  execution: SuperdocTableTransformExecution,
): Promise<WorkflowStepResult<SuperdocTableTransformVerification>> {
  if (execution.action === 'split_table') {
    return verifySplit(context, execution);
  }
  if (execution.action === 'insert_column') {
    return verifyInsertColumn(context, execution);
  }
  if (execution.action === 'insert_row') {
    return verifyInsertRow(context, execution);
  }
  if (execution.action === 'create_table') {
    return verifyCreateTable(context, execution);
  }
  if (execution.action === 'set_shading') {
    return verifySetShading(execution);
  }
  return verifyPreviewInsertRow(execution);
}

export async function runSuperdocTableTransformWorkflow(
  input: RunSuperdocTableTransformInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocTableTransformResolved,
    SuperdocTableTransformPlan,
    SuperdocTableTransformExecution,
    SuperdocTableTransformVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_table_transform',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => resolveStep(context),
      plan: async (context, resolved) => planStep(context, resolved),
      execute: async (context, resolved, plan) => executeStep(context, resolved, plan),
      verify: async (context, resolved, plan, execution) => verifyStep(context, resolved, plan, execution),
    },
  });
}
