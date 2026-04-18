/**
 * export-sdk-contract.ts — Produces `apps/cli/generated/sdk-contract.json`.
 *
 * This is the single input artifact the SDK codegen consumes. It merges:
 *   - CLI operation metadata (transport plane: params, constraints, command tokens)
 *   - document-api schemas (schema plane: inputSchema, outputSchema, successSchema)
 *   - CLI-only operation definitions (from canonical definitions module)
 *   - Host protocol metadata
 *
 * Run:   bun run apps/cli/scripts/export-sdk-contract.ts
 * Check: bun run apps/cli/scripts/export-sdk-contract.ts --check
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { COMMAND_CATALOG, INTENT_GROUP_META } from '@superdoc/document-api';
import { buildContractSnapshot } from '@superdoc/document-api/scripts/lib/contract-snapshot.ts';

import { CLI_OPERATION_METADATA } from '../src/cli/operation-params';
import {
  CLI_OPERATION_IDS,
  cliCategory,
  cliDescription,
  cliCommandTokens,
  cliRequiresDocumentContext,
  toDocApiId,
} from '../src/cli/operation-set';
import type { CliOnlyOperation, CliOperationParamSpec, CliTypeSpec } from '../src/cli/types';
import { CLI_ONLY_OPERATION_DEFINITIONS } from '../src/cli/cli-only-operation-definitions';
import { RESPONSE_ENVELOPE_KEY } from '../src/cli/operation-hints';
import { HOST_PROTOCOL_VERSION, HOST_PROTOCOL_FEATURES, HOST_PROTOCOL_NOTIFICATIONS } from '../src/host/protocol';

// ---------------------------------------------------------------------------
// SDK surface classification
// ---------------------------------------------------------------------------

type SdkSurface = 'client' | 'document' | 'internal';

const CLIENT_OPERATIONS = new Set(['doc.open', 'doc.describe', 'doc.describeCommand']);
const INTERNAL_OPERATIONS = new Set(['doc.status']);

function classifySdkSurface(operationId: string): SdkSurface {
  if (CLIENT_OPERATIONS.has(operationId)) return 'client';
  if (INTERNAL_OPERATIONS.has(operationId)) return 'internal';
  if (operationId.startsWith('doc.session.')) return 'internal';
  return 'document';
}

function buildParamSchema(param: CliOperationParamSpec): Record<string, unknown> {
  let schema: Record<string, unknown>;

  if (param.type === 'string' && param.schema) schema = { type: 'string', ...(param.schema as CliTypeSpec) };
  else if (param.type === 'string') schema = { type: 'string' };
  else if (param.type === 'number') schema = { type: 'number' };
  else if (param.type === 'boolean') schema = { type: 'boolean' };
  else if (param.type === 'string[]') schema = { type: 'array', items: { type: 'string' } };
  else if (param.type === 'json' && param.schema && (param.schema as CliTypeSpec).type !== 'json') {
    schema = { ...(param.schema as CliTypeSpec) };
  } else {
    schema = { type: 'object' };
  }

  if (param.description) schema.description = param.description;
  return schema;
}

function buildCliOnlyInputSchema(
  params: readonly CliOperationParamSpec[],
  sdkSurface: SdkSurface,
): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const param of params) {
    if (param.agentVisible === false) continue;
    if (sdkSurface === 'document' && (param.name === 'doc' || param.name === 'sessionId')) continue;

    properties[param.name] = buildParamSchema(param);
    if (param.required) required.push(param.name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '../../..');
const CLI_DIR = resolve(ROOT, 'apps/cli');
const OUTPUT_PATH = resolve(CLI_DIR, 'generated/sdk-contract.json');
const CLI_PKG_PATH = resolve(CLI_DIR, 'package.json');

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function loadCliPackage(): { name: string; version: string } {
  const raw = readFileSync(CLI_PKG_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Build contract
// ---------------------------------------------------------------------------

function buildSdkContract() {
  // Read the live document-api source snapshot instead of the generated JSON
  // artifact. This keeps SDK export resilient when developers add operations
  // before refreshing packages/document-api/generated/.
  const docApiContract = buildContractSnapshot();
  const cliPkg = loadCliPackage();
  const docApiOperations = Object.fromEntries(
    docApiContract.operations.map((operation) => [operation.operationId, operation]),
  );

  const operations: Record<string, unknown> = {};

  for (const cliOpId of CLI_OPERATION_IDS) {
    const metadata = CLI_OPERATION_METADATA[cliOpId];
    const docApiId = toDocApiId(cliOpId);
    const stripped = cliOpId.slice(4) as CliOnlyOperation;

    const cliOnlyDef = docApiId ? null : CLI_ONLY_OPERATION_DEFINITIONS[stripped];
    const sdkSurface = classifySdkSurface(cliOpId);

    // Base fields shared by all operations
    const entry: Record<string, unknown> = {
      operationId: cliOpId,
      sdkSurface,
      command: metadata.command,
      commandTokens: [...cliCommandTokens(cliOpId)],
      category: cliCategory(cliOpId),
      description: cliDescription(cliOpId),
      requiresDocumentContext: cliRequiresDocumentContext(cliOpId),
      docRequirement: metadata.docRequirement,

      // Response envelope key — tells SDKs which property to unwrap from the CLI response.
      // null means result is spread across top-level keys (no unwrapping needed).
      responseEnvelopeKey: docApiId ? (RESPONSE_ENVELOPE_KEY[docApiId] ?? null) : null,

      // Transport plane
      params: metadata.params.map((p) => {
        const spec: Record<string, unknown> = {
          name: p.name,
          kind: p.kind,
          type: p.type,
        };
        if (p.flag && p.flag !== p.name) spec.flag = p.flag;
        if (p.required) spec.required = true;
        if (p.schema) spec.schema = p.schema;
        if (p.description) spec.description = p.description;
        if (p.agentVisible === false) spec.agentVisible = false;
        return spec;
      }),
      constraints: metadata.constraints ?? null,
    };

    if (docApiId) {
      // Doc-backed operation — metadata from COMMAND_CATALOG
      const catalog = COMMAND_CATALOG[docApiId];
      entry.mutates = catalog.mutates;
      entry.idempotency = catalog.idempotency;
      entry.supportsTrackedMode = catalog.supportsTrackedMode;
      entry.supportsDryRun = catalog.supportsDryRun;

      // Schema plane from the source snapshot.
      const docOp = docApiOperations[docApiId];
      if (!docOp) {
        throw new Error(`CLI operation ${cliOpId} maps to missing document-api source entry ${docApiId}.`);
      }
      entry.inputSchema = docOp.schemas.input;
      entry.outputSchema = docOp.schemas.output;
      if (docOp.schemas.success) entry.successSchema = docOp.schemas.success;
      if (docOp.schemas.failure) entry.failureSchema = docOp.schemas.failure;
      if (docOp.skipAsATool) entry.skipAsATool = true;
      if (docOp.intentGroup) entry.intentGroup = docOp.intentGroup;
      if (docOp.intentAction) entry.intentAction = docOp.intentAction;
    } else {
      // CLI-only operation — metadata from canonical definitions
      const def = cliOnlyDef!;
      entry.inputSchema = buildCliOnlyInputSchema(metadata.params, sdkSurface);
      entry.mutates = def.sdkMetadata.mutates;
      entry.idempotency = def.sdkMetadata.idempotency;
      entry.supportsTrackedMode = def.sdkMetadata.supportsTrackedMode;
      entry.supportsDryRun = def.sdkMetadata.supportsDryRun;
      entry.outputSchema = def.outputSchema;
      if (def.skipAsATool) entry.skipAsATool = true;
    }

    // Invariant: every operation must have outputSchema
    if (!entry.outputSchema) {
      throw new Error(`Operation ${cliOpId} is missing outputSchema — contract export bug.`);
    }

    operations[cliOpId] = entry;
  }

  return {
    contractVersion: docApiContract.contractVersion,
    sourceHash: docApiContract.sourceHash,
    ...(docApiContract.$defs ? { $defs: docApiContract.$defs } : {}),
    cli: {
      package: cliPkg.name,
      // Envelope meta.version is contract-version-based today, so minVersion must match that domain.
      minVersion: docApiContract.contractVersion,
    },
    protocol: {
      version: HOST_PROTOCOL_VERSION,
      transport: 'stdio',
      features: [...HOST_PROTOCOL_FEATURES],
      notifications: [...HOST_PROTOCOL_NOTIFICATIONS],
    },
    intentGroupMeta: INTENT_GROUP_META,
    operations,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const isCheck = process.argv.includes('--check');
  const contract = buildSdkContract();
  const json = JSON.stringify(contract, null, 2) + '\n';

  if (isCheck) {
    let existing: string;
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf-8');
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError?.code === 'ENOENT') {
        console.error(`--check: ${OUTPUT_PATH} does not exist. Run without --check to generate.`);
        process.exit(1);
      }
      throw error;
    }

    if (existing === json) {
      console.log('sdk-contract.json is up to date.');
      process.exit(0);
    }

    // Write to temp for diff
    const tmpPath = resolve(tmpdir(), 'sdk-contract-check.json');
    writeFileSync(tmpPath, json);
    console.error(`--check: sdk-contract.json is stale.`);
    console.error(`  Committed: ${OUTPUT_PATH}`);
    console.error(`  Generated: ${tmpPath}`);
    console.error(`  Run without --check to regenerate.`);
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, json);

  const opCount = Object.keys(contract.operations).length;
  console.log(`Wrote ${OUTPUT_PATH} (${opCount} operations)`);
}

main();
