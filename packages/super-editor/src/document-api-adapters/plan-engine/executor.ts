/**
 * Atomic execution engine — single-transaction execution with rollback semantics.
 *
 * Phase 2 (execute): apply compiled mutation steps sequentially in one PM
 * transaction, remap positions, evaluate assert steps post-mutation.
 */

import type {
  MutationStep,
  AssertStep,
  TextRewriteStep,
  TextInsertStep,
  TextDeleteStep,
  StyleApplyStep,
  PlanReceipt,
  StepOutcome,
  StepEffect,
  TextStepData,
  TextStepResolution,
  AssertStepData,
  MutationsApplyInput,
  SetMarks,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CompiledStep, CompiledPlan } from './compiler.js';
import type { CompiledTarget, ExecuteContext } from './executor-registry.types.js';
import { getStepExecutor } from './executor-registry.js';
import { planError } from './errors.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { compilePlan } from './compiler.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { resolveTextRangeInBlock } from '../helpers/text-offset-resolver.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from '../helpers/transaction-meta.js';
import { captureRunsInRange, resolveInlineStyle } from './style-resolver.js';
import { mapBlockNodeType } from '../helpers/node-address-resolver.js';
import { resolveWithinScope, scopeByRange } from '../helpers/adapter-utils.js';

// ---------------------------------------------------------------------------
// Style resolution helpers
// ---------------------------------------------------------------------------

/** Default inline policy when style is omitted from text.rewrite. */
const DEFAULT_INLINE_POLICY: import('@superdoc/document-api').InlineStylePolicy = {
  mode: 'preserve',
  onNonUniform: 'majority',
};

function resolveMarks(editor: Editor, target: CompiledTarget, step: MutationStep): readonly unknown[] {
  if (step.op !== 'text.rewrite') return [];
  const rewriteStep = step as TextRewriteStep;
  const policy = rewriteStep.args.style?.inline ?? DEFAULT_INLINE_POLICY;

  // Use captured style data from compilation if available, otherwise capture now
  const captured =
    target.capturedStyle ??
    captureRunsInRange(editor, toAbsoluteBlockPos(editor, target.blockId), target.from, target.to);

  return resolveInlineStyle(editor, captured, policy, step.id);
}

function toAbsoluteBlockPos(editor: Editor, blockId: string): number {
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === blockId);
  if (!candidate) throw planError('TARGET_NOT_FOUND', `block "${blockId}" not found in style capture fallback`);
  return candidate.pos;
}

function buildMarksFromSetMarks(editor: Editor, setMarks?: SetMarks): readonly unknown[] {
  if (!setMarks) return [];
  const { schema } = editor.state;
  const marks: unknown[] = [];
  if (setMarks.bold && schema.marks.bold) marks.push(schema.marks.bold.create());
  if (setMarks.italic && schema.marks.italic) marks.push(schema.marks.italic.create());
  if (setMarks.underline && schema.marks.underline) marks.push(schema.marks.underline.create());
  if (setMarks.strike && schema.marks.strike) marks.push(schema.marks.strike.create());
  return marks;
}

// ---------------------------------------------------------------------------
// Step executors
// ---------------------------------------------------------------------------

/**
 * Resolves block-relative text offsets to absolute PM positions using the
 * node-walking resolver.  This accounts for inline run boundaries (marks,
 * leaf atoms) so that offsets from the flattened text model map to the
 * correct PM positions.
 */
function resolveTextRange(
  editor: Editor,
  blockId: string,
  from: number,
  to: number,
  stepId?: string,
): { absFrom: number; absTo: number } {
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === blockId);
  if (!candidate) throw planError('TARGET_NOT_FOUND', `block "${blockId}" not found`, stepId);

  const resolved = resolveTextRangeInBlock(candidate.node, candidate.pos, { start: from, end: to });
  if (!resolved) {
    throw planError('INVALID_INPUT', `text offset [${from}, ${to}) out of range in block "${blockId}"`, stepId);
  }
  return { absFrom: resolved.from, absTo: resolved.to };
}

