/**
 * Purpose: Generate an internal-only schema snapshot keyed by operation ID.
 * Caller: Local tooling/debugging; not part of published/generated docs outputs.
 * Reads: Contract snapshot + schema dialect from `../src/index.js`.
 * Writes: `packages/document-api/.generated-internal/contract-schemas/index.json`.
 * Output: Deterministic internal artifact for local inspection/tooling workflows.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { JSON_SCHEMA_DIALECT } from '../src/index.js';
import { buildContractSnapshot } from './lib/contract-snapshot.js';
import { runScript, stableStringify } from './lib/generation-utils.js';

const DEFAULT_OUTPUT_PATH = resolve(
  process.cwd(),
  'packages/document-api/.generated-internal/contract-schemas/index.json',
);

runScript('generate internal contract schemas', async () => {
  const outputPath = DEFAULT_OUTPUT_PATH;
  const snapshot = buildContractSnapshot();

  const artifact = {
    $schema: JSON_SCHEMA_DIALECT,
    contractVersion: snapshot.contractVersion,
    sourceHash: snapshot.sourceHash,
    operations: Object.fromEntries(snapshot.operations.map((op) => [op.operationId, op.schemas])),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${stableStringify(artifact)}\n`, 'utf8');

  console.log(`generated internal contract schemas at ${outputPath}`);
});
