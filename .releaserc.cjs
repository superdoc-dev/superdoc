/* eslint-env node */

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
    // NPM plugin MUST come before git plugin - ADD pkgRoot HERE!
    [
      'semantic-release-pnpm',
      {
        npmPublish: false,
        pkgRoot: 'packages/superdoc'
      }
    ],
    './scripts/publish-superdoc.cjs'
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
      changelogFile: 'packages/superdoc/CHANGELOG.md'  // Also specify where changelog goes
    }
  ])

  // Git plugin comes AFTER npm and changelog
  config.plugins.push([
    '@semantic-release/git',
    {
      assets: [
        'packages/superdoc/CHANGELOG.md',
        'packages/superdoc/package.json'  // Update paths to point to actual package
      ],
      message:
        'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ])
}

// Linear integration - labels issues with version on release
config.plugins.push(['semantic-release-linear-app', { teamKeys: ['SD'], addComment: true, packageName: 'superdoc' }])

// GitHub plugin comes last
config.plugins.push([
  '@semantic-release/github',
  {
    successComment: ':tada: This ${issue.pull_request ? "PR" : "issue"} is included in **superdoc** v${nextRelease.version}\n\nThe release is available on [GitHub release](<github_release_url>)',
  }
])

module.exports = config