/**
 * Resolves a single block-relative text offset to an absolute PM position.
 * Used for insertion points where only one position is needed.
 */
function resolveTextOffset(editor: Editor, blockId: string, offset: number, stepId?: string): number {
  return resolveTextRange(editor, blockId, offset, offset, stepId).absFrom;
}

/**
 * Returns the absolute PM position of a block node (not a text offset).
 * Used by create steps that insert relative to block boundaries.
 */
function toAbsoluteBlockInsertPos(editor: Editor, blockId: string, offset: number, stepId?: string): number {
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === blockId);
  if (!candidate) throw planError('TARGET_NOT_FOUND', `block "${blockId}" not found`, stepId);
  return candidate.pos + offset;
}

export function executeTextRewrite(
  editor: Editor,
  tr: any,
  target: CompiledTarget,
  step: TextRewriteStep,
  mapping: any,
): { changed: boolean } {
  const range = resolveTextRange(editor, target.blockId, target.from, target.to, step.id);
  const absFrom = mapping.map(range.absFrom);
  const absTo = mapping.map(range.absTo);

  const replacementText = step.args.replacement.text;
  const marks = resolveMarks(editor, target, step);

  const textNode = editor.state.schema.text(replacementText, marks as any);
  tr.replaceWith(absFrom, absTo, textNode);

  return { changed: replacementText !== target.text };
}

export function executeTextInsert(
  editor: Editor,
  tr: any,
  target: CompiledTarget,
  step: TextInsertStep,
  mapping: any,
): { changed: boolean } {
  const position = step.args.position;
  const offset = position === 'before' ? target.from : target.to;
  const absPos = mapping.map(resolveTextOffset(editor, target.blockId, offset, step.id));

  const text = step.args.content.text;
  if (!text) return { changed: false };

  // Resolve insert style
  let marks: readonly unknown[] = [];
  const stylePolicy = step.args.style?.inline;
  if (stylePolicy) {
    if (stylePolicy.mode === 'set') {
      marks = buildMarksFromSetMarks(editor, stylePolicy.setMarks);
    } else if (stylePolicy.mode === 'clear') {
      marks = [];
    } else {
      // 'inherit' — use marks at insertion point
      const resolvedPos = tr.doc.resolve(absPos);
      marks = resolvedPos.marks();
    }
  } else {
    // Default: inherit
    const resolvedPos = tr.doc.resolve(absPos);
    marks = resolvedPos.marks();
  }

  const textNode = editor.state.schema.text(text, marks as any);
  tr.insert(absPos, textNode);

  return { changed: true };
}

export function executeTextDelete(
  editor: Editor,
  tr: any,
  target: CompiledTarget,
  _step: TextDeleteStep,
  mapping: any,
): { changed: boolean } {
  const range = resolveTextRange(editor, target.blockId, target.from, target.to, _step.id);
  const absFrom = mapping.map(range.absFrom);
  const absTo = mapping.map(range.absTo);

  if (absFrom === absTo) return { changed: false };

  tr.delete(absFrom, absTo);
  return { changed: true };
}

export function executeStyleApply(
  editor: Editor,
  tr: any,
  target: CompiledTarget,
  step: StyleApplyStep,
  mapping: any,
): { changed: boolean } {
  const range = resolveTextRange(editor, target.blockId, target.from, target.to, step.id);
  const absFrom = mapping.map(range.absFrom);
  const absTo = mapping.map(range.absTo);
  const { schema } = editor.state;
  let changed = false;

  const markEntries: Array<[string, boolean | undefined, any]> = [
    ['bold', step.args.marks.bold, schema.marks.bold],
    ['italic', step.args.marks.italic, schema.marks.italic],
    ['underline', step.args.marks.underline, schema.marks.underline],
    ['strike', step.args.marks.strike, schema.marks.strike],
  ];

  for (const [, value, markType] of markEntries) {
    if (value === undefined || !markType) continue;
    if (value) {
      tr.addMark(absFrom, absTo, markType.create());
    } else {
      tr.removeMark(absFrom, absTo, markType);
    }
    changed = true;
  }

  return { changed };
}

