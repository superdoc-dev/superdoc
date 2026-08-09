/**
 * The openapi-types dependency patch is gone because nothing in this
 * repository consumes the package. Keep that absence explicit so a future
 * consumer cannot silently depend on the removed ESM wrapper.
 *
 * Run:
 *   node --test scripts/__tests__/removed-patches-stay-unnecessary.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const SELF = 'scripts/__tests__/removed-patches-stay-unnecessary.test.mjs';

test('nothing imports openapi-types, which is why its patch stays deleted', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);

  assert.ok(tracked.length > 1000, `expected a populated public tree, saw ${tracked.length} tracked files`);
  assert.ok(tracked.includes(SELF), 'the scan does not include this file, so its file list is wrong');

  const consumer = String.raw`(from|require\()[[:space:]]*['"]openapi-types['"]|"openapi-types"[[:space:]]*:`;
  let matches = '';
  try {
    matches = execFileSync(
      'git',
      [
        'grep',
        '-I',
        '-l',
        '-E',
        consumer,
        '--',
        '*.js',
        '*.mjs',
        '*.cjs',
        '*.ts',
        '*.mts',
        '*.cts',
        '*.jsx',
        '*.tsx',
        '*.vue',
        'package.json',
        '**/package.json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  const offenders = matches
    .split('\n')
    .filter(Boolean)
    .filter((file) => file !== SELF);

  assert.deepEqual(
    offenders,
    [],
    'something consumes openapi-types again; decide whether it needs the removed ESM wrapper',
  );
});
