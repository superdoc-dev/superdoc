/**
 * Purpose: Verify generated agent artifacts match the current contract snapshot.
 * Caller: Focused local/CI check; `check-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot + files under `packages/document-api/generated/agent`.
 * Writes: None (exit code + console output only).
 * Fails when: Expected files are missing/extra/stale.
 */
import { buildAgentArtifacts, getAgentArtifactRoot } from './lib/contract-output-artifacts.js';
import { runArtifactCheck, runScript } from './lib/generation-utils.js';

runScript('agent artifacts check', () =>
  runArtifactCheck('agent artifacts', buildAgentArtifacts, [getAgentArtifactRoot()]),
);