/**
 * Counts text pattern matches within a given text string.
 */
function countTextMatches(text: string, pattern: string, mode: string, caseSensitive: boolean): number {
  if (mode === 'regex') {
    if (pattern.length > 1024) return 0;
    const flags = caseSensitive ? 'g' : 'gi';
    try {
      const regex = new RegExp(pattern, flags);
      const matches = text.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = searchText.indexOf(searchPattern, pos);
    if (idx === -1) break;
    count++;
    pos = idx + 1;
  }
  return count;
}

type AssertIndexCandidate = {
  node: any;
  pos: number;
  end: number;
  nodeType: string;
  nodeId: string;
};

type AssertIndex = {
  candidates: AssertIndexCandidate[];
  byId: Map<string, AssertIndexCandidate>;
};

function asId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveAssertNodeId(node: any, mappedType: string): string | undefined {
  const attrs = node.attrs ?? {};
  // Paragraph-like blocks use paraId as canonical identity, with sdBlockId fallback.
  if (mappedType === 'paragraph' || mappedType === 'heading' || mappedType === 'listItem') {
    return asId(attrs.paraId) ?? asId(attrs.sdBlockId) ?? asId(attrs.nodeId);
  }
  return (
    asId(attrs.blockId) ??
    asId(attrs.id) ??
    asId(attrs.paraId) ??
    asId(attrs.uuid) ??
    asId(attrs.sdBlockId) ??
    asId(attrs.nodeId)
  );
}

function buildAssertIndex(doc: any): AssertIndex {
  const candidates: AssertIndexCandidate[] = [];
  const byId = new Map<string, AssertIndexCandidate>();
  const ambiguous = new Set<string>();

  function registerKey(key: string, candidate: AssertIndexCandidate): void {
    if (byId.has(key)) {
      ambiguous.add(key);
      byId.delete(key);
      return;
    }
    if (!ambiguous.has(key)) {
      byId.set(key, candidate);
    }
  }

  doc.descendants((node: any, pos: number) => {
    const nodeType = mapBlockNodeType(node);
    if (!nodeType) return true;
    const nodeId = resolveAssertNodeId(node, nodeType);
    if (!nodeId) return true;

    const candidate: AssertIndexCandidate = {
      node,
      pos,
      end: pos + node.nodeSize,
      nodeType,
      nodeId,
    };

    candidates.push(candidate);
    registerKey(`${nodeType}:${nodeId}`, candidate);

    // Preserve alias resolution for paragraph-like blocks.
    if (nodeType === 'paragraph' || nodeType === 'heading' || nodeType === 'listItem') {
      const aliasId = asId(node.attrs?.sdBlockId);
      if (aliasId && aliasId !== nodeId) {
        registerKey(`${nodeType}:${aliasId}`, candidate);
      }
    }

    return true;
  });

  return { candidates, byId };
}

function resolveAssertScope(
  index: AssertIndex,
  select: AssertStep['where']['select'],
  within: AssertStep['where']['within'],
): { ok: true; range: { start: number; end: number } | undefined } | { ok: false } {
  if (!within) return { ok: true, range: undefined };
  const scope = resolveWithinScope(index as any, { select, within } as any, []);
  if (!scope.ok) return { ok: false };
  return { ok: true, range: scope.range };
}

/**
 * Count block nodes matching `nodeType` in the document, optionally scoped
 * to descendants of a specific block node.
 *
 * Uses the same scope resolution and range semantics as the query engine
 * (`resolveWithinScope` + `scopeByRange`) so assert counts match query counts.
 */
function countNodeMatchesInDoc(
  doc: any,
  selector: Exclude<AssertStep['where']['select'], { type: 'text' }>,
  within: AssertStep['where']['within'],
): number {
  const index = buildAssertIndex(doc);
  const scope = resolveAssertScope(index, selector, within);
  if (!scope.ok) return 0;

  // Node assert currently operates on block selectors only.
  if (selector.kind && selector.kind !== 'block') return 0;

  const scoped = scopeByRange(index.candidates, scope.range);
  let count = 0;
  for (const candidate of scoped) {
    if (selector.nodeType && candidate.nodeType !== selector.nodeType) continue;
    count++;
  }
  return count;
}

function resolveScopedTextForAssert(
  doc: any,
  selector: Extract<AssertStep['where']['select'], { type: 'text' }>,
  within: AssertStep['where']['within'],
): string {
  const index = buildAssertIndex(doc);
  const scope = resolveAssertScope(index, selector, within);
  if (!scope.ok) return '';
  if (!scope.range) return doc.textContent;

  return doc.textBetween(scope.range.start, scope.range.end, '\n', '\ufffc');
}

function executeAssertStep(_editor: Editor, tr: any, step: AssertStep): { passed: boolean; actualCount: number } {
  // Evaluate against post-mutation state (the transaction's doc)
  const where = step.where;
  if (where.by !== 'select') {
    throw planError('INVALID_INPUT', `assert steps only support by: 'select'`, step.id);
  }

  const selector = where.select;
  if (selector.type !== 'text') {
    // For node selectors, use Document API node type mapping (e.g., headings
    // and listItems are PM paragraph nodes with specific attributes).
    const count = countNodeMatchesInDoc(tr.doc, selector, where.within);
    return { passed: count === step.args.expectCount, actualCount: count };
  }

  const text = resolveScopedTextForAssert(tr.doc, selector, where.within);

  const pattern = selector.pattern;
  const mode = selector.mode ?? 'contains';
  const caseSensitive = selector.caseSensitive ?? false;

  const count = countTextMatches(text, pattern, mode, caseSensitive);
  return { passed: count === step.args.expectCount, actualCount: count };
}

// ---------------------------------------------------------------------------
// Domain step executors — create operations
// ---------------------------------------------------------------------------

export function executeCreateStep(
  editor: Editor,
  tr: any,
  step: MutationStep,
  targets: CompiledTarget[],
  mapping: any,
): StepOutcome {
  const target = targets[0];
  if (!target) {
    throw planError('INVALID_INPUT', `${step.op} step requires exactly one target`, step.id);
  }

  const args = step.args as Record<string, unknown>;
  const pos = mapping.map(toAbsoluteBlockInsertPos(editor, target.blockId, target.from, step.id));
  const paragraphType = editor.state.schema?.nodes?.paragraph;

  if (!paragraphType) {
    throw planError('INVALID_INPUT', 'paragraph node type not in schema', step.id);
  }

  const sdBlockId = args.sdBlockId as string | undefined;
  const text = (args.text as string) ?? '';
  const textNode = text.length > 0 ? editor.state.schema.text(text) : null;

  let attrs: Record<string, unknown> | undefined;
  if (step.op === 'create.heading') {
    const level = (args.level as number) ?? 1;
    attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      paragraphProperties: { styleId: `Heading${level}` },
    };
  } else {
    attrs = sdBlockId ? { sdBlockId } : undefined;
  }

  const node =
    paragraphType.createAndFill(attrs, textNode ?? undefined) ??
    paragraphType.create(attrs, textNode ? [textNode] : undefined);

  if (!node) {
    throw planError('INVALID_INPUT', `could not create ${step.op} node`, step.id);
  }

  tr.insert(pos, node);

  return {
    stepId: step.id,
    op: step.op,
    effect: 'changed',
    matchCount: 1,
    data: { domain: 'text', resolutions: [] } as TextStepData,
  };
}

