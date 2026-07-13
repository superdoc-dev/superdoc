/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Commit filter: vscode-ext bundles superdoc, so git log must include
 * commits touching superdoc's sub-packages. This shared helper patches
 * git-log-parser to expand path coverage. It REPLACES
 * semantic-release-commit-filter — do not use both (the filter restricts
 * to CWD, which undoes the expansion).
 *
 * Keep in sync with .github/workflows/release-vscode-ext.yml paths: trigger.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'apps/vscode-ext',
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

// GitHub Releases are stable-only; prerelease tags still proceed on main.
const shouldPublishGitHubRelease = Boolean(branch) && !isPrerelease;
// Linear release comments remain the shipped-version breadcrumb, so
// prereleases link to their Git tags when no GitHub Release exists.
const shouldCommentOnLinearRelease = true;

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'vscode-v${version}',
  plugins: [
    createCommitAnalyzer({
      // Cap at minor — the extension bundles superdoc, so upstream breaking
      // changes don't break the extension's public API (it has none).
      // Prevents accidental major bumps from superdoc feat!/BREAKING CHANGE commits.
      releaseRules: [
        { breaking: true, release: 'minor' },
        { type: 'feat', release: 'minor' },
        { type: 'fix', release: 'patch' },
        { type: 'perf', release: 'patch' },
        { type: 'revert', release: 'patch' },
      ],
    }),
    notesPlugin,
    ['semantic-release-pnpm', { npmPublish: false }], // Version bump only, handles workspace:* versions
  ],
};

// VS Code Marketplace doesn't support semver prerelease versions, so only
// stable releases build and publish a .vsix.
if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/exec',
    {
      prepareCmd: 'pnpm run package', // Creates .vsix file
      publishCmd: 'pnpm run publish:vsce', // Publishes to VS Code Marketplace
    },
  ]);

  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(vscode): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration
config.plugins.push([
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'vscode-ext',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      assets: [{ path: '*.vsix', label: 'VS Code Extension' }],
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **vscode-ext** v${nextRelease.version}',
    },
  ]);
}

module.exports = config;
