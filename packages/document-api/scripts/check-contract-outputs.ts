/**
 * Purpose: Verify all contract-derived outputs are up to date.
 * Caller: Main CI/local gate for generated Document API artifacts.
 * Reads: Contract snapshot + generated schemas and agent artifacts.
 * Writes: None (exit code + console output only).
 * Fails when: Any artifact builder throws or produces output that does not
 *   match the contract.
 *
 * Clean-checkout safe: the schemas/ and agent/ outputs live under
 * `packages/document-api/generated/`, which is gitignored. Those artifacts are
 * built in memory (so any builder error still surfaces) but their on-disk
 * presence is not required. Run `pnpm generate:docapi` to materialize them
 * locally before publishing.
 *
 * Documentation coverage is checked separately by
 * `check-documented-operations.ts`. The documentation site generates its own
 * reference from this contract, and nothing in this package writes pages.
 */
import {
  buildStableSchemaArtifacts,
  buildAgentArtifacts,
  getAgentArtifactRoot,
  getStableSchemaRoot,
} from './lib/contract-output-artifacts.js';
import { checkGeneratedFiles, formatGeneratedCheckIssues, runScript } from './lib/generation-utils.js';

runScript('contract output artifacts check', async () => {
  const files = [...buildStableSchemaArtifacts(), ...buildAgentArtifacts()];

  const issues = await checkGeneratedFiles(files, {
    // Gitignored: validate the builders produce the artifacts in memory,
    // but don't require the files to exist on a clean checkout.
    inMemoryRoots: [getStableSchemaRoot(), getAgentArtifactRoot()],
  });

  if (issues.length > 0) {
    console.error('contract output artifacts check failed');
    console.error(formatGeneratedCheckIssues(issues));
    process.exitCode = 1;
    return;
  }

  console.log(`contract output artifacts check passed (${files.length} generated files)`);
});
