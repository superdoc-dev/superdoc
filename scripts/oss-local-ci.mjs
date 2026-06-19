#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

const GETTING_STARTED_EXAMPLES = ['react', 'vue', 'vanilla', 'cdn', 'angular', 'nuxt', 'laravel', 'solid'];
const COLLABORATION_EXAMPLES = ['superdoc-yjs', 'hocuspocus', 'liveblocks'];
const BUILT_IN_UI_EXAMPLES = ['track-changes', 'comments', 'toolbar'];
const CUSTOM_UI_EXAMPLES = ['selection-capture', 'configurable-toolbar'];
const ADVANCED_HEADLESS_EXAMPLES = ['react-shadcn', 'react-mui', 'vue-vuetify', 'svelte-shadcn', 'vanilla'];
const ADVANCED_EXTENSION_EXAMPLES = ['custom-mark', 'custom-node'];
const DEMOS = [
  'contract-templates',
  'custom-ui',
  'docx-from-html',
  'fields-source',
  'grading-papers',
  'linked-sections',
  'nextjs-ssr',
];

const VISUAL_REQUIRED_ENV = [
  'SD_VISUAL_TESTING_R2_ACCOUNT_ID',
  'SD_VISUAL_TESTING_R2_ACCESS_KEY_ID',
  'SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY',
  'SD_VISUAL_TESTING_R2_BUCKET',
  'SUPERDOC_CORPUS_R2_ACCOUNT_ID',
  'SUPERDOC_CORPUS_R2_ACCESS_KEY_ID',
  'SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY',
  'SUPERDOC_CORPUS_R2_BUCKET',
];

const NON_LOCAL_WORKFLOWS = [
  'agent-docs-audit.yml: scheduled/LLM-backed audit',
  'docs-preview-pr.yml: GitHub Pages preview context',
  'pickled.yml: GitHub app/bot automation',
  'pr-labels.yml: GitHub PR labels/comments',
  'pr-renderer-build.yml: Labs API artifact upload and GitHub PR context',
  'risk-assess.yml: GitHub PR diff + AI assessment',
  'spec-review.yml: GitHub PR diff + Claude Code review',
  'update-contributors.yml: GitHub contributor context',
];

function sh(command, options = {}) {
  return {
    command: ['bash', '-lc', command],
    cwd: options.cwd ?? '.',
    env: options.env ?? {},
    requiredEnv: options.requiredEnv ?? [],
    optional: Boolean(options.optional),
    note: options.note ?? '',
  };
}

function exampleStage(id, example) {
  return {
    id,
    title: `Run example smoke: ${example}`,
    ...sh(`EXAMPLE=${quoteShell(example)} npx playwright test`, {
      cwd: 'examples/__tests__',
    }),
  };
}

function demoStage(demo) {
  return {
    id: `demo-${demo}`,
    title: `Run demo smoke: ${demo}`,
    ...sh(`DEMO=${quoteShell(demo)} npx playwright test`, {
      cwd: 'demos/__tests__',
    }),
  };
}

