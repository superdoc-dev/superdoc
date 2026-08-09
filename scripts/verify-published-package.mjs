#!/usr/bin/env node
//
// verify-published-package.mjs - install a package from the registry and prove
// it actually works.
//
// A successful publish says the tarball uploaded. It does not say the package
// resolves, imports, or finds its native binary. Those failures show up on a
// consumer's machine, which is the worst place to discover them.
//
// This runs against the real registry in a throwaway directory with no workspace
// to fall back on. That last part matters: inside the monorepo, a broken
// published artifact can still resolve through the workspace and look healthy.
//
// SECURITY: this executes third-party code (install lifecycle scripts, and the
// package's own module body during the import check). Every child process gets
// a scrubbed environment and an isolated npm home, and install scripts are
// skipped by default; pass runScripts only when a package genuinely needs them,
// and only for packages you control.
//
// AIDEV-NOTE: Scrubbing the child environment is not isolation. On Linux a
// child can still read the parent's secrets from /proc/<ppid>/environ, so this
// must only be invoked from a process that does not itself hold credentials.
// It runs in the CI build job, which has no secrets. Do not call it from a
// publish step or any job with a token in its environment; give it its own
// credential-free job instead.
//
// Mirrored packages must be verified under BOTH names. Testing only the
// canonical name would pass while the legacy mirror is broken, and the mirror is
// the one existing consumers install.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultRegistry = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';

/**
 * Environment variables a child process needs to run at all. Everything else,
 * including every *_TOKEN, *_KEY, and npm auth variable, is dropped.
 */
// PATHEXT is required on Windows: without it, spawning `npm` or `node` by bare
// name cannot resolve npm.cmd / node.exe and the verifier fails to start.
// USERPROFILE and TEMP are the Windows equivalents of HOME and TMPDIR.
const ENV_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'ComSpec',
];

// Every child process gets a deadline. A stalled registry request or an import
// check that never terminates would otherwise hang the job holding it, and
// `continue-on-error` does not rescue a hang: the runner stays occupied until
// the workflow-level timeout kills it.
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const COMMAND_TIMEOUT_MS = 60_000;

const scrubbedEnv = (npmHome) => {
  const env = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }

  // Point npm at a throwaway home so it cannot read the release job's
  // credentials from ~/.npmrc, and cannot write to the shared cache.
  // Redirect every home-directory variable, not just HOME. USERPROFILE is what
  // Windows resolves `~` and per-user config from, so allowlisting it for PATH
  // resolution while leaving it pointed at the real profile would hand installed
  // code the caller's npmrc and credentials.
  env.HOME = npmHome;
  env.USERPROFILE = npmHome;
  env.NPM_CONFIG_USERCONFIG = path.join(npmHome, '.npmrc');
  env.NPM_CONFIG_CACHE = path.join(npmHome, '.npm-cache');
  env.npm_config_userconfig = env.NPM_CONFIG_USERCONFIG;
  env.npm_config_cache = env.NPM_CONFIG_CACHE;

  return env;
};

/**
 * Install `spec` into an isolated directory and evaluate `importCheck` against
 * it. Returns the resolved version and whatever the check printed.
 *
 * npm is used rather than pnpm because pnpm's store and workspace awareness can
 * satisfy a dependency without going to the registry, which is exactly the
 * failure mode this is meant to catch.
 */
