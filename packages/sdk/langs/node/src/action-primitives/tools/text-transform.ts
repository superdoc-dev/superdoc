import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
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

const TEXT_TRANSFORM_ACTIONS = ['replace_all', 'delete_all', 'rewrite_block', 'fill_placeholders'] as const;
const CHANGE_MODES = ['direct', 'tracked'] as const;
const REWRITE_BLOCK_SUPPORTED_NODE_TYPES = ['paragraph', 'heading', 'listItem'] as const;

type SuperdocTextTransformAction = (typeof TEXT_TRANSFORM_ACTIONS)[number];
type SuperdocTextTransformChangeMode = (typeof CHANGE_MODES)[number];
type SuperdocTextTransformSupportedNodeType = (typeof REWRITE_BLOCK_SUPPORTED_NODE_TYPES)[number];

type SuperdocTextTransformEdit = {
  find: string;
  replace?: string;
};

type SuperdocTextTransformResolved = {
  action: SuperdocTextTransformAction;
  changeMode: SuperdocTextTransformChangeMode;
  preserveStyle: boolean;
  caseSensitive: boolean;
  edits: SuperdocTextTransformEdit[];
  placeholderValues: string[];
  rewriteText?: string;
  targetArgKey?: 'target';
  request?: WorkflowTargetRequest;
  target?: WorkflowResolvedTarget;
};

type SuperdocTextTransformPlan = {
  action: SuperdocTextTransformAction;
  changeMode: SuperdocTextTransformChangeMode;
  stepCount: number;
  noOp: boolean;
  editPreflight: Array<SuperdocTextTransformEdit & { sourcePresent: boolean }>;
  applyParams: Parameters<BoundDocApi['mutations']['apply']>[0];
};

type SuperdocTextTransformExecution = {
  action: SuperdocTextTransformAction;
  changeMode: SuperdocTextTransformChangeMode;
  stepCount: number;
  revision: {
    before: string;
    after: string;
  };
};

type SuperdocTextTransformVerification = {
  action: SuperdocTextTransformAction;
  deterministicTarget: boolean;
  passed: boolean;
  summary: string;
  checks: {
    replacementsPresent?: number;
    replacementsExpected?: number;
    deletedPatternsGone?: number;
    deletedPatternsExpected?: number;
    rewrittenTextPresent?: boolean;
  };
};

export type RunSuperdocTextTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') {
    return raw;
  }
  return fallback;
}

function parseAction(raw: unknown): SuperdocTextTransformAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return TEXT_TRANSFORM_ACTIONS.find((action) => action === raw);
}

function parseChangeMode(raw: unknown): SuperdocTextTransformChangeMode | undefined {
  if (raw == null) {
    return 'direct';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return CHANGE_MODES.find((mode) => mode === raw);
}

function parseText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  if (raw.length === 0) {
    return undefined;
  }
  return raw;
}

