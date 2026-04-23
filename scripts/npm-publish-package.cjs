#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const defaultRegistry = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';

const run = (command, args, cwd = rootDir) => {
  execFileSync(command, args, { stdio: 'inherit', cwd });
};

const isVersionLookupNotFoundError = (error) => {
  const details = [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join('\n');
  return /E404|Not found|not found|No match found/i.test(details);
};

const isVersionPublished = (packageName, version) => {
  try {
    execFileSync(
      'pnpm',
      ['view', `${packageName}@${version}`, 'version', '--registry', defaultRegistry],
      { stdio: 'pipe' },
    );
    return true;
  } catch (error) {
    if (isVersionLookupNotFoundError(error)) {
      return false;
    }
    throw error;
  }
};

const getPackageMetadata = (packageDir) => {
  const pkgPath = path.join(rootDir, packageDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.name || !pkg.version) {
    throw new Error(`Expected ${packageDir}/package.json to include name and version.`);
  }
  return pkg;
};

const publishPackage = ({ packageDir, tag = 'latest', logger = console }) => {
  const cwd = path.join(rootDir, packageDir);
  const pkg = getPackageMetadata(packageDir);

  if (isVersionPublished(pkg.name, pkg.version)) {
    logger.log(`${pkg.name}@${pkg.version} already published, ensuring dist-tag "${tag}" and skipping.`);
    run('pnpm', ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, tag, '--registry', defaultRegistry]);
    return;
  }

  logger.log(`Publishing ${pkg.name} with dist-tag "${tag}"...`);
  run('pnpm', ['publish', '--access', 'public', '--tag', tag, '--no-git-checks'], cwd);
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
