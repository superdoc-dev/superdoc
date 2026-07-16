/**
 * Clean agent runtime.
 *
 * Exposes the four product-stable agent tools:
 *
 * - `superdoc_inspect`     — build a deterministic document snapshot
 * - `agent_apply`       — execute a validated IR plan against a document
 * - `agent_verify`      — re-run verification checks against current state
 * - `agent_operation`   — controlled escape hatch that dispatches a single
 *                         generated `doc.*` operation by id
 *
 * Every mutating call returns receipts containing pre/post evidence,
 * selected targets, executed operations, verification checks, and (for risky
 * domains) save/reopen proof.
 *
 * This runtime does not depend on, or import, the benchmark-shaped
 * `workflow-poc` profile. The benchmark surface is preserved separately for
 * measurement, but agent_* product paths never route through it.
 */
import type { BoundDocApi } from '../generated/client.js';
import { CONTRACT } from '../generated/contract.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { validatePlan, type AgentPlan, type AgentVerificationCheck } from './ir.js';
import {
  buildDocumentSnapshot,
  resolveSnapshotSelector,
  AmbiguousSelectorError,
  type DocumentSnapshot,
  type SnapshotDomain,
} from './doc-snapshot.js';
import { getOperationCatalogEntry, type OperationCatalogEntry } from './operation-catalog.js';

export type AgentInspectArgs = {
  countsOnly?: boolean;
  includeDomains?: readonly SnapshotDomain[];
  blockNodeTypes?: readonly string[];
  blockTextLimit?: number;
  listLimit?: number;
  tableLimit?: number;
  commentLimit?: number;
  trackedChangeLimit?: number;
  blockOffset?: number;
  blockLimit?: number;
  omitEmptyBlocks?: boolean;
  dropTextPreview?: boolean;
};

export type AgentApplyArgs = {
  plan: AgentPlan;
};

export type AgentVerifyArgs = {
  checks: readonly AgentVerificationCheck[];
  saveReopen?: boolean;
};

export type AgentOperationArgs = {
  operationId: string;
  args?: Record<string, unknown>;
  /** When true, fail closed for any operation classified as mutating. Default false. */
  readOnly?: boolean;
};

export type VerificationResult = {
  check: AgentVerificationCheck;
  passed: boolean;
  detail?: string;
};

export type SelectedTarget = {
  selector: import('./ir.js').AgentSelector;
  matched: readonly string[];
};

/**
 * Machine-readable recovery guidance. The prose twins (`revertHint`,
 * teaching-error messages) are what the model reads; this is the same
 * instruction as data, for customer logging and automated retry tooling.
 */
export type ReceiptRecovery = {
  kind: 'retry' | 'revert' | 'reinspect';
  /** Literal next call, paste-ready, e.g. `superdoc_perform_action {"action":"undo_changes","untilMarker":"2.1."}` */
  call?: string;
  selector?: Record<string, unknown>;
};

export type AgentReceipt = {
  /**
   * `partial` means SOME requested edits applied and some did not — receipts
   * must never report a half-done request as plain ok.
   */
  status: 'ok' | 'partial' | 'failed' | 'aborted';
  intent: string;
  preSnapshot?: { revision: string; counts?: DocumentSnapshot['counts'] };
  postSnapshot?: { revision: string; counts?: DocumentSnapshot['counts'] };
  selectedTargets?: readonly SelectedTarget[];
  executedOperations?: ReadonlyArray<{ operationId: string; rationale?: string; result?: unknown }>;
  verification?: ReadonlyArray<VerificationResult>;
  saveReopen?: { attempted: boolean; succeeded: boolean; message?: string };
  errors?: ReadonlyArray<{ code: string; message: string; recovery?: ReceiptRecovery }>;
  /** What the model should do next when status is partial/failed. Prose. */
  nextStep?: string;
  /** Literal revert call when the action dispatched multiple history steps. */
  revertHint?: string;
  recovery?: ReceiptRecovery;
  note?: string;
  /** Action-specific evidence (editsApplied, marker, placement, …). */
  [key: string]: unknown;
};

const RESERVED_ARG_KEYS = new Set(['sessionId', 'doc']);
type BindingMap = Map<string, unknown>;

