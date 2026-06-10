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
const shouldCommentOnRelease = !isPrerelease;
const notesPlugin = isPrerelease ? createReleaseNotesGenerator() : ['semantic-release-ai-notes', { style: 'concise' }];

const config = {
  branches,
  tagFormat: 'font-pack-cjk-jp-v${version}',
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
      message: 'chore(font-pack-cjk-jp): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ]);
}

config.plugins.push([
  '../../scripts/semantic-release/linear-commit-sync.cjs',
  {
    teamKeys: ['SD'],
    addComment: shouldCommentOnRelease,
    packageName: 'font-pack-cjk-jp',
    commentTemplate: 'shipped in {package} {releaseLink} {channel}',
  },
]);

config.plugins.push([
  '@semantic-release/github',
  {
    successComment:
      ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **@superdoc-dev/font-pack-cjk-jp** v${nextRelease.version}\n\nThe release is available on [GitHub release](https://github.com/superdoc-dev/superdoc/releases/tag/${nextRelease.gitTag})',
    successCommentCondition: shouldCommentOnRelease ? undefined : false,
  },
]);

module.exports = config;
