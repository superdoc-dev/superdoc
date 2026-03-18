/**
 * Smoke tests for dual ESM + CJS packaging of @superdoc-dev/sdk.
 *
 * Verifies:
 *   - CJS require('.') loads and exposes core exports through package exports
 *   - ESM import('./dist/index.js') still works (no regression)
 *   - CJS asset path resolution works (listSkills, listTools read from ../tools, ../skills)
 *   - Packed tarball installs and resolves from package entrypoint in a temp consumer project
 *
 * CJS tests spawn a child process because the test runner is ESM and we need
 * to exercise real require() resolution, not dynamic import() interop.
 *
 * Prerequisites: run `pnpm --prefix packages/sdk/langs/node run build` first.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const NODE_SDK_DIR = path.resolve(__dirname, '../../langs/node');
const NPM_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'npm');

const EXPECTED_EXPORTS = [
  'createSuperDocClient',
  'SuperDocClient',
  'listTools',
  'listSkills',
  'getSkill',
  'installSkill',
  'chooseTools',
  'dispatchSuperDocTool',
  'getToolCatalog',
  'getSystemPrompt',
  'SuperDocCliError',
];

// ---------------------------------------------------------------------------
// Guard: skip all tests if dist/ hasn't been built
// ---------------------------------------------------------------------------

const cjsEntry = path.join(NODE_SDK_DIR, 'dist/index.cjs');
const esmEntry = path.join(NODE_SDK_DIR, 'dist/index.js');

if (!existsSync(cjsEntry) || !existsSync(esmEntry)) {
  test.skip('Node SDK dist/ not built — skipping dual-package smoke tests', () => {});
  // node:test has no top-level bail, so individual tests are guarded below.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run an inline CJS script in a child process and return parsed JSON stdout.
 * The child runs from NODE_SDK_DIR so `require('.')` resolves via package exports.
 */
async function evalCjs(script) {
  const { stdout } = await execFileAsync('node', ['--eval', script], {
    cwd: NODE_SDK_DIR,
  });
  return JSON.parse(stdout.trim());
}

async function run(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, options);
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// CJS core exports
// ---------------------------------------------------------------------------

test('CJS package entry require() resolves core exports', { skip: !existsSync(cjsEntry) }, async () => {
  const result = await evalCjs(`
    const sdk = require('.');
    const types = {};
    for (const name of ${JSON.stringify(EXPECTED_EXPORTS)}) {
      types[name] = typeof sdk[name];
    }
    console.log(JSON.stringify(types));
  `);

  for (const name of EXPECTED_EXPORTS) {
    assert.equal(result[name], 'function', `CJS: ${name} should be a function`);
  }
});

// ---------------------------------------------------------------------------
// ESM core exports
// ---------------------------------------------------------------------------

test('ESM import() resolves core exports', { skip: !existsSync(esmEntry) }, async () => {
  const entryUrl = pathToFileURL(esmEntry).href;
  const sdk = await import(entryUrl);

  for (const name of EXPECTED_EXPORTS) {
    assert.equal(typeof sdk[name], 'function', `ESM: ${name} should be a function`);
  }
});

// ---------------------------------------------------------------------------
// CJS asset path resolution (import.meta.url → __filename shim)
// ---------------------------------------------------------------------------

const skillsDir = path.join(NODE_SDK_DIR, 'skills');
const toolsDir = path.join(NODE_SDK_DIR, 'tools');

test('CJS: listSkills() resolves skills directory', {
  skip: !existsSync(cjsEntry) || !existsSync(skillsDir),
}, async () => {
  const skills = await evalCjs(`
    const { listSkills } = require('.');
    console.log(JSON.stringify(listSkills()));
  `);

  assert.ok(Array.isArray(skills), 'listSkills should return an array');
  assert.ok(skills.length > 0, 'skills array should not be empty');
});

test('CJS: listTools() resolves tools directory', {
  skip: !existsSync(cjsEntry) || !existsSync(toolsDir),
}, async () => {
  const result = await evalCjs(`
    (async () => {
      const { listTools } = require('.');
      const tools = await listTools('generic');
      console.log(JSON.stringify({ count: tools.length, isArray: Array.isArray(tools) }));
    })().catch(e => { console.error(e); process.exit(1); });
  `);

  assert.ok(result.isArray, 'listTools should return an array');
  assert.ok(result.count > 0, 'tools array should not be empty');
});

test('Packed tarball installs and resolves package entry in CJS', { skip: !existsSync(cjsEntry) }, async () => {
  const sandboxDir = await mkdtemp(path.join(os.tmpdir(), 'sdk-node-package-smoke-'));
  try {
    const packDir = path.join(sandboxDir, 'pack');
    const consumerDir = path.join(sandboxDir, 'consumer');
    await mkdir(packDir, { recursive: true });
    await mkdir(consumerDir, { recursive: true });

    const env = { ...process.env, npm_config_cache: NPM_CACHE_DIR };

    const packStdout = await run(
      'npm',
      ['pack', '--json', '--pack-destination', packDir],
      { cwd: NODE_SDK_DIR, env },
    );
    const packOutput = JSON.parse(packStdout);
    const filename = packOutput[0]?.filename;
    assert.equal(typeof filename, 'string', 'npm pack should output a tarball filename');

    await run('pnpm', ['init'], { cwd: consumerDir, env });
    await run('pnpm', ['add', path.join(packDir, filename)], { cwd: consumerDir, env });

    const script = `
      (async () => {
        const sdk = require('@superdoc-dev/sdk');
        const skills = sdk.listSkills();
        const tools = await sdk.listTools('generic');
        console.log(JSON.stringify({
          createSuperDocClientType: typeof sdk.createSuperDocClient,
          skillCount: skills.length,
          toolCount: tools.length
        }));
      })();
    `;
    const output = await run('node', ['--eval', script], { cwd: consumerDir, env });
    const result = JSON.parse(output);

    assert.equal(result.createSuperDocClientType, 'function', 'consumer require() should expose createSuperDocClient');
    assert.ok(result.skillCount > 0, 'consumer package should include skills');
    assert.ok(result.toolCount > 0, 'consumer package should include tools');
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});
