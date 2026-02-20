#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const superdocDir = path.join(rootDir, 'packages', 'superdoc');
const packageJsonPath = path.join(superdocDir, 'package.json');
const defaultRegistry = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';

const run = (command, args, cwd) => {
  execFileSync(command, args, { stdio: 'inherit', cwd });
};

const runCapture = (command, args, cwd) => {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
};

const isVersionPublished = (packageName, version) => {
  try {
    execFileSync(
      'pnpm',
      ['view', `${packageName}@${version}`, 'version', '--registry', defaultRegistry],
      { stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    if (error.status === 1) {
      return false;
    }
    throw error;
  }
};

const ensurePackageJson = () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.name !== 'superdoc') {
    throw new Error('Unexpected package name for packages/superdoc');
  }
  return packageJson;
};

const ensureDist = () => {
  const distPath = path.join(superdocDir, 'dist');
  if (!existsSync(distPath)) {
    throw new Error('Missing dist build for superdoc');
  }
};

const publishScopedMirror = (packageJson, distTag, logger = console) => {
  const scopedName = '@harbour-enterprises/superdoc';

  if (isVersionPublished(scopedName, packageJson.version)) {
    logger.log(`${scopedName}@${packageJson.version} already published, ensuring dist-tag "${distTag}" and skipping.`);
    run('pnpm', ['dist-tag', 'add', `${scopedName}@${packageJson.version}`, distTag], rootDir);
    return;
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'superdoc-publish-'));
  try {
    // Pack from workspace - pnpm resolves catalog: and workspace: refs automatically
    logger.log('Packing superdoc (pnpm resolves workspace/catalog refs)...');
    const packOutput = runCapture('pnpm', ['pack', '--pack-destination', tempDir], superdocDir);
    // pnpm pack outputs multiple lines; extract the .tgz filename
    const tarballLine = packOutput.split('\n').find(line => line.endsWith('.tgz'));
    if (!tarballLine) {
      throw new Error(`Could not find .tgz in pnpm pack output:\n${packOutput}`);
    }
    // tarballLine may be full path or just filename
    const tarballPath = tarballLine.startsWith('/') ? tarballLine : path.join(tempDir, tarballLine);

    // Extract the tarball
    run('tar', ['-xzf', tarballPath, '-C', tempDir], tempDir);
    rmSync(tarballPath);

    // Modify package.json to use scoped name
    const extractedDir = path.join(tempDir, 'package');
    const extractedPkgPath = path.join(extractedDir, 'package.json');
    const extractedPkg = JSON.parse(readFileSync(extractedPkgPath, 'utf8'));
    extractedPkg.name = scopedName;
    extractedPkg.publishConfig = {
      ...(extractedPkg.publishConfig || {}),
      access: 'public'
    };
    writeFileSync(extractedPkgPath, `${JSON.stringify(extractedPkg, null, 2)}\n`);

    logger.log(`Publishing @harbour-enterprises/superdoc with dist-tag "${distTag}"...`);
    run('pnpm', ['publish', '--access', 'public', '--tag', distTag, '--no-git-checks'], extractedDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const publishPackages = ({
  distTag = 'latest',
  publishUnscoped = true,
  build = true,
  logger = console
} = {}) => {
  if (build) {
    logger.log('Building packages...');
    run('pnpm', ['run', 'build'], rootDir);
  }

  const packageJson = ensurePackageJson();
  ensureDist();

  if (publishUnscoped) {
    if (isVersionPublished(packageJson.name, packageJson.version)) {
      logger.log(`superdoc@${packageJson.version} already published, ensuring dist-tag "${distTag}" and skipping.`);
      run('pnpm', ['dist-tag', 'add', `${packageJson.name}@${packageJson.version}`, distTag], rootDir);
    } else {
      logger.log(`Publishing superdoc with dist-tag "${distTag}"...`);
      run('pnpm', ['publish', '--access', 'public', '--tag', distTag, '--no-git-checks'], superdocDir);
    }
  }

  publishScopedMirror(packageJson, distTag, logger);
};

const parseArgs = (argv) => {
  let distTag;
  let skipUnscoped = false;
  let skipBuild = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist-tag') {
      distTag = argv[index + 1];
      index += 1;
    } else if (arg === '--skip-unscoped') {
      skipUnscoped = true;
    } else if (arg === '--skip-build') {
      skipBuild = true;
    }
  }

  const envTag = process.env.RELEASE_DIST_TAG;
  const resolvedTag = distTag || envTag || 'latest';

  return {
    distTag: resolvedTag,
    publishUnscoped: !skipUnscoped && process.env.SKIP_UNSCOPED_PUBLISH !== 'true',
    build: !skipBuild && process.env.SKIP_BUILD !== 'true'
  };
};

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    publishPackages(options);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  publish: async (pluginConfig, context) => {
    const { nextRelease, logger = console } = context;
    const distTag = (nextRelease && nextRelease.channel) || 'latest';

    publishPackages({
      distTag,
      publishUnscoped: true,
      build: true,
      logger
    });
  },
  publishPackages
};
