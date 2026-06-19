/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Release narrow: esign externalizes `superdoc` in its build, so a core
 * change inside the declared dependency/peer range does not alter the
 * published esign tarball. Consumers pick up eligible core versions through
 * package manager resolution. Only commits touching packages/esign/** should
 * trigger a release. See .github/package-impact-map.md.
 */

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

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'esign-v${version}',
  plugins: [
    'semantic-release-commit-filter',
    createCommitAnalyzer(),
    notesPlugin,
    ['@semantic-release/npm', { npmPublish: true }],
  ],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(esign): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push([
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'esign',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **esign** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
