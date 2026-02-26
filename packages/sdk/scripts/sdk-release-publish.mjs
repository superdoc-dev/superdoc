#!/usr/bin/env node

/**
 * SDK release publish orchestrator.
 *
 * Called by semantic-release's publishCmd to execute the full SDK publish
 * pipeline. Each sub-step is idempotent — already-published packages are
 * skipped, so re-running after a partial failure is safe.
 *
 * Usage:
 *   node sdk-release-publish.mjs --tag <dist-tag>
 *   node sdk-release-publish.mjs --tag next --npm-only
 *
 * Flags:
 *   --tag <tag>    npm dist-tag (required)
 *   --npm-only     Only publish npm packages (skip PyPI — for workflows that
 *                  use pypa/gh-action-pypi-publish for OIDC publishing)
 *   --dry-run      Validate without publishing
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

function run(command, args, { cwd = REPO_ROOT, label } = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label || `${command} ${args.join(' ')}`}`);
  console.log(`${'='.repeat(60)}\n`);

  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

function parseArgs(argv) {
  const tagIdx = argv.indexOf('--tag');
  const tag = tagIdx !== -1 && argv[tagIdx + 1] ? argv[tagIdx + 1] : null;
  if (!tag) throw new Error('--tag is required (e.g. --tag next or --tag latest)');

  const npmOnly = argv.includes('--npm-only');
  const dryRun = argv.includes('--dry-run');
  return { tag, npmOnly, dryRun };
}

function main() {
  const { tag, npmOnly, dryRun } = parseArgs(process.argv.slice(2));
  const dryRunSuffix = dryRun ? ' [dry-run]' : '';

  console.log(`\nSDK Release Publish Pipeline${dryRunSuffix}`);
  console.log(`  tag: ${tag}`);
  console.log(`  npm-only: ${npmOnly}`);

  // 1. Build superdoc (required for CLI native bundling)
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'packages/superdoc'), 'run', 'build:es'], {
    label: 'Step 1/7: Build superdoc package',
  });

  // 2. Build CLI native artifacts for all platforms
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'apps/cli'), 'run', 'build:native:all'], {
    label: 'Step 2/7: Build CLI native binaries (all platforms)',
  });

  // 3. Stage CLI artifacts into CLI platform packages
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'apps/cli'), 'run', 'build:stage'], {
    label: 'Step 3/7: Stage CLI artifacts',
  });

  // 4. Stage binaries into Node SDK platform packages
  run('node', [path.join(__dirname, 'stage-node-sdk-platform-cli.mjs')], {
    label: 'Step 4/7: Stage Node SDK platform binaries',
  });

  // 5. Stage binaries into Python companion packages
  run('node', [path.join(__dirname, 'stage-python-companion-cli.mjs')], {
    label: 'Step 5/7: Stage Python companion binaries',
  });

  // 6. Publish Node SDK (platforms first, then root)
  const nodePublishArgs = [path.join(__dirname, 'publish-node-sdk.mjs'), '--tag', tag];
  if (dryRun) nodePublishArgs.push('--dry-run');
  run('node', nodePublishArgs, {
    label: `Step 6/7: Publish Node SDK packages (tag: ${tag})${dryRunSuffix}`,
  });

  // 7. Python publish (unless --npm-only, which defers to workflow-level PyPI action)
  if (npmOnly) {
    console.log('\n  Skipping Python publish (--npm-only). PyPI publish handled by workflow.\n');
  } else {
    // Build companion wheels
    run('node', [path.join(__dirname, 'build-python-companion-wheels.mjs')], {
      label: 'Step 7a/7: Build Python companion wheels',
    });

    // Verify companion wheels
    run('node', [path.join(__dirname, 'verify-python-companion-wheels.mjs'), '--companions-only'], {
      label: 'Step 7b/7: Verify companion wheels',
    });

    // Build main Python SDK wheel
    run('python', ['-m', 'build'], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/python'),
      label: 'Step 7c/7: Build main Python SDK wheel',
    });

    // Verify main wheel
    run('node', [path.join(__dirname, 'verify-python-companion-wheels.mjs'), '--root-only'], {
      label: 'Step 7d/7: Verify main Python wheel',
    });

    if (!dryRun) {
      console.log('\n  Note: PyPI publish requires OIDC token. Use pypa/gh-action-pypi-publish in workflow.\n');
    }
  }

  console.log(`\nSDK Release Publish Pipeline complete${dryRunSuffix}.`);
}

try {
  main();
} catch (error) {
  console.error(`\nSDK publish pipeline failed: ${error.message}`);
  process.exitCode = 1;
}
