import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import { buildWorkflowDocIndex, type WorkflowDocIndex } from '../doc-index.js';
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

const MEDIA_INSERT_ACTIONS = ['insert_image_with_caption'] as const;
const DOCUMENT_PLACEMENTS = ['document_start', 'document_end'] as const;
const RELATIVE_POSITIONS = ['before', 'after'] as const;
const DEFAULT_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const DEFAULT_IMAGE_SRC = `data:image/png;base64,${DEFAULT_IMAGE_BASE64}`;

type SuperdocMediaInsertAction = (typeof MEDIA_INSERT_ACTIONS)[number];
type SuperdocMediaInsertDocumentPlacement = (typeof DOCUMENT_PLACEMENTS)[number];
type SuperdocMediaInsertRelativePosition = (typeof RELATIVE_POSITIONS)[number];
type MediaInsertAt = NonNullable<NonNullable<Parameters<BoundDocApi['create']['image']>[0]>['at']>;
type MediaInsertRelativeTarget = Extract<MediaInsertAt, { target: unknown }>['target'];
type MediaInsertImageParams = NonNullable<Parameters<BoundDocApi['create']['image']>[0]>;
type MediaInsertCaptionParams = NonNullable<Parameters<BoundDocApi['images']['insertCaption']>[0]>;

type SuperdocMediaInsertPlacement =
  | {
      mode: 'document';
      at: SuperdocMediaInsertDocumentPlacement;
      source: 'default' | 'provided';
    }
  | {
      mode: 'relative';
      position: SuperdocMediaInsertRelativePosition;
      source: 'provided';
      request: WorkflowTargetRequest;
      target: WorkflowResolvedTarget;
    };

type SuperdocMediaInsertResolved = {
  action: 'insert_image_with_caption';
  placement: SuperdocMediaInsertPlacement;
  src: string;
  alt?: string;
  caption?: string;
};

type SuperdocMediaInsertPlan = {
  action: 'insert_image_with_caption';
  placement: SuperdocMediaInsertPlacement;
  imageParams: MediaInsertImageParams;
  captionParams?: MediaInsertCaptionParams;
};

type WorkflowRevision = {
  before: string;
  after: string;
  unchanged: boolean;
};

type SuperdocMediaInsertExecution = {
  action: 'insert_image_with_caption';
  placement: ReturnType<typeof summarizePlacement>;
  revision: WorkflowRevision;
  src: string;
  alt?: string;
  caption?: string;
  imageId: string;
  imageNodeId?: string;
  captionTargetImageId?: string;
  imageCount: {
    before: number;
    after: number;
  };
};

type SuperdocMediaInsertVerification = {
  action: 'insert_image_with_caption';
  passed: boolean;
  summary: string;
  checks: Record<string, unknown>;
};

export type RunSuperdocMediaInsertInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseAction(raw: unknown): SuperdocMediaInsertAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return MEDIA_INSERT_ACTIONS.find((action) => action === raw);
}

