import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_ROOT = path.join(PUBLIC_ROOT, '.github/workflows');

function readWorkflow(name) {
  return readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8');
}

function hasWorkflow(name) {
  return existsSync(path.join(WORKFLOW_ROOT, name));
}

function jobBlocks(workflow) {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const starts = [...jobs.matchAll(/^  ([a-z0-9-]+):\s*$/gmu)];
  return starts.map((match, index) => ({
    id: match[1],
    source: jobs.slice(match.index, starts[index + 1]?.index ?? jobs.length),
  }));
}

const reusableWorkflows = new Map([
  ['declarations.yml', ['node scripts/check-dts-shadows.mjs']],
  ['document-api.yml', ['pnpm run docapi:check']],
  ['examples.yml', ['pnpm run check:go-links', 'pnpm run check:examples']],
  [
    'react.yml',
    [
      'pnpm --filter @superdoc/react lint',
      'pnpm --filter @superdoc/react type-check',
      'pnpm --filter @superdoc/react build',
      'pnpm --filter @superdoc/react test',
    ],
  ],
  [
    'vscode.yml',
    [
      'pnpm --filter superdoc-vscode-ext lint',
      'pnpm --filter superdoc-vscode-ext typecheck',
      'pnpm --filter superdoc-vscode-ext test',
      'pnpm --filter superdoc-vscode-ext compile:ext',
    ],
  ],
]);

test('the required public gate covers every projected validation lane', () => {
  const workflow = readWorkflow('validate.yml');
  const requiredCommands = [
    'pnpm run check:pnpm-config',
    'pnpm run check:vite-plus',
    'pnpm run check:public-ci',
    'pnpm install --frozen-lockfile',
    'pnpm run format:check',
    'pnpm run lint',
    'pnpm run build:superdoc',
    'pnpm run type-check',
    'pnpm run check:removed-patches',
    'pnpm run check:release-scripts',
    'pnpm run check:workflow-paths:tests && pnpm run check:workflow-paths',
    'pnpm run check:consumer-install',
    'pnpm run check:public-boundary:tests && pnpm run check:public-boundary',
    'pnpm check:public:superdoc --skip-build',
    'pnpm --filter @superdoc/fonts --fail-if-no-match run check:families',
    'bash scripts/install-canvas-system-dependencies.sh',
    "pnpm exec vp test run '--project=!*super-editor*'",
    '--filter @superdoc/document-api',
    '--filter @superdoc/layout-engine',
    '--filter @superdoc/style-engine',
    '--filter @superdoc/geometry-utils',
    '--filter @superdoc/word-layout',
    '--filter @superdoc/common',
    '--filter @superdoc/font-utils',
    '--filter @superdoc/url-validation',
    'pnpm test:slow',
    'pnpm --filter @superdoc/cdn-smoke-test exec playwright install --with-deps chromium',
    'working-directory: packages/superdoc/tests/cdn-smoke',
    'pnpm --filter @superdoc/docs typecheck',
    'pnpm --filter @superdoc/docs test:fixtures',
    'pnpm --filter @superdoc/docs test:migration-catalog',
    'pnpm --filter @superdoc/docs test:migration-explorer',
    'pnpm --filter @superdoc/docs test:migration-explorer-contrast',
    'pnpm --filter @superdoc/docs test:migration-snippets:contract',
    'pnpm --filter @superdoc/docs test:links',
    'pnpm --filter @superdoc/docs test:redirects',
    'pnpm --filter @superdoc/docs build',
    'pnpm --filter @superdoc/docs check:links',
    'pnpm --filter @superdoc/docs check:redirects',
    'pnpm --filter @superdoc/docs test:export',
    'pnpm --filter @superdoc/docs test:migration-agent-prompt',
    'pnpm exec vp fmt --check apps/docs',
  ];

  for (const command of requiredCommands) {
    assert.ok(workflow.includes(command), `validate.yml no longer runs: ${command}`);
  }

  for (const name of reusableWorkflows.keys()) {
    assert.ok(
      workflow.includes(`uses: ./.github/workflows/${name}`),
      `validate.yml no longer includes ${name}`,
    );
  }
  assert.equal(
    workflow.includes('docx-privacy'),
    false,
    'validate.yml still includes the removed DOCX privacy workflow',
  );

  assert.match(workflow, /name: CI V2 Public \/ validate/u);
  assert.match(workflow, /  validate:\n    name: CI V2 Public \/ validate\n    if: always\(\)\n/u);
  assert.match(
    workflow,
    /needs: \[preflight, core, packages, docs, declarations, document-api, examples, react, vscode\]/u,
  );
  assert.match(workflow, /contains\(needs\.\*\.result, 'failure'\)/u);
  assert.match(workflow, /contains\(needs\.\*\.result, 'cancelled'\)/u);
  assert.match(workflow, /contains\(needs\.\*\.result, 'skipped'\)/u);

  const blocks = new Map(jobBlocks(workflow).map((block) => [block.id, block.source]));
  for (const job of ['core', 'packages', 'docs', 'document-api', 'examples', 'react', 'vscode']) {
    assert.match(blocks.get(job), /^    needs: preflight$/mu, `${job}: install can start before preflight`);
  }
});

