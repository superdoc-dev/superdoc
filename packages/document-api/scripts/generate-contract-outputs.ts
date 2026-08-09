/**
 * Purpose: Generate all contract-derived outputs in one pass.
 * Caller: Main local sync command before committing contract changes.
 * Reads: Contract snapshot.
 * Writes: Stable schemas and agent artifacts.
 * Output: Deterministic generated files aligned to the current contract.
 *
 * Documentation is not generated here. The documentation site builds its own
 * reference from this same contract, so a product generator writing pages into
 * a documentation tree would be a second renderer to keep in step.
 */
import { rm } from 'node:fs/promises';
import { buildStableSchemaArtifacts, buildAgentArtifacts } from './lib/contract-output-artifacts.js';
import { resolveWorkspacePath, runScript, writeGeneratedFiles } from './lib/generation-utils.js';

/** Directories from removed artifact types that may still exist in developer workspaces. */
const DEPRECATED_OUTPUT_DIRS = ['packages/document-api/generated/manifests'];

runScript('generate contract outputs', async () => {
  await Promise.all(
    DEPRECATED_OUTPUT_DIRS.map((dir) => rm(resolveWorkspacePath(dir), { recursive: true, force: true })),
  );

  const files = [...buildStableSchemaArtifacts(), ...buildAgentArtifacts()];

  await writeGeneratedFiles(files);
  console.log(`generated contract outputs (${files.length} files)`);
});
