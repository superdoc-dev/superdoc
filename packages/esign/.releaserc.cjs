/* eslint-env node */
/*
 * Commit filter: esign depends on superdoc, so git log must include
 * commits touching superdoc's sub-packages. This shared helper patches
 * git-log-parser to expand path coverage. It REPLACES
 * semantic-release-commit-filter — do not use both (the filter restricts
 * to CWD, which undoes the expansion).
 *
 * Keep in sync with .github/workflows/release-esign.yml paths: trigger.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'packages/esign',
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/ai',
  'packages/word-layout',
  'packages/preset-geometry',
  'pnpm-workspace.yaml',
]);

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const branches = [
  { name: 'stable', channel: 'latest' },
  { name: 'main', prerelease: 'next', channel: 'next' },
];

const isPrerelease = branches.some(
  (b) => typeof b === 'object' && b.name === branch && b.prerelease
);

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease
  ? '@semantic-release/release-notes-generator'
  : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'esign-v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // Cap at minor — esign depends on superdoc, so upstream breaking
        // changes don't break esign's own public API.
        // Prevents accidental major bumps from superdoc feat!/BREAKING CHANGE commits.
        releaseRules: [
          { breaking: true, release: 'minor' },
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
        ],
      },
    ],
    notesPlugin,
    ['@semantic-release/npm', { npmPublish: true }],
  ],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message:
        'chore(esign): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push(['semantic-release-linear-app', {
  teamKeys: ['SD'],
  addComment: true,
  packageName: 'esign',
  commentTemplate: 'shipped in {package} {releaseLink} {channel}'
}]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment: ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **esign** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
  }
]);

module.exports = config;
