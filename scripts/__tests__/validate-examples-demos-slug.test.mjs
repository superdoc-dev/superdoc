import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(REPO_ROOT, 'examples/manifest.json');

// The validator resolves its targets from its own location, so these tests
// exercise it in place: back the manifest up, write the case, restore. A
// fixture tree would need the whole examples/ directory to exist alongside it.
function withManifest(entries, assertion) {
  const backupDir = mkdtempSync(path.join(tmpdir(), 'slug-test-'));
  const backup = path.join(backupDir, 'manifest.json');
  copyFileSync(MANIFEST, backup);
  try {
    writeFileSync(MANIFEST, `${JSON.stringify(entries, null, 2)}\n`);
    let output;
    let failed = false;
    try {
      output = execFileSync('bun', ['scripts/validate-examples-demos.ts'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      failed = true;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    assertion({ output, failed });
  } finally {
    copyFileSync(backup, MANIFEST);
    rmSync(backupDir, { recursive: true, force: true });
  }
}

function readEntries() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function entryById(entries, id) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`fixture entry "${id}" is no longer in examples/manifest.json; update this test`);
  return entry;
}

test('the committed manifests pass validation', () => {
  withManifest(readEntries(), ({ failed, output }) => {
    assert.equal(failed, false, `validator failed on the committed manifest:\n${output}`);
  });
});

test('a duplicate slug is rejected', () => {
  const entries = readEntries();
  entryById(entries, 'getting-started-vue').slug = entryById(entries, 'getting-started-react').slug;
  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, true, 'expected a duplicate slug to fail validation');
    assert.match(output, /manifest-duplicate-slug/);
  });
});

test('a slug that is not lowercase kebab-case is rejected', () => {
  for (const slug of ['React_Starter', 'React', 'react--starter', '-react', 'react-']) {
    const entries = readEntries();
    entryById(entries, 'getting-started-vue').slug = slug;
    withManifest(entries, ({ failed, output }) => {
      assert.equal(failed, true, `expected slug "${slug}" to fail validation`);
      assert.match(output, /must be lowercase kebab-case/);
    });
  }
});

test('a slug that would shadow a service route is rejected', () => {
  const entries = readEntries();
  entryById(entries, 'getting-started-vue').slug = 'docs';
  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, true, 'expected a reserved slug to fail validation');
    assert.match(output, /reserved for a service route/);
  });
});

test('a slug survives an entry being hidden or archived', () => {
  // The URL is the promise, not the entry. Requiring `active` would mean
  // archiving an example forces removing its slug, breaking every published
  // link at exactly the moment the example stops being maintained.
  for (const status of ['hidden', 'archived']) {
    const entries = readEntries();
    entryById(entries, 'getting-started-vue').status = status;
    withManifest(entries, ({ failed, output }) => {
      assert.equal(
        failed,
        false,
        `expected a slug on a ${status} entry to stay valid:
${output}`,
      );
    });
  }
});

test('a slug on a shim is rejected', () => {
  const entries = readEntries();
  entryById(entries, 'getting-started-vue').status = 'shim';
  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, true, 'expected a slug on a shim to fail validation');
    assert.match(output, /cannot hold a slug/);
  });
});

test('losing a published slug fails, so a stale branch cannot drop URLs', () => {
  // The realistic way this happens is a long-lived branch that predates slugs
  // resolving a manifest conflict in its own favour. Nothing else would catch
  // it: the file stays valid and the URLs just stop being published.
  const entries = readEntries().map(({ slug, ...rest }) => rest);
  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, true, 'expected dropping every slug to fail validation');
    assert.match(output, /manifest-slug-regression/);
    assert.match(output, /no longer published/);
  });
});

test('renaming a published slug fails, even though the count is unchanged', () => {
  // A count-only check passes here, which is why the baseline is an exact set.
  // The old URL stops resolving the moment this deploys.
  const entries = readEntries();
  entryById(entries, 'getting-started-react').slug = 'renamed-react';
  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, true, 'expected renaming a published slug to fail');
    assert.match(output, /no longer published: react/);
    assert.match(output, /newly published: renamed-react/);
  });
});

test('the catalog workflow watches every file the slug check depends on', () => {
  // A check that never runs is not a check. The baseline is half the permanence
  // rule, so a PR touching only it must still trigger validation.
  const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci-catalog.yml'), 'utf8');
  for (const dependency of [
    'demos/manifest.json',
    'examples/manifest.json',
    'go-links/published-slugs.json',
    'scripts/validate-examples-demos.ts',
  ]) {
    assert.ok(workflow.includes(`'${dependency}'`), `ci-catalog.yml must trigger on ${dependency}`);
  }
});

test('an entry without a slug is valid', () => {
  // Moves a slug rather than removing one: this is about an unpublished entry
  // being allowed, not about the published-slug floor, which has its own test.
  const entries = readEntries();
  const donor = entryById(entries, 'getting-started-vue');
  const recipient = entries.find((entry) => entry.slug === undefined && entry.status === 'active');
  if (!recipient) throw new Error('no unpublished active entry to move a slug onto; update this test');

  recipient.slug = donor.slug;
  delete donor.slug;

  withManifest(entries, ({ failed, output }) => {
    assert.equal(failed, false, `expected an unpublished entry to pass:\n${output}`);
  });
});
