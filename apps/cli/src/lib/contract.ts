/**
 * Contract introspection — powers `describe` and `describeCommand`.
 *
 * Rebuilt from document-api exports + CLI metadata. No SDK dependency.
 */

import { CONTRACT_VERSION, COMMAND_CATALOG, type OperationId } from '@superdoc/document-api';
import { HOST_PROTOCOL_FEATURES, HOST_PROTOCOL_NOTIFICATIONS, HOST_PROTOCOL_VERSION } from '../host/protocol';
import {
  CLI_COMMAND_SPECS,
  CLI_OPERATION_METADATA,
  toDocApiId,
  type CliOperationId,
  type CliCommandSpec,
  type CliOperationMetadata,
} from '../cli';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContractOperationSummary = {
  id: string;
  command: string[];
  description: string;
  category: string;
  stability: string;
  mutates: boolean;
  requiresDocumentContext: boolean;
  capabilities: string[];
  aliases: string[];
  examples: string[];
  errors: string[];
};

type ContractOperationDetail = ContractOperationSummary & {
  params: readonly {
    name: string;
    kind: string;
    flag?: string;
    type: string;
    required?: boolean;
    schema?: unknown;
  }[];
  constraints: unknown;
};

type ContractOverview = {
  contractVersion: string;
  cli: {
    package: string;
    minVersion: string;
  };
  protocol: {
    transport: string;
    host: {
      protocolVersion: string;
      features: string[];
      notifications: string[];
    };
  };
  invariants: string[];
  operationCount: number;
  operations: ContractOperationSummary[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase();
}

function deriveCapabilities(cliOpId: CliOperationId): string[] {
  const docApiId = toDocApiId(cliOpId);
  if (!docApiId) return [];

  const catalog = COMMAND_CATALOG[docApiId];
  const caps: string[] = [];
  if (catalog.supportsDryRun) caps.push('dryRun');
  if (catalog.supportsTrackedMode) caps.push('trackedMode');
  return caps;
}

function deriveErrors(cliOpId: CliOperationId): string[] {
  const docApiId = toDocApiId(cliOpId);
  if (!docApiId) return [];

  const catalog = COMMAND_CATALOG[docApiId];
  return [...catalog.throws.preApply, ...catalog.possibleFailureCodes];
}

function buildOperationSummary(spec: CliCommandSpec): ContractOperationSummary {
  const cliOpId = spec.operationId as CliOperationId;

  // Collect aliases for this operation
  const aliases = CLI_COMMAND_SPECS.filter((s) => s.alias && s.operationId === spec.operationId).map((s) => s.key);

  return {
    id: spec.operationId,
    command: [...spec.tokens],
    description: spec.description,
    category: spec.category,
    stability: 'stable',
    mutates: spec.mutates,
    requiresDocumentContext: spec.requiresDocumentContext,
    capabilities: deriveCapabilities(cliOpId),
    aliases,
    examples: [...spec.examples],
    errors: deriveErrors(cliOpId),
  };
}

function buildOperationDetail(spec: CliCommandSpec, metadata: CliOperationMetadata): ContractOperationDetail {
  const summary = buildOperationSummary(spec);

  return {
    ...summary,
    params: metadata.params.map((p) => ({
      name: p.name,
      kind: p.kind,
      flag: p.flag,
      type: p.type,
      required: p.required,
      schema: p.schema,
    })),
    constraints: metadata.constraints,
  };
}

function metadataForSpec(spec: CliCommandSpec): CliOperationMetadata | null {
  const operationId = spec.operationId as CliOperationId;
  return CLI_OPERATION_METADATA[operationId] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getContractSpec(): ContractOverview {
  return buildContractOverview();
}

export function listContractOperations(): ContractOperationSummary[] {
  return CLI_COMMAND_SPECS.filter((spec) => !spec.alias).map(buildOperationSummary);
}

export function resolveContractOperation(query: string): ContractOperationDetail | null {
  const normalizedQuery = normalizeLookup(query);
  if (!normalizedQuery) return null;

  // Match by operation id
  const byId = CLI_COMMAND_SPECS.find((spec) => !spec.alias && normalizeLookup(spec.operationId) === normalizedQuery);
  if (byId) {
    const metadata = metadataForSpec(byId);
    return metadata ? buildOperationDetail(byId, metadata) : null;
  }

  // Match by command key
  const byCommand = CLI_COMMAND_SPECS.find((spec) => !spec.alias && normalizeLookup(spec.key) === normalizedQuery);
  if (byCommand) {
    const metadata = metadataForSpec(byCommand);
    return metadata ? buildOperationDetail(byCommand, metadata) : null;
  }

  // Match by alias
  const byAlias = CLI_COMMAND_SPECS.find((spec) => spec.alias && normalizeLookup(spec.key) === normalizedQuery);
  if (byAlias) {
    // Resolve to canonical spec
    const canonical = CLI_COMMAND_SPECS.find((spec) => !spec.alias && spec.operationId === byAlias.operationId);
    if (canonical) {
      const metadata = metadataForSpec(canonical);
      return metadata ? buildOperationDetail(canonical, metadata) : null;
    }
  }

  // Match by doc.X suffix (strip doc. prefix from query)
  const bySuffix = CLI_COMMAND_SPECS.find(
    (spec) => !spec.alias && normalizeLookup(spec.operationId.slice('doc.'.length)) === normalizedQuery,
  );
  if (bySuffix) {
    const metadata = metadataForSpec(bySuffix);
    return metadata ? buildOperationDetail(bySuffix, metadata) : null;
  }

  return null;
}

export function buildContractOverview(): ContractOverview {
  const operations = listContractOperations();

  return {
    contractVersion: CONTRACT_VERSION,
    cli: {
      package: 'superdoc',
      minVersion: CONTRACT_VERSION,
    },
    protocol: {
      transport: 'stdio',
      host: {
        protocolVersion: HOST_PROTOCOL_VERSION,
        features: [...HOST_PROTOCOL_FEATURES],
        notifications: [...HOST_PROTOCOL_NOTIFICATIONS],
      },
    },
    invariants: [
      'All mutation operations require an open document context or a stateless doc path.',
      'Response envelopes include elapsed_ms for all operations.',
      'JSON output mode is the default and must always be supported.',
    ],
    operationCount: operations.length,
    operations,
  };
}

export function buildContractOperationDetail(query: string): {
  contractVersion: string;
  query: string;
  operation: ContractOperationDetail;
} | null {
  const operation = resolveContractOperation(query);
  if (!operation) return null;

  return {
    contractVersion: CONTRACT_VERSION,
    query,
    operation,
  };
}
