import { buildContractSnapshot } from './contract-snapshot.js';
import { stableStringify, type GeneratedFile } from './generation-utils.js';

const GENERATED_FILE_HEADER = 'GENERATED FILE: DO NOT EDIT. Regenerate via `pnpm run docapi:sync`.\n';

const STABLE_SCHEMA_ROOT = 'packages/document-api/generated/schemas';
const TOOL_MANIFEST_ROOT = 'packages/document-api/generated/manifests';
const AGENT_ARTIFACT_ROOT = 'packages/document-api/generated/agent';

function buildOperationContractMap() {
  const snapshot = buildContractSnapshot();

  const operations = Object.fromEntries(
    snapshot.operations.map((operation) => [
      operation.operationId,
      {
        memberPath: operation.memberPath,
        metadata: operation.metadata,
        inputSchema: operation.schemas.input,
        outputSchema: operation.schemas.output,
        successSchema: operation.schemas.success,
        failureSchema: operation.schemas.failure,
      },
    ]),
  );

  return {
    contractVersion: snapshot.contractVersion,
    schemaDialect: snapshot.schemaDialect,
    sourceHash: snapshot.sourceHash,
    operations,
  };
}

export function buildStableSchemaArtifacts(): GeneratedFile[] {
  const contractMap = buildOperationContractMap();

  const artifact = {
    $schema: contractMap.schemaDialect,
    contractVersion: contractMap.contractVersion,
    generatedAt: null,
    sourceCommit: null,
    sourceHash: contractMap.sourceHash,
    operations: contractMap.operations,
  };

  return [
    {
      path: `${STABLE_SCHEMA_ROOT}/document-api-contract.json`,
      content: stableStringify(artifact),
    },
    {
      path: `${STABLE_SCHEMA_ROOT}/README.md`,
      content: `# Generated Document API schemas\n\n${GENERATED_FILE_HEADER}This directory is generated from \`packages/document-api/src/contract/*\`.\n`,
    },
  ];
}

function toToolDescription(operationId: string, mutates: boolean): string {
  if (mutates) {
    return `Apply Document API mutation \`${operationId}\`.`;
  }
  return `Read Document API data via \`${operationId}\`.`;
}

export function buildToolManifestArtifacts(): GeneratedFile[] {
  const contractMap = buildOperationContractMap();

  const tools = Object.entries(contractMap.operations).map(([operationId, operation]) => ({
    name: operationId,
    memberPath: operation.memberPath,
    description: toToolDescription(operationId, operation.metadata.mutates),
    mutates: operation.metadata.mutates,
    idempotency: operation.metadata.idempotency,
    supportsTrackedMode: operation.metadata.supportsTrackedMode,
    supportsDryRun: operation.metadata.supportsDryRun,
    deterministicTargetResolution: operation.metadata.deterministicTargetResolution,
    preApplyThrows: operation.metadata.throws.preApply,
    possibleFailureCodes: operation.metadata.possibleFailureCodes,
    remediationHints: operation.metadata.remediationHints ?? [],
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
    successSchema: operation.successSchema,
    failureSchema: operation.failureSchema,
  }));

  const manifest = {
    contractVersion: contractMap.contractVersion,
    sourceHash: contractMap.sourceHash,
    generatedAt: null,
    sourceCommit: null,
    tools,
  };

  return [
    {
      path: `${TOOL_MANIFEST_ROOT}/document-api-tools.json`,
      content: stableStringify(manifest),
    },
  ];
}

const DEFAULT_REMEDIATION_BY_CODE: Record<string, string> = {
  TARGET_NOT_FOUND: 'Refresh targets via find/get operations and retry with a fresh address or ID.',
  COMMAND_UNAVAILABLE: 'Call capabilities.get and branch to a fallback when operation availability is false.',
  TRACK_CHANGE_COMMAND_UNAVAILABLE: 'Verify track-changes support via capabilities.get before requesting tracked mode.',
  CAPABILITY_UNAVAILABLE: 'Check runtime capabilities and switch to supported mode or operation.',
  INVALID_TARGET: 'Confirm the target shape and operation compatibility, then retry with a valid target.',
  NO_OP: 'Treat as idempotent no-op and avoid retry loops unless inputs change.',
};

