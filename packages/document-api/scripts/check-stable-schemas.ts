/**
 * Purpose: Verify generated stable schema artifacts match the current contract snapshot.
 * Caller: Focused local/CI check; `check-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot + files under `packages/document-api/generated/schemas`.
 * Writes: None (exit code + console output only).
 * Fails when: Stable schema files are missing/extra/stale.
 */
import { buildStableSchemaArtifacts, getStableSchemaRoot } from './lib/contract-output-artifacts.js';
import { runArtifactCheck, runScript } from './lib/generation-utils.js';

runScript('stable schema check', () =>
  runArtifactCheck('stable schema', buildStableSchemaArtifacts, [getStableSchemaRoot()]),
);
