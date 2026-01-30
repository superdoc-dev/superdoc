/* eslint-env node */
const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const config = {
  branches: [
    { name: 'stable', channel: 'latest' },
    { name: 'main', prerelease: 'next', channel: 'next' },
  ],
  tagFormat: 'template-builder-v${version}',
  plugins: [
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

config.plugins.push('@semantic-release/github');

module.exports = config;
