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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import { COMMAND_CATALOG } from '@superdoc/document-api';

import { CLI_OPERATION_METADATA } from '../src/cli/operation-params';
import {
  CLI_OPERATION_IDS,
  cliCategory,
  cliDescription,
  cliCommandTokens,
  cliRequiresDocumentContext,
  toDocApiId,
  type DocBackedCliOpId,
} from '../src/cli/operation-set';
import type { CliOnlyOperation } from '../src/cli/types';
import { CLI_ONLY_OPERATION_DEFINITIONS } from '../src/cli/cli-only-operation-definitions';
import { HOST_PROTOCOL_VERSION, HOST_PROTOCOL_FEATURES, HOST_PROTOCOL_NOTIFICATIONS } from '../src/host/protocol';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '../../..');
const CLI_DIR = resolve(ROOT, 'apps/cli');
const CONTRACT_JSON_PATH = resolve(ROOT, 'packages/document-api/generated/schemas/document-api-contract.json');
const OUTPUT_PATH = resolve(CLI_DIR, 'generated/sdk-contract.json');
const CLI_PKG_PATH = resolve(CLI_DIR, 'package.json');

// ---------------------------------------------------------------------------
// Intent names — human-friendly tool names for doc-backed operations only.
// CLI-only intent names live in CLI_ONLY_OPERATION_DEFINITIONS.
// Typed exhaustively: missing entry = compile error.
// ---------------------------------------------------------------------------

const INTENT_NAMES = {
  'doc.find': 'find_content',
  'doc.getNode': 'get_node',
  'doc.getNodeById': 'get_node_by_id',
  'doc.info': 'get_document_info',
  'doc.insert': 'insert_content',
  'doc.replace': 'replace_content',
  'doc.delete': 'delete_content',
  'doc.format.bold': 'format_bold',
  'doc.format.italic': 'format_italic',
  'doc.format.underline': 'format_underline',
  'doc.format.strikethrough': 'format_strikethrough',
  'doc.create.paragraph': 'create_paragraph',
  'doc.lists.list': 'list_lists',
  'doc.lists.get': 'get_list',
  'doc.lists.insert': 'insert_list',
  'doc.lists.setType': 'set_list_type',
  'doc.lists.indent': 'indent_list',
  'doc.lists.outdent': 'outdent_list',
  'doc.lists.restart': 'restart_list_numbering',
  'doc.lists.exit': 'exit_list',
  'doc.comments.add': 'add_comment',
  'doc.comments.edit': 'edit_comment',
  'doc.comments.reply': 'reply_to_comment',
  'doc.comments.move': 'move_comment',
  'doc.comments.resolve': 'resolve_comment',
  'doc.comments.remove': 'remove_comment',
  'doc.comments.setInternal': 'set_comment_internal',
  'doc.comments.setActive': 'set_comment_active',
  'doc.comments.goTo': 'go_to_comment',
  'doc.comments.get': 'get_comment',
  'doc.comments.list': 'list_comments',
  'doc.trackChanges.list': 'list_tracked_changes',
  'doc.trackChanges.get': 'get_tracked_change',
  'doc.trackChanges.accept': 'accept_tracked_change',
  'doc.trackChanges.reject': 'reject_tracked_change',
  'doc.trackChanges.acceptAll': 'accept_all_tracked_changes',
  'doc.trackChanges.rejectAll': 'reject_all_tracked_changes',
} as const satisfies Record<DocBackedCliOpId, string>;

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function loadDocApiContract(): {
  contractVersion: string;
  operations: Record<string, Record<string, unknown>>;
} {
  const raw = readFileSync(CONTRACT_JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

function loadCliPackage(): { name: string; version: string } {
  const raw = readFileSync(CLI_PKG_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Build contract
// ---------------------------------------------------------------------------

function buildSdkContract() {
  const docApiContract = loadDocApiContract();
  const cliPkg = loadCliPackage();

  const sourceHash = createHash('sha256').update(JSON.stringify(docApiContract)).digest('hex').slice(0, 16);

  const operations: Record<string, unknown> = {};

  for (const cliOpId of CLI_OPERATION_IDS) {
    const metadata = CLI_OPERATION_METADATA[cliOpId];
    const docApiId = toDocApiId(cliOpId);
    const stripped = cliOpId.slice(4) as CliOnlyOperation;

    // Resolve intentName: doc-backed from INTENT_NAMES, CLI-only from definitions
    const cliOnlyDef = docApiId ? null : CLI_ONLY_OPERATION_DEFINITIONS[stripped];
    const intentName = docApiId ? INTENT_NAMES[cliOpId as DocBackedCliOpId] : cliOnlyDef!.intentName;
    if (!intentName) {
      throw new Error(`Missing intentName for ${cliOpId}`);
    }

    // Base fields shared by all operations
    const entry: Record<string, unknown> = {
      operationId: cliOpId,
      command: metadata.command,
      commandTokens: [...cliCommandTokens(cliOpId)],
      category: cliCategory(cliOpId),
      description: cliDescription(cliOpId),
      requiresDocumentContext: cliRequiresDocumentContext(cliOpId),
      docRequirement: metadata.docRequirement,
      intentName,

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

      // Schema plane from document-api-contract.json
      const docOp = docApiContract.operations[docApiId];
      if (!docOp) {
        throw new Error(`Missing document-api contract entry for ${docApiId}`);
      }
      entry.inputSchema = docOp.inputSchema;
      entry.outputSchema = docOp.outputSchema;
      if (docOp.successSchema) entry.successSchema = docOp.successSchema;
      if (docOp.failureSchema) entry.failureSchema = docOp.failureSchema;
    } else {
      // CLI-only operation — metadata from canonical definitions
      const def = cliOnlyDef!;
      entry.mutates = def.sdkMetadata.mutates;
      entry.idempotency = def.sdkMetadata.idempotency;
      entry.supportsTrackedMode = def.sdkMetadata.supportsTrackedMode;
      entry.supportsDryRun = def.sdkMetadata.supportsDryRun;
      entry.outputSchema = def.outputSchema;
    }

    // Invariant: every operation must have outputSchema
    if (!entry.outputSchema) {
      throw new Error(`Operation ${cliOpId} is missing outputSchema — contract export bug.`);
    }

    operations[cliOpId] = entry;
  }

  return {
    contractVersion: docApiContract.contractVersion,
    sourceHash,
    cli: {
      package: cliPkg.name,
      minVersion: cliPkg.version,
    },
    protocol: {
      version: HOST_PROTOCOL_VERSION,
      transport: 'stdio',
      features: [...HOST_PROTOCOL_FEATURES],
      notifications: [...HOST_PROTOCOL_NOTIFICATIONS],
    },
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
    } catch {
      console.error(`--check: ${OUTPUT_PATH} does not exist. Run without --check to generate.`);
      process.exit(1);
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
