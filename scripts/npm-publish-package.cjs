#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  defaultRegistry,
  isVersionLookupNotFoundError,
  makeRegistryLookup,
  rootDir,
} = require('./npm-registry.cjs');

const run = (command, args, cwd = rootDir) => {
  execFileSync(command, args, { stdio: 'inherit', cwd });
};

// Bound once for the common path. Callers that need to intercept the registry
// (tests, dry runs) pass their own `effects` to publishPackage instead, matching
// how npm-mirror-publish.cjs threads them through.
const isVersionPublished = makeRegistryLookup();

const getPackageMetadata = (packageDir) => {
  const pkgPath = path.join(rootDir, packageDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.name || !pkg.version) {
    throw new Error(`Expected ${packageDir}/package.json to include name and version.`);
  }
  return pkg;
};

const publishPackage = ({ packageDir, tag = 'latest', logger = console, effects } = {}) => {
  const cwd = path.join(rootDir, packageDir);
  const pkg = getPackageMetadata(packageDir);
  const lookup = effects ? makeRegistryLookup(effects) : isVersionPublished;
  const exec = effects ? effects.run : run;

  if (lookup(pkg.name, pkg.version)) {
    logger.log(`${pkg.name}@${pkg.version} already published, ensuring dist-tag "${tag}" and skipping.`);
    exec('pnpm', ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, tag, '--registry', defaultRegistry()], rootDir);
    return;
  }

  logger.log(`Publishing ${pkg.name} with dist-tag "${tag}"...`);
  exec('pnpm', ['publish', '--access', 'public', '--tag', tag, '--no-git-checks'], cwd);
};

const parseArgs = (argv) => {
  let packageDir = '';
  let tag = 'latest';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--package-dir') {
      packageDir = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--tag') {
      tag = argv[index + 1] || tag;
      index += 1;
    }
  }

  if (!packageDir) {
    throw new Error('--package-dir is required');
  }

  return { packageDir, tag };
};

if (require.main === module) {
  try {
    publishPackage(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  isVersionLookupNotFoundError,
  isVersionPublished,
  publishPackage,
};
