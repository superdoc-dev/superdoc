/**
 * Purpose: Generate Document API reference docs and refresh the overview API-surface block.
 * Caller: Focused local regeneration; `generate-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot + existing overview doc markers/content.
 * Writes: `apps/docs/document-api/reference/*` + generated block in `apps/docs/document-api/overview.mdx`.
 * Output: Deterministic MDX reference pages/index/manifest and synchronized overview section.
 */
import { buildReferenceDocsArtifacts, buildOverviewArtifact } from './lib/reference-docs-artifacts.js';
import { runScript, writeGeneratedFiles } from './lib/generation-utils.js';

runScript('generate reference docs', async () => {
  const files = buildReferenceDocsArtifacts();
  const overview = await buildOverviewArtifact();
  await writeGeneratedFiles([...files, overview]);
  console.log(`generated document-api reference docs and overview block (${files.length} reference files)`);
});