const LANES = [
  {
    id: 'setup',
    title: 'Shared setup',
    workflow: '(local prelude)',
    stages: [
      {
        id: 'install',
        title: 'Install dependencies',
        ...sh('pnpm install --frozen-lockfile'),
      },
    ],
  },
  {
    id: 'ci-superdoc',
    title: 'CI SuperDoc',
    workflow: '.github/workflows/ci-superdoc.yml',
    stages: [
      { id: 'lint', title: 'Lint', ...sh('NODE_OPTIONS=--max-old-space-size=4096 pnpm run lint') },
      { id: 'format', title: 'Format check', ...sh('pnpm run format:check') },
      { id: 'build', title: 'Build', ...sh('pnpm run build') },
      {
        id: 'validate-command-types',
        title: 'Validate command types',
        ...sh('node scripts/validate-command-types.mjs'),
      },
      { id: 'typecheck', title: 'Typecheck', ...sh('pnpm run type-check') },
      {
        id: 'public-interface',
        title: 'SuperDoc public interface check',
        ...sh('pnpm check:public:superdoc --skip-build'),
      },
      {
        id: 'font-families',
        title: 'Font curation list drift check',
        ...sh('pnpm --filter @superdoc-dev/fonts run check:families'),
      },
      ...Array.from({ length: 4 }, (_, index) => {
        const shard = `${index + 1}/4`;
        return {
          id: `super-editor-${index + 1}`,
          title: `Run super-editor tests shard ${shard}`,
          ...sh(
            [
              'NODE_OPTIONS=--max-old-space-size=4096',
              'pnpm exec vitest run --pool forks --minWorkers 1 --maxWorkers 1',
              `--shard=${shard}`,
              "--exclude='**/decrypt-docx.integration*'",
              "--exclude='**/contract-conformance*'",
            ].join(' '),
            { cwd: 'packages/super-editor' },
          ),
        };
      }),
      {
        id: 'other-vitest',
        title: 'Run other package vitest tests',
        ...sh(
          'NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 VITEST_MIN_WORKERS=1 pnpm exec vitest run ' +
            "'--project=!*super-editor*'",
        ),
      },
      {
        id: 'bun-tests',
        title: 'Run Bun package tests',
        ...sh(
          [
            'pnpm -r --parallel',
            '--filter @superdoc/document-api',
            '--filter @superdoc/layout-engine',
            '--filter @superdoc/style-engine',
            '--filter @superdoc/geometry-utils',
            '--filter @superdoc/word-layout',
            '--filter @superdoc/common',
            '--filter @font-utils',
            '--filter @locale-utils',
            '--filter @url-validation',
            'test',
          ].join(' '),
        ),
      },
      {
        id: 'sdk-scripts',
        title: 'Run SDK scripts tests',
        ...sh('pnpm --prefix packages/sdk run test:scripts'),
      },
      { id: 'slow-tests', title: 'Run slow tests', ...sh('pnpm test:slow') },
      {
        id: 'cdn-install',
        title: 'Install Playwright Chromium for CDN smoke test',
        ...sh('pnpm --filter @superdoc/cdn-smoke-test exec playwright install chromium'),
      },
      {
        id: 'cdn-smoke',
        title: 'Run CDN smoke test',
        ...sh('pnpm test', { cwd: 'packages/superdoc/tests/cdn-smoke' }),
      },
      {
        id: 'cli-build-superdoc',
        title: 'Build superdoc for CLI tests',
        ...sh('pnpm run build:superdoc'),
      },
      { id: 'cli-tests', title: 'Run CLI tests', ...sh('pnpm run test:cli') },
      {
        id: 'coverage-build-collaboration',
        title: 'Build collaboration dependency for coverage',
        ...sh('pnpm --filter @superdoc-dev/superdoc-yjs-collaboration build'),
      },
      {
        id: 'coverage',
        title: 'Run SuperDoc coverage locally (Codecov upload excluded)',
        ...sh('pnpm --filter superdoc exec vitest run --coverage'),
      },
    ],
  },
  {
    id: 'ci-document-api',
    title: 'CI Document API',
    workflow: '.github/workflows/ci-document-api.yml',
    stages: [
      { id: 'docapi-sync', title: 'Generate contract outputs', ...sh('pnpm run docapi:sync') },
      {
        id: 'overview-freshness',
        title: 'Check overview freshness',
        ...sh('git diff --exit-code apps/docs/document-api/overview.mdx'),
      },
      {
        id: 'docapi-check',
        title: 'Check contract parity and generated outputs',
        ...sh('pnpm run docapi:check'),
      },
    ],
  },
  {
    id: 'ci-docs',
    title: 'CI Docs',
    workflow: '.github/workflows/ci-docs.yml',
    stages: [
      { id: 'generate-all', title: 'Generate all artifacts', ...sh('pnpm run generate:all') },
      { id: 'docs-validate', title: 'Validate docs', ...sh('pnpm --filter @superdoc/docs validate') },
      { id: 'docs-links', title: 'Check docs links', ...sh('pnpm --filter @superdoc/docs check:links') },
      { id: 'docs-imports', title: 'Check docs code imports', ...sh('pnpm --filter @superdoc/docs check:imports') },
      {
        id: 'docs-build-superdoc',
        title: 'Build SuperDoc package for docs',
        ...sh('pnpm --prefix packages/superdoc run build'),
      },
      { id: 'docs-examples', title: 'Test docs code examples', ...sh('pnpm --filter @superdoc/docs test:examples') },
    ],
  },
  {
    id: 'ci-package-wrappers',
    title: 'CI package wrappers',
    workflow: 'ci-react/esign/template-builder/vscode-ext.yml',
    stages: [
      { id: 'react-build-superdoc', title: 'Build superdoc for React', ...sh('pnpm run build:superdoc') },
      { id: 'react-lint', title: 'Lint React package', ...sh('pnpm --filter @superdoc-dev/react lint') },
      { id: 'react-typecheck', title: 'Typecheck React package', ...sh('pnpm --filter @superdoc-dev/react type-check') },
      { id: 'react-build', title: 'Build React package', ...sh('pnpm --filter @superdoc-dev/react build') },
      { id: 'react-test', title: 'Test React package', ...sh('pnpm --filter @superdoc-dev/react test') },
      { id: 'esign-build-superdoc', title: 'Build superdoc for eSign', ...sh('pnpm run build:superdoc') },
      { id: 'esign-lint', title: 'Lint eSign package', ...sh('pnpm --filter @superdoc-dev/esign lint') },
      { id: 'esign-typecheck', title: 'Typecheck eSign package', ...sh('pnpm --filter @superdoc-dev/esign type-check') },
      { id: 'esign-build', title: 'Build eSign package', ...sh('pnpm --filter @superdoc-dev/esign build') },
      { id: 'esign-test', title: 'Test eSign package', ...sh('pnpm --filter @superdoc-dev/esign test') },
      {
        id: 'template-build-superdoc',
        title: 'Build superdoc for template builder',
        ...sh('pnpm run build:superdoc'),
      },
      {
        id: 'template-lint',
        title: 'Lint template builder package',
        ...sh('pnpm --filter @superdoc-dev/template-builder lint'),
      },
      {
        id: 'template-typecheck',
        title: 'Typecheck template builder package',
        ...sh('pnpm --filter @superdoc-dev/template-builder type-check'),
      },
      {
        id: 'template-build',
        title: 'Build template builder package',
        ...sh('pnpm --filter @superdoc-dev/template-builder build'),
      },
      {
        id: 'template-test',
        title: 'Test template builder package',
        ...sh('pnpm --filter @superdoc-dev/template-builder test'),
      },
      { id: 'vscode-lint', title: 'Lint VS Code extension', ...sh('pnpm --filter superdoc-vscode-ext lint') },
      {
        id: 'vscode-typecheck',
        title: 'Typecheck VS Code extension',
        ...sh('pnpm --filter superdoc-vscode-ext typecheck'),
      },
      { id: 'vscode-test', title: 'Test VS Code extension', ...sh('pnpm --filter superdoc-vscode-ext test') },
      {
        id: 'vscode-compile',
        title: 'Compile VS Code extension',
        ...sh('pnpm --filter superdoc-vscode-ext compile:ext'),
      },
    ],
  },
  {
    id: 'ci-sdk-mcp',
    title: 'CI SDK and MCP',
    workflow: 'ci-sdk.yml + ci-mcp.yml',
    stages: [
      { id: 'sdk-generate-all', title: 'Generate SDK artifacts', ...sh('pnpm run generate:all') },
      { id: 'sdk-build-node', title: 'Build Node SDK', ...sh('pnpm --prefix packages/sdk/langs/node run build') },
      { id: 'sdk-validate', title: 'Validate SDK', ...sh('node packages/sdk/scripts/sdk-validate.mjs') },
      { id: 'mcp-build-superdoc', title: 'Build superdoc for MCP', ...sh('pnpm run build:superdoc') },
      { id: 'mcp-build-sdk', title: 'Build SDK for MCP', ...sh('pnpm --prefix packages/sdk/langs/node run build') },
      { id: 'mcp-build', title: 'Build MCP app', ...sh('pnpm --prefix apps/mcp run build') },
      { id: 'mcp-test', title: 'Test MCP app', ...sh('pnpm --prefix apps/mcp run test') },
    ],
  },
  {
    id: 'ci-dts-shadows',
    title: 'Check .d.ts shadows',
    workflow: '.github/workflows/check-dts-shadows.yml',
    stages: [{ id: 'check', title: 'Check .d.ts shadows', ...sh('node scripts/check-dts-shadows.mjs') }],
  },
  {
    id: 'ci-examples',
    title: 'CI Examples',
    workflow: '.github/workflows/ci-examples.yml',
    stages: [
      { id: 'examples-build-superdoc', title: 'Build superdoc for examples', ...sh('pnpm build:superdoc') },
      { id: 'examples-build-react', title: 'Build React wrapper for examples', ...sh('pnpm --filter @superdoc-dev/react build') },
      {
        id: 'examples-build-collaboration',
        title: 'Build collaboration package for examples',
        ...sh('pnpm --filter @superdoc-dev/superdoc-yjs-collaboration build'),
      },
      {
        id: 'examples-install-playwright',
        title: 'Install Playwright Chromium for examples',
        ...sh('pnpm exec playwright install chromium', { cwd: 'examples/__tests__' }),
      },
      {
        id: 'examples-laravel-prepare',
        title: 'Prepare Laravel example',
        ...sh('composer install --no-interaction --prefer-dist && cp .env.example .env && php artisan key:generate', {
          cwd: 'examples/getting-started/laravel',
        }),
      },
      ...GETTING_STARTED_EXAMPLES.map((example) => exampleStage(`getting-started-${example}`, example)),
      ...COLLABORATION_EXAMPLES.flatMap((example) => {
        const stages = [];
        if (example === 'liveblocks') {
          stages.push({
            id: 'collaboration-liveblocks-env',
            title: 'Create Liveblocks example .env',
            ...sh("printf 'VITE_LIVEBLOCKS_PUBLIC_KEY=%s\\n' \"$VITE_LIVEBLOCKS_PUBLIC_KEY\" > .env", {
              cwd: 'examples/editor/collaboration/providers/liveblocks',
              requiredEnv: ['VITE_LIVEBLOCKS_PUBLIC_KEY'],
            }),
          });
        }
        stages.push(exampleStage(`collaboration-${example}`, `editor/collaboration/providers/${example}`));
        return stages;
      }),
      ...BUILT_IN_UI_EXAMPLES.map((example) => exampleStage(`built-in-ui-${example}`, `editor/built-in-ui/${example}`)),
      ...CUSTOM_UI_EXAMPLES.map((example) => exampleStage(`custom-ui-${example}`, `editor/custom-ui/${example}`)),
      { ...exampleStage('ai-redlining', 'ai/redlining') },
      ...ADVANCED_HEADLESS_EXAMPLES.map((example) => exampleStage(`advanced-headless-${example}`, `advanced/headless-toolbar/${example}`)),
      ...ADVANCED_EXTENSION_EXAMPLES.map((example) => exampleStage(`advanced-extension-${example}`, `advanced/extensions/${example}`)),
      {
        id: 'document-engine-ai-redlining',
        title: 'Run document-engine AI redlining server-side tests',
        ...sh('npx tsx src/index.test.ts', { cwd: 'examples/document-engine/ai-redlining' }),
      },
    ],
  },
  {
    id: 'ci-demos',
    title: 'CI Demos',
    workflow: '.github/workflows/ci-demos.yml',
    stages: [
      { id: 'demos-build-superdoc', title: 'Build superdoc for demos', ...sh('pnpm build:superdoc') },
      { id: 'demos-build-react', title: 'Build React wrapper for demos', ...sh('pnpm --filter @superdoc-dev/react build') },
      {
        id: 'demos-install-playwright',
        title: 'Install Playwright Chromium for demos',
        ...sh('pnpm exec playwright install chromium', { cwd: 'demos/__tests__' }),
      },
      ...DEMOS.map((demo) => demoStage(demo)),
    ],
  },
  {
    id: 'visual',
    title: 'Visual Tests',
    workflow: '.github/workflows/visual-test.yml',
    defaultEnabled: false,
    stages: [
      { id: 'visual-install', title: 'Install visual dependencies', ...sh('pnpm install --ignore-scripts') },
      { id: 'visual-build', title: 'Build SuperDoc for visual tests', ...sh('pnpm build') },
      {
        id: 'visual-install-playwright',
        title: 'Install visual Playwright browsers',
        ...sh('pnpm exec playwright install chromium firefox webkit', { cwd: 'tests/visual' }),
      },
      {
        id: 'visual-download-docs',
        title: 'Download visual test documents from R2',
        ...sh('pnpm docs:download', { cwd: 'tests/visual', requiredEnv: VISUAL_REQUIRED_ENV }),
      },
      {
        id: 'visual-download-baselines',
        title: 'Download visual baselines from R2',
        ...sh('pnpm exec tsx scripts/download-baselines.ts', {
          cwd: 'tests/visual',
          requiredEnv: VISUAL_REQUIRED_ENV,
        }),
      },
      {
        id: 'visual-test',
        title: 'Run visual tests',
        ...sh('pnpm test', {
          cwd: 'tests/visual',
          requiredEnv: VISUAL_REQUIRED_ENV,
          optional: true,
          note: 'Matches GitHub continue-on-error behavior for screenshot diffs.',
        }),
      },
    ],
  },
];

