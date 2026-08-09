#!/usr/bin/env node
/**
 * Workflow path-filter guard.
 *
 * Fails when a `paths:` / `paths-ignore:` filter in `.github/workflows/**.yml`
 * matches nothing in the tracked tree.
 *
 * Why this exists
 * ---------------
 * A path filter that matches nothing is silent. GitHub does not warn, the
 * workflow simply never triggers, and the check stays green because a job that
 * never runs cannot fail. That reads identically to "everything passed".
 *
 * Renaming or deleting a package is exactly when this happens, and exactly when
 * the lost coverage matters most. The tree that this guard was written against
 * had four lanes still filtering on `packages/super-editor/**` and two whole
 * workflows whose every trigger path had been deleted.
 *
 * What it does not do
 * -------------------
 * It checks that a filter CAN match, not that it matches the right thing.
 * Pointing a lane at the wrong live package is still a review question.
 *
 * Parsing is shared with the Orbit-side guard through
 * `scripts/lib/workflow-path-filters.mjs`; see that file for which syntax is
 * covered and why negations are exempt.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectPathFilters, matchesSomething } from './lib/workflow-path-filters.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(repoRoot, '.github', 'workflows');

/** Tracked files, so untracked scratch files cannot make a dead filter look alive. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function main() {
  const files = trackedFiles();
  const workflows = readdirSync(workflowDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();

  const dead = [];
  const unreadable = [];
  for (const name of workflows) {
    const relative = path.posix.join('.github/workflows', name);
    const source = readFileSync(path.join(workflowDir, name), 'utf8');
    const { entries, unparsed } = collectPathFilters(source);
    for (const { glob, line } of entries) {
      if (!matchesSomething(glob, files)) dead.push({ relative, line, glob });
    }
    for (const { line, text } of unparsed) unreadable.push({ relative, line, text });
  }

  // Fail closed on syntax the parser recognizes but cannot read. Skipping it
  // silently is the same failure this guard exists to catch, one level up.
  if (unreadable.length > 0) {
    console.error('Unreadable workflow path filters (recognized syntax this guard cannot parse):\n');
    for (const { relative, line, text } of unreadable) {
      console.error(`  ${relative}:${line}  ${text}`);
    }
    console.error(
      '\nTeach scripts/lib/workflow-path-filters.mjs this shape, or rewrite the ' +
        'filter in a form it reads. An unparsed filter cannot be checked.',
    );
    process.exit(1);
  }

  if (dead.length > 0) {
    console.error('Dead workflow path filters (match nothing in the tracked tree):\n');
    for (const { relative, line, glob } of dead) {
      console.error(`  ${relative}:${line}  ${glob}`);
    }
    console.error(
      `\n${dead.length} dead filter${dead.length === 1 ? '' : 's'}. ` +
        'Repoint each at the path that replaced it, or remove it. A filter that ' +
        'matches nothing makes its workflow silently unreachable.',
    );
    process.exit(1);
  }

  console.log(
    `check:workflow-paths — ${workflows.length} workflows, every path filter resolves to tracked files.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
