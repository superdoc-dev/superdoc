/**
 * Clean agent IR.
 *
 * The IR makes the four phases of an agent edit explicit:
 *
 *   inspect -> select -> apply -> verify
 *
 * Every mutation a stable agent runtime path produces must be expressible as
 * an `AgentPlan` whose steps reference real entries in the generated
 * operation catalog. There is no prompt-derived execution contract: the IR is
 * the only contract.
 *
 * Selectors are deterministic — they resolve to concrete blocks/ranges by
 * ordinal, ref, nodeId, or named entity. Ambiguity is returned as a
 * structured error so the agent must clarify rather than silently picking.
 *
 * Apply steps reference a generated `doc.*` operation id and carry the
 * arguments the operation expects. The validator enforces that the operation
 * id exists in the catalog, that it is the right mode for the requested
 * intent (read vs write), and that arguments do not include reserved
 * runtime keys.
 *
 * Verify steps describe the post-conditions the runtime must prove before
 * declaring success. For risky domains (sections, protection,
 * permission-ranges) the runtime additionally captures save/reopen evidence.
 */
import { getOperationCatalogEntry, type OperationCatalogEntry } from './operation-catalog.js';

export type AgentSelector =
  | { kind: 'ref'; ref: string }
  | { kind: 'nodeId'; nodeId: string }
  | { kind: 'ordinal'; ordinalKind: AgentOrdinalKind; value: number }
  | { kind: 'tableCell'; tableOrdinal: number; rowIndex: number; columnIndex: number }
  | {
      kind: 'textSearch';
      terms: readonly string[];
      match?: 'all' | 'any';
      occurrence?: number;
      caseSensitive?: boolean;
      nodeTypes?: readonly ('paragraph' | 'heading' | 'listItem')[];
    }
  | { kind: 'entity'; entityType: AgentEntityKind; entityId: string }
  | { kind: 'document' }
  | { kind: 'placement'; at: 'document_start' | 'document_end' }
  | { kind: 'relative'; position: 'before' | 'after'; target: AgentSelector };

export type AgentOrdinalKind =
  | 'blockOrdinal'
  | 'paragraphOrdinal'
  | 'bodyParagraphOrdinal'
  | 'headingOrdinal'
  | 'listOrdinal'
  | 'tableOrdinal'
  | 'sectionOrdinal';

export type AgentEntityKind = 'comment' | 'trackedChange' | 'bookmark' | 'image' | 'hyperlink' | 'field';

export type AgentChangeMode = 'direct' | 'tracked';

export type AgentVerificationCheck =
  | { kind: 'block-text-contains'; nodeId: string; text: string }
  | { kind: 'block-text-equals'; nodeId: string; text: string }
  | { kind: 'block-count-delta'; nodeType: string; delta: number }
  | { kind: 'list-item-count'; listId?: string; expected: number }
  | { kind: 'table-shape'; nodeId: string; rows: number; columns: number }
  | { kind: 'comment-count-delta'; delta: number }
  | { kind: 'tracked-change-count-delta'; delta: number }
  | { kind: 'image-anchor-present'; imageId?: string }
  | { kind: 'revision-changed' }
  | { kind: 'revision-unchanged' }
  | { kind: 'document-saves-cleanly' }
  | { kind: 'save-reopen-text-contains'; text: string }
  // Action-evidence checks: emitted by list/numbering/scoped-replace actions.
  | { kind: 'block-text-matches-expectation' }
  | { kind: 'list-kind-equals'; expected: string }
  | { kind: 'range-converted'; expected: number }
  | { kind: 'paragraphs-form-one-list'; expected: number }
  | { kind: 'single-list-with-expected-items'; expected: number }
  | { kind: 'items-form-one-list'; expected: number }
  | { kind: 'placement-honored'; at: string; anchorNodeId: string }
  | { kind: 'marker-restored'; marker: string }
  | { kind: 'steps-undone' }
  | { kind: 'marker-rendered' }
  | { kind: 'block-style-equals'; styleId: string };