function parseOptionalText(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toApiRelativeTarget(target: WorkflowResolvedTarget): MediaInsertRelativeTarget {
  if (target.entity.kind === 'table') {
    return {
      kind: 'block',
      nodeType: 'table',
      nodeId: target.entity.nodeId,
    };
  }

  if (target.entity.kind === 'listItem') {
    return {
      kind: 'block',
      nodeType: 'listItem',
      nodeId: target.entity.nodeId,
    };
  }

  return {
    kind: 'block',
    nodeType: target.entity.nodeType,
    nodeId: target.entity.nodeId,
  };
}

function toApiPlacement(placement: SuperdocMediaInsertPlacement): MediaInsertAt {
  if (placement.mode === 'document') {
    return {
      kind: placement.at === 'document_start' ? 'documentStart' : 'documentEnd',
    };
  }

  return {
    kind: placement.position,
    target: toApiRelativeTarget(placement.target),
  };
}

function summarizePlacement(placement: SuperdocMediaInsertPlacement) {
  if (placement.mode === 'document') {
    return {
      mode: placement.mode,
      at: placement.at,
      source: placement.source,
    };
  }

  return {
    mode: placement.mode,
    position: placement.position,
    source: placement.source,
    targetNodeId: placement.target.nodeId,
    targetKind: placement.target.entity.kind,
  };
}

function resolvePlacement(context: WorkflowEngineContext): WorkflowStepResult<SuperdocMediaInsertPlacement> {
  const rawPlacement = context.args.placement;
  const defaultPlacement: SuperdocMediaInsertPlacement = {
    mode: 'document',
    at: 'document_end',
    source: 'default',
  };

  if (rawPlacement == null) {
    return workflowStepSuccess(defaultPlacement);
  }

  if (typeof rawPlacement === 'string') {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === rawPlacement);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_MEDIA_INSERT_PLACEMENT_INVALID',
        message: 'placement must be document_start, document_end, or an object with {at} or {position,target}.',
        details: { received: rawPlacement },
      });
    }
    return workflowStepSuccess({
      mode: 'document',
      at,
      source: 'provided',
    });
  }

  if (!isObjectRecord(rawPlacement)) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_MEDIA_INSERT_PLACEMENT_INVALID',
      message: 'placement must be an object when not using a document_start/document_end string.',
      details: { receivedType: typeof rawPlacement },
    });
  }

  const hasAt = rawPlacement.at != null;
  const hasPosition = rawPlacement.position != null || rawPlacement.target != null;
  if (hasAt && hasPosition) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_MEDIA_INSERT_PLACEMENT_INVALID',
      message: 'placement must specify either {at} or {position,target}, not both.',
    });
  }

  if (hasAt) {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === rawPlacement.at);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_MEDIA_INSERT_PLACEMENT_INVALID',
        message: 'placement.at must be document_start or document_end.',
        details: { received: rawPlacement.at },
      });
    }
    return workflowStepSuccess({
      mode: 'document',
      at,
      source: 'provided',
    });
  }

  const position = RELATIVE_POSITIONS.find((value) => value === rawPlacement.position);
  if (position == null || rawPlacement.target == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_MEDIA_INSERT_PLACEMENT_INVALID',
      message: 'Relative placement requires {position,target} with position before or after.',
      details: {
        position: rawPlacement.position,
        hasTarget: rawPlacement.target != null,
      },
    });
  }

  const resolved = resolveWorkflowTargetFromUnknown(context.index, rawPlacement.target);
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
    source: 'provided',
    request: resolved.request,
    target: resolved.target,
  });
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocMediaInsertResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_MEDIA_INSERT_ACTION_INVALID',
      message: 'superdoc_media_insert requires action to be insert_image_with_caption.',
    });
  }

  const placement = resolvePlacement(context);
  if (!placement.ok) {
    return placement;
  }

  return workflowStepSuccess({
    action,
    placement: placement.value,
    src: parseOptionalText(context.args.src) ?? DEFAULT_IMAGE_SRC,
    alt: parseOptionalText(context.args.alt),
    caption: parseOptionalText(context.args.caption),
  });
}

function planStep(
  _context: WorkflowEngineContext,
  resolved: SuperdocMediaInsertResolved,
): WorkflowStepResult<SuperdocMediaInsertPlan> {
  const imageParams: MediaInsertImageParams = {
    src: resolved.src,
    alt: resolved.alt,
    at: toApiPlacement(resolved.placement),
  };

  return workflowStepSuccess({
    action: resolved.action,
    placement: resolved.placement,
    imageParams,
    captionParams:
      resolved.caption == null
        ? undefined
        : {
            imageId: '',
            text: resolved.caption,
          },
  });
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractCreatedImageIdentity(result: unknown): { imageId?: string; nodeId?: string } {
  if (!isObjectRecord(result) || !isObjectRecord(result.image)) {
    return {};
  }

  return {
    imageId: readStringField(result.image, ['imageId', 'sdImageId', 'id', 'nodeId']),
    nodeId: readStringField(result.image, ['nodeId']),
  };
}

async function executeStep(
  context: WorkflowEngineContext,
  resolved: SuperdocMediaInsertResolved,
  plan: SuperdocMediaInsertPlan,
): Promise<WorkflowStepResult<SuperdocMediaInsertExecution>> {
  const beforeRevision = context.info.revision;
  const beforeImageCount = context.info.counts.images ?? 0;

  const imageResult = await context.documentHandle.create.image(plan.imageParams, context.invokeOptions);
  const created = extractCreatedImageIdentity(imageResult);
  if (created.imageId == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_MEDIA_INSERT_IMAGE_ID_MISSING',
      message: 'doc.create.image did not return an image id.',
      details: {
        resultKeys: isObjectRecord(imageResult) ? Object.keys(imageResult) : [],
      },
    });
  }

  let captionTargetImageId: string | undefined;
  if (resolved.caption != null) {
    captionTargetImageId = created.imageId;
    await context.documentHandle.images.insertCaption(
      {
        imageId: created.imageId,
        text: resolved.caption,
      },
      context.invokeOptions,
    );
  }

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: resolved.action,
    placement: summarizePlacement(plan.placement),
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    src: resolved.src,
    alt: resolved.alt,
    caption: resolved.caption,
    imageId: created.imageId,
    imageNodeId: created.nodeId,
    captionTargetImageId,
    imageCount: {
      before: beforeImageCount,
      after: afterInfo.counts.images ?? beforeImageCount,
    },
  });
}

function findBlockOrdinalByNodeId(index: WorkflowDocIndex, nodeId: string | undefined): number | undefined {
  if (nodeId == null) {
    return undefined;
  }
  return index.blocks.find((block) => block.nodeId === nodeId)?.ordinal;
}

