/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Commit filter: CLI bundles multiple sub-packages, so git log must include
 * commits touching any of them. This shared helper patches git-log-parser to
 * expand path coverage. It REPLACES semantic-release-commit-filter — do not
 * use both (the filter restricts to CWD, which undoes the expansion).
 *
 * Keep in sync with .github/workflows/release-cli.yml paths: trigger.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'apps/cli',
  'packages/document-api',
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/word-layout',
  'packages/preset-geometry',
  'shared',
  'pnpm-workspace.yaml',
]);

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const branches = [
  { name: 'stable', channel: 'latest' },
  { name: 'main', prerelease: 'next', channel: 'next' },
];

const isPrerelease = branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);

// GitHub Releases are stable-only; prerelease tags and package publishing still proceed.
const shouldPublishGitHubRelease = Boolean(branch) && !isPrerelease;
// Linear release comments remain the shipped-version breadcrumb, so
// prereleases link to their Git tags when no GitHub Release exists.
const shouldCommentOnLinearRelease = true;

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'cli-v${version}',
  plugins: [
    createCommitAnalyzer(),
    notesPlugin,
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
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'superdoc-cli',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc-cli** v${nextRelease.version}\n\nThe release is available on [GitHub release](${releases.find(release => release.pluginName === "@semantic-release/github").url})',
    },
  ]);
}

module.exports = config;
