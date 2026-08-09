#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = path.resolve(publicRoot, '..', 'v2');
const archiveRoot = path.join(publicRoot, '.ci-docx-engine');
const installedRoot = path.join(publicRoot, 'packages', 'superdoc', 'node_modules', '@superdoc', 'docx-engine');

export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === 'pack') packEngine();
  else if (command === 'materialize') materializeEngine();
  else throw new Error('Usage: node scripts/ci-docx-engine-artifact.mjs <pack|materialize>');
}

function packEngine() {
  rmSync(archiveRoot, { recursive: true, force: true });
  if (!existsSync(path.join(engineRoot, 'package.json'))) {
    console.log('[ci:docx-engine] No internal engine workspace found; using the installed package.');
    return;
  }

  mkdirSync(archiveRoot, { recursive: true });
  run(process.execPath, createEnginePackArguments());

  const engineArchive = findEngineArchive();
  for (const file of readdirSync(archiveRoot)) {
    if (file.endsWith('.tgz') && path.join(archiveRoot, file) !== engineArchive) {
      rmSync(path.join(archiveRoot, file));
    }
  }
  console.log(`[ci:docx-engine] Packed ${path.basename(engineArchive)}.`);
}

export function createEnginePackArguments() {
  return [
    path.join(engineRoot, 'scripts', 'pack-v2-package.mjs'),
    '--package',
    engineRoot,
    '--pack-destination',
    archiveRoot,
    '--no-build',
  ];
}

function materializeEngine() {
  if (!existsSync(archiveRoot)) {
    console.log('[ci:docx-engine] No internal engine artifact found; using the installed package.');
    return;
  }

  const engineArchive = findEngineArchive();
  rmSync(installedRoot, { recursive: true, force: true });
  mkdirSync(installedRoot, { recursive: true });
  run('tar', ['-xzf', engineArchive, '-C', installedRoot, '--strip-components=1']);

  const manifest = JSON.parse(readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  if (manifest.name !== '@superdoc/docx-engine') {
    throw new Error(`Unexpected materialized package name: ${JSON.stringify(manifest.name)}.`);
  }
  for (const required of [
    'DOCX-ENGINE-LICENSE.md',
    'build/license-banner.txt',
    'dist/docx-engine.es.js',
    'dist-cdn/docx-engine.es.js',
  ]) {
    if (!existsSync(path.join(installedRoot, required))) {
      throw new Error(`Materialized DOCX Engine package is missing ${required}.`);
    }
  }
  const linkedRoots = linkEngineIntoConsumerRoots(installedRoot, findSuperdocConsumerRoots());
  console.log(
    `[ci:docx-engine] Materialized @superdoc/docx-engine@${manifest.version} for ${linkedRoots.length} workspace consumer(s).`,
  );
}

function findSuperdocConsumerRoots() {
  const result = spawnSync('pnpm', ['--recursive', 'list', '--depth', '-1', '--json'], {
    cwd: publicRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Failed to enumerate SuperDoc workspace consumers.');
  }

  return JSON.parse(result.stdout)
    .map((workspace) => workspace.path)
    .filter((workspacePath) => typeof workspacePath === 'string' && workspacePath.startsWith(publicRoot))
    .filter((workspacePath) => {
      const manifestPath = path.join(workspacePath, 'package.json');
      if (!existsSync(manifestPath)) return false;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      };
      return Boolean(dependencies.superdoc || dependencies['@superdoc-dev/react']);
    });
}

export function linkEngineIntoConsumerRoots(engineRoot, consumerRoots) {
  const linkedRoots = [];
  for (const consumerRoot of consumerRoots) {
    const nodeModulesRoot = path.join(consumerRoot, 'node_modules');
    if (!existsSync(nodeModulesRoot)) continue;
    const scopeRoot = path.join(nodeModulesRoot, '@superdoc');
    const target = path.join(scopeRoot, 'docx-engine');
    if (path.resolve(target) === path.resolve(engineRoot)) continue;

    mkdirSync(scopeRoot, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(path.relative(scopeRoot, engineRoot), target, 'dir');
    linkedRoots.push(consumerRoot);
  }
  return linkedRoots;
}

function findEngineArchive() {
  const archives = readdirSync(archiveRoot)
    .filter((file) => /^superdoc-docx-engine-.+\.tgz$/u.test(file))
    .map((file) => path.join(archiveRoot, file));
  if (archives.length !== 1) {
    throw new Error(`Expected one DOCX Engine archive, found ${archives.length}.`);
  }
  return archives[0];
}

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: publicRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