// ---------------------------------------------------------------------------
// Shared execution core — used by both executePlan and previewPlan
// ---------------------------------------------------------------------------

/**
 * Execute compiled mutation steps on a transaction and evaluate asserts.
 * Does NOT dispatch the transaction — the caller decides whether to dispatch.
 *
 * @returns Step outcomes for each mutation and assert step.
 * @throws PlanError if an assert step fails (PRECONDITION_FAILED).
 */
export function runMutationsOnTransaction(
  editor: Editor,
  tr: any,
  compiled: CompiledPlan,
  options: { throwOnAssertFailure: boolean },
): {
  stepOutcomes: StepOutcome[];
  assertFailures: Array<{ stepId: string; expectedCount: number; actualCount: number }>;
  commandDispatched: boolean;
} {
  const mapping = tr.mapping;
  const stepOutcomes: StepOutcome[] = [];
  const assertFailures: Array<{ stepId: string; expectedCount: number; actualCount: number }> = [];

  const ctx: ExecuteContext = {
    editor,
    tr,
    mapping,
    changeMode: 'direct',
    planGroupId: '',
    commandDispatched: false,
  };

  // Execute mutation steps sequentially via registry dispatch
  for (const compiledStep of compiled.mutationSteps) {
    const { step, targets } = compiledStep;
    const executor = getStepExecutor(step.op);
    if (!executor) {
      throw planError('INVALID_INPUT', `unsupported step op "${step.op}"`, step.id);
    }
    const outcome = executor.execute(ctx, targets, step);
    stepOutcomes.push(outcome);
  }

  // Evaluate assert steps against post-mutation state
  for (const assertStep of compiled.assertSteps) {
    const { passed, actualCount } = executeAssertStep(editor, tr, assertStep);

    if (!passed) {
      if (options.throwOnAssertFailure) {
        throw planError(
          'PRECONDITION_FAILED',
          `assert "${assertStep.id}" expected ${assertStep.args.expectCount} matches but found ${actualCount}`,
          assertStep.id,
          { expectedCount: assertStep.args.expectCount, actualCount },
        );
      }
      assertFailures.push({ stepId: assertStep.id, expectedCount: assertStep.args.expectCount, actualCount });
    }

    const data: AssertStepData = {
      domain: 'assert',
      expectedCount: assertStep.args.expectCount,
      actualCount,
    };

    stepOutcomes.push({
      stepId: assertStep.id,
      op: 'assert',
      effect: passed ? 'assert_passed' : 'assert_failed',
      matchCount: actualCount,
      data,
    });
  }

  return { stepOutcomes, assertFailures, commandDispatched: ctx.commandDispatched };
}

