/**
 * Purpose: Verify generated tool manifest artifacts match the current contract snapshot.
 * Caller: Focused local/CI check; `check-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot + files under `packages/document-api/generated/manifests`.
 * Writes: None (exit code + console output only).
 * Fails when: Tool manifest files are missing/extra/stale.
 */
import { buildToolManifestArtifacts, getToolManifestRoot } from './lib/contract-output-artifacts.js';
import { runArtifactCheck, runScript } from './lib/generation-utils.js';

runScript('tool manifest check', () =>
  runArtifactCheck('tool manifest', buildToolManifestArtifacts, [getToolManifestRoot()]),
);