export type AgentInspectStep = {
  kind: 'inspect';
  /**
   * `read`-mode catalog operation used to gather inspection data. e.g.
   * `doc.info`, `doc.blocks.list`, `doc.tables.get`.
   */
  operationId: string;
  args: Record<string, unknown>;
  /** Optional alias used by later steps to reference the inspection result. */
  bind?: string;
};

export type AgentSelectStep = {
  kind: 'select';
  selector: AgentSelector;
  /** Optional alias used by later steps to reference the resolved selector. */
  bind?: string;
  /**
   * When true, the selector must resolve uniquely. Multiple matches are
   * reported as a structured AMBIGUOUS_SELECTOR error and the plan halts.
   */
  requireUnique?: boolean;
};

export type AgentApplyStep = {
  kind: 'apply';
  operationId: string;
  args: Record<string, unknown>;
  /** Optional human-readable rationale included in receipts for auditability. */
  rationale?: string;
  changeMode?: AgentChangeMode;
  /** True for plans that must run as a single atomic batch. */
  atomic?: boolean;
};

export type AgentVerifyStep = {
  kind: 'verify';
  checks: readonly AgentVerificationCheck[];
  /** When true, the runtime must save and re-open the document and re-run the checks. */
  saveReopen?: boolean;
};

export type AgentPlanStep = AgentInspectStep | AgentSelectStep | AgentApplyStep | AgentVerifyStep;

export type AgentPlan = {
  intent: string;
  steps: readonly AgentPlanStep[];
  /** Optional plain-language preconditions evaluated before execution. */
  preconditions?: readonly string[];
  /** Optional plain-language postconditions used for evidence reporting. */
  postconditions?: readonly string[];
  /** When true, the entire plan must be applied atomically. */
  atomic?: boolean;
  /** Expected diff summary (informational; used in receipts). */
  expectedDiff?: {
    blocksAdded?: number;
    blocksRemoved?: number;
    textReplacements?: number;
    commentsAdded?: number;
    trackedChangesAdded?: number;
  };
};

export type IrValidationError = {
  code:
    | 'UNKNOWN_OPERATION'
    | 'WRONG_OPERATION_MODE'
    | 'MISSING_VERIFY_STEP'
    | 'MISSING_APPLY_STEP'
    | 'RESERVED_ARG_KEY'
    | 'INVALID_SELECTOR'
    | 'EMPTY_PLAN';
  message: string;
  stepIndex?: number;
  operationId?: string;
};

export type IrValidationResult = {
  ok: boolean;
  errors: readonly IrValidationError[];
  /** Catalog entries referenced by the plan, in order. */
  references: readonly OperationCatalogEntry[];
};

const RESERVED_ARG_KEYS = new Set(['sessionId', 'doc']);

function isSelectorValid(selector: AgentSelector): boolean {
  switch (selector.kind) {
    case 'ref':
      return typeof selector.ref === 'string' && selector.ref.length > 0;
    case 'nodeId':
      return typeof selector.nodeId === 'string' && selector.nodeId.length > 0;
    case 'ordinal':
      return Number.isInteger(selector.value) && selector.value >= 1;
    case 'tableCell':
      return (
        Number.isInteger(selector.tableOrdinal) &&
        selector.tableOrdinal >= 1 &&
        Number.isInteger(selector.rowIndex) &&
        selector.rowIndex >= 0 &&
        Number.isInteger(selector.columnIndex) &&
        selector.columnIndex >= 0
      );
    case 'textSearch':
      return (
        Array.isArray(selector.terms) &&
        selector.terms.length > 0 &&
        selector.terms.every((term) => typeof term === 'string' && term.length > 0) &&
        (selector.match == null || selector.match === 'all' || selector.match === 'any') &&
        (selector.occurrence == null || (Number.isInteger(selector.occurrence) && selector.occurrence >= 1))
      );
    case 'entity':
      return typeof selector.entityId === 'string' && selector.entityId.length > 0;
    case 'placement':
      return selector.at === 'document_start' || selector.at === 'document_end';
    case 'relative':
      return (selector.position === 'before' || selector.position === 'after') && isSelectorValid(selector.target);
    case 'document':
      return true;
  }
}

