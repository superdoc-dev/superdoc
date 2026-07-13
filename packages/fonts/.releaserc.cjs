/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

require('../../scripts/semantic-release/patch-commit-filter.cjs')(['packages/fonts', 'shared', 'pnpm-workspace.yaml']);

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const branches = [
  { name: 'stable', channel: 'latest' },
  { name: 'main', prerelease: 'next', channel: 'next' },
];

const isPrerelease = branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);
// GitHub Releases are stable-only; prerelease tags and package publishing still proceed.
const shouldPublishGitHubRelease = Boolean(branch) && !isPrerelease;
const shouldCommentOnLinearRelease = true;
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'fonts-v${version}',
  plugins: [
    createCommitAnalyzer(),
    notesPlugin,
    ['semantic-release-pnpm', { npmPublish: false }],
    '../../scripts/publish-fonts.cjs',
  ],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(fonts): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

config.plugins.push([
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'fonts',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/fonts** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    },
  ]);
}

module.exports = config;
