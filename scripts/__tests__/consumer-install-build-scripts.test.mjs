import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

async function readRepoFile(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * A first `pnpm add superdoc` on pnpm 11 used to exit 1:
 *
 *   ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: vue-demi@0.14.10
 *
 * The chain was superdoc -> pinia 2 -> vue-demi, whose postinstall needs an
 * approval pnpm no longer grants by default. It reproduced on every clean
 * checkout, container build, and cache miss — anywhere the dependency tree had
 * to be materialized — so it blocked CI, Docker builds, and scaffolding tools
 * rather than being a one-time onboarding papercut.
 *
 * Pinia 3 has no vue-demi, which removes the script and the approval. These
 * assertions fail if a dependency carrying an unapproved build script returns
 * to the published graph, which is the defining outcome of that change and is
 * otherwise only visible to someone installing the package from scratch.
 */
test('vue-demi stays out of the published package graph', async () => {
  // Scoped to vue-demi deliberately. A general "no dependency has an install
  // script" assertion would need to resolve every package's manifest, and the
  // name would then promise more than a lockfile grep can deliver. vue-demi is
  // the package that broke installs, and it only ever arrived through Pinia 2.
  const lock = await readRepoFile('pnpm-lock.yaml');
  assert.equal(
    lock.includes('vue-demi'),
    false,
    'vue-demi is back in the lockfile: a consumer install will exit 1 on pnpm 11 ' +
      'until the build script is approved. It arrives via Pinia 2, so check the pinia catalog entry.',
  );
});

test('the pinia catalog stays on a major without a vue-demi dependency', async () => {
  // Only this workspace's catalog is read. `superdoc/public` builds and tests
  // from a standalone clone, so reaching up to the Orbit catalog would throw
  // ENOENT in the exported repository, and this is the catalog the published
  // package resolves through.
  const catalog = await readRepoFile('pnpm-workspace.yaml');

  const entry = catalog.match(/^\s*pinia:\s*(\S+)/m);
  assert.ok(entry, 'no pinia catalog entry in pnpm-workspace.yaml');
  const major = Number.parseInt(entry[1].replace(/^\D+/, ''), 10);
  assert.ok(
    major >= 3,
    `pinia is pinned at ${entry[1]}; Pinia 2 depends on vue-demi, whose install script ` +
      'makes a fresh consumer install exit 1 on pnpm 11.',
  );
});

test('the published vue range admits the pinia peer requirement', async () => {
  // Pinia 3 requires vue ^3.5.11. Publishing a wider range would trade the
  // install failure for an unmet-peer warning on versions the package claims
  // to support, which is a quieter version of the same problem.
  const manifest = JSON.parse(await readRepoFile('packages/superdoc/package.json'));
  const vueRange = manifest.dependencies?.vue;

  assert.ok(vueRange, 'superdoc no longer declares a vue dependency');
  const floor = vueRange.replace(/^\D+/, '');
  const [major, minor, patch] = floor.split('.').map((part) => Number.parseInt(part, 10));
  assert.ok(
    major > 3 || (major === 3 && (minor > 5 || (minor === 5 && patch >= 11))),
    `superdoc advertises vue ${vueRange}, below pinia 3's ^3.5.11 peer requirement. ` +
      'Consumers on the excluded versions would install with an unmet-peer warning.',
  );
});
