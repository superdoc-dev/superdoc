#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontSystemRoot = path.resolve(here, '..');
const repoRoot = path.resolve(fontSystemRoot, '../..');
const assetsDir = path.join(fontSystemRoot, 'assets');
const manifestPath = path.join(assetsDir, 'font-assets.manifest.json');
const runtimeManifestPath = path.join(fontSystemRoot, 'src/bundled-manifest.ts');
const notices = {
  licenses: path.join(assetsDir, 'LICENSES.md'),
  ofl: path.join(assetsDir, 'OFL.txt'),
  apache: path.join(assetsDir, 'Apache-2.0.txt'),
  thirdParty: path.join(repoRoot, 'THIRD_PARTY_LICENSES.md'),
  superdocPlugin: path.join(repoRoot, 'packages/superdoc/vite-plugin-bundled-fonts.mjs'),
};

const VALID_LICENSES = new Set(['OFL-1.1', 'Apache-2.0']);
const VALID_WEIGHTS = new Set(['normal', 'bold']);
const VALID_STYLES = new Set(['normal', 'italic']);
const FOUR_FACE_SUFFIXES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function includesNormalized(haystack, needle) {
  return normalizeText(haystack).includes(normalizeText(needle));
}

function oflNoticeFragments(family) {
  const fragments = [];
  const singleRfnMarker = ' with Reserved Font Name ';
  if (family.copyrightNotice.includes(singleRfnMarker)) {
    const [ownerNotice] = family.copyrightNotice.split(singleRfnMarker);
    if (ownerNotice) fragments.push(ownerNotice);
    if (family.reservedFontName) fragments.push(`Reserved Font Name "${family.reservedFontName}"`);
  } else if (family.copyrightNotice) {
    fragments.push(family.copyrightNotice);
  }
  if (family.copyrightNotice.includes('Copyright (c) 2012 Red Hat, Inc.')) {
    fragments.push('Copyright (c) 2012 Red Hat, Inc.');
  }
  fragments.push('Licensed under the SIL Open Font License, Version 1.1');
  return fragments;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function parseRuntimeManifest() {
  const source = readText(runtimeManifestPath);
  const rows = [];
  const pattern = /family\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const [, family, filePrefix, license] = match;
    rows.push({
      family,
      license,
      files: FOUR_FACE_SUFFIXES.map((suffix) => `${filePrefix}-${suffix}.woff2`),
    });
    match = pattern.exec(source);
  }
  const customPattern = /familyWithFaces\('([^']+)'\s*,\s*'([^']+)'\s*,\s*\[([\s\S]*?)\]\)/g;
  const facePattern = /{\s*weight:\s*'([^']+)'\s*,\s*style:\s*'([^']+)'\s*,\s*file:\s*'([^']+)'\s*}/g;
  match = customPattern.exec(source);
  while (match !== null) {
    const [, family, license, faceBlock] = match;
    const files = [];
    let faceMatch = facePattern.exec(faceBlock);
    while (faceMatch !== null) {
      files.push(faceMatch[3]);
      faceMatch = facePattern.exec(faceBlock);
    }
    rows.push({ family, license, files });
    match = customPattern.exec(source);
  }
  return rows;
}

function compareSets(label, actual, expected) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  const missing = expectedSorted.filter((value) => !actual.has(value));
  const extra = actualSorted.filter((value) => !expected.has(value));
  if (missing.length) fail(`${label}: missing ${missing.join(', ')}`);
  if (extra.length) fail(`${label}: extra ${extra.join(', ')}`);
}

for (const file of [manifestPath, runtimeManifestPath, ...Object.values(notices)]) {
  if (!fs.existsSync(file)) fail(`required file missing: ${path.relative(repoRoot, file)}`);
}