function parseArgs(argv) {
  const options = {
    help: false,
    includeVisual: false,
    lane: '',
    list: false,
    plan: false,
    stage: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--plan' || arg === '--dry-run') {
      options.plan = true;
    } else if (arg === '--include-visual') {
      options.includeVisual = true;
    } else if (arg === '--lane' || arg.startsWith('--lane=')) {
      options.lane = arg.includes('=') ? arg.split('=', 2)[1] : argv[++index];
    } else if (arg === '--stage' || arg.startsWith('--stage=')) {
      options.stage = arg.includes('=') ? arg.split('=', 2)[1] : argv[++index];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`OSS local CI runner

Usage:
  pnpm ci:local                  run all reproducible OSS pull-request CI locally
  pnpm ci:local --plan           print the exact stages without running them
  pnpm ci:local --list           list lanes and stages
  pnpm ci:local --lane <lane>    run one lane
  pnpm ci:local --lane <lane> --stage <stage>
  pnpm ci:local --include-visual also run the R2-backed visual workflow locally

Default lanes: ${enabledLanes({ includeVisual: false }).map((lane) => lane.id).join(', ')}
Optional lanes: visual
`);
}

function enabledLanes(options) {
  return LANES.filter((lane) => lane.defaultEnabled !== false || options.includeVisual);
}