// ---------------------------------------------------------------------------
// Shared post-compilation execution — used by executePlan and convenience wrappers
// ---------------------------------------------------------------------------

export interface ExecuteCompiledOptions {
  changeMode?: 'direct' | 'tracked';
  expectedRevision?: string;
}

/**
 * Execute a pre-compiled plan: build transaction, run mutations, dispatch.
 *
 * This is the single execution path for all document mutations. Both
 * `executePlan` (selector-compiled plans) and convenience wrappers
 * (pre-resolved targets) converge here.
 */
export function executeCompiledPlan(
  editor: Editor,
  compiled: CompiledPlan,
  options: ExecuteCompiledOptions = {},
): PlanReceipt {
  const startTime = performance.now();
  const revisionBefore = getRevision(editor);

  checkRevision(editor, options.expectedRevision);

  const tr = editor.state.tr;
  const changeMode = options.changeMode ?? 'direct';

  if (changeMode === 'tracked') {
    applyTrackedMutationMeta(tr);
  } else {
    applyDirectMutationMeta(tr);
  }

  const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: true });

  if (tr.docChanged) {
    editor.dispatch(tr);
  }

  // Revision is advanced by the transaction listener (trackRevisions),
  // so we read the current value after dispatch completes.
  const revisionAfter = getRevision(editor);
  const totalMs = performance.now() - startTime;

  return {
    success: true,
    revision: {
      before: revisionBefore,
      after: revisionAfter,
    },
    steps: stepOutcomes,
    timing: { totalMs },
  };
}

// ---------------------------------------------------------------------------
// Main execution entry point (selector-based plans)
// ---------------------------------------------------------------------------

export function executePlan(editor: Editor, input: MutationsApplyInput): PlanReceipt {
  if (!input.steps?.length) {
    throw planError('INVALID_INPUT', 'plan must contain at least one step');
  }

  const compiled = compilePlan(editor, input.steps);

  return executeCompiledPlan(editor, compiled, {
    changeMode: input.changeMode ?? 'direct',
    expectedRevision: input.expectedRevision,
  });
}
