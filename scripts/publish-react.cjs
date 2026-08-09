#!/usr/bin/env node
const { publishPackage } = require('./npm-publish-package.cjs');

module.exports = {
  publish: async (_pluginConfig, context) => {
    const { nextRelease, logger = console } = context;
    const distTag = (nextRelease && nextRelease.channel) || 'latest';

    publishPackage({
      packageDir: 'packages/react',
      tag: distTag,
      logger,
    });
  },
};
