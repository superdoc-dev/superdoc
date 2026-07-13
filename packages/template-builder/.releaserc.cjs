/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Release narrow: template-builder externalizes `superdoc` in its build, so a
 * core change inside the declared dependency/peer range does not alter the
 * published template-builder tarball. Consumers pick up eligible core versions
 * through package manager resolution. Only commits touching
 * packages/template-builder/** should trigger a release. See
 * .github/package-impact-map.md.
 */

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
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnLinearRelease,
    packageName: 'template-builder',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **template-builder** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    },
  ]);
}

module.exports = config;
