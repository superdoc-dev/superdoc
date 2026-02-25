/* eslint-env node */
const path = require('path');

/*
 * Commit filter: SDK depends on CLI, document-api, and all engine packages.
 * This shared helper patches git-log-parser to expand commit analysis to
 * dependency paths. It REPLACES semantic-release-commit-filter.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'packages/sdk',
  'apps/cli',
  'packages/document-api',
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/ai',
  'packages/word-layout',
  'packages/preset-geometry',
]);

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const config = {
  branches: [
    { name: 'stable', channel: 'latest' },
    { name: 'main', prerelease: 'next', channel: 'next' },
  ],
  tagFormat: 'sdk-v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    // Version bump only — actual publishing is handled by exec
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        // NOTE: semantic-release runs these commands from packages/sdk/ (the working-directory).
        // All script paths must be relative to packages/sdk/, and workspace-root pnpm
        // scripts need the -w flag.
        prepareCmd: [
          'node scripts/sync-sdk-version.mjs --set ${nextRelease.version}',
          'pnpm -w run generate:all',
          'node scripts/sdk-validate.mjs',
        ].join(' && '),
        // Publish: build artifacts + publish npm packages (PyPI handled by workflow)
        publishCmd:
          'node scripts/sdk-release-publish.mjs --tag ${nextRelease.channel || "latest"} --npm-only',
      },
    ],
  ],
};

const isPrerelease = config.branches.some(
  (b) => typeof b === 'object' && b.name === branch && b.prerelease,
);

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: [
        'package.json',
        'version.json',
        'langs/node/package.json',
        'langs/node/platforms/sdk-darwin-arm64/package.json',
        'langs/node/platforms/sdk-darwin-x64/package.json',
        'langs/node/platforms/sdk-linux-x64/package.json',
        'langs/node/platforms/sdk-linux-arm64/package.json',
        'langs/node/platforms/sdk-windows-x64/package.json',
        'langs/python/pyproject.toml',
        'langs/python/platforms/superdoc-sdk-cli-darwin-arm64/pyproject.toml',
        'langs/python/platforms/superdoc-sdk-cli-darwin-x64/pyproject.toml',
        'langs/python/platforms/superdoc-sdk-cli-linux-x64/pyproject.toml',
        'langs/python/platforms/superdoc-sdk-cli-linux-arm64/pyproject.toml',
        'langs/python/platforms/superdoc-sdk-cli-windows-x64/pyproject.toml',
      ],
      message: 'chore(sdk): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration
config.plugins.push([
  'semantic-release-linear-app',
  {
    teamKeys: ['SD'],
    addComment: true,
    packageName: 'superdoc-sdk',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc-sdk** v${nextRelease.version}',
  },
]);

module.exports = config;
