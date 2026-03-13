/**
 * Purpose: Verify all contract-derived outputs are up to date.
 * Caller: Main CI/local gate for generated Document API artifacts.
 * Reads: Contract snapshot + generated schemas/manifests/agent artifacts/reference docs + overview.
 * Writes: None (exit code + console output only).
 * Fails when: Any generated output is missing/extra/stale or overview block is out of sync.
 */
import {
  buildStableSchemaArtifacts,
  buildToolManifestArtifacts,
  buildAgentArtifacts,
  getAgentArtifactRoot,
  getStableSchemaRoot,
  getToolManifestRoot,
} from './lib/contract-output-artifacts.js';
import { checkGeneratedFiles, formatGeneratedCheckIssues, runScript } from './lib/generation-utils.js';
import {
  buildReferenceDocsArtifacts,
  checkReferenceDocsExtras,
  getReferenceDocsOutputRoot,
} from './lib/reference-docs-artifacts.js';

runScript('contract output artifacts check', async () => {
  const files = [
    ...buildStableSchemaArtifacts(),
    ...buildToolManifestArtifacts(),
    ...buildAgentArtifacts(),
    ...buildReferenceDocsArtifacts(),
  ];

  const issues = await checkGeneratedFiles(files, {
    roots: [getStableSchemaRoot(), getToolManifestRoot(), getAgentArtifactRoot(), getReferenceDocsOutputRoot()],
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
