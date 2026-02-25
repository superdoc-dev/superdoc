#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeVersionLabel } from './shared.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const EXPORT_SCRIPT_PATH = path.join(SCRIPT_DIR, 'export-layout-snapshots.mjs');

const DEFAULT_INPUT_ROOT = process.env.SUPERDOC_CORPUS_ROOT
  ? path.resolve(process.env.SUPERDOC_CORPUS_ROOT)
  : path.join(REPO_ROOT, 'test-corpus');
const DEFAULT_OUTPUT_BASE = path.join(REPO_ROOT, 'tests', 'layout-snapshots', 'reference');

function printHelp() {
  console.log(`
Usage:
  bun tests/layout-snapshots/export-layout-snapshots-npm.mjs <superdoc-version> [exporter-options]

Arguments:
  <superdoc-version>         npm version/tag (examples: 1.12.0, 1.12.0-next.3, latest)

Wrapper Options:
      --version <value>      Same as positional version argument
      --installer <name>     auto | bun | npm (default: auto)
      --output-base <path>   Parent folder for versioned snapshots (default: ${DEFAULT_OUTPUT_BASE})
      --keep-temp            Keep temporary install directory for debugging
  -h, --help                 Show this help

All other arguments are forwarded to export-layout-snapshots.mjs.
Common forwarded options include:
  --jobs <n> --limit <n> --match <pattern> --pipeline <mode> --timeout-ms <ms> --fail-fast --input-root <path>

Examples:
  bun tests/layout-snapshots/export-layout-snapshots-npm.mjs 1.12.0 --jobs 4
  bun tests/layout-snapshots/export-layout-snapshots-npm.mjs latest --jobs 2 --limit 20
  bun tests/layout-snapshots/export-layout-snapshots-npm.mjs 1.12.0-next.3 --pipeline presentation
`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function resolveInstaller(preferred) {
  const normalized = String(preferred ?? 'auto').toLowerCase();
  if (normalized === 'bun' || normalized === 'npm') return normalized;
  if (normalized !== 'auto') {
    throw new Error(`Invalid --installer value "${preferred}". Use auto, bun, or npm.`);
  }

  const bunCheck = spawnSync('bun', ['--version'], { stdio: 'ignore' });
  if (bunCheck.status === 0) return 'bun';

  const npmCheck = spawnSync('npm', ['--version'], { stdio: 'ignore' });
  if (npmCheck.status === 0) return 'npm';

  throw new Error('No supported installer found. Install bun or npm.');
}

function hasFlag(args, names) {
  return args.some((arg) => names.includes(arg));
}

function parseArgs(argv) {
  const options = {
    version: null,
    installer: 'auto',
    outputBase: DEFAULT_OUTPUT_BASE,
    keepTemp: false,
    forwarded: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--') {
      options.forwarded.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--version' && next) {
      options.version = next;
      i += 1;
      continue;
    }
    if (arg === '--installer' && next) {
      options.installer = next;
      i += 1;
      continue;
    }
    if (arg === '--output-base' && next) {
      options.outputBase = next;
      i += 1;
      continue;
    }
    if (arg === '--keep-temp') {
      options.keepTemp = true;
      continue;
    }

    // Forward unknown flags (and their value when present) to the exporter.
    // This prevents values like "--jobs 4" from being misread as the npm version.
    if (arg.startsWith('-')) {
      options.forwarded.push(arg);
      if (next && !next.startsWith('-')) {
        options.forwarded.push(next);
        i += 1;
      }
      continue;
    }

    if (!options.version) {
      options.version = arg;
      continue;
    }

    options.forwarded.push(arg);
  }

  if (!options.version) {
    throw new Error('Missing superdoc version. Provide a version (e.g. 1.12.0 or latest).');
  }

  const reservedFlags = [
    '--module',
    '-m',
    '--output-root',
    '-o',
    '--telemetry',
    '--enable-telemetry',
    '--disable-telemetry',
  ];
  if (hasFlag(options.forwarded, reservedFlags)) {
    throw new Error(
      'Do not pass --module/--output-root/telemetry flags to this wrapper; they are controlled automatically.',
    );
  }

  return options;
}

async function readInstalledVersion(tempDir) {
  const pkgPath = path.join(tempDir, 'node_modules', 'superdoc', 'package.json');
  const raw = await fs.readFile(pkgPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed?.version) {
    throw new Error(`Installed superdoc package has no version field (${pkgPath}).`);
  }
  return String(parsed.version);
}

async function installSuperdoc({ installer, version, tempDir }) {
  const packageJsonPath = path.join(tempDir, 'package.json');
  const cacheRoot = path.join(tempDir, '.cache');
  const bunCacheDir = path.join(cacheRoot, 'bun');
  const npmCacheDir = path.join(cacheRoot, 'npm');
  await fs.mkdir(bunCacheDir, { recursive: true });
  await fs.mkdir(npmCacheDir, { recursive: true });

  const envBase = {
    ...process.env,
    TMPDIR: tempDir,
    TEMP: tempDir,
    TMP: tempDir,
  };

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(
      {
        name: 'layout-snapshots-npm-temp',
        private: true,
      },
      null,
      2,
    ),
    'utf8',
  );

  if (installer === 'bun') {
    const code = await runCommand('bun', ['add', `superdoc@${version}`], {
      cwd: tempDir,
      env: {
        ...envBase,
        BUN_INSTALL_CACHE_DIR: bunCacheDir,
      },
    });
    if (code !== 0) {
      throw new Error(`bun add failed with exit code ${code}.`);
    }
    return;
  }

  const code = await runCommand(
    'npm',
    ['install', '--no-audit', '--no-fund', '--no-package-lock', `superdoc@${version}`],
    {
      cwd: tempDir,
      env: {
        ...envBase,
        npm_config_cache: npmCacheDir,
      },
    },
  );
  if (code !== 0) {
    throw new Error(`npm install failed with exit code ${code}.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const installer = resolveInstaller(options.installer);

  const outputBase = path.resolve(options.outputBase);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'layout-snapshots-npm-'));
  let keepTemp = options.keepTemp;

  try {
    console.log(`[layout-snapshots:npm] Installer: ${installer}`);
    console.log(`[layout-snapshots:npm] Requested version: ${options.version}`);
    console.log(`[layout-snapshots:npm] Temp install dir: ${tempDir}`);

    await installSuperdoc({
      installer,
      version: options.version,
      tempDir,
    });

    const installedVersion = await readInstalledVersion(tempDir);
    const versionLabel = normalizeVersionLabel(installedVersion);
    const versionOutputRoot = path.join(outputBase, versionLabel);
    const modulePath = path.join(tempDir, 'node_modules', 'superdoc', 'dist', 'super-editor.es.js');

    await fs.access(modulePath);

    console.log(`[layout-snapshots:npm] Resolved version: ${installedVersion}`);
    console.log(`[layout-snapshots:npm] Snapshot output root: ${versionOutputRoot}`);

    const forwarded = [...options.forwarded];
    if (!hasFlag(forwarded, ['--input-root', '-i'])) {
      forwarded.push('--input-root', DEFAULT_INPUT_ROOT);
    }

    const exporterArgs = [
      EXPORT_SCRIPT_PATH,
      '--module',
      modulePath,
      '--output-root',
      versionOutputRoot,
      '--disable-telemetry',
      ...forwarded,
    ];

    const code = await runCommand(process.execPath, exporterArgs);
    if (code !== 0) {
      throw new Error(`Snapshot export failed with exit code ${code}.`);
    }

    console.log(`[layout-snapshots:npm] Done.`);
    console.log(`[layout-snapshots:npm] Version folder: ${versionOutputRoot}`);
  } catch (error) {
    keepTemp = true;
    throw error;
  } finally {
    if (!keepTemp) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } else {
      console.log(`[layout-snapshots:npm] Temp dir kept: ${tempDir}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[layout-snapshots:npm] Fatal: ${message}`);
  process.exit(1);
});
