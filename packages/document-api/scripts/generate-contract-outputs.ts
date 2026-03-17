/**
 * Purpose: Generate all contract-derived outputs in one pass.
 * Caller: Main local sync command before committing contract/docs changes.
 * Reads: Contract snapshot + existing overview doc markers/content.
 * Writes: Stable schemas, agent artifacts, reference docs, and overview generated block.
 * Output: Deterministic generated files aligned to the current contract.
 */
import { rm } from 'node:fs/promises';
import { buildStableSchemaArtifacts, buildAgentArtifacts } from './lib/contract-output-artifacts.js';
import { buildReferenceDocsArtifacts, buildOverviewArtifact } from './lib/reference-docs-artifacts.js';
import { resolveWorkspacePath, runScript, writeGeneratedFiles } from './lib/generation-utils.js';

/** Directories from removed artifact types that may still exist in developer workspaces. */
const DEPRECATED_OUTPUT_DIRS = ['packages/document-api/generated/manifests'];

runScript('generate contract outputs', async () => {
  await Promise.all(
    DEPRECATED_OUTPUT_DIRS.map((dir) => rm(resolveWorkspacePath(dir), { recursive: true, force: true })),
  );

  const overview = await buildOverviewArtifact();
  const files = [...buildStableSchemaArtifacts(), ...buildAgentArtifacts(), ...buildReferenceDocsArtifacts(), overview];

  await writeGeneratedFiles(files);
  console.log(`generated contract outputs (${files.length} files, including overview block)`);
});
