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

const TRACK_CHANGES_ACTIONS = ['summary', 'accept_all', 'reject_all'] as const;
const PAGE_LIMIT = 250;
const SUMMARY_SAMPLE_LIMIT = 5;

type SuperdocTrackChangesAction = (typeof TRACK_CHANGES_ACTIONS)[number];
type TrackChangeListResult = Awaited<ReturnType<BoundDocApi['trackChanges']['list']>>;
type TrackChangeListItem = TrackChangeListResult['items'][number];
type TrackChangeGetResult = Awaited<ReturnType<BoundDocApi['trackChanges']['get']>>;
type TrackChangeDecideResult = Awaited<ReturnType<BoundDocApi['trackChanges']['decide']>>;

type SuperdocTrackChangesResolved = {
  action: SuperdocTrackChangesAction;
  scope: 'all' | 'author';
  author?: string;
};

type SuperdocTrackChangesPlan = {
  action: SuperdocTrackChangesAction;
  scope: 'all' | 'author';
  author?: string;
  evaluatedRevision: string;
  total: number;
  allTotal: number;
  ids: string[];
  preservedIds: string[];
  counts: {
    insert: number;
    delete: number;
    format: number;
  };
  items: TrackChangeListItem[];
};

type SuperdocTrackChangesExecution =
  | {
      action: 'summary';
      scope: 'all' | 'author';
      author?: string;
      evaluatedRevision: string;
      total: number;
      counts: SuperdocTrackChangesPlan['counts'];
      sample: Array<{
        id: string;
        type: TrackChangeGetResult['type'];
        address: string;
        author?: string;
        date?: string;
        excerpt?: string;
      }>;
      truncated: boolean;
    }
  | {
      action: 'accept_all' | 'reject_all';
      scope: 'all' | 'author';
      author?: string;
      decision: 'accept' | 'reject';
      pendingBefore: number;
      preservedBefore: number;
      revisionBefore: string;
      receipt: {
        success: true;
        removedChangeIds: string[];
        updatedChangeIds: string[];
        insertedChangeIds: string[];
      };
    };

type SuperdocTrackChangesVerification =
  | {
      action: 'summary';
      passed: boolean;
      summary: string;
      checks: {
        totalStable: boolean;
        idsStable: boolean;
        revisionStable: boolean;
        sampleCount: number;
      };
    }
  | {
      action: 'accept_all' | 'reject_all';
      passed: boolean;
      summary: string;
      checks: {
        beforeTotal: number;
        afterTotal: number;
        removedIdsMatched: boolean;
        authorCleared?: boolean;
        preservedIdsStillPresent?: boolean;
        revisionChanged: boolean;
      };
    };

export type RunSuperdocTrackChangesInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function parseAction(raw: unknown): SuperdocTrackChangesAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return TRACK_CHANGES_ACTIONS.find((action) => action === raw);
}

function parseScope(raw: unknown, author?: string): 'all' | 'author' | undefined {
  if (raw == null) {
    return author == null ? 'all' : 'author';
  }
  if (raw === 'all') {
    return 'all';
  }
  if (raw === 'author') {
    return author == null ? undefined : 'author';
  }
  return undefined;
}

function parseAuthor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

async function listAllTrackChanges(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<TrackChangeListResult> {
  const items: TrackChangeListItem[] = [];
  let evaluatedRevision = '';
  let offset = 0;
  while (true) {
    const page = await documentHandle.trackChanges.list({ offset, limit: PAGE_LIMIT, in: 'all' }, invokeOptions);
    evaluatedRevision = page.evaluatedRevision;
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) {
      return {
        evaluatedRevision,
        total: page.total,
        items,
        page: {
          limit: PAGE_LIMIT,
          offset: 0,
          returned: items.length,
        },
      };
    }
  }
}

function countByType(items: TrackChangeListItem[]): SuperdocTrackChangesPlan['counts'] {
  return items.reduce(
    (counts, item) => {
      counts[item.type] += 1;
      return counts;
    },
    { insert: 0, delete: 0, format: 0 },
  );
}

function formatStoryAddress(story: TrackChangeListItem['address']['story'] | undefined): string {
  if (story == null || story.storyType === 'body') {
    return 'body';
  }
  if (story.storyType === 'headerFooterSlot') {
    return `${story.headerFooterKind}:${story.variant}:${story.section.sectionId}`;
  }
  if (story.storyType === 'headerFooterPart') {
    return `headerFooterPart:${story.refId}`;
  }
  return `${story.storyType}:${story.noteId}`;
}

