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
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

function run(command, args, { cwd = REPO_ROOT, label, env = process.env } = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label || `${command} ${args.join(' ')}`}`);
  console.log(`${'='.repeat(60)}\n`);

  execFileSync(command, args, { cwd, stdio: 'inherit', env });
}

function parseArgs(argv) {
  const tagIdx = argv.indexOf('--tag');
  const tag = tagIdx !== -1 && argv[tagIdx + 1] ? argv[tagIdx + 1] : null;
  if (!tag) throw new Error('--tag is required (e.g. --tag next or --tag latest)');

  const npmOnly = argv.includes('--npm-only');
  const dryRun = argv.includes('--dry-run');
  return { tag, npmOnly, dryRun };
}

function resolveLocalPypiPublishConfig({ npmOnly, dryRun }) {
  if (npmOnly || dryRun) return null;

  try {
    execFileSync('python3', ['-m', 'twine', '--version'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'twine is not installed. Install it with:\n  pip install twine',
    );
  }

  const pypiToken = process.env.PYPI_PUBLISH_TOKEN;
  if (!pypiToken) {
    throw new Error(
      'PYPI_PUBLISH_TOKEN env var is required for local PyPI publishing.\n' +
        'Set it in your shell profile or pass it inline:\n' +
        '  PYPI_PUBLISH_TOKEN=pypi-... node sdk-release-publish.mjs --tag latest',
    );
  }

  return {
    twineEnv: {
      ...process.env,
      TWINE_USERNAME: '__token__',
      TWINE_PASSWORD: pypiToken,
    },
  };
}

function main() {
  const { tag, npmOnly, dryRun } = parseArgs(process.argv.slice(2));
  const dryRunSuffix = dryRun ? ' [dry-run]' : '';

  console.log(`\nSDK Release Publish Pipeline${dryRunSuffix}`);
  console.log(`  tag: ${tag}`);
  console.log(`  npm-only: ${npmOnly}`);

  const totalSteps = npmOnly ? 6 : 8;
  // Stable local releases must fail before any npm publish if PyPI upload
  // cannot run; otherwise the release can become partially published.
  const localPypiPublishConfig = resolveLocalPypiPublishConfig({ npmOnly, dryRun });

  // 1. Build superdoc (required for CLI native bundling)
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'packages/superdoc'), 'run', 'build:es'], {
    label: `Step 1/${totalSteps}: Build superdoc package`,
  });

  // 2. Build CLI native artifacts for all platforms
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'apps/cli'), 'run', 'build:native:all'], {
    label: `Step 2/${totalSteps}: Build CLI native binaries (all platforms)`,
  });

  // 3. Stage CLI artifacts into CLI platform packages
  run('pnpm', ['--prefix', path.join(REPO_ROOT, 'apps/cli'), 'run', 'build:stage'], {
    label: `Step 3/${totalSteps}: Stage CLI artifacts`,
  });

  // 4. Stage binaries into Node SDK platform packages
  run('node', [path.join(__dirname, 'stage-node-sdk-platform-cli.mjs')], {
    label: `Step 4/${totalSteps}: Stage Node SDK platform binaries`,
  });

  // 5. Stage binaries into Python companion packages
  run('node', [path.join(__dirname, 'stage-python-companion-cli.mjs')], {
    label: `Step 5/${totalSteps}: Stage Python companion binaries`,
  });

  // 6. Publish Node SDK (platforms first, then root)
  const nodePublishArgs = [path.join(__dirname, 'publish-node-sdk.mjs'), '--tag', tag];
  if (dryRun) nodePublishArgs.push('--dry-run');
  run('node', nodePublishArgs, {
    label: `Step 6/${totalSteps}: Publish Node SDK packages (tag: ${tag})${dryRunSuffix}`,
  });

  // 7. Python publish (unless --npm-only, which defers to workflow-level PyPI action)
  if (npmOnly) {
    console.log('\n  Skipping Python build (--npm-only). Python build + PyPI publish handled by workflow.\n');
  } else {
    run('node', [path.join(__dirname, 'build-python-sdk.mjs')], {
      label: `Step 7/${totalSteps}: Build and verify Python SDK`,
    });

    if (!dryRun) {
      const companionDist = path.join(REPO_ROOT, 'packages/sdk/langs/python/companion-dist');
      const rootDist = path.join(REPO_ROOT, 'packages/sdk/langs/python/dist');

      const companionFiles = readdirSync(companionDist)
        .filter((f) => f.endsWith('.whl') || f.endsWith('.tar.gz'))
        .map((f) => path.join(companionDist, f));

      const rootFiles = readdirSync(rootDist)
        .filter((f) => f.endsWith('.whl') || f.endsWith('.tar.gz'))
        .map((f) => path.join(rootDist, f));

      if (companionFiles.length === 0) throw new Error('No companion wheels found in companion-dist/');
      if (rootFiles.length === 0) throw new Error('No root wheel found in dist/');

      run('python3', ['-m', 'twine', 'upload', '--skip-existing', ...companionFiles], {
        label: `Step 8/${totalSteps}: Publish companion Python packages to PyPI`,
        env: localPypiPublishConfig.twineEnv,
      });

      run('python3', ['-m', 'twine', 'upload', '--skip-existing', ...rootFiles], {
        label: `Step 8/${totalSteps}: Publish main Python SDK to PyPI`,
        env: localPypiPublishConfig.twineEnv,
      });
    } else {
      console.log('\n  Dry run — skipping PyPI upload.\n');
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