function textIncludes(text: string, pattern: string, caseSensitive: boolean): boolean {
  if (caseSensitive) {
    return text.includes(pattern);
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

const DATE_CANDIDATE_PATTERN =
  /\b(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;

function dateLikePattern(text: string): boolean {
  DATE_CANDIDATE_PATTERN.lastIndex = 0;
  const matched = DATE_CANDIDATE_PATTERN.test(text.trim());
  DATE_CANDIDATE_PATTERN.lastIndex = 0;
  return matched;
}

function isGenericDateDescriptor(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ');
  return new Set([
    'date',
    'the date',
    'top date',
    'contract date',
    'agreement date',
    'effective date',
    'signature date',
    'sign date',
    'current date',
  ]).has(normalized);
}

function uniqueDateCandidates(text: string, exclude: string): string[] {
  const excludeLower = exclude.toLowerCase();
  const dates = new Set<string>();
  DATE_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(DATE_CANDIDATE_PATTERN)) {
    const value = match[0];
    if (value.toLowerCase() !== excludeLower) {
      dates.add(value);
    }
  }
  return [...dates];
}

function withPreflightedEdits(
  resolved: SuperdocTextTransformResolved,
  editPreflight: Array<SuperdocTextTransformEdit & { sourcePresent: boolean }>,
): SuperdocTextTransformResolved {
  return {
    ...resolved,
    edits: editPreflight.filter((edit) => edit.sourcePresent).map(({ sourcePresent: _sourcePresent, ...edit }) => edit),
  };
}

async function resolveDescriptorBackedEdits(
  context: WorkflowEngineContext,
  resolved: SuperdocTextTransformResolved,
  currentText: string,
  editPreflight: Array<SuperdocTextTransformEdit & { sourcePresent: boolean }>,
): Promise<Array<SuperdocTextTransformEdit & { sourcePresent: boolean }>> {
  if (resolved.action !== 'replace_all') {
    return editPreflight;
  }

  let resolvedPreflight = editPreflight.map((edit) => {
    const replacement = edit.replace ?? '';
    if (!dateLikePattern(replacement)) {
      return edit;
    }

    const candidates = uniqueDateCandidates(currentText, replacement);
    const shouldResolveGenericDate = isGenericDateDescriptor(edit.find) && candidates.length > 0;
    const shouldResolveMissingLiteralDate = !edit.sourcePresent && edit.find === replacement && candidates.length === 1;
    if (!shouldResolveGenericDate && !shouldResolveMissingLiteralDate) {
      return edit;
    }

    return {
      ...edit,
      find: candidates[0] ?? edit.find,
      sourcePresent: true,
    };
  });

  const needsIndentedHeadingFallback = resolvedPreflight.some(
    (edit) =>
      !edit.sourcePresent && edit.find.toLowerCase().includes('indented heading') && (edit.replace ?? '').length > 0,
  );
  if (!needsIndentedHeadingFallback) {
    return resolvedPreflight;
  }

  const page = await context.documentHandle.blocks.list(
    { offset: 0, limit: 100, includeText: true },
    context.invokeOptions,
  );
  const candidate = page.blocks.find((block) => {
    const record = block as Record<string, unknown>;
    const text =
      typeof block.text === 'string'
        ? block.text.trim()
        : typeof block.textPreview === 'string'
          ? block.textPreview.trim()
          : '';
    if (block.nodeType !== 'paragraph' || text.length === 0 || text.length > 80) {
      return false;
    }
    return (
      record.bold === true ||
      String(record.styleId ?? '')
        .toLowerCase()
        .includes('heading')
    );
  });

  const candidateText =
    typeof candidate?.text === 'string'
      ? candidate.text.trim()
      : typeof candidate?.textPreview === 'string'
        ? candidate.textPreview.trim()
        : undefined;
  if (candidateText == null || candidateText.length === 0) {
    return resolvedPreflight;
  }

  resolvedPreflight = resolvedPreflight.map((edit) => {
    if (edit.sourcePresent || !edit.find.toLowerCase().includes('indented heading')) {
      return edit;
    }
    return {
      ...edit,
      find: candidateText,
      sourcePresent: true,
    };
  });

  return resolvedPreflight;
}

function parseEdits(raw: unknown): SuperdocTextTransformEdit[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  const edits: SuperdocTextTransformEdit[] = [];
  for (const entry of raw) {
    if (!isObjectRecord(entry)) {
      return undefined;
    }
    const find = entry.find;
    if (typeof find !== 'string' || find.length === 0) {
      return undefined;
    }

    const replace = entry.replace;
    if (replace != null && typeof replace !== 'string') {
      return undefined;
    }

    edits.push({
      find,
      replace: typeof replace === 'string' ? replace : undefined,
    });
  }

  return edits;
}

function parsePlaceholderValues(raw: unknown): string[] | undefined {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return undefined;
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0) {
      values.push(entry);
      continue;
    }
    if (isObjectRecord(entry) && typeof entry.value === 'string' && entry.value.length > 0) {
      values.push(entry.value);
      continue;
    }
    return undefined;
  }
  return values;
}