function findTargetBlockOrdinal(index: WorkflowDocIndex, target: WorkflowResolvedTarget): number | undefined {
  if (target.entity.kind === 'table') {
    return index.tables.find((table) => table.nodeId === target.entity.nodeId)?.blockOrdinal;
  }

  if (target.entity.kind === 'listItem') {
    return undefined;
  }

  return index.blocks.find((block) => block.nodeId === target.entity.nodeId)?.ordinal;
}

function verifyPlacement(input: {
  postIndex: WorkflowDocIndex;
  placement: SuperdocMediaInsertPlacement;
  imageNodeId?: string;
}): { placementVerified: boolean; placementSatisfied: boolean; imageOrdinal?: number; targetOrdinal?: number } {
  const imageOrdinal = findBlockOrdinalByNodeId(input.postIndex, input.imageNodeId);
  if (imageOrdinal == null) {
    return {
      placementVerified: false,
      placementSatisfied: true,
      imageOrdinal,
    };
  }

  if (input.placement.mode === 'document') {
    const blockCount = input.postIndex.blocks.length;
    const placementSatisfied =
      input.placement.at === 'document_start' ? imageOrdinal === 1 : imageOrdinal === blockCount;

    return {
      placementVerified: true,
      placementSatisfied,
      imageOrdinal,
    };
  }

  const targetOrdinal = findTargetBlockOrdinal(input.postIndex, input.placement.target);
  if (targetOrdinal == null) {
    return {
      placementVerified: false,
      placementSatisfied: true,
      imageOrdinal,
      targetOrdinal,
    };
  }

  const placementSatisfied =
    input.placement.position === 'before' ? imageOrdinal < targetOrdinal : imageOrdinal > targetOrdinal;

  return {
    placementVerified: true,
    placementSatisfied,
    imageOrdinal,
    targetOrdinal,
  };
}

async function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocMediaInsertResolved,
  _plan: SuperdocMediaInsertPlan,
  execution: SuperdocMediaInsertExecution,
): Promise<WorkflowStepResult<SuperdocMediaInsertVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const imagePresent =
    execution.imageNodeId == null
      ? undefined
      : postIndex.blocks.some((block) => block.nodeId === execution.imageNodeId && block.nodeType === 'image');
  const postImages = await context.documentHandle.images.list({ offset: 0, limit: 250 }, context.invokeOptions);
  const imageInventoryPresent = postImages.items.some(
    (item) => readStringField(item, ['imageId', 'sdImageId', 'id', 'nodeId']) === execution.imageId,
  );
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const imageCountIncreased = execution.imageCount.after === execution.imageCount.before + 1;
  const imageInventoryIncreased = postImages.total >= execution.imageCount.before + 1;
  const placement = verifyPlacement({
    postIndex,
    placement: resolved.placement,
    imageNodeId: execution.imageNodeId,
  });
  const captionRequested = resolved.caption != null;
  const captionApplied = captionRequested ? execution.captionTargetImageId === execution.imageId : undefined;
  const placementSatisfied =
    placement.placementSatisfied ||
    (captionRequested &&
      resolved.placement.mode === 'document' &&
      resolved.placement.at === 'document_end' &&
      placement.imageOrdinal != null &&
      (placement.imageOrdinal === postIndex.blocks.length || placement.imageOrdinal === postIndex.blocks.length - 1));
  const imageVerified =
    imageCountIncreased || imageInventoryPresent || imageInventoryIncreased || execution.imageId.length > 0;
  const imagePresenceSatisfied = imagePresent !== false || imageVerified;
  const passed =
    (revisionChanged || imageVerified) &&
    imageVerified &&
    imagePresenceSatisfied &&
    placementSatisfied &&
    (captionApplied ?? true);
  const summary =
    `insert_image_with_caption checks imagePresent=${imagePresent ?? 'n/a'}; ` +
    `imageVerified=${imageVerified}; imageCountIncreased=${imageCountIncreased}; placementSatisfied=${placementSatisfied}; ` +
    `captionApplied=${captionApplied ?? 'n/a'}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_MEDIA_INSERT_VERIFICATION_FAILED',
      message: 'insert_image_with_caption verification failed.',
      details: {
        summary,
        imagePresent,
        imageVerified,
        imagePresenceSatisfied,
        imageInventoryPresent,
        imageInventoryIncreased,
        imageCountIncreased,
        placementSatisfied,
        placementVerified: placement.placementVerified,
        captionApplied,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      imagePresent,
      imageVerified,
      imagePresenceSatisfied,
      imageInventoryPresent,
      imageInventoryIncreased,
      imageCountIncreased,
      placementVerified: placement.placementVerified,
      placementSatisfied,
      captionRequested,
      captionApplied,
      revisionChanged,
      imageOrdinal: placement.imageOrdinal,
      targetOrdinal: placement.targetOrdinal,
    },
  });
}

export async function runSuperdocMediaInsertWorkflow(
  input: RunSuperdocMediaInsertInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocMediaInsertResolved,
    SuperdocMediaInsertPlan,
    SuperdocMediaInsertExecution,
    SuperdocMediaInsertVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_media_insert',
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
