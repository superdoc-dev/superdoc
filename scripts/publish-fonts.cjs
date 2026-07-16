#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { publishPackage } = require('./npm-publish-package.cjs');

const rootDir = path.resolve(__dirname, '..');

const run = (command, args, cwd = rootDir) => {
  execFileSync(command, args, { stdio: 'inherit', cwd });
};

const buildFontsPackage = (logger = console) => {
  logger.log('Building @superdoc-dev/fonts...');
  run('pnpm', ['--filter', '@superdoc-dev/fonts', 'build']);
};

const publishFontsPackage = ({ distTag = 'latest', build = true, logger = console } = {}) => {
  if (build) {
    buildFontsPackage(logger);
  }

  publishPackage({
    packageDir: 'packages/fonts',
    tag: distTag,
    logger,
  });
};

const parseArgs = (argv) => {
  let distTag;
  let skipBuild = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist-tag') {
      distTag = argv[index + 1];
      index += 1;
    } else if (arg === '--skip-build') {
      skipBuild = true;
    }
  }

  return {
    distTag: distTag || process.env.RELEASE_DIST_TAG || 'latest',
    build: !skipBuild && process.env.SKIP_BUILD !== 'true',
  };
};

if (require.main === module) {
  try {
    publishFontsPackage(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  publish: async (_pluginConfig, context) => {
    const { nextRelease, logger = console } = context;
    const distTag = (nextRelease && nextRelease.channel) || 'latest';

    publishFontsPackage({
      distTag,
      build: true,
      logger,
    });
  },
  publishFontsPackage,
};
