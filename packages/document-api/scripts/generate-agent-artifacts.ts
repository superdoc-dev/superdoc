/**
 * Purpose: Generate agent-facing contract artifacts from the canonical contract snapshot.
 * Caller: Focused local regeneration; `generate-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot.
 * Writes: `packages/document-api/generated/agent/*`.
 * Output: Deterministic JSON artifacts for agent remediation/workflow/compatibility guidance.
 */
import { buildAgentArtifacts } from './lib/contract-output-artifacts.js';
import { runArtifactGenerate, runScript } from './lib/generation-utils.js';

runScript('generate agent artifacts', () => runArtifactGenerate('agent artifacts', buildAgentArtifacts));