function rewriteBlockSupported(nodeType: string): nodeType is SuperdocTextTransformSupportedNodeType {
  return REWRITE_BLOCK_SUPPORTED_NODE_TYPES.some((value) => value === nodeType);
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocTextTransformResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TEXT_TRANSFORM_ACTION_INVALID',
      message:
        'superdoc_text_transform requires action to be one of replace_all, delete_all, rewrite_block, fill_placeholders.',
    });
  }

  const changeMode = parseChangeMode(context.args.changeMode);
  if (changeMode == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TEXT_TRANSFORM_CHANGE_MODE_INVALID',
      message: 'changeMode must be "direct" or "tracked".',
      details: { received: context.args.changeMode },
    });
  }

  const preserveStyle = coerceBoolean(context.args.preserveStyle, true);
  const caseSensitive = coerceBoolean(context.args.caseSensitive, false);
  const edits = parseEdits(context.args.edits) ?? [];
  const placeholderValues = parsePlaceholderValues(context.args.values ?? context.args.fields);
  if (placeholderValues == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_PLACEHOLDER_VALUES_INVALID',
      message: 'values/fields must be an array of strings or {value} objects.',
    });
  }

  if (action === 'rewrite_block') {
    if (context.args.target == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TARGET_REQUIRED',
        message: 'rewrite_block requires a deterministic target selector.',
        details: { expectedArgKey: 'target' },
      });
    }

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

    if (resolved.target.entity.kind !== 'block') {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TARGET_KIND_UNSUPPORTED',
        message: `rewrite_block requires a block target but resolved to ${resolved.target.entity.kind}.`,
        details: {
          targetArgKey: 'target',
          entityKind: resolved.target.entity.kind,
        },
      });
    }

    if (!rewriteBlockSupported(resolved.target.entity.nodeType)) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TARGET_KIND_UNSUPPORTED',
        message: `rewrite_block does not support block nodeType "${resolved.target.entity.nodeType}".`,
        details: {
          targetArgKey: 'target',
          entityKind: resolved.target.entity.kind,
          nodeType: resolved.target.entity.nodeType,
          supportedNodeTypes: [...REWRITE_BLOCK_SUPPORTED_NODE_TYPES],
        },
      });
    }

    const rewriteText = parseText(context.args.text);
    if (rewriteText == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_TEXT_REQUIRED',
        message: 'rewrite_block requires non-empty text.',
      });
    }

    return workflowStepSuccess({
      action,
      changeMode,
      preserveStyle,
      caseSensitive,
      edits: [],
      placeholderValues: [],
      rewriteText,
      targetArgKey: 'target',
      request: resolved.request,
      target: resolved.target,
    });
  }

  if (edits.length === 0 && !(action === 'fill_placeholders' && placeholderValues.length > 0)) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_EDITS_REQUIRED',
      message: `${action} requires a non-empty edits array with {find, replace?} entries.`,
    });
  }

  if (action === 'replace_all' || action === 'fill_placeholders') {
    const missingReplace = edits.find((edit) => edit.replace == null);
    if (missingReplace != null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_REPLACE_VALUE_REQUIRED',
        message: `${action} requires replace text for every edit entry.`,
        details: { missingFind: missingReplace.find },
      });
    }
  }

  return workflowStepSuccess({
    action,
    changeMode,
    preserveStyle,
    caseSensitive,
    edits,
    placeholderValues:
      placeholderValues.length > 0
        ? placeholderValues
        : edits.map((edit) => edit.replace ?? '').filter((value) => value.length > 0),
  });
}

function rewriteStyle(
  preserveStyle: boolean,
): { inline: { mode: 'preserve' }; paragraph: { mode: 'preserve' } } | undefined {
  if (!preserveStyle) {
    return undefined;
  }
  return {
    inline: { mode: 'preserve' },
    paragraph: { mode: 'preserve' },
  };
}

