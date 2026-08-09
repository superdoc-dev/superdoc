#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultExamplesRoot = path.join(publicRoot, 'examples');
const requiredFiles = ['README.md', 'package.json'];
const requiredScripts = ['typecheck', 'test'];

export function findExampleProblems(examplesRoot) {
  const problems = [];
  const entries = readdirSync(examplesRoot, { withFileTypes: true }).filter((entry) => entry.name !== 'README.md');

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      problems.push(`${entry.name}: only example directories are allowed beside README.md`);
      continue;
    }

    const exampleRoot = path.join(examplesRoot, entry.name);
    for (const file of requiredFiles) {
      if (!existsSync(path.join(exampleRoot, file))) problems.push(`${entry.name}: missing ${file}`);
    }

    const manifestPath = path.join(exampleRoot, 'package.json');
    if (!existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      problems.push(`${entry.name}: invalid package.json (${error.message})`);
      continue;
    }

    if (manifest.name !== `@superdoc-examples/${entry.name}`) {
      problems.push(`${entry.name}: package name must be @superdoc-examples/${entry.name}`);
    }
    if (manifest.private !== true) problems.push(`${entry.name}: package must be private`);

    for (const script of requiredScripts) {
      if (typeof manifest.scripts?.[script] !== 'string' || manifest.scripts[script].trim() === '') {
        problems.push(`${entry.name}: missing ${script} script`);
      }
    }

    const publicDependencies = Object.entries(manifest.dependencies ?? {}).filter(
      ([name]) => name === 'superdoc' || name.startsWith('@superdoc/'),
    );
    if (publicDependencies.length === 0) problems.push(`${entry.name}: missing a public SuperDoc dependency`);
    for (const [name, specifier] of publicDependencies) {
      if (typeof specifier !== 'string' || /^(?:workspace:|latest$|next$|\*$)/.test(specifier)) {
        problems.push(`${entry.name}: ${name} must use an installable version range`);
      }
    }
  }

  return problems;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const problems = findExampleProblems(defaultExamplesRoot);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join('\n'));
    process.exitCode = 1;
  } else {
    const count = readdirSync(defaultExamplesRoot, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    ).length;
    console.log(`Examples: ${count} checked.`);
  }
}