function ensureKnownOperation(operationId: string): OperationCatalogEntry {
  const entry = getOperationCatalogEntry(operationId);
  if (!entry) {
    throw new SuperDocCliError(`Unknown operation: ${operationId}`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }
  return entry;
}

function ensureClean(args: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(args)) {
    if (RESERVED_ARG_KEYS.has(key)) {
      throw new SuperDocCliError(`Reserved key "${key}" must not appear in agent args.`, {
        code: 'INVALID_ARGUMENT',
        details: { key },
      });
    }
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isRefToken(value: unknown): value is { ref: string; path?: string } {
  return (
    isRecord(value) &&
    typeof value.ref === 'string' &&
    (value.path == null || typeof value.path === 'string') &&
    Object.keys(value).every((key) => key === 'ref' || key === 'path')
  );
}

function readBindingPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  let cursor = value;
  for (const segment of path.split('.').filter((part) => part.length > 0)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function resolveBindingRef(bindings: BindingMap, ref: string, path?: string): unknown {
  if (!bindings.has(ref)) {
    throw new SuperDocCliError(`Unknown plan binding: ${ref}`, {
      code: 'INVALID_ARGUMENT',
      details: { ref, path },
    });
  }
  const resolved = readBindingPath(bindings.get(ref), path);
  if (resolved === undefined) {
    throw new SuperDocCliError(`Binding ${ref} does not contain path ${path}.`, {
      code: 'INVALID_ARGUMENT',
      details: { ref, path },
    });
  }
  return resolved;
}

function resolveBindingTokens(value: unknown, bindings: BindingMap): unknown {
  if (isRefToken(value)) {
    return resolveBindingRef(bindings, value.ref, value.path);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveBindingTokens(entry, bindings));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveBindingTokens(entry, bindings)]));
}

function extractBoundNodeIds(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) return [value];
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((entry) => extractBoundNodeIds(entry)))];
  }
  if (!isRecord(value)) return [];
  const direct =
    typeof value.nodeId === 'string' && value.nodeId.length > 0
      ? [value.nodeId]
      : typeof value.blockId === 'string' && value.blockId.length > 0
        ? [value.blockId]
        : typeof value.startNodeId === 'string' && value.startNodeId.length > 0
          ? [value.startNodeId]
          : [];
  if (direct.length > 0) return direct;
  if (Array.isArray(value.matched)) {
    return [...new Set(value.matched.flatMap((entry) => extractBoundNodeIds(entry)))];
  }
  const recursiveKeys = ['blocks', 'items', 'cells', 'segments'] as const;
  const nested: string[] = [];
  for (const key of recursiveKeys) {
    if (Array.isArray(value[key])) nested.push(...extractBoundNodeIds(value[key]));
  }
  return [...new Set(nested)];
}

function resolveSelectorWithBindings(
  snapshot: DocumentSnapshot,
  selector: import('./ir.js').AgentSelector,
  bindings: BindingMap,
): readonly string[] {
  if (selector.kind === 'ref') {
    return extractBoundNodeIds(resolveBindingRef(bindings, selector.ref));
  }
  if (selector.kind === 'relative') {
    const targetIds = resolveSelectorWithBindings(snapshot, selector.target, bindings);
    const offset = selector.position === 'before' ? -1 : 1;
    const matches: string[] = [];
    for (const targetId of targetIds) {
      const index = snapshot.blocks.findIndex((block) => block.nodeId === targetId);
      if (index === -1) continue;
      const sibling = snapshot.blocks[index + offset];
      if (sibling != null) matches.push(sibling.nodeId);
    }
    return [...new Set(matches)];
  }
  return resolveSnapshotSelector(snapshot, selector);
}

