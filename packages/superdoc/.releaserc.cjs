/* eslint-env node */
const path = require('path')

/*
 * Commit filter: superdoc bundles multiple sub-packages, so git log must
 * include commits touching any of them. Keep in sync with release-superdoc.yml.
 */
const SUPERDOC_PACKAGES = [
  'packages/superdoc',
  'packages/super-editor',
  'packages/layout-engine',
  'packages/ai',
  'packages/word-layout',
  'packages/preset-geometry',
]

Object.keys(require.cache)
  .filter(m =>
    path.posix.normalize(m).endsWith('/node_modules/git-log-parser/src/index.js')
  )
  .forEach(moduleName => {
    const parse = require.cache[moduleName].exports.parse
    require.cache[moduleName].exports.parse = (config, options) => {
      const repoRoot = path.resolve(options.cwd, '..', '..')
      const packagePaths = SUPERDOC_PACKAGES.map(p => path.join(repoRoot, p))

      if (Array.isArray(config._)) {
        config._.push(...packagePaths)
      } else if (config._) {
        config._ = [config._, ...packagePaths]
      } else {
        config._ = packagePaths
      }

      return parse(config, options)
    }
  })

const branch = process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH

const config = {
  branches: [
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
  ],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    // NPM plugin MUST come before git plugin
    [
      'semantic-release-pnpm',
      {
        npmPublish: false,
      }
    ],
    '../../scripts/publish-superdoc.cjs'
  ],
}

// Only add changelog and git plugins for non-prerelease branches
const isPrerelease = config.branches.some(
  (b) => typeof b === 'object' && b.name === branch && b.prerelease
)

if (!isPrerelease) {
  // Add changelog BEFORE git
  config.plugins.push([
    '@semantic-release/changelog',
    {
      changelogFile: 'CHANGELOG.md'
    }
  ])

  // Git plugin comes AFTER npm and changelog
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: [
        'CHANGELOG.md',
        'package.json'
      ],
      message:
        'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ])
}

// Linear integration - labels issues with version on release
config.plugins.push(['semantic-release-linear-app', {
  teamKeys: ['SD'],
  addComment: true,
  packageName: 'superdoc',
  commentTemplate: 'shipped in {package} {releaseLink} {channel}'
}])

// GitHub plugin comes last
config.plugins.push([
  '@semantic-release/github',
  {
    successComment: ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc** v${nextRelease.version}\n\nThe release is available on [GitHub release](<github_release_url>)',
  }
])

module.exports = config
