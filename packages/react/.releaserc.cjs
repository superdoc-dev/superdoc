/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Commit filter: react declares `superdoc` in dependencies (not
 * peerDependencies), so existing consumers with lockfiles won't pick up a
 * new core version until react republishes. Expand commit analysis into
 * core paths so semantic-release triggers a react release on core changes.
 *
 * When react migrates `superdoc` to peerDependencies, narrow this to
 * packages/react only. See .github/package-impact-map.md.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'packages/react',
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

// stable -> main syncs (real merges) re-attribute prereleases to PRs already shipped on @latest.
// Gate per-PR/issue success comments off on prereleases to avoid duplicate "shipped" comments.
const shouldCommentOnRelease = !isPrerelease;

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'react-v${version}',
  plugins: [
    createCommitAnalyzer({
      // Cap at minor — react declares superdoc in dependencies, so
      // upstream breaking changes don't break react's own public API.
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
    ['semantic-release-pnpm', { npmPublish: false }],
    '../../scripts/publish-react.cjs',
  ],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(react): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push([
  'semantic-release-linear-app',
  { teamKeys: ['SD'], addComment: shouldCommentOnRelease, packageName: 'react' },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/react** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