function resolveLanes(options) {
  if (options.lane) {
    const lane = LANES.find((candidate) => candidate.id === options.lane);
    if (!lane) {
      throw new Error(`Unknown lane "${options.lane}". Lanes: ${LANES.map((candidate) => candidate.id).join(', ')}`);
    }
    return [lane];
  }
  return enabledLanes(options);
}

function resolveStages(lane, options) {
  if (!options.stage) {
    return lane.stages;
  }
  const stage = lane.stages.find((candidate) => candidate.id === options.stage);
  if (!stage) {
    throw new Error(`Unknown stage "${options.stage}" for lane "${lane.id}".`);
  }
  return [stage];
}

function printList() {
  for (const lane of LANES) {
    const suffix = lane.defaultEnabled === false ? ' (optional)' : '';
    console.log(`\n${lane.id}${suffix} - ${lane.title}`);
    console.log(`  workflow: ${lane.workflow}`);
    for (const stage of lane.stages) {
      console.log(`  - ${stage.id}: ${stage.title}`);
    }
  }
}

function printPlan(plans) {
  console.log('OSS local CI plan:');
  for (const { lane, stages } of plans) {
    console.log(`\n- lane ${lane.id}: ${lane.title}`);
    console.log(`  workflow: ${lane.workflow}`);
    for (const stage of stages) {
      console.log(`  ${stage.optional ? '~' : '*'} ${stage.id}: ${stage.command.join(' ')}  (cwd: ${stage.cwd})`);
      if (stage.requiredEnv.length > 0) {
        console.log(`    required env: ${stage.requiredEnv.join(', ')}`);
      }
      if (stage.note) {
        console.log(`    note: ${stage.note}`);
      }
    }
  }
  console.log('\nNon-local PR workflows not covered by this command:');
  for (const workflow of NON_LOCAL_WORKFLOWS) {
    console.log(`- ${workflow}`);
  }
  console.log('\n(* = blocking stage, ~ = GitHub non-blocking/continue-on-error equivalent)');
}