export function verifyPublishedPackage({
  packageName,
  version,
  importCheck,
  installOnly = false,
  runScripts = false,
  registry = defaultRegistry,
  logger = console,
}) {
  if (!importCheck && !installOnly) {
    throw new Error(
      `${packageName}: pass importCheck to prove the package loads, or installOnly to accept an install-only check`,
    );
  }

  const spec = `${packageName}@${version}`;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'superdoc-verify-'));
  const npmHome = mkdtempSync(path.join(os.tmpdir(), 'superdoc-verify-home-'));
  const env = scrubbedEnv(npmHome);

  try {
    logger.log(`Installing ${spec} from ${registry}...`);
    writeFileSync(path.join(npmHome, '.npmrc'), `registry=${registry}\n`);
    writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: 'superdoc-verify', private: true, type: 'module' }, null, 2)}\n`,
    );

    const installArgs = [
      'install',
      spec,
      '--registry',
      registry,
      '--no-audit',
      '--no-fund',
      runScripts ? '--foreground-scripts' : '--ignore-scripts',
    ];
    execFileSync('npm', installArgs, {
      cwd: dir,
      stdio: 'inherit',
      env,
      timeout: INSTALL_TIMEOUT_MS,
    });

    // `npm ls` exits non-zero for tree problems that do not concern us here,
    // such as an unmet peer dependency in the throwaway consumer project. The
    // JSON is still written to stdout, and the resolved version below is the
    // assertion that matters, so read the output rather than trusting the code.
    let listed;
    try {
      listed = execFileSync('npm', ['ls', packageName, '--json', '--depth', '0'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        timeout: COMMAND_TIMEOUT_MS,
      });
    } catch (error) {
      listed = typeof error.stdout === 'string' ? error.stdout : '';
      if (!listed.trim()) throw error;
    }
    const resolved = JSON.parse(listed).dependencies?.[packageName]?.version;

    if (resolved !== version) {
      throw new Error(`${packageName} resolved to ${resolved}, expected ${version}`);
    }

    let output = '';
    if (importCheck) {
      logger.log(`Running import check for ${spec}...`);
      output = execFileSync('node', ['--input-type=module', '-e', importCheck], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        timeout: COMMAND_TIMEOUT_MS,
      }).trim();
    }

    logger.log(`${spec} verified.`);
    return { packageName, version: resolved, output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(npmHome, { recursive: true, force: true });
  }
}

/**
 * Verify a canonical package and its legacy mirror at the same version.
 *
 * Both names ship the same build, so the same check applies to each. The import
 * check is rewritten per name so each one is imported under the name a consumer
 * would actually use.
 */
export function verifyPublishedPair({
  canonicalName,
  mirrorName,
  version,
  importCheck,
  installOnly = false,
  runScripts = false,
  registry = defaultRegistry,
  logger = console,
}) {
  // Without the placeholder both names would import the same hardcoded string,
  // so one of the two checks would prove nothing about the package it claims to
  // verify. That is exactly the failure a mirror pair exists to catch.
  // A pair whose two names are equal verifies one package twice and reports a
  // green pair, leaving the real mirror untested. The publish side already
  // rejects this; the verifier is the last gate before a release is called good,
  // so it has to reject it too.
  if (canonicalName === mirrorName) {
    throw new Error(
      `canonical and mirror names must differ, both were "${canonicalName}"`,
    );
  }

  if (importCheck && !importCheck.includes('__PACKAGE__')) {
    throw new Error(
      'importCheck must reference __PACKAGE__ so each name is imported under its own identity',
    );
  }

  return [canonicalName, mirrorName].map((packageName) =>
    verifyPublishedPackage({
      packageName,
      version,
      importCheck: importCheck ? importCheck.replaceAll('__PACKAGE__', packageName) : undefined,
      installOnly,
      runScripts,
      registry,
      logger,
    }),
  );
}

const parseArgs = (argv) => {
  const args = { registry: defaultRegistry, installOnly: false, runScripts: false };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--install-only') {
      args.installOnly = true;
      continue;
    }
    if (flag === '--run-scripts') {
      args.runScripts = true;
      continue;
    }

    const value = argv[index + 1];
    if (flag === '--package') args.packageName = value;
    else if (flag === '--mirror') args.mirrorName = value;
    else if (flag === '--version') args.version = value;
    else if (flag === '--import-check') args.importCheck = value;
    else if (flag === '--registry') args.registry = value;
    else continue;

    index += 1;
  }

  if (!args.packageName) throw new Error('--package is required');
  if (!args.version) throw new Error('--version is required');
  if (!args.importCheck && !args.installOnly) {
    throw new Error('pass --import-check "<js>" or --install-only');
  }

  return args;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.mirrorName) {
      verifyPublishedPair({ canonicalName: args.packageName, ...args });
    } else {
      verifyPublishedPackage(args);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
