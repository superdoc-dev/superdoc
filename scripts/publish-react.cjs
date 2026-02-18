#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const reactDir = path.join(rootDir, 'packages', 'react');

module.exports = {
  publish: async (_pluginConfig, context) => {
    const { nextRelease, logger = console } = context;
    const distTag = (nextRelease && nextRelease.channel) || 'latest';

    logger.log(`Publishing @superdoc-dev/react with dist-tag "${distTag}"...`);
    execFileSync(
      'pnpm',
      ['publish', '--access', 'public', '--tag', distTag, '--no-git-checks'],
      { stdio: 'inherit', cwd: reactDir }
    );
  },
};