function buildReplaceAllSteps(
  resolved: SuperdocTextTransformResolved,
): Parameters<BoundDocApi['mutations']['apply']>[0]['steps'] {
  return resolved.edits.map((edit, index) => ({
    id: `replace-${index + 1}`,
    op: 'text.rewrite',
    where: {
      by: 'select',
      select: {
        type: 'text',
        pattern: edit.find,
        mode: 'contains',
        caseSensitive: resolved.caseSensitive,
      },
      require: 'all',
    },
    args: {
      replacement: { text: edit.replace ?? '' },
      style: rewriteStyle(resolved.preserveStyle),
    },
  }));
}

function buildDeleteAllSteps(
  resolved: SuperdocTextTransformResolved,
): Parameters<BoundDocApi['mutations']['apply']>[0]['steps'] {
  return resolved.edits.map((edit, index) => ({
    id: `delete-${index + 1}`,
    op: 'text.delete',
    where: {
      by: 'select',
      select: {
        type: 'text',
        pattern: edit.find,
        mode: 'contains',
        caseSensitive: resolved.caseSensitive,
      },
      require: 'all',
    },
    args: {},
  }));
}

function buildRewriteBlockSteps(
  resolved: SuperdocTextTransformResolved,
): Parameters<BoundDocApi['mutations']['apply']>[0]['steps'] {
  const target = resolved.target;
  if (target == null || target.entity.kind !== 'block' || resolved.rewriteText == null) {
    return [];
  }
  return [
    {
      id: 'rewrite-block-1',
      op: 'text.rewrite',
      where: {
        by: 'block',
        nodeType: target.entity.nodeType,
        nodeId: target.nodeId,
      },
      args: {
        replacement: { text: resolved.rewriteText },
        style: rewriteStyle(resolved.preserveStyle),
      },
    },
  ];
}

async function buildFillPlaceholderSteps(
  context: WorkflowEngineContext,
  resolved: SuperdocTextTransformResolved,
): Promise<Parameters<BoundDocApi['mutations']['apply']>[0]['steps']> {
  if (resolved.placeholderValues.length === 0) {
    return buildReplaceAllSteps(resolved);
  }

  const steps: Parameters<BoundDocApi['mutations']['apply']>[0]['steps'] = [];
  let valueIndex = 0;
  let offset = 0;
  while (true) {
    const page = await context.documentHandle.blocks.list(
      { offset, limit: 250, includeText: true },
      context.invokeOptions,
    );
    for (const block of page.blocks) {
      if (block.nodeType !== 'paragraph' && block.nodeType !== 'heading' && block.nodeType !== 'listItem') continue;
      const text = typeof block.text === 'string' ? block.text : '';
      if (!text.includes('[insert]')) continue;

      const rewritten = text.replace(/\[insert\]/g, () => {
        const value =
          resolved.placeholderValues[valueIndex] ??
          resolved.placeholderValues[resolved.placeholderValues.length - 1] ??
          '';
        valueIndex += 1;
        return value;
      });

      steps.push({
        id: `fill-placeholder-block-${steps.length + 1}`,
        op: 'text.rewrite',
        where: {
          by: 'block',
          nodeType: block.nodeType,
          nodeId: block.nodeId,
        },
        args: {
          replacement: { text: rewritten },
          style: rewriteStyle(resolved.preserveStyle),
        },
      });
    }

    offset += page.blocks.length;
    if (page.blocks.length === 0 || offset >= page.total) break;
  }

  return steps;
}

