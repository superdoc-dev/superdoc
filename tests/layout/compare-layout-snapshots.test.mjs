import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { normalizeGenerationWarningMessage, toDisplayDocPath } from './compare-layout-snapshots.mjs';

test('normalizeGenerationWarningMessage strips command-service prefix and trims whitespace', () => {
  const raw = '   [CommandService] Dispatch failed: Invalid content for node structuredContentBlock   ';
  const normalized = normalizeGenerationWarningMessage(raw);
  assert.equal(normalized, 'Invalid content for node structuredContentBlock');
});

test('normalizeGenerationWarningMessage falls back to default text for empty values', () => {
  const normalized = normalizeGenerationWarningMessage('');
  assert.equal(normalized, 'Unknown generation error');
});

test('toDisplayDocPath returns relative doc path inside input root', () => {
  const inputRoot = path.join('/tmp', 'repo', 'test-corpus');
  const docPath = path.join(inputRoot, 'permissions', 'sd-1840-perm-tags.docx');
  const displayPath = toDisplayDocPath(docPath, inputRoot);

  assert.equal(displayPath, 'permissions/sd-1840-perm-tags.docx');
});

test('toDisplayDocPath preserves absolute path for docs outside input root', () => {
  const inputRoot = path.join('/tmp', 'repo', 'test-corpus');
  const outsidePath = path.join('/tmp', 'other', 'doc.docx');
  const displayPath = toDisplayDocPath(outsidePath, inputRoot);

  assert.equal(displayPath, '/tmp/other/doc.docx');
});
