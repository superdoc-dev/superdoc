/**
 * Purpose: Generate stable schema artifacts from the current contract snapshot.
 * Caller: Focused local regeneration; `generate-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot.
 * Writes: `packages/document-api/generated/schemas/*`.
 * Output: Deterministic stable schema JSON/README artifacts.
 */
import { buildStableSchemaArtifacts } from './lib/contract-output-artifacts.js';
import { runArtifactGenerate, runScript } from './lib/generation-utils.js';

runScript('generate stable schemas', () => runArtifactGenerate('stable schemas', buildStableSchemaArtifacts));
