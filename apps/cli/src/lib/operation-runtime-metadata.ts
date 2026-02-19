import {
  CLI_COMMAND_SPECS,
  CLI_OPERATION_METADATA,
  type CliCommandSpec,
  type CliOperationId,
  type CliOperationParamSpec,
} from '../cli';

export type OperationProfile = 'read' | 'mutation' | 'lifecycle' | 'sessionAdmin';

export type OperationTraits = {
  supportsDryRun: boolean;
  supportsChangeMode: boolean;
  requiresOutInStateless: boolean;
  supportsExpectedRevision: boolean;
};

export type OperationContextCapabilities = {
  requiresDocument: boolean;
  requiresSession: boolean;
  supportsStateless: boolean;
  supportsSession: boolean;
  supportsCollab: boolean;
};

export type OperationRuntimeMetadata = {
  operationId: CliOperationId;
  profile: OperationProfile;
  traits: OperationTraits;
  context: OperationContextCapabilities;
};

type RuntimeOverride = Partial<Pick<OperationRuntimeMetadata, 'profile' | 'context'>>;

const CANONICAL_COMMAND_SPEC_BY_OPERATION = new Map<CliOperationId, CliCommandSpec>();
for (const spec of CLI_COMMAND_SPECS) {
  if (spec.alias) continue;
  CANONICAL_COMMAND_SPEC_BY_OPERATION.set(spec.operationId as CliOperationId, spec);
}

const RUNTIME_OVERRIDES: Record<string, RuntimeOverride> = {
  'doc.open': {
    profile: 'lifecycle',
    context: {
      requiresDocument: true,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.save': {
    profile: 'lifecycle',
    context: {
      requiresDocument: false,
      requiresSession: true,
      supportsStateless: false,
      supportsSession: true,
      supportsCollab: true,
    },
  },
  'doc.close': {
    profile: 'lifecycle',
    context: {
      requiresDocument: false,
      requiresSession: true,
      supportsStateless: false,
      supportsSession: true,
      supportsCollab: true,
    },
  },
  'doc.session.list': {
    profile: 'sessionAdmin',
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.session.save': {
    profile: 'sessionAdmin',
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.session.close': {
    profile: 'sessionAdmin',
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.session.setDefault': {
    profile: 'sessionAdmin',
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.describe': {
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.describeCommand': {
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: false,
      supportsCollab: false,
    },
  },
  'doc.status': {
    context: {
      requiresDocument: false,
      requiresSession: false,
      supportsStateless: true,
      supportsSession: true,
      supportsCollab: true,
    },
  },
};

function hasParam(params: readonly CliOperationParamSpec[], name: string): boolean {
  return params.some((param) => param.name === name);
}

function deriveProfile(operationId: CliOperationId): OperationProfile {
  const spec = CANONICAL_COMMAND_SPEC_BY_OPERATION.get(operationId);
  if (!spec) return 'read';
  return spec.mutates ? 'mutation' : 'read';
}

function deriveTraits(params: readonly CliOperationParamSpec[], profile: OperationProfile): OperationTraits {
  return {
    supportsDryRun: hasParam(params, 'dryRun'),
    supportsChangeMode: hasParam(params, 'changeMode'),
    requiresOutInStateless: profile === 'mutation',
    supportsExpectedRevision: hasParam(params, 'expectedRevision'),
  };
}

function deriveContextCapabilities(params: readonly CliOperationParamSpec[]): OperationContextCapabilities {
  const hasDocumentParam = params.some((param) => param.kind === 'doc' && param.name === 'doc');
  const hasSessionParam = hasParam(params, 'sessionId');

  return {
    requiresDocument: false,
    requiresSession: false,
    supportsStateless: hasDocumentParam || !hasSessionParam,
    supportsSession: hasSessionParam,
    supportsCollab: hasSessionParam,
  };
}

function applyOverride(
  base: OperationRuntimeMetadata,
  override: RuntimeOverride | undefined,
): OperationRuntimeMetadata {
  if (!override) return base;
  return {
    ...base,
    ...(override.profile ? { profile: override.profile } : {}),
    ...(override.context
      ? {
          context: {
            ...base.context,
            ...override.context,
          },
        }
      : {}),
  };
}

function buildRuntimeMetadata(): Record<CliOperationId, OperationRuntimeMetadata> {
  const entries = Object.keys(CLI_OPERATION_METADATA) as CliOperationId[];
  const metadataByOperation = {} as Record<CliOperationId, OperationRuntimeMetadata>;

  for (const operationId of entries) {
    const operation = CLI_OPERATION_METADATA[operationId];
    const profile = deriveProfile(operationId);
    const runtime = applyOverride(
      {
        operationId,
        profile,
        traits: deriveTraits(operation.params, profile),
        context: deriveContextCapabilities(operation.params),
      },
      RUNTIME_OVERRIDES[operationId],
    );
    metadataByOperation[operationId] = runtime;
  }

  return metadataByOperation;
}

const OPERATION_RUNTIME_METADATA = buildRuntimeMetadata();

export function getOperationRuntimeMetadata(operationId: CliOperationId): OperationRuntimeMetadata {
  return OPERATION_RUNTIME_METADATA[operationId];
}