test('the public gate excludes validation owned by private Orbit workspaces', () => {
  const workflow = readWorkflow('validate.yml');
  for (const privateCommand of [
    'apps/cli',
    'apps/mcp',
    'packages/sdk',
    'test:document-api-smoke',
    'test:content',
    'check:v1-routes',
    'test:v1-routes',
  ]) {
    assert.equal(workflow.includes(privateCommand), false, `validate.yml includes private lane: ${privateCommand}`);
  }
});

test('public package tests use the installed DOCX Engine', () => {
  const workflow = readWorkflow('validate.yml');
  const blocks = new Map(jobBlocks(workflow).map((block) => [block.id, block.source]));
  const packages = blocks.get('packages');

  assert.match(packages, /^          SUPERDOC_V2_RUNTIME_MODE: package$/mu);
  assert.doesNotMatch(packages, /^          SUPERDOC_V2_RUNTIME_MODE: source$/mu);
});

test('public validation stays read-only and on GitHub-hosted default runners', () => {
  for (const name of ['validate.yml', ...reusableWorkflows.keys()]) {
    const workflow = readWorkflow(name);
    assert.match(workflow, /\npermissions:\n  contents: read\n/u, `${name}: missing read-only permissions`);
    assert.doesNotMatch(workflow, /pull_request_target:/u, `${name}: must not execute fork code with base privileges`);
    assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./u, `${name}: fork CI must not depend on secrets`);
    assert.doesNotMatch(workflow, /self-hosted|orbit-ci-pilot|ubuntu-24\.04-/u, `${name}: uses a non-default runner`);

    for (const line of workflow.match(/^\s+runs-on:.*$/gmu) ?? []) {
      assert.equal(line.trim(), 'runs-on: ubuntu-latest', `${name}: ${line.trim()}`);
    }
  }

  for (const block of jobBlocks(readWorkflow('validate.yml'))) {
    if (/^    uses: \.\/\.github\/workflows\//mu.test(block.source)) continue;
    assert.match(block.source, /^    runs-on: ubuntu-latest$/mu, `${block.id}: missing default runner`);
  }
});

test('SuperDoc CI covers the Windows TypeScript launch paths', (t) => {
  if (!hasWorkflow('ci-superdoc.yml')) {
    t.skip('ci-superdoc.yml is omitted from the standalone OSS projection');
    return;
  }

  const workflow = readWorkflow('ci-superdoc.yml');
  const blocks = new Map(jobBlocks(workflow).map((block) => [block.id, block.source]));
  const windowsChecks = blocks.get('windows-source-checks');
  const validate = blocks.get('validate');

  assert.ok(windowsChecks, 'ci-superdoc.yml is missing Windows source checks');
  assert.match(windowsChecks, /^    needs: \[detect, pnpm-config\]$/mu);
  assert.match(windowsChecks, /^    if: needs\.detect\.outputs\.superdoc == 'true'$/mu);
  assert.match(windowsChecks, /^    runs-on: windows-latest$/mu);
  assert.match(windowsChecks, /uses: pnpm\/action-setup@/u);
  assert.match(windowsChecks, /uses: actions\/setup-node@/u);
  assert.match(windowsChecks, /run: pnpm install --ignore-scripts --frozen-lockfile/u);
  assert.match(
    windowsChecks,
    /node --test\s+packages\/superdoc\/scripts\/typescript-runner\.test\.mjs\s+packages\/superdoc\/scripts\/check-jsdoc-launcher\.test\.mjs/u,
  );
  assert.match(windowsChecks, /run: pnpm --filter superdoc run check:jsdoc/u);

  assert.match(validate, /^    needs: \[[^\n]*windows-source-checks[^\n]*\]$/mu);
  assert.match(validate, /windows-source-checks:\$\{\{ needs\.windows-source-checks\.result \}\}/u);
});

test('every focused workflow is reusable and retains its validation contract', () => {
  for (const [name, commands] of reusableWorkflows) {
    const workflow = readWorkflow(name);
    assert.match(workflow, /\non:\n  workflow_call:\n/u, `${name}: missing workflow_call`);
    if (name === 'react.yml' || name === 'vscode.yml') {
      assert.match(workflow, /uses: dorny\/paths-filter@/u, `${name}: reusable calls run for unrelated changes`);
      assert.match(workflow, /  detect:\n/u, `${name}: missing change detection`);
      assert.match(workflow, /  check:\n    needs: detect\n/u, `${name}: check is not gated on detection`);
      assert.match(workflow, /  validate:\n    name: CI /u, `${name}: missing stable final context`);
    }
    if (workflow.includes('\nconcurrency:\n')) {
      assert.match(
        workflow,
        /group: \$\{\{ github\.workflow \}\}-/u,
        `${name}: called and standalone runs can cancel each other`,
      );
    }
    for (const command of commands) {
      assert.ok(workflow.includes(command), `${name} no longer runs: ${command}`);
    }
  }
});
