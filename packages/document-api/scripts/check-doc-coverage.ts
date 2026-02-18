/**
 * Purpose: Ensure every operation has a dedicated section in `src/README.md`.
 * Caller: Documentation quality gate for operation-level docs.
 * Reads: `packages/document-api/src/README.md` + `OPERATION_IDS`.
 * Writes: None (exit code + console output only).
 * Fails when: Any operation ID is missing a `### \`<operationId>\`` heading.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OPERATION_IDS } from '../src/index.js';
import { runScript } from './lib/generation-utils.js';

const README_PATH = resolve(process.cwd(), 'packages/document-api/src/README.md');

function hasOperationSection(readme: string, operationId: string): boolean {
  const escaped = operationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(`^###\\s+\`${escaped}\`\\s*$`, 'm');
  return sectionPattern.test(readme);
}

runScript('doc coverage check', async () => {
  const readme = await readFile(README_PATH, 'utf8');
  const missing = OPERATION_IDS.filter((operationId) => !hasOperationSection(readme, operationId));

  if (missing.length > 0) {
    console.error('doc coverage check failed: missing operation sections in README.md');
    for (const operationId of missing) {
      console.error(`- ${operationId}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`doc coverage check passed (${OPERATION_IDS.length} operations documented).`);
});
