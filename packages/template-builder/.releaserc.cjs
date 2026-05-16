/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Release narrow: template-builder externalizes `superdoc` in its build, so a
 * core change does not alter the published template-builder tarball
 * (consumers get the new core via their own peerDependencies install). Only
 * commits touching packages/template-builder/** should trigger a release.
 * See .github/package-impact-map.md.
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

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'template-builder-v${version}',
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
      message: 'chore(template-builder): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push([
  'semantic-release-linear-app',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnRelease,
    packageName: 'template-builder',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **template-builder** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
