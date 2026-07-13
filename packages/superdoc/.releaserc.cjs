/* eslint-env node */
const path = require('path');
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Commit filter: superdoc bundles multiple sub-packages, so git log must
 * include commits touching any of them. Keep in sync with release-superdoc.yml.
 */
const SUPERDOC_PACKAGES = [
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/word-layout',
  'packages/preset-geometry',
  'shared',
  'pnpm-workspace.yaml',
];

Object.keys(require.cache)
  .filter((m) => path.posix.normalize(m).endsWith('/node_modules/git-log-parser/src/index.js'))
  .forEach((moduleName) => {
    const parse = require.cache[moduleName].exports.parse;
    require.cache[moduleName].exports.parse = (config, options) => {
      const repoRoot = path.resolve(options.cwd, '..', '..');
      const packagePaths = SUPERDOC_PACKAGES.map((p) => path.join(repoRoot, p));

      if (Array.isArray(config._)) {
        config._.push(...packagePaths);
      } else if (config._) {
        config._ = [config._, ...packagePaths];
      } else {
        config._ = packagePaths;
      }

      return parse(config, options);
    };
  });

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH;
const isLocalPreview = process.env.SUPERDOC_RELEASE_PREVIEW === '1';

const branches = [
  {
    name: 'stable',
    channel: 'latest', // Only stable gets @latest
  },
  {
    name: 'main',
    channel: 'next',
    prerelease: 'next',
  },
  // Maintenance branches - channel defaults to branch name
  {
    name: '+([0-9])?(.{+([0-9]),x}).x',
    // No channel specified - defaults to branch name (0.8.x, 1.2.x, etc)
  },
];

const isPrerelease = branches.some((b) => typeof b === 'object' && b.name === branch && b.prerelease);

// GitHub Releases are stable-only; prerelease tags and package publishing still proceed.
const shouldPublishGitHubRelease = !isLocalPreview && Boolean(branch) && !isPrerelease;
// Linear release comments remain the shipped-version breadcrumb, so
// prereleases link to their Git tags when no GitHub Release exists.
const shouldCommentOnLinearRelease = true;

// Use AI-powered notes for stable releases, conventional generator for prereleases
const notesPlugin =
  isLocalPreview || isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'v${version}',
  plugins: [createCommitAnalyzer(), notesPlugin],
};

if (!isLocalPreview) {
  config.plugins.push(
    // NPM plugin MUST come before git plugin
    [
      'semantic-release-pnpm',
      {
        npmPublish: false,
      },
    ],
    '../../scripts/publish-superdoc.cjs',
  );
}

// Only add changelog and git plugins for non-prerelease, non-preview branches

if (!isLocalPreview && !isPrerelease) {
  // Git plugin commits the version bump back to the branch.
  // No changelog — release notes live on the GitHub release only.
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
if (!isLocalPreview) {
  config.plugins.push([
    '../../scripts/semantic-release/linear-commit-sync.cjs',
    {
      teamKeys: ['SD'],
      addComment: shouldCommentOnLinearRelease,
      packageName: 'superdoc',
      commentTemplate: 'shipped in {package} {releaseLink} {channel}',
    },
  ]);
}

// GitHub plugin comes last
if (shouldPublishGitHubRelease) {
  config.plugins.push([
    '@semantic-release/github',
    {
      successComment:
        ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    },
  ]);
}

module.exports = config;
