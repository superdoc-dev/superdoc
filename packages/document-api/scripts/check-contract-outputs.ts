/**
 * Purpose: Verify all contract-derived outputs are up to date.
 * Caller: Main CI/local gate for generated Document API artifacts.
 * Reads: Contract snapshot + generated schemas/agent artifacts/reference docs + overview.
 * Writes: None (exit code + console output only).
 * Fails when: A tracked generated output (reference docs, overview block)
 *   is missing/extra/stale, or any artifact builder throws.
 *
 * Clean-checkout safe: the schemas/ and agent/ outputs live under
 * `packages/document-api/generated/` which is gitignored. Those
 * artifacts are built in memory (so any builder error still surfaces)
 * but their on-disk presence is not required. Reference docs and the
 * overview block ARE committed and continue to be compared
 * byte-for-byte against the in-memory build. Run `pnpm generate:docapi`
 * to materialize the gitignored artifacts locally before publishing.
 */
import {
  buildStableSchemaArtifacts,
  buildAgentArtifacts,
  getAgentArtifactRoot,
  getStableSchemaRoot,
} from './lib/contract-output-artifacts.js';
import { checkGeneratedFiles, formatGeneratedCheckIssues, runScript } from './lib/generation-utils.js';
import {
  buildReferenceDocsArtifacts,
  checkReferenceDocsExtras,
  getReferenceDocsOutputRoot,
} from './lib/reference-docs-artifacts.js';

runScript('contract output artifacts check', async () => {
  const files = [...buildStableSchemaArtifacts(), ...buildAgentArtifacts(), ...buildReferenceDocsArtifacts()];

  const issues = await checkGeneratedFiles(files, {
    // Tracked output: committed reference docs must match the in-memory
    // build (existence, content, and no extras on disk).
    roots: [getReferenceDocsOutputRoot()],
    // Gitignored: validate the builders produce the artifacts in memory,
    // but don't require the files to exist on a clean checkout.
    inMemoryRoots: [getStableSchemaRoot(), getAgentArtifactRoot()],
  });

  await checkReferenceDocsExtras(files, issues);

  if (issues.length > 0) {
    console.error('contract output artifacts check failed');
    console.error(formatGeneratedCheckIssues(issues));
    process.exitCode = 1;
    return;
  }

  console.log(`contract output artifacts check passed (${files.length} generated files + overview block)`);
});
