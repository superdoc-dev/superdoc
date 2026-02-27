/**
 * Purpose: Generate all contract-derived outputs in one pass.
 * Caller: Main local sync command before committing contract/docs changes.
 * Reads: Contract snapshot + existing overview doc markers/content.
 * Writes: Stable schemas, tool manifests, agent artifacts, reference docs, and overview generated block.
 * Output: Deterministic generated files aligned to the current contract.
 */
import {
  buildStableSchemaArtifacts,
  buildToolManifestArtifacts,
  buildAgentArtifacts,
} from './lib/contract-output-artifacts.js';
import { buildReferenceDocsArtifacts, buildOverviewArtifact } from './lib/reference-docs-artifacts.js';
import { runScript, writeGeneratedFiles } from './lib/generation-utils.js';

runScript('generate contract outputs', async () => {
  const overview = await buildOverviewArtifact();
  const files = [
    ...buildStableSchemaArtifacts(),
    ...buildToolManifestArtifacts(),
    ...buildAgentArtifacts(),
    ...buildReferenceDocsArtifacts(),
    overview,
  ];

  await writeGeneratedFiles(files);
  console.log(`generated contract outputs (${files.length} files, including overview block)`);
});