function collectTrackedChangeIds(
  entries:
    | TrackChangeDecideResult['removed']
    | TrackChangeDecideResult['updated']
    | TrackChangeDecideResult['inserted'],
): string[] {
  if (entries == null) {
    return [];
  }
  return entries.flatMap((entry) =>
    entry.entityType === 'trackedChange' && typeof entry.entityId === 'string' ? [entry.entityId] : [],
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocTrackChangesResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TRACK_CHANGES_ACTION_INVALID',
      message: 'superdoc_track_changes requires action to be one of summary, accept_all, reject_all.',
    });
  }

  const author = parseAuthor(context.args.author);
  const scope = parseScope(context.args.scope, author);
  if (scope == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_TRACK_CHANGES_SCOPE_INVALID',
      message: 'superdoc_track_changes supports scope "all" or scope "author" with an author name.',
    });
  }

  return workflowStepSuccess({
    action,
    scope,
    ...(author == null ? {} : { author }),
  });
}

async function planStep(
  context: WorkflowEngineContext,
  resolved: SuperdocTrackChangesResolved,
): Promise<WorkflowStepResult<SuperdocTrackChangesPlan>> {
  const listed = await listAllTrackChanges(context.documentHandle, context.invokeOptions);
  const authorKey = resolved.author?.toLocaleLowerCase();
  const selectedItems =
    resolved.scope === 'author' && authorKey != null
      ? listed.items.filter((item) => item.author?.toLocaleLowerCase() === authorKey)
      : listed.items;
  const preservedItems =
    resolved.scope === 'author' && authorKey != null
      ? listed.items.filter((item) => item.author?.toLocaleLowerCase() !== authorKey)
      : [];

  return workflowStepSuccess({
    action: resolved.action,
    scope: resolved.scope,
    ...(resolved.author == null ? {} : { author: resolved.author }),
    evaluatedRevision: listed.evaluatedRevision,
    total: selectedItems.length,
    allTotal: listed.total,
    ids: selectedItems.map((item) => item.id),
    preservedIds: preservedItems.map((item) => item.id),
    counts: countByType(selectedItems),
    items: selectedItems,
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  resolved: SuperdocTrackChangesResolved,
  plan: SuperdocTrackChangesPlan,
): Promise<WorkflowStepResult<SuperdocTrackChangesExecution>> {
  if (resolved.action === 'summary') {
    const sampleTargets = plan.items.slice(0, SUMMARY_SAMPLE_LIMIT).map((item) => ({
      id: item.id,
      story: item.address.story,
    }));
    const sampleDetails = await Promise.all(
      sampleTargets.map((target) => context.documentHandle.trackChanges.get(target, context.invokeOptions)),
    );

    return workflowStepSuccess({
      action: 'summary',
      scope: plan.scope,
      ...(plan.author == null ? {} : { author: plan.author }),
      evaluatedRevision: plan.evaluatedRevision,
      total: plan.total,
      counts: plan.counts,
      sample: sampleDetails.map((change) => ({
        id: change.id,
        type: change.type,
        address: formatStoryAddress(change.address.story),
        author: change.author,
        date: change.date,
        excerpt: change.excerpt,
      })),
      truncated: plan.total > sampleDetails.length,
    });
  }

  const decision = resolved.action === 'accept_all' ? 'accept' : 'reject';
  const receipts =
    resolved.scope === 'all'
      ? [
          await context.documentHandle.trackChanges.decide(
            {
              decision,
              target: { scope: 'all' },
            },
            context.invokeOptions,
          ),
        ]
      : await Promise.all(
          plan.items.map((item) =>
            context.documentHandle.trackChanges.decide(
              {
                decision,
                target: { id: item.id, story: item.address.story },
              },
              context.invokeOptions,
            ),
          ),
        );

  return workflowStepSuccess({
    action: resolved.action,
    scope: plan.scope,
    ...(plan.author == null ? {} : { author: plan.author }),
    decision,
    pendingBefore: plan.total,
    preservedBefore: plan.preservedIds.length,
    revisionBefore: plan.evaluatedRevision,
    receipt: {
      success: true,
      removedChangeIds: receipts.flatMap((receipt) => collectTrackedChangeIds(receipt.removed)),
      updatedChangeIds: receipts.flatMap((receipt) => collectTrackedChangeIds(receipt.updated)),
      insertedChangeIds: receipts.flatMap((receipt) => collectTrackedChangeIds(receipt.inserted)),
    },
  });
}

async function verifyStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocTrackChangesResolved,
  plan: SuperdocTrackChangesPlan,
  execution: SuperdocTrackChangesExecution,
): Promise<WorkflowStepResult<SuperdocTrackChangesVerification>> {
  const relisted = await listAllTrackChanges(context.documentHandle, context.invokeOptions);

  if (execution.action === 'summary') {
    const relistedIds = relisted.items.map((item) => item.id);
    const totalStable = relisted.total === plan.total;
    const idsStable = arraysEqual(relistedIds, plan.ids);
    const revisionStable = relisted.evaluatedRevision === plan.evaluatedRevision;
    const passed = totalStable && idsStable && revisionStable;
    const summary = `summary checks totalStable=${totalStable}; idsStable=${idsStable}; revisionStable=${revisionStable}; sample=${execution.sample.length}.`;

    if (!passed) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'verify',
        code: 'WORKFLOW_TRACK_CHANGES_SUMMARY_VERIFICATION_FAILED',
        message: 'superdoc_track_changes summary verification failed.',
        details: {
          summary,
          expectedRevision: plan.evaluatedRevision,
          actualRevision: relisted.evaluatedRevision,
          expectedTotal: plan.total,
          actualTotal: relisted.total,
        },
      });
    }

    return workflowStepSuccess({
      action: 'summary',
      passed,
      summary,
      checks: {
        totalStable,
        idsStable,
        revisionStable,
        sampleCount: execution.sample.length,
      },
    });
  }

  const relistedIds = relisted.items.map((item) => item.id);
  const selectedIdsGone = plan.ids.every((id) => !relistedIds.includes(id));
  const preservedIdsStillPresent = plan.preservedIds.every((id) => relistedIds.includes(id));
  const authorKey = plan.author?.toLocaleLowerCase();
  const authorCleared =
    plan.scope !== 'author' || authorKey == null
      ? undefined
      : relisted.items.every((item) => item.author?.toLocaleLowerCase() !== authorKey);
  const removedIdsMatched = plan.scope === 'author' ? selectedIdsGone : relisted.total === 0 && selectedIdsGone;
  const revisionChanged = relisted.evaluatedRevision !== plan.evaluatedRevision;
  const cleared = plan.scope === 'author' ? authorCleared === true && preservedIdsStillPresent : relisted.total === 0;
  const passed = cleared && removedIdsMatched && (plan.total === 0 ? true : revisionChanged);
  const summary =
    plan.scope === 'author'
      ? `${execution.action} author=${plan.author} checks afterTotal=${relisted.total}; selectedGone=${selectedIdsGone}; authorCleared=${authorCleared}; preservedIdsStillPresent=${preservedIdsStillPresent}; revisionChanged=${revisionChanged}.`
      : `${execution.action} checks afterTotal=${relisted.total}; removedIdsMatched=${removedIdsMatched}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_TRACK_CHANGES_MUTATION_VERIFICATION_FAILED',
      message: 'superdoc_track_changes verification failed after decide.',
      details: {
        summary,
        beforeTotal: plan.total,
        afterTotal: relisted.total,
        revisionBefore: plan.evaluatedRevision,
        revisionAfter: relisted.evaluatedRevision,
        removedChangeIds: execution.receipt.removedChangeIds,
        expectedChangeIds: plan.ids,
        preservedChangeIds: plan.preservedIds,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      beforeTotal: plan.total,
      afterTotal: relisted.total,
      removedIdsMatched,
      ...(authorCleared == null ? {} : { authorCleared }),
      ...(plan.scope === 'author' ? { preservedIdsStillPresent } : {}),
      revisionChanged,
    },
  });
}

export async function runSuperdocTrackChangesWorkflow(
  input: RunSuperdocTrackChangesInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocTrackChangesResolved,
    SuperdocTrackChangesPlan,
    SuperdocTrackChangesExecution,
    SuperdocTrackChangesVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_track_changes',
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
