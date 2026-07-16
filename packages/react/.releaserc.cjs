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
const RELEASE_PATHS = [
  'packages/react',
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/word-layout',
  'packages/preset-geometry',
  'shared',
  'pnpm-workspace.yaml',
];

require('../../scripts/semantic-release/patch-commit-filter.cjs')(RELEASE_PATHS);

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
const notesPlugin = isPrerelease
  ? createReleaseNotesGenerator()
  : [
      'semantic-release-ai-notes',
      {
        style: 'concise',
        scope: {
          name: 'SuperDoc React',
          paths: RELEASE_PATHS,
          audience: 'React developers embedding the @superdoc-dev/react component',
          instructions:
            "This package wraps the SuperDoc editor for React. Only mention editor changes when they affect the embedded editor's behavior or the component's props and API.",
        },
      },
    ];

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
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  { teamKeys: ['SD'], addComment: shouldCommentOnLinearRelease, packageName: 'react' },
]);

if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/react** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    },
  ]);
}

module.exports = config;
