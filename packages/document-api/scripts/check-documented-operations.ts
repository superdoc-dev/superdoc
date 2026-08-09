/**
 * Purpose: Ensure the published documentation renders a page for every contract operation.
 * Caller: Document API public-surface gate.
 * Reads: Contract snapshot + the reference pages docs emits from it.
 * Writes: None (exit code + console output only).
 * Fails when: An operation exists in the contract but has no rendered page, or a
 *   rendered page belongs to no contract operation.
 *
 * Two generators used to render this reference: one wrote committed Mintlify
 * pages, the other builds the documentation site's reference. Removing the first
 * removed a cross-check nobody had written down, so this states it directly. The
 * contract is the authority, and an operation that ships without a page is a
 * documented API with no documentation.
 *
 * The check reads the emitted `.mdx` files rather than the generator's own model.
 * Both the model and the contract are projections of `OPERATION_DEFINITIONS`, so
 * comparing them would agree with itself no matter what the renderer wrote to
 * disk. Only the files answer the question the gate is asking.
 *
 * Pages are build artifacts rather than committed files, so this runs the
 * generator first instead of trusting whatever a workspace happens to have.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { buildContractSnapshot } from './lib/contract-snapshot.js';
import { runScript } from './lib/generation-utils.js';

const DOCS_APP = resolve(process.cwd(), 'apps/docs');
const REFERENCE_MODEL = resolve(DOCS_APP, 'generated/document-api-reference.json');
const REFERENCE_PAGES = resolve(DOCS_APP, 'content/docs/document-api/reference');

interface ReferenceModel {
  operations: Record<string, { path: string }>;
}

/** Every `.mdx` under the reference tree, as a slash-joined path without its extension. */
async function collectRenderedPages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectRenderedPages(entryPath);
      if (!entry.name.endsWith('.mdx')) return [];
      return [
        relative(REFERENCE_PAGES, entryPath)
          .split(sep)
          .join('/')
          .replace(/\.mdx$/u, ''),
      ];
    }),
  );
  return pages.flat();
}

runScript('documented operation coverage check', async () => {
  execFileSync('pnpm', ['run', 'generate:reference'], { cwd: DOCS_APP, stdio: 'pipe' });

  const model = JSON.parse(await readFile(REFERENCE_MODEL, 'utf8')) as ReferenceModel;
  const rendered = new Set(await collectRenderedPages(REFERENCE_PAGES));
  const defined = buildContractSnapshot().operations.map((operation) => operation.operationId);

  // Where each operation's page is expected to be. An operation the model omits
  // entirely has no declared path, and is reported as missing rather than
  // silently skipped.
  const pageFor = new Map(Object.entries(model.operations ?? {}).map(([id, entry]) => [id, entry.path]));
  const operationPages = new Set(pageFor.values());

  const problems: string[] = [];
  for (const id of defined) {
    const path = pageFor.get(id);
    if (path === undefined) problems.push(`in the contract but absent from the reference: ${id}`);
    else if (!rendered.has(path)) problems.push(`in the contract but no page was rendered: ${id} (${path}.mdx)`);
  }
  for (const id of pageFor.keys()) {
    if (!defined.includes(id)) problems.push(`documented but not in the contract: ${id}`);
  }
  // Group and index pages are rendered alongside the operations and belong to no
  // single operation, so only stale operation-shaped pages are reported: a page
  // whose operation left the contract keeps answering a URL for an API that no
  // longer exists.
  for (const page of rendered) {
    if (!operationPages.has(page) && pageFor.has(page.split('/').at(-1) ?? '')) {
      problems.push(`a rendered page belongs to no documented operation: ${page}.mdx`);
    }
  }

  if (problems.length > 0) {
    console.error('documented operation coverage check failed');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`documented operation coverage check passed (${defined.length} operations, ${rendered.size} pages)`);
});
