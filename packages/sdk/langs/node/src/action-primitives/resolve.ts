import type { WorkflowDocIndex, WorkflowIndexedEntity } from './doc-index.js';

export type WorkflowTargetRequest =
  | { mode: 'ref'; ref: string }
  | { mode: 'nodeId'; nodeId: string }
  | { mode: 'blockOrdinal'; blockOrdinal: number }
  | { mode: 'paragraphOrdinal'; paragraphOrdinal: number }
  | { mode: 'bodyParagraphOrdinal'; bodyParagraphOrdinal: number }
  | { mode: 'headingOrdinal'; headingOrdinal: number }
  | { mode: 'listOrdinal'; listOrdinal: number }
  | { mode: 'tableOrdinal'; tableOrdinal: number };

export type WorkflowResolveFailureCode =
  | 'TARGET_REQUIRED'
  | 'TARGET_UNSUPPORTED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_MODE_UNAVAILABLE';

export type WorkflowResolveFailure = {
  ok: false;
  code: WorkflowResolveFailureCode;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkflowResolvedTarget = {
  mode: WorkflowTargetRequest['mode'];
  entityKind: WorkflowIndexedEntity['kind'];
  nodeId: string;
  ref?: string;
  blockOrdinal?: number;
  paragraphOrdinal?: number;
  bodyParagraphOrdinal?: number;
  headingOrdinal?: number;
  listOrdinal?: number;
  tableOrdinal?: number;
  entity: WorkflowIndexedEntity;
};

export type WorkflowResolveSuccess = {
  ok: true;
  request: WorkflowTargetRequest;
  target: WorkflowResolvedTarget;
};

export type WorkflowResolveResult = WorkflowResolveSuccess | WorkflowResolveFailure;

function failure(
  code: WorkflowResolveFailureCode,
  message: string,
  details?: Record<string, unknown>,
): WorkflowResolveFailure {
  return { ok: false, code, message, details };
}

function isResolveFailure(value: WorkflowTargetRequest | WorkflowResolveFailure): value is WorkflowResolveFailure {
  return (value as WorkflowResolveFailure).ok === false;
}

function parseOrdinal(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

export function parseWorkflowTargetRequest(raw: unknown): WorkflowTargetRequest | WorkflowResolveFailure {
  if (typeof raw === 'string') {
    const ref = raw.trim();
    if (ref.length === 0) {
      return failure('TARGET_UNSUPPORTED', 'Target reference cannot be empty.');
    }
    return { mode: 'ref', ref };
  }

  if (raw == null || typeof raw !== 'object') {
    return failure('TARGET_UNSUPPORTED', 'Target must be a string ref or a supported target object.', {
      receivedType: raw == null ? 'nullish' : typeof raw,
    });
  }

  const target = raw as Record<string, unknown>;
  if (typeof target.by === 'string' && 'value' in target) {
    const by = target.by;
    const value = target.value;
    if (by === 'ref' && typeof value === 'string') {
      return parseWorkflowTargetRequest(value);
    }
    if (by === 'nodeId' && typeof value === 'string' && value.length > 0) {
      return { mode: 'nodeId', nodeId: value };
    }
    if (by === 'blockOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'blockOrdinal', blockOrdinal: parsed };
    }
    if (by === 'paragraphOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'paragraphOrdinal', paragraphOrdinal: parsed };
    }
    if (by === 'bodyParagraphOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'bodyParagraphOrdinal', bodyParagraphOrdinal: parsed };
    }
    if (by === 'headingOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'headingOrdinal', headingOrdinal: parsed };
    }
    if (by === 'listOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'listOrdinal', listOrdinal: parsed };
    }
    if (by === 'tableOrdinal') {
      const parsed = parseOrdinal(value);
      if (parsed != null) return { mode: 'tableOrdinal', tableOrdinal: parsed };
    }
    return failure('TARGET_UNSUPPORTED', 'Target object has unsupported {by,value} shape.', {
      by,
      valueType: typeof value,
    });
  }

  const supportedKeys = [
    'ref',
    'nodeId',
    'blockOrdinal',
    'paragraphOrdinal',
    'bodyParagraphOrdinal',
    'headingOrdinal',
    'listOrdinal',
    'tableOrdinal',
  ] as const;
  const presentKeys = supportedKeys.filter((key) => target[key] != null);
  if (presentKeys.length !== 1) {
    return failure(
      'TARGET_UNSUPPORTED',
      'Target object must include exactly one supported key: ref, nodeId, blockOrdinal, paragraphOrdinal, bodyParagraphOrdinal, headingOrdinal, listOrdinal, tableOrdinal.',
      { presentKeys },
    );
  }

  const key = presentKeys[0];
  if (key === 'ref') {
    return parseWorkflowTargetRequest(target.ref);
  }

  if (key === 'nodeId' && typeof target.nodeId === 'string' && target.nodeId.length > 0) {
    return { mode: 'nodeId', nodeId: target.nodeId };
  }

  if (key === 'blockOrdinal') {
    const parsed = parseOrdinal(target.blockOrdinal);
    if (parsed != null) return { mode: 'blockOrdinal', blockOrdinal: parsed };
  }

  if (key === 'paragraphOrdinal') {
    const parsed = parseOrdinal(target.paragraphOrdinal);
    if (parsed != null) return { mode: 'paragraphOrdinal', paragraphOrdinal: parsed };
  }

  if (key === 'bodyParagraphOrdinal') {
    const parsed = parseOrdinal(target.bodyParagraphOrdinal);
    if (parsed != null) return { mode: 'bodyParagraphOrdinal', bodyParagraphOrdinal: parsed };
  }

  if (key === 'headingOrdinal') {
    const parsed = parseOrdinal(target.headingOrdinal);
    if (parsed != null) return { mode: 'headingOrdinal', headingOrdinal: parsed };
  }

  if (key === 'listOrdinal') {
    const parsed = parseOrdinal(target.listOrdinal);
    if (parsed != null) return { mode: 'listOrdinal', listOrdinal: parsed };
  }

  if (key === 'tableOrdinal') {
    const parsed = parseOrdinal(target.tableOrdinal);
    if (parsed != null) return { mode: 'tableOrdinal', tableOrdinal: parsed };
  }

  return failure('TARGET_UNSUPPORTED', `Target ${key} value is invalid.`, {
    key,
    value: target[key],
  });
}

function toResolvedTarget(mode: WorkflowTargetRequest['mode'], entity: WorkflowIndexedEntity): WorkflowResolvedTarget {
  if (entity.kind === 'block') {
    return {
      mode,
      entityKind: entity.kind,
      nodeId: entity.nodeId,
      ref: entity.ref,
      blockOrdinal: entity.ordinal,
      paragraphOrdinal: entity.paragraphOrdinal,
      bodyParagraphOrdinal: entity.bodyParagraphOrdinal,
      headingOrdinal: entity.headingOrdinal,
      tableOrdinal: entity.tableOrdinal,
      entity,
    };
  }

  if (entity.kind === 'listItem') {
    return {
      mode,
      entityKind: entity.kind,
      nodeId: entity.nodeId,
      ref: entity.ref,
      listOrdinal: entity.apiOrdinal,
      entity,
    };
  }

  return {
    mode,
    entityKind: entity.kind,
    nodeId: entity.nodeId,
    ref: entity.ref,
    blockOrdinal: entity.blockOrdinal,
    tableOrdinal: entity.tableOrdinal,
    entity,
  };
}

function resolveUnique(
  request: WorkflowTargetRequest,
  candidates: WorkflowIndexedEntity[],
  details: Record<string, unknown>,
): WorkflowResolveResult {
  const mode = request.mode;
  if (candidates.length === 0) {
    return failure('TARGET_NOT_FOUND', `No workflow target matched ${mode}.`, details);
  }
  if (candidates.length > 1) {
    return failure('TARGET_AMBIGUOUS', `Multiple workflow targets matched ${mode}.`, {
      ...details,
      candidateCount: candidates.length,
      candidateKinds: candidates.map((candidate) => candidate.kind),
      candidateNodeIds: candidates.map((candidate) => candidate.nodeId),
    });
  }

  const matched = candidates[0];
  if (matched == null) {
    return failure('TARGET_NOT_FOUND', `No workflow target matched ${mode}.`, details);
  }
  return { ok: true, request, target: toResolvedTarget(mode, matched) };
}

export function resolveWorkflowTarget(index: WorkflowDocIndex, request: WorkflowTargetRequest): WorkflowResolveResult {
  if (request.mode === 'ref') {
    const candidates = index.lookup.byRef.get(request.ref) ?? [];
    if (candidates.length > 0) {
      return resolveUnique(request, candidates, { ref: request.ref });
    }
    const nodeIdCandidates = index.lookup.byNodeId.get(request.ref) ?? [];
    return resolveUnique(request, nodeIdCandidates, { ref: request.ref, nodeIdFallback: true });
  }

  if (request.mode === 'nodeId') {
    const candidates = index.lookup.byNodeId.get(request.nodeId) ?? [];
    return resolveUnique(request, candidates, { nodeId: request.nodeId });
  }

  if (request.mode === 'blockOrdinal') {
    // Requests use the 1-based convention (parseOrdinal rejects < 1); the
    // index keys on the doc-api block.ordinal, which is 0-based.
    const block = index.lookup.byBlockOrdinal.get(request.blockOrdinal - 1);
    return resolveUnique(request, block == null ? [] : [block], {
      blockOrdinal: request.blockOrdinal,
    });
  }

  if (request.mode === 'paragraphOrdinal') {
    const block = index.lookup.byParagraphOrdinal.get(request.paragraphOrdinal);
    return resolveUnique(request, block == null ? [] : [block], {
      paragraphOrdinal: request.paragraphOrdinal,
    });
  }

  if (request.mode === 'bodyParagraphOrdinal') {
    const block = index.lookup.byBodyParagraphOrdinal.get(request.bodyParagraphOrdinal);
    return resolveUnique(request, block == null ? [] : [block], {
      bodyParagraphOrdinal: request.bodyParagraphOrdinal,
    });
  }

  if (request.mode === 'headingOrdinal') {
    const block = index.lookup.byHeadingOrdinal.get(request.headingOrdinal);
    return resolveUnique(request, block == null ? [] : [block], {
      headingOrdinal: request.headingOrdinal,
    });
  }

  if (request.mode === 'listOrdinal') {
    if (index.lookup.byListOrdinal.size === 0) {
      return failure(
        'TARGET_MODE_UNAVAILABLE',
        'List ordinal resolution is unavailable: index has no API list ordinals.',
        {
          listCount: index.lists.length,
        },
      );
    }
    const candidates = index.lookup.byListOrdinal.get(request.listOrdinal) ?? [];
    return resolveUnique(request, candidates, { listOrdinal: request.listOrdinal });
  }

  if (index.lookup.byTableOrdinal.size === 0) {
    return failure('TARGET_MODE_UNAVAILABLE', 'Table ordinal resolution is unavailable: index has no tables.', {
      tableCount: index.tables.length,
    });
  }
  const table = index.lookup.byTableOrdinal.get(request.tableOrdinal);
  return resolveUnique(request, table == null ? [] : [table], { tableOrdinal: request.tableOrdinal });
}

export function resolveWorkflowTargetFromUnknown(index: WorkflowDocIndex, rawTarget: unknown): WorkflowResolveResult {
  if (rawTarget == null) {
    return failure('TARGET_REQUIRED', 'No target value was provided.');
  }
  const parsed = parseWorkflowTargetRequest(rawTarget);
  if (isResolveFailure(parsed)) {
    return parsed;
  }
  return resolveWorkflowTarget(index, parsed);
}