function resolveDocMethod(doc: BoundDocApi, operationId: string): (args: Record<string, unknown>) => Promise<unknown> {
  const tokens = operationId.split('.').slice(1);
  let cursor: unknown = doc;
  for (const token of tokens) {
    if (
      cursor == null ||
      (typeof cursor !== 'object' && typeof cursor !== 'function') ||
      !(token in (cursor as Record<string, unknown>))
    ) {
      throw new SuperDocCliError(`No bound method found for operation ${operationId}.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { operationId, token },
      });
    }
    cursor = (cursor as Record<string, unknown>)[token];
  }
  if (typeof cursor !== 'function') {
    throw new SuperDocCliError(`Resolved member for ${operationId} is not callable.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }
  return cursor as (args: Record<string, unknown>) => Promise<unknown>;
}

export async function agentInspect(doc: BoundDocApi, args: AgentInspectArgs = {}): Promise<DocumentSnapshot> {
  return buildDocumentSnapshot(doc, args);
}

function checkAgainstSnapshot(snapshot: DocumentSnapshot, check: AgentVerificationCheck): VerificationResult {
  switch (check.kind) {
    case 'block-text-contains': {
      const block = snapshot.blocks.find((b) => b.nodeId === check.nodeId);
      const passed = !!block && block.text.includes(check.text);
      return { check, passed, detail: passed ? undefined : `block ${check.nodeId} does not contain text` };
    }
    case 'block-text-equals': {
      const block = snapshot.blocks.find((b) => b.nodeId === check.nodeId);
      const passed = !!block && block.text === check.text;
      return { check, passed };
    }
    case 'block-count-delta':
      return { check, passed: false, detail: 'block-count-delta requires a baseline snapshot' };
    case 'list-item-count': {
      const list = check.listId == null ? snapshot.lists[0] : snapshot.lists.find((l) => l.listId === check.listId);
      const passed = !!list && list.items.length === check.expected;
      return { check, passed, detail: passed ? undefined : `expected ${check.expected} items` };
    }
    case 'table-shape': {
      const table = snapshot.tables.find((t) => t.nodeId === check.nodeId);
      const passed = !!table && table.rows === check.rows && table.columns === check.columns;
      return { check, passed };
    }
    case 'comment-count-delta':
      return { check, passed: false, detail: 'comment-count-delta requires a baseline snapshot' };
    case 'tracked-change-count-delta':
      return { check, passed: false, detail: 'tracked-change-count-delta requires a baseline snapshot' };
    case 'image-anchor-present': {
      const passed =
        check.imageId == null
          ? snapshot.images.length > 0
          : snapshot.images.some((img) => img.imageId === check.imageId);
      return { check, passed };
    }
    case 'revision-changed':
      return { check, passed: false, detail: 'revision-changed requires a baseline snapshot' };
    case 'revision-unchanged':
      return { check, passed: false, detail: 'revision-unchanged requires a baseline snapshot' };
    case 'document-saves-cleanly':
      return { check, passed: false, detail: 'document-saves-cleanly requires save/reopen evidence' };
    case 'save-reopen-text-contains':
      return { check, passed: false, detail: 'save-reopen-text-contains requires save/reopen evidence' };
    default:
      // Action-evidence check kinds (range-converted, placement-honored, …)
      // are computed inline by the action that emitted them; they cannot be
      // re-evaluated from a bare snapshot. Fail closed.
      return { check, passed: false, detail: 'action-evidence check; not re-checkable from a snapshot' };
  }
}

type SaveReopenEvidence = {
  attempted: boolean;
  succeeded: boolean;
  message?: string;
  snapshot?: DocumentSnapshot;
};

function computeDeltaChecks(
  pre: DocumentSnapshot,
  post: DocumentSnapshot,
  checks: readonly AgentVerificationCheck[],
  saveReopen?: SaveReopenEvidence,
): VerificationResult[] {
  const results: VerificationResult[] = [];
  for (const check of checks) {
    if (check.kind === 'block-count-delta') {
      const preCount = pre.blocks.filter((b) => b.nodeType === check.nodeType).length;
      const postCount = post.blocks.filter((b) => b.nodeType === check.nodeType).length;
      results.push({
        check,
        passed: postCount - preCount === check.delta,
        detail: `pre=${preCount} post=${postCount} delta=${postCount - preCount}`,
      });
    } else if (check.kind === 'comment-count-delta') {
      results.push({
        check,
        passed: post.comments.length - pre.comments.length === check.delta,
        detail: `pre=${pre.comments.length} post=${post.comments.length}`,
      });
    } else if (check.kind === 'tracked-change-count-delta') {
      results.push({
        check,
        passed: post.trackedChanges.length - pre.trackedChanges.length === check.delta,
        detail: `pre=${pre.trackedChanges.length} post=${post.trackedChanges.length}`,
      });
    } else if (check.kind === 'revision-changed') {
      results.push({
        check,
        passed: pre.revision !== post.revision,
        detail: `pre=${pre.revision} post=${post.revision}`,
      });
    } else if (check.kind === 'revision-unchanged') {
      results.push({
        check,
        passed: pre.revision === post.revision,
        detail: `pre=${pre.revision} post=${post.revision}`,
      });
    } else if (check.kind === 'document-saves-cleanly') {
      results.push({
        check,
        passed: saveReopen?.attempted === true && saveReopen.succeeded === true,
        detail: saveReopen?.message,
      });
    } else if (check.kind === 'save-reopen-text-contains') {
      const found = saveReopen?.snapshot?.blocks.some((block) => block.text.includes(check.text)) ?? false;
      results.push({
        check,
        passed: saveReopen?.attempted === true && saveReopen.succeeded === true && found,
        detail: found ? undefined : `text not found after save/reopen: ${check.text}`,
      });
    } else {
      results.push(checkAgainstSnapshot(post, check));
    }
  }
  return results;
}

function computeCurrentChecks(
  snapshot: DocumentSnapshot,
  checks: readonly AgentVerificationCheck[],
  saveReopen?: SaveReopenEvidence,
): VerificationResult[] {
  return checks.map((check) => {
    if (check.kind === 'document-saves-cleanly') {
      return {
        check,
        passed: saveReopen?.attempted === true && saveReopen.succeeded === true,
        detail: saveReopen?.message,
      };
    }
    if (check.kind === 'save-reopen-text-contains') {
      const found = saveReopen?.snapshot?.blocks.some((block) => block.text.includes(check.text)) ?? false;
      return {
        check,
        passed: saveReopen?.attempted === true && saveReopen.succeeded === true && found,
        detail: found ? undefined : `text not found after save/reopen: ${check.text}`,
      };
    }
    return checkAgainstSnapshot(snapshot, check);
  });
}

const RISKY_DOMAINS = new Set(['sections', 'protection', 'permission-ranges', 'header-footer', 'content-controls']);

function planTouchesRiskyDomain(plan: AgentPlan): boolean {
  for (const step of plan.steps) {
    if (step.kind !== 'apply') continue;
    const entry = getOperationCatalogEntry(step.operationId);
    if (entry && RISKY_DOMAINS.has(entry.domain)) return true;
  }
  return false;
}

async function trySaveReopen(doc: BoundDocApi, checks: readonly AgentVerificationCheck[]): Promise<SaveReopenEvidence> {
  const saveAny = (doc as unknown as { save?: (args?: Record<string, unknown>) => Promise<unknown> }).save;
  if (typeof saveAny !== 'function') {
    return { attempted: false, succeeded: false, message: 'save not available on doc handle' };
  }
  try {
    await saveAny.call(doc, {});
    // Rebuild a fresh snapshot after save. Host-level true reopen still needs
    // a new document handle, which this runtime cannot force on its own.
    const fresh = await buildDocumentSnapshot(doc);
    for (const check of checks) {
      if (check.kind === 'save-reopen-text-contains') {
        const found = fresh.blocks.some((b) => b.text.includes(check.text));
        if (!found) {
          return {
            attempted: true,
            succeeded: false,
            message: `text not found after save: ${check.text}`,
            snapshot: fresh,
          };
        }
      }
    }
    return { attempted: true, succeeded: true, snapshot: fresh };
  } catch (err) {
    return { attempted: true, succeeded: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function verificationNeedsSaveReopen(checks: readonly AgentVerificationCheck[]): boolean {
  return checks.some((check) => check.kind === 'document-saves-cleanly' || check.kind === 'save-reopen-text-contains');
}

export async function agentApply(doc: BoundDocApi, args: AgentApplyArgs): Promise<AgentReceipt> {
  const plan = args.plan;
  const validation = validatePlan(plan);
  if (!validation.ok) {
    return {
      status: 'failed',
      intent: plan.intent,
      preSnapshot: { revision: 'unknown', counts: emptyCounts() },
      selectedTargets: [],
      executedOperations: [],
      verification: [],
      errors: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  const preSnapshot = await buildDocumentSnapshot(doc);
  const selectedTargets: SelectedTarget[] = [];
  const executedOperations: Array<{ operationId: string; rationale?: string; result?: unknown }> = [];
  const bindings: BindingMap = new Map();

  try {
    for (const step of plan.steps) {
      if (step.kind === 'select') {
        const matched = resolveSelectorWithBindings(preSnapshot, step.selector, bindings);
        if (step.requireUnique && matched.length !== 1) {
          throw new AmbiguousSelectorError(
            `Selector did not resolve uniquely (matched ${matched.length}).`,
            matched.map((nodeId) => ({ nodeId, description: nodeId })),
          );
        }
        selectedTargets.push({ selector: step.selector, matched });
        if (step.bind) {
          bindings.set(step.bind, matched.length === 1 ? matched[0] : [...matched]);
        }
        continue;
      }
      if (step.kind === 'inspect') {
        const inspectArgs = ensureClean(resolveBindingTokens(step.args, bindings) as Record<string, unknown>);
        const method = resolveDocMethod(doc, step.operationId);
        const result = await method(inspectArgs);
        if (step.bind) bindings.set(step.bind, result);
        continue;
      }
      if (step.kind === 'apply') {
        ensureKnownOperation(step.operationId);
        const applyArgs = ensureClean(resolveBindingTokens(step.args, bindings) as Record<string, unknown>);
        const method = resolveDocMethod(doc, step.operationId);
        const argsWithMode =
          step.changeMode != null && getOperationCatalogEntry(step.operationId)?.supportsChangeMode
            ? { ...applyArgs, changeMode: step.changeMode }
            : applyArgs;
        const result = await method(argsWithMode);
        executedOperations.push({ operationId: step.operationId, rationale: step.rationale, result });
      }
    }
  } catch (err) {
    if (err instanceof AmbiguousSelectorError) {
      return {
        status: 'aborted',
        intent: plan.intent,
        preSnapshot: { revision: preSnapshot.revision, counts: preSnapshot.counts },
        selectedTargets,
        executedOperations,
        verification: [],
        errors: [
          {
            code: err.code,
            message: err.message,
          },
        ],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      intent: plan.intent,
      preSnapshot: { revision: preSnapshot.revision, counts: preSnapshot.counts },
      selectedTargets,
      executedOperations,
      verification: [],
      errors: [{ code: 'APPLY_FAILED', message }],
    };
  }

  const postSnapshot = await buildDocumentSnapshot(doc);
  const verifyStep = plan.steps.find((s) => s.kind === 'verify');
  let saveReopen: AgentReceipt['saveReopen'];
  const shouldSaveReopen =
    (verifyStep?.kind === 'verify' && (verifyStep.saveReopen || verificationNeedsSaveReopen(verifyStep.checks))) ||
    planTouchesRiskyDomain(plan);
  if (shouldSaveReopen) {
    saveReopen = await trySaveReopen(doc, verifyStep?.kind === 'verify' ? verifyStep.checks : []);
  }
  const verification: VerificationResult[] =
    verifyStep?.kind === 'verify' ? computeDeltaChecks(preSnapshot, postSnapshot, verifyStep.checks, saveReopen) : [];

  const allVerified = verification.every((v) => v.passed);
  return {
    status: allVerified ? 'ok' : 'failed',
    intent: plan.intent,
    preSnapshot: { revision: preSnapshot.revision, counts: preSnapshot.counts },
    postSnapshot: { revision: postSnapshot.revision, counts: postSnapshot.counts },
    selectedTargets,
    executedOperations,
    verification,
    saveReopen,
  };
}

export async function agentVerify(doc: BoundDocApi, args: AgentVerifyArgs): Promise<AgentReceipt> {
  const snapshot = await buildDocumentSnapshot(doc);
  let saveReopen: AgentReceipt['saveReopen'];
  if (args.saveReopen || verificationNeedsSaveReopen(args.checks)) {
    saveReopen = await trySaveReopen(doc, args.checks);
  }
  const verification = computeCurrentChecks(snapshot, args.checks, saveReopen);
  const allPassed = verification.every((v) => v.passed);
  return {
    status: allPassed ? 'ok' : 'failed',
    intent: 'verify',
    preSnapshot: { revision: snapshot.revision, counts: snapshot.counts },
    postSnapshot: { revision: snapshot.revision, counts: snapshot.counts },
    selectedTargets: [],
    executedOperations: [],
    verification,
    saveReopen,
  };
}

/**
 * Controlled escape hatch — dispatches a single generated operation by id.
 * The catalog determines mode (read/write); if `readOnly` is true and the
 * operation is mutating, the call fails closed.
 */
export async function agentOperation(doc: BoundDocApi, args: AgentOperationArgs): Promise<unknown> {
  const entry = ensureKnownOperation(args.operationId);
  if (args.readOnly && entry.isMutating) {
    throw new SuperDocCliError(`Operation ${args.operationId} is mutating and readOnly was requested.`, {
      code: 'INVALID_ARGUMENT',
      details: { operationId: args.operationId },
    });
  }
  const callArgs = ensureClean(args.args ?? {});
  // Sanity-check the operation exists in the generated CONTRACT (and not just
  // our derived catalog). This protects against drift between contract.ts
  // and the doc-api binding.
  if (!CONTRACT.operations[args.operationId]) {
    throw new SuperDocCliError(`Operation ${args.operationId} is not in the generated contract.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId: args.operationId },
    });
  }
  const method = resolveDocMethod(doc, args.operationId);
  return method(callArgs);
}

function emptyCounts(): DocumentSnapshot['counts'] {
  return {
    blocks: 0,
    paragraphs: 0,
    headings: 0,
    tables: 0,
    lists: 0,
    images: 0,
    comments: 0,
    trackedChanges: 0,
    sections: 0,
    fields: 0,
    hyperlinks: 0,
    bookmarks: 0,
    contentControls: 0,
    permissionRanges: 0,
    styles: 0,
    headers: 0,
    footers: 0,
  };
}
