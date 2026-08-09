#!/usr/bin/env node
/**
 * Points the docs editor demo at the versions the repository actually publishes.
 *
 * `config/editor-demo-runtime.json` feeds a live jsDelivr URL in
 * `components/embeds/editor-demo.tsx`, so a stale entry does not just fail a
 * test: the published docs load a different SuperDoc than the one this commit
 * describes. It drifted to `2.0.0-next.36` while the package was at
 * `2.4.0-next.10` because release stamping bumps the manifest and nothing was
 * updating this file.
 *
 * `public/_headers` pins the same versions again, as exact CDN URLs in the CSP
 * allowlist. That copy is the dangerous one: a stale entry does not fail at
 * build time, it makes the browser block the editor runtime, styles, engine and
 * worker on the deployed site. `test:export` is the only thing connecting the
 * two, and it runs after the build that changes them.
 *
 * So this owns both. The manifest is the single source of truth, the config is
 * derived from it, and the CSP is derived from the config. `test:content` and
 * `test:export` assert those agree; this is the other half, a way to make them
 * agree without hand-editing three version strings in two formats.
 *
 * Usage:
 *   node scripts/sync-editor-demo-runtime.mjs [--check]
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(here, '../config/editor-demo-runtime.json');
const HEADERS = path.join(here, '../public/_headers');
const SUPERDOC_MANIFEST = path.join(here, '../../../packages/superdoc/package.json');

const checkOnly = process.argv.includes('--check');

const config = JSON.parse(await readFile(CONFIG, 'utf8'));
const manifest = JSON.parse(await readFile(SUPERDOC_MANIFEST, 'utf8'));

const engineSpecifier = manifest.dependencies?.[config.enginePackage];
if (!engineSpecifier) {
  process.stderr.write(`${config.enginePackage} is not a dependency of ${manifest.name}\n`);
  process.exit(1);
}

const expected = {
  ...config,
  runtimePackage: manifest.name,
  runtimeVersion: manifest.version,
  // The manifest carries `workspace:0.3.0-next.7`; the demo needs the bare
  // version, because it becomes part of a CDN URL.
  engineVersion: engineSpecifier.replace(/^workspace:/u, ''),
};

const drifted = Object.keys(expected).filter((key) => expected[key] !== config[key]);

/**
 * Rewrites every pinned CDN URL in the CSP to the versions the config now names.
 *
 * Matches on package and path rather than on the old version, so it repairs a
 * header that drifted to any version, not only the one we happen to be
 * replacing. Anything that is not one of these two packages is left alone.
 */
function retargetHeaders(headers) {
  const runtime = `${expected.cdnOrigin}/${expected.runtimePackage}@`;
  const engine = `${expected.cdnOrigin}/${expected.enginePackage}@`;
  return headers
    .replaceAll(new RegExp(`${escapeForRegExp(runtime)}[^/\\s]+`, 'gu'), `${runtime}${expected.runtimeVersion}`)
    .replaceAll(new RegExp(`${escapeForRegExp(engine)}[^/\\s]+`, 'gu'), `${engine}${expected.engineVersion}`);
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const headers = await readFile(HEADERS, 'utf8');
const expectedHeaders = retargetHeaders(headers);
const headersDrifted = expectedHeaders !== headers;

if (drifted.length === 0 && !headersDrifted) {
  process.stdout.write('editor demo runtime already matches the published packages\n');
  process.exit(0);
}

const summary = [
  ...drifted.map((key) => `${key}: ${config[key]} -> ${expected[key]}`),
  ...(headersDrifted ? ['_headers CSP allowlist'] : []),
].join(', ');

if (checkOnly) {
  process.stderr.write(
    `editor demo runtime is stale (${summary}).\n` +
      'Run `pnpm --filter @superdoc/docs run sync:runtime` to update it.\n',
  );
  process.exit(1);
}

if (drifted.length > 0) await writeFile(CONFIG, `${JSON.stringify(expected, null, 2)}\n`);
if (headersDrifted) await writeFile(HEADERS, expectedHeaders);
process.stdout.write(`updated editor demo runtime (${summary})\n`);
