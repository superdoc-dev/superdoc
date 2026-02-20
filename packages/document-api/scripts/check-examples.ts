/**
 * Purpose: Ensure required workflow example headings exist in `src/README.md`.
 * Caller: Documentation quality gate for canonical workflow examples.
 * Reads: `packages/document-api/src/README.md`.
 * Writes: None (exit code + console output only).
 * Fails when: Any required workflow heading is missing.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runScript } from './lib/generation-utils.js';

const README_PATH = resolve(process.cwd(), 'packages/document-api/src/README.md');

const REQUIRED_WORKFLOW_HEADINGS = [
  '### Workflow: Find + Mutate',
  '### Workflow: Tracked-Mode Insert',
  '### Workflow: Comment Thread Lifecycle',
  '### Workflow: List Manipulation',
  '### Workflow: Capabilities-Aware Branching',
] as const;

runScript('workflow example check', async () => {
  const readme = await readFile(README_PATH, 'utf8');
  const missing = REQUIRED_WORKFLOW_HEADINGS.filter((heading) => !readme.includes(heading));

  if (missing.length > 0) {
    console.error('workflow example check failed: missing required README headings');
    for (const heading of missing) {
      console.error(`- ${heading}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`workflow example check passed (${REQUIRED_WORKFLOW_HEADINGS.length} examples found).`);
});