async function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocTextTransformResolved,
): Promise<WorkflowStepResult<SuperdocTextTransformPlan>> {
  let plannedResolved = resolved;
  let editPreflight = resolved.edits.map((edit) => ({ ...edit, sourcePresent: true }));

  if (resolved.action === 'replace_all' || resolved.action === 'delete_all') {
    const currentText = await context.documentHandle.getText({}, context.invokeOptions);
    editPreflight = resolved.edits.map((edit) => ({
      ...edit,
      sourcePresent:
        resolved.action === 'replace_all' && edit.replace === edit.find
          ? false
          : textIncludes(currentText, edit.find, resolved.caseSensitive),
    }));
    editPreflight = await resolveDescriptorBackedEdits(context, resolved, currentText, editPreflight);
    plannedResolved = withPreflightedEdits(resolved, editPreflight);
  }

  const steps =
    plannedResolved.action === 'rewrite_block'
      ? buildRewriteBlockSteps(plannedResolved)
      : plannedResolved.action === 'delete_all'
        ? buildDeleteAllSteps(plannedResolved)
        : plannedResolved.action === 'fill_placeholders'
          ? await buildFillPlaceholderSteps(context, plannedResolved)
          : buildReplaceAllSteps(plannedResolved);

  // fill_placeholders used to force direct mode (legacy workaround from when
  // tracked rewrites misbehaved). Tracked rewrites are correct now, and
  // silently downgrading a tracked request makes the receipt lie — lawyers
  // filling a template AS TRACKED CHANGES is a core workflow.
  const applyChangeMode = resolved.changeMode;

  if (steps.length === 0 && (resolved.action === 'replace_all' || resolved.action === 'delete_all')) {
    return workflowStepSuccess({
      action: resolved.action,
      changeMode: applyChangeMode,
      stepCount: 0,
      noOp: true,
      editPreflight,
      applyParams: {
        atomic: true,
        changeMode: applyChangeMode,
        steps,
      },
    });
  }

  if (steps.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'plan',
      code: 'WORKFLOW_TEXT_TRANSFORM_STEP_BUILD_FAILED',
      message: `No mutation steps were built for action "${resolved.action}".`,
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    changeMode: applyChangeMode,
    stepCount: steps.length,
    noOp: false,
    editPreflight,
    applyParams: {
      atomic: true,
      changeMode: applyChangeMode,
      steps,
    },
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocTextTransformResolved,
  plan: SuperdocTextTransformPlan,
): Promise<WorkflowStepResult<SuperdocTextTransformExecution>> {
  if (plan.stepCount === 0) {
    return workflowStepSuccess({
      action: plan.action,
      changeMode: plan.changeMode,
      stepCount: plan.stepCount,
      revision: {
        before: context.info.revision,
        after: context.info.revision,
      },
    });
  }

  const applyResult = await context.documentHandle.mutations.apply(plan.applyParams, context.invokeOptions);
  return workflowStepSuccess({
    action: plan.action,
    changeMode: plan.changeMode,
    stepCount: plan.stepCount,
    revision: applyResult.revision,
  });
}

function verifyReplace(
  resolved: SuperdocTextTransformResolved,
  plan: SuperdocTextTransformPlan,
  execution: SuperdocTextTransformExecution,
  currentText: string,
): WorkflowStepResult<SuperdocTextTransformVerification> {
  const matchedEdits = plan.editPreflight.filter((edit) => edit.sourcePresent);
  const replacementCandidates = matchedEdits.filter((edit) => (edit.replace ?? '').length > 0);
  const replacementExpected = replacementCandidates.length;
  const replacementsPresent = replacementCandidates.filter((edit) =>
    textIncludes(currentText, edit.replace ?? '', resolved.caseSensitive),
  ).length;
  const sourceRemovalCandidates = plan.editPreflight.filter((edit) => {
    const replacement = edit.replace ?? '';
    return replacement !== edit.find && !replacement.includes(edit.find);
  });
  const sourceRemovalExpected = sourceRemovalCandidates.length;
  const deletedPatternsGone = sourceRemovalCandidates.filter(
    (edit) => !textIncludes(currentText, edit.find, resolved.caseSensitive),
  ).length;
  const passed = replacementsPresent === replacementExpected && deletedPatternsGone === sourceRemovalExpected;
  const summary = `replacement checks ${replacementsPresent}/${replacementExpected}; source removal checks ${deletedPatternsGone}/${sourceRemovalExpected}; revision ${execution.revision.before} -> ${execution.revision.after}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TEXT_TRANSFORM_VERIFICATION_FAILED',
      message: 'Text replacement verification failed.',
      details: {
        action: execution.action,
        summary,
        replacementsPresent,
        replacementExpected,
        deletedPatternsGone,
        deletedPatternsExpected: sourceRemovalExpected,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    deterministicTarget: execution.action === 'rewrite_block',
    passed,
    summary,
    checks: {
      replacementsPresent,
      replacementsExpected: replacementExpected,
      deletedPatternsGone,
      deletedPatternsExpected: sourceRemovalExpected,
    },
  });
}

function verifyDelete(
  resolved: SuperdocTextTransformResolved,
  execution: SuperdocTextTransformExecution,
  currentText: string,
): WorkflowStepResult<SuperdocTextTransformVerification> {
  const deletedPatternsExpected = resolved.edits.length;
  const deletedPatternsGone = resolved.edits.filter(
    (edit) => !textIncludes(currentText, edit.find, resolved.caseSensitive),
  ).length;
  const passed = deletedPatternsGone === deletedPatternsExpected;
  const summary = `delete checks ${deletedPatternsGone}/${deletedPatternsExpected}; revision ${execution.revision.before} -> ${execution.revision.after}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TEXT_TRANSFORM_VERIFICATION_FAILED',
      message: 'Text deletion verification failed.',
      details: {
        action: execution.action,
        summary,
        deletedPatternsGone,
        deletedPatternsExpected,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    deterministicTarget: false,
    passed,
    summary,
    checks: {
      deletedPatternsGone,
      deletedPatternsExpected,
    },
  });
}

function significantRewriteTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((token) => token.length >= 3);
}

function tokensPresentInOrder(haystack: string, tokens: string[]): boolean {
  let offset = 0;
  const lowerHaystack = haystack.toLowerCase();
  for (const token of tokens) {
    const index = lowerHaystack.indexOf(token.toLowerCase(), offset);
    if (index < 0) {
      return false;
    }
    offset = index + token.length;
  }
  return true;
}

function verifyRewriteBlock(
  resolved: SuperdocTextTransformResolved,
  execution: SuperdocTextTransformExecution,
  currentText: string,
): WorkflowStepResult<SuperdocTextTransformVerification> {
  const rewriteText = resolved.rewriteText ?? '';
  const rewrittenTextPresent =
    execution.changeMode === 'tracked'
      ? tokensPresentInOrder(currentText, significantRewriteTokens(rewriteText))
      : currentText.includes(rewriteText);
  const deterministicTarget = resolved.target != null;
  const passed = rewrittenTextPresent && deterministicTarget;
  const summary = `rewrite_block checks textPresent=${rewrittenTextPresent} deterministicTarget=${deterministicTarget}; revision ${execution.revision.before} -> ${execution.revision.after}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TEXT_TRANSFORM_VERIFICATION_FAILED',
      message: 'rewrite_block verification failed.',
      details: {
        action: execution.action,
        summary,
        rewrittenTextPresent,
        deterministicTarget,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    deterministicTarget,
    passed,
    summary,
    checks: {
      rewrittenTextPresent,
    },
  });
}

async function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocTextTransformResolved,
  plan: SuperdocTextTransformPlan,
  execution: SuperdocTextTransformExecution,
): Promise<WorkflowStepResult<SuperdocTextTransformVerification>> {
  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  if (execution.action === 'delete_all') {
    return verifyDelete(resolved, execution, currentText);
  }
  if (execution.action === 'rewrite_block') {
    return verifyRewriteBlock(resolved, execution, currentText);
  }
  return verifyReplace(resolved, plan, execution, currentText);
}

export async function runSuperdocTextTransformWorkflow(
  input: RunSuperdocTextTransformInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocTextTransformResolved,
    SuperdocTextTransformPlan,
    SuperdocTextTransformExecution,
    SuperdocTextTransformVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_text_transform',
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