export function buildAgentArtifacts(): GeneratedFile[] {
  const contractMap = buildOperationContractMap();

  const remediationEntries = new Map<
    string,
    {
      code: string;
      message: string;
      operations: string[];
      preApplyOperations: string[];
      nonAppliedOperations: string[];
    }
  >();

  for (const [operationId, operation] of Object.entries(contractMap.operations)) {
    for (const code of operation.metadata.throws.preApply) {
      const entry = remediationEntries.get(code) ?? {
        code,
        message: DEFAULT_REMEDIATION_BY_CODE[code] ?? 'Inspect structured error details and operation capabilities.',
        operations: [],
        preApplyOperations: [],
        nonAppliedOperations: [],
      };
      entry.operations.push(operationId);
      entry.preApplyOperations.push(operationId);
      remediationEntries.set(code, entry);
    }

    for (const code of operation.metadata.possibleFailureCodes) {
      const entry = remediationEntries.get(code) ?? {
        code,
        message: DEFAULT_REMEDIATION_BY_CODE[code] ?? 'Inspect structured error details and operation capabilities.',
        operations: [],
        preApplyOperations: [],
        nonAppliedOperations: [],
      };
      entry.operations.push(operationId);
      entry.nonAppliedOperations.push(operationId);
      remediationEntries.set(code, entry);
    }
  }

  const remediationMap = {
    contractVersion: contractMap.contractVersion,
    sourceHash: contractMap.sourceHash,
    entries: Array.from(remediationEntries.values())
      .map((entry) => ({
        ...entry,
        operations: [...new Set(entry.operations)].sort(),
        preApplyOperations: [...new Set(entry.preApplyOperations)].sort(),
        nonAppliedOperations: [...new Set(entry.nonAppliedOperations)].sort(),
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  };

  const workflowPlaybooks = {
    contractVersion: contractMap.contractVersion,
    sourceHash: contractMap.sourceHash,
    workflows: [
      {
        id: 'find-mutate',
        title: 'Find + mutate workflow',
        operations: ['find', 'replace'],
      },
      {
        id: 'tracked-insert',
        title: 'Tracked insert workflow',
        operations: ['capabilities.get', 'insert'],
      },
      {
        id: 'comment-thread-lifecycle',
        title: 'Comment lifecycle workflow',
        operations: ['comments.add', 'comments.reply', 'comments.resolve'],
      },
      {
        id: 'list-manipulation',
        title: 'List manipulation workflow',
        operations: ['lists.insert', 'lists.setType', 'lists.indent', 'lists.outdent', 'lists.exit'],
      },
      {
        id: 'capabilities-aware-branching',
        title: 'Capabilities-aware branching workflow',
        operations: ['capabilities.get', 'replace', 'insert'],
      },
      {
        id: 'track-change-review',
        title: 'Track-change review workflow',
        operations: ['trackChanges.list', 'trackChanges.accept', 'trackChanges.reject'],
      },
    ],
  };

  const compatibilityHints = {
    contractVersion: contractMap.contractVersion,
    sourceHash: contractMap.sourceHash,
    operations: Object.fromEntries(
      Object.entries(contractMap.operations).map(([operationId, operation]) => [
        operationId,
        {
          memberPath: operation.memberPath,
          mutates: operation.metadata.mutates,
          supportsTrackedMode: operation.metadata.supportsTrackedMode,
          supportsDryRun: operation.metadata.supportsDryRun,
          requiresPreflightCapabilitiesCheck: operation.metadata.mutates,
          postApplyThrowForbidden: operation.metadata.throws.postApplyForbidden,
          deterministicTargetResolution: operation.metadata.deterministicTargetResolution,
        },
      ]),
    ),
  };

  return [
    {
      path: `${AGENT_ARTIFACT_ROOT}/remediation-map.json`,
      content: stableStringify(remediationMap),
    },
    {
      path: `${AGENT_ARTIFACT_ROOT}/workflow-playbooks.json`,
      content: stableStringify(workflowPlaybooks),
    },
    {
      path: `${AGENT_ARTIFACT_ROOT}/compatibility-hints.json`,
      content: stableStringify(compatibilityHints),
    },
  ];
}

export function getStableSchemaRoot(): string {
  return STABLE_SCHEMA_ROOT;
}

export function getToolManifestRoot(): string {
  return TOOL_MANIFEST_ROOT;
}

export function getAgentArtifactRoot(): string {
  return AGENT_ARTIFACT_ROOT;
}
