/* eslint-env node */

/*
 * Commit filter: CLI bundles multiple sub-packages, so git log must include
 * commits touching any of them. This shared helper patches git-log-parser to
 * expand path coverage. It REPLACES semantic-release-commit-filter — do not
 * use both (the filter restricts to CWD, which undoes the expansion).
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
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
  tagFormat: 'cli-v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'pnpm run build:prepublish',
        publishCmd: 'node scripts/publish.js --tag ${nextRelease.channel || "latest"}',
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
        'platforms/cli-darwin-arm64/package.json',
        'platforms/cli-darwin-x64/package.json',
        'platforms/cli-linux-x64/package.json',
        'platforms/cli-linux-arm64/package.json',
        'platforms/cli-windows-x64/package.json',
      ],
      message: 'chore(cli): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push([
  'semantic-release-linear-app',
  {
    teamKeys: ['SD'],
    addComment: true,
    packageName: 'superdoc-cli',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc-cli** v${nextRelease.version}\n\nThe release is available on [GitHub release](${releases.find(release => release.pluginName === "@semantic-release/github").url})',
  },
]);

module.exports = config;
