/* eslint-env node */
const {
  createCommitAnalyzer,
  createReleaseNotesGenerator,
} = require('../../scripts/semantic-release/strict-breaking-parser.cjs');

/*
 * Commit filter: MCP depends on SDK (workspace:*) and imports engine/session
 * code directly. Git log must include commits touching those paths so MCP
 * picks up SDK/core fixes. This shared helper patches git-log-parser to
 * expand path coverage. It REPLACES semantic-release-commit-filter — do not
 * use both (the filter restricts to CWD, which undoes the expansion).
 *
 * Keep in sync with .github/workflows/release-mcp.yml paths and
 * .github/package-impact-map.md.
 */
require('../../scripts/semantic-release/patch-commit-filter.cjs')([
  'apps/mcp',
  'packages/sdk',
  'apps/cli',
  'packages/document-api',
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
  tagFormat: 'mcp-v${version}',
  plugins: [
    createCommitAnalyzer(),
    notesPlugin,
    // Publish via pnpm — npm does not rewrite `workspace:*` / `catalog:` specifiers.
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        // MCP's published tarball declares `dist/` in `files` and a
        // `dist/index.js` bin. Root `pnpm run build` only runs
        // build:superdoc + type-check and does not produce apps/mcp/dist.
        // Build MCP here so semantic-release ships a working tarball
        // regardless of which workflow drives the release.
        prepareCmd: 'pnpm run build',
        publishCmd: 'pnpm publish --no-git-checks --access public --tag ${nextRelease.channel || "latest"}',
      },
    ],
  ],
};

if (!isPrerelease) {
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: ['package.json'],
      message: 'chore(mcp): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

// Linear integration - labels issues with version on release
config.plugins.push([
  'semantic-release-linear-app',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnRelease,
    packageName: 'mcp',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/mcp** v${nextRelease.version}\n\nThe release is available on [GitHub release](${releases.find(release => release.pluginName === "@semantic-release/github").url})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
