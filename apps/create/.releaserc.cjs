/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;

const branches = [
  { name: 'stable', channel: 'latest' },
  { name: 'main', prerelease: 'next', channel: 'next' },
];

const isPrerelease = branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);

// stable -> main syncs (real merges) re-attribute prereleases to PRs already shipped on @latest.
// Gate per-PR/issue success comments off on prereleases to avoid duplicate "shipped" comments.
const shouldCommentOnRelease = !isPrerelease;
// Linear release comments are the shipped-version breadcrumb inside Linear
// itself, so keep them on for prereleases even while GitHub PR comments stay
// gated separately.
const shouldCommentOnLinearRelease = true;

const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'create-v${version}',
  plugins: ['semantic-release-commit-filter', createCommitAnalyzer(), notesPlugin, ['@semantic-release/npm']],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(create): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

config.plugins.push([
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'create',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/create** v${nextRelease.version}\n\nThe release is available on [GitHub release](${releases.find(release => release.pluginName === "@semantic-release/github").url})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
