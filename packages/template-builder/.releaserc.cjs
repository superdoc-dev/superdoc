/* eslint-env node */
const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const config = {
  branches: [
    { name: 'stable', channel: 'latest' },
    { name: 'main', prerelease: 'next', channel: 'next' },
  ],
  tagFormat: 'template-builder-v${version}',
  plugins: [
    'semantic-release-commit-filter',
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: true }],
  ],
};

const isPrerelease = config.branches.some(
  (b) => typeof b === 'object' && b.name === branch && b.prerelease
);

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message:
        'chore(template-builder): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push(['semantic-release-linear-app', {
  teamKeys: ['SD'],
  addComment: true,
  packageName: 'template-builder',
  commentTemplate: 'shipped in {package} {releaseLink} {channel}'
}]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment: ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **template-builder** v${nextRelease.version}\n\nThe release is available on [GitHub release](<github_release_url>)',
  }
]);

module.exports = config;
