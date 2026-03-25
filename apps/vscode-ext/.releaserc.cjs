/* eslint-env node */
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

const isPrerelease = branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease
  ? '@semantic-release/release-notes-generator'
  : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'vscode-v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
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
      },
    ],
    notesPlugin,
    ['semantic-release-pnpm', { npmPublish: false }], // Version bump only, handles workspace:* versions
  ],
};

// VS Code Marketplace doesn't support semver prerelease versions (e.g., 0.0.1-next.1)
// Only publish stable releases to marketplace; prereleases get GitHub release with .vsix attached
if (isPrerelease) {
  config.plugins.push([
    '@semantic-release/exec',
    {
      prepareCmd: 'pnpm run package', // Creates .vsix file only
    },
  ]);
} else {
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
  'semantic-release-linear-app',
  {
    teamKeys: ['SD'],
    addComment: true,
    packageName: 'vscode-ext',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    assets: [{ path: '*.vsix', label: 'VS Code Extension' }],
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **vscode-ext** v${nextRelease.version}',
  },
]);

module.exports = config;