if (errors.length === 0) {
  const manifest = readJson(manifestPath);
  const assetFiles = new Set(fs.readdirSync(assetsDir).filter((name) => name.endsWith('.woff2')));
  const manifestFamilies = new Set();
  const manifestFiles = new Set();
  const manifestFamilyRows = new Map();

  if (manifest.schemaVersion !== 1) fail('font-assets.manifest.json schemaVersion must be 1');
  if (manifest.spdxExpression !== 'OFL-1.1 AND Apache-2.0') {
    fail('font-assets.manifest.json spdxExpression must be "OFL-1.1 AND Apache-2.0"');
  }
  if (!Array.isArray(manifest.families) || manifest.families.length === 0) {
    fail('font-assets.manifest.json must contain at least one family');
  }

  for (const family of manifest.families ?? []) {
    const familyName = family.family;
    if (!familyName) {
      fail('manifest family row is missing family');
      continue;
    }
    if (manifestFamilies.has(familyName)) fail(`duplicate family in manifest: ${familyName}`);
    manifestFamilies.add(familyName);
    manifestFamilyRows.set(familyName, family);

    if (!VALID_LICENSES.has(family.license)) fail(`${familyName}: unsupported license ${family.license}`);
    if (!family.version) fail(`${familyName}: missing version`);
    if (!family.upstreamSource) fail(`${familyName}: missing upstreamSource`);
    if (!family.copyrightNotice) fail(`${familyName}: missing copyrightNotice`);
    if (!Array.isArray(family.licenseFiles) || family.licenseFiles.length === 0) {
      fail(`${familyName}: missing licenseFiles`);
    }
    for (const licenseFile of family.licenseFiles ?? []) {
      if (!fs.existsSync(path.join(assetsDir, licenseFile)))
        fail(`${familyName}: license file missing: ${licenseFile}`);
    }
    if (family.license === 'OFL-1.1' && !family.licenseFiles?.includes('OFL.txt')) {
      fail(`${familyName}: OFL-1.1 row must list OFL.txt`);
    }
    if (family.license === 'Apache-2.0' && !family.licenseFiles?.includes('Apache-2.0.txt')) {
      fail(`${familyName}: Apache-2.0 row must list Apache-2.0.txt`);
    }

    if (!Array.isArray(family.faces) || family.faces.length === 0) {
      fail(`${familyName}: missing faces`);
      continue;
    }
    for (const face of family.faces) {
      if (!face.file) {
        fail(`${familyName}: face missing file`);
        continue;
      }
      if (manifestFiles.has(face.file)) fail(`duplicate face file in manifest: ${face.file}`);
      manifestFiles.add(face.file);

      const facePath = path.join(assetsDir, face.file);
      if (!fs.existsSync(facePath)) {
        fail(`${familyName}: missing face file ${face.file}`);
      } else if (sha256(facePath) !== face.sha256) {
        fail(`${face.file}: sha256 mismatch`);
      }
      if (!VALID_WEIGHTS.has(face.weight)) fail(`${face.file}: invalid weight ${face.weight}`);
      if (!VALID_STYLES.has(face.style)) fail(`${face.file}: invalid style ${face.style}`);
      if (!/^[a-f0-9]{64}$/.test(face.sha256 ?? '')) fail(`${face.file}: sha256 must be 64 lowercase hex chars`);
    }
  }

  compareSets('asset directory vs font-assets.manifest.json', assetFiles, manifestFiles);

  const runtimeRows = parseRuntimeManifest();
  if (runtimeRows.length === 0) fail('could not parse bundled runtime manifest rows');
  const runtimeFamilies = new Set(runtimeRows.map((row) => row.family));
  compareSets('runtime BUNDLED_MANIFEST vs legal manifest families', runtimeFamilies, manifestFamilies);
  for (const runtime of runtimeRows) {
    const legal = manifestFamilyRows.get(runtime.family);
    if (!legal) continue;
    if (legal.license !== runtime.license) {
      fail(`${runtime.family}: runtime license ${runtime.license} does not match legal manifest ${legal.license}`);
    }
    compareSets(
      `${runtime.family}: runtime files vs legal manifest files`,
      new Set(runtime.files),
      new Set((legal.faces ?? []).map((face) => face.file)),
    );
  }

  const licensesText = readText(notices.licenses);
  const oflText = readText(notices.ofl);
  const thirdPartyText = readText(notices.thirdParty);
  const superdocPluginText = readText(notices.superdocPlugin);

  if (!licensesText.includes(manifest.spdxExpression)) fail('LICENSES.md missing bundled font SPDX expression');
  if (!thirdPartyText.includes(manifest.spdxExpression)) {
    fail('THIRD_PARTY_LICENSES.md missing bundled font SPDX expression');
  }
  if (!superdocPluginText.includes('THIRD_PARTY_LICENSES.md')) {
    fail('SuperDoc bundled-fonts plugin must emit THIRD_PARTY_LICENSES.md into dist');
  }

  for (const family of manifest.families ?? []) {
    if (!licensesText.includes(family.family)) fail(`LICENSES.md missing family ${family.family}`);
    if (!thirdPartyText.includes(family.family)) fail(`THIRD_PARTY_LICENSES.md missing family ${family.family}`);
    if (!includesNormalized(licensesText, family.copyrightNotice)) {
      fail(`LICENSES.md missing copyright notice for ${family.family}`);
    }
    if (family.trademarkNotice && !includesNormalized(licensesText, family.trademarkNotice)) {
      fail(`LICENSES.md missing trademark notice for ${family.family}`);
    }
    if (family.license === 'OFL-1.1') {
      if (!oflText.includes(family.family)) fail(`OFL.txt missing family ${family.family}`);
      for (const fragment of oflNoticeFragments(family)) {
        if (!includesNormalized(oflText, fragment)) fail(`OFL.txt missing copyright notice for ${family.family}`);
      }
    }
  }
}

if (errors.length) {
  console.error('[font-license-check] FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[font-license-check] OK');
