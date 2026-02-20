/* eslint-env node */
const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const config = {
  branches: [
    { name: 'stable', channel: 'latest' },
    { name: 'main', prerelease: 'next', channel: 'next' },
  ],
  tagFormat: 'vscode-v${version}',
  plugins: [
    'semantic-release-commit-filter',
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }], // Version bump only, no npm publish
  ],
};

const isPrerelease = config.branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);

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
