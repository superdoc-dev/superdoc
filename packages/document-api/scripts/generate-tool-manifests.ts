/**
 * Purpose: Generate tool manifest artifacts from the current contract snapshot.
 * Caller: Focused local regeneration; `generate-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot.
 * Writes: `packages/document-api/generated/manifests/*`.
 * Output: Deterministic tool manifest JSON artifacts.
 */
import { buildToolManifestArtifacts } from './lib/contract-output-artifacts.js';
import { runArtifactGenerate, runScript } from './lib/generation-utils.js';

runScript('generate tool manifests', () => runArtifactGenerate('tool manifests', buildToolManifestArtifacts));