function verifyEnv(plans) {
  const missing = [];
  for (const { lane, stages } of plans) {
    for (const stage of stages) {
      for (const envName of stage.requiredEnv ?? []) {
        if (!process.env[envName]) {
          missing.push(`${lane.id}:${stage.id} requires ${envName}`);
        }
      }
    }
  }
  return missing;
}

function printToolchainNotes() {
  const nodeVersion = readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
  const packageManager = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).packageManager;
  console.log(`Expected local toolchain: node ${nodeVersion}, ${packageManager}, bun 1.3.13 for SuperDoc PR CI.`);
  console.log('Some legacy OSS workflows still declare node-version: 20; this runner uses the repository .nvmrc as the local CI toolchain.');
}

function runStage(lane, stage) {
  const cwd = path.resolve(repoRoot, stage.cwd);
  if (!existsSync(cwd)) {
    console.error(`Missing cwd for ${lane.id}:${stage.id}: ${stage.cwd}`);
    return 1;
  }
  console.log(`\n> [${lane.id}:${stage.id}] ${stage.title}`);
  console.log(`  ${stage.command.join(' ')}  (cwd: ${stage.cwd})`);
  const result = spawnSync(stage.command[0], stage.command.slice(1), {
    cwd,
    env: {
      ...process.env,
      ...stage.env,
    },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.list) {
    printList();
    return 0;
  }

  let plans;
  try {
    plans = resolveLanes(options).map((lane) => ({
      lane,
      stages: resolveStages(lane, options),
    }));
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  printToolchainNotes();

  if (options.plan) {
    printPlan(plans);
    return 0;
  }

  const missingEnv = verifyEnv(plans);
  if (missingEnv.length > 0) {
    console.error('Missing required environment for selected stages:');
    for (const issue of missingEnv) {
      console.error(`- ${issue}`);
    }
    return 2;
  }

  for (const plan of plans) {
    for (const stage of plan.stages) {
      const status = runStage(plan.lane, stage);
      if (status !== 0) {
        if (stage.optional) {
          console.warn(`Non-blocking stage failed: ${plan.lane.id}:${stage.id}`);
          continue;
        }
        console.error(`\nOSS local CI failed at ${plan.lane.id}:${stage.id} with exit ${status}.`);
        console.error(`Rerun: pnpm ci:local --lane ${plan.lane.id} --stage ${stage.id}`);
        return status;
      }
    }
    console.log(`\nOK lane ${plan.lane.id} passed`);
  }

  console.log('\nOK OSS local CI passed for all reproducible PR workflows.');
  console.log('Non-local GitHub/secrets workflows are listed by `pnpm ci:local --plan`.');
  return 0;
}

process.exit(main());