export function validatePlan(plan: AgentPlan): IrValidationResult {
  const errors: IrValidationError[] = [];
  const references: OperationCatalogEntry[] = [];

  if (!plan.steps || plan.steps.length === 0) {
    errors.push({ code: 'EMPTY_PLAN', message: 'Plan must contain at least one step.' });
    return { ok: false, errors, references };
  }

  let hasApply = false;
  let hasVerify = false;
  let hasMutatingApply = false;

  plan.steps.forEach((step, index) => {
    switch (step.kind) {
      case 'inspect': {
        const entry = getOperationCatalogEntry(step.operationId);
        if (!entry) {
          errors.push({
            code: 'UNKNOWN_OPERATION',
            message: `Inspect step references unknown operation: ${step.operationId}.`,
            stepIndex: index,
            operationId: step.operationId,
          });
          break;
        }
        if (entry.mode === 'write') {
          errors.push({
            code: 'WRONG_OPERATION_MODE',
            message: `Inspect step ${step.operationId} must use a read-mode operation.`,
            stepIndex: index,
            operationId: step.operationId,
          });
        }
        for (const key of Object.keys(step.args)) {
          if (RESERVED_ARG_KEYS.has(key)) {
            errors.push({
              code: 'RESERVED_ARG_KEY',
              message: `Reserved key "${key}" must not appear in IR args.`,
              stepIndex: index,
              operationId: step.operationId,
            });
          }
        }
        references.push(entry);
        break;
      }
      case 'select': {
        if (!isSelectorValid(step.selector)) {
          errors.push({
            code: 'INVALID_SELECTOR',
            message: `Select step has invalid selector at index ${index}.`,
            stepIndex: index,
          });
        }
        break;
      }
      case 'apply': {
        hasApply = true;
        const entry = getOperationCatalogEntry(step.operationId);
        if (!entry) {
          errors.push({
            code: 'UNKNOWN_OPERATION',
            message: `Apply step references unknown operation: ${step.operationId}.`,
            stepIndex: index,
            operationId: step.operationId,
          });
          break;
        }
        if (entry.mode === 'read') {
          errors.push({
            code: 'WRONG_OPERATION_MODE',
            message: `Apply step ${step.operationId} must use a write-mode operation.`,
            stepIndex: index,
            operationId: step.operationId,
          });
        }
        if (entry.isMutating) hasMutatingApply = true;
        for (const key of Object.keys(step.args)) {
          if (RESERVED_ARG_KEYS.has(key)) {
            errors.push({
              code: 'RESERVED_ARG_KEY',
              message: `Reserved key "${key}" must not appear in IR args.`,
              stepIndex: index,
              operationId: step.operationId,
            });
          }
        }
        references.push(entry);
        break;
      }
      case 'verify': {
        hasVerify = true;
        break;
      }
    }
  });

  if (!hasApply) {
    errors.push({ code: 'MISSING_APPLY_STEP', message: 'Plan must contain at least one apply step.' });
  }
  if (hasMutatingApply && !hasVerify) {
    errors.push({
      code: 'MISSING_VERIFY_STEP',
      message: 'Mutating plans must include a verify step with explicit checks.',
    });
  }

  return { ok: errors.length === 0, errors, references };
}

/**
 * Tagged-union narrowing helper used by runtimes and tests. Keeps the IR types
 * the single source of truth for step discrimination.
 */
export function isApplyStep(step: AgentPlanStep): step is AgentApplyStep {
  return step.kind === 'apply';
}

export function isVerifyStep(step: AgentPlanStep): step is AgentVerifyStep {
  return step.kind === 'verify';
}

export function isInspectStep(step: AgentPlanStep): step is AgentInspectStep {
  return step.kind === 'inspect';
}

export function isSelectStep(step: AgentPlanStep): step is AgentSelectStep {
  return step.kind === 'select';
}
