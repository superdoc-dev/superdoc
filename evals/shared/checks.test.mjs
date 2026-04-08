#!/usr/bin/env node

/**
 * Unit tests for checks.cjs assertion helpers.
 * Run: node evals/lib/checks.test.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const checks = require('./checks.cjs');

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function call(name, args = {}) {
  return { function: { name, arguments: JSON.stringify(args) } };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log('  FAIL', name, e.message);
  }
}

const eq = assert.strictEqual;

// --- noHallucinatedParams ---
console.log('noHallucinatedParams');
test('skips empty', () => eq(checks.noHallucinatedParams([]), true));
test('passes clean', () => eq(checks.noHallucinatedParams([call('superdoc_search', { select: {} })]).pass, true));
test('tolerates empty strings', () => eq(checks.noHallucinatedParams([call('superdoc_search', { doc: '', sessionId: '' })]).pass, true));
test('fails non-empty doc', () => eq(checks.noHallucinatedParams([call('superdoc_search', { doc: 'x' })]).pass, false));
test('fails non-empty sessionId', () => eq(checks.noHallucinatedParams([call('superdoc_edit', { sessionId: 'abc' })]).pass, false));

// --- validOpNames ---
console.log('validOpNames');
test('skips no mutations', () => eq(checks.validOpNames([call('superdoc_search')]), true));
test('passes valid ops', () => eq(checks.validOpNames([call('superdoc_mutations', { steps: [{ op: 'text.rewrite' }] })]).pass, true));
test('fails bare replace', () => eq(checks.validOpNames([call('superdoc_mutations', { steps: [{ op: 'replace' }] })]).pass, false));

// --- stepFields ---
console.log('stepFields');
test('fails missing op', () => eq(checks.stepFields([call('superdoc_mutations', { steps: [{ where: {} }] })]).pass, false));
test('fails missing where', () => eq(checks.stepFields([call('superdoc_mutations', { steps: [{ op: 'text.rewrite' }] })]).pass, false));
test('passes complete', () => eq(checks.stepFields([call('superdoc_mutations', { steps: [{ op: 'text.rewrite', where: {} }] })]).pass, true));

// --- noMixedBatch ---
console.log('noMixedBatch');
test('fails mixed', () => eq(checks.noMixedBatch([call('superdoc_mutations', { steps: [{ op: 'text.rewrite' }, { op: 'format.apply' }] })]).pass, false));
test('passes text only', () => eq(checks.noMixedBatch([call('superdoc_mutations', { steps: [{ op: 'text.rewrite' }, { op: 'text.delete' }] })]).pass, true));

// --- correctFormatArgs ---
console.log('correctFormatArgs');
test('passes superdoc_format inline with nested payload', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline', inline: { bold: true } })]).pass, true));
test('fails superdoc_format inline without inline payload', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline' })]).pass, false));
test('fails superdoc_format inline with top-level style key', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline', bold: true })]).pass, false));
test('fails superdoc_format inline with empty inline object', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline', inline: {} })]).pass, false));
test('fails superdoc_format inline with unknown inline key', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline', inline: { notAStyle: true } })]).pass, false));
test('passes mutations format.apply with inline wrapper', () => eq(checks.correctFormatArgs([call('superdoc_mutations', { steps: [{ op: 'format.apply', where: {}, args: { inline: { bold: true } } }] })]).pass, true));
test('fails mutations format.apply without wrapper', () => eq(checks.correctFormatArgs([call('superdoc_mutations', { steps: [{ op: 'format.apply', where: {}, args: { bold: true } }] })]).pass, false));
test('fails mutations format.apply with empty inline object', () => eq(checks.correctFormatArgs([call('superdoc_mutations', { steps: [{ op: 'format.apply', where: {}, args: { inline: {} } }] })]).pass, false));
test('fails mutations format.apply with unknown inline key', () => eq(checks.correctFormatArgs([call('superdoc_mutations', { steps: [{ op: 'format.apply', where: {}, args: { inline: { notAStyle: true } } }] })]).pass, false));
test('validates mutations even with superdoc_format present', () => eq(checks.correctFormatArgs([call('superdoc_format', { action: 'inline' }), call('superdoc_mutations', { steps: [{ op: 'format.apply', where: {}, args: { bold: true } }] })]).pass, false));
test('skips no formatting tools', () => eq(checks.correctFormatArgs([call('superdoc_search')]), true));

// --- textSearchArgs ---
console.log('textSearchArgs');
test('fails no search', () => eq(checks.textSearchArgs([call('superdoc_edit')]).pass, false));
test('fails non-text type', () => eq(checks.textSearchArgs([call('superdoc_search', { select: { type: 'node' } })]).pass, false));
test('fails missing pattern', () => eq(checks.textSearchArgs([call('superdoc_search', { select: { type: 'text' } })]).pass, false));
test('passes correct', () => eq(checks.textSearchArgs([call('superdoc_search', { select: { type: 'text', pattern: 'hi' } })]).pass, true));

// --- nodeSearchArgs ---
console.log('nodeSearchArgs');
test('passes correct node', () => eq(checks.nodeSearchArgs([call('superdoc_search', { select: { type: 'node', nodeType: 'heading' } })], { vars: { expectedNodeType: 'heading' } }).pass, true));
test('fails wrong type', () => eq(checks.nodeSearchArgs([call('superdoc_search', { select: { type: 'node', nodeType: 'paragraph' } })], { vars: { expectedNodeType: 'heading' } }).pass, false));

// --- usesGetContentText ---
console.log('usesGetContentText');
test('passes action text', () => eq(checks.usesGetContentText([call('superdoc_get_content', { action: 'text' })]).pass, true));
test('fails action markdown', () => eq(checks.usesGetContentText([call('superdoc_get_content', { action: 'markdown' })]).pass, false));

// --- usesCreateAction ---
console.log('usesCreateAction');
test('passes matching', () => eq(checks.usesCreateAction([call('superdoc_create', { action: 'heading' })], { vars: { expectedCreateAction: 'heading' } }).pass, true));
test('fails mismatch', () => eq(checks.usesCreateAction([call('superdoc_create', { action: 'paragraph' })], { vars: { expectedCreateAction: 'heading' } }).pass, false));
test('skips no expected', () => eq(checks.usesCreateAction([call('superdoc_create')], {}), true));

// --- usesCommentCreate ---
console.log('usesCommentCreate');
test('passes action create', () => eq(checks.usesCommentCreate([call('superdoc_comment', { action: 'create' })]).pass, true));
test('fails action list', () => eq(checks.usesCommentCreate([call('superdoc_comment', { action: 'list' })]).pass, false));

// --- usesEditUndo ---
console.log('usesEditUndo');
test('passes action undo', () => eq(checks.usesEditUndo([call('superdoc_edit', { action: 'undo' })]).pass, true));
test('fails wrong action', () => eq(checks.usesEditUndo([call('superdoc_edit', { action: 'replace' })]).pass, false));

// --- isTrackedMode ---
console.log('isTrackedMode');
test('passes mutations tracked', () => eq(checks.isTrackedMode([call('superdoc_mutations', { changeMode: 'tracked', steps: [] })]).pass, true));
test('passes edit tracked', () => eq(checks.isTrackedMode([call('superdoc_edit', { changeMode: 'tracked' })]).pass, true));
test('fails mutations direct', () => eq(checks.isTrackedMode([call('superdoc_mutations', { changeMode: 'direct', steps: [] })]).pass, false));

// --- isNotTrackedMode ---
console.log('isNotTrackedMode');
test('passes edit direct', () => eq(checks.isNotTrackedMode([call('superdoc_edit', { changeMode: 'direct' })]).pass, true));
test('fails mutations tracked', () => eq(checks.isNotTrackedMode([call('superdoc_mutations', { changeMode: 'tracked', steps: [] })]).pass, false));

// --- atomicMultiStep ---
console.log('atomicMultiStep');
test('passes atomic 2+ steps', () => eq(checks.atomicMultiStep([call('superdoc_mutations', { atomic: true, steps: [{ op: 'a', where: {} }, { op: 'b', where: {} }] })]).pass, true));
test('fails split calls', () => eq(checks.atomicMultiStep([call('superdoc_mutations', { atomic: true, steps: [{ op: 'a', where: {} }] }), call('superdoc_mutations', { atomic: true, steps: [{ op: 'b', where: {} }] })]).pass, false));
test('fails non-atomic', () => eq(checks.atomicMultiStep([call('superdoc_mutations', { atomic: false, steps: [{ op: 'a', where: {} }, { op: 'b', where: {} }] })]).pass, false));

// --- usesDeleteOp ---
console.log('usesDeleteOp');
test('via mutations text.delete', () => eq(checks.usesDeleteOp([call('superdoc_mutations', { steps: [{ op: 'text.delete' }] })]).pass, true));
test('via edit delete', () => eq(checks.usesDeleteOp([call('superdoc_edit', { action: 'delete' })]).pass, true));
test('fails no delete', () => eq(checks.usesDeleteOp([call('superdoc_search')]).pass, false));

// --- usesRewriteOp ---
console.log('usesRewriteOp');
test('via mutations text.rewrite', () => eq(checks.usesRewriteOp([call('superdoc_mutations', { steps: [{ op: 'text.rewrite' }] })]).pass, true));
test('via edit replace', () => eq(checks.usesRewriteOp([call('superdoc_edit', { action: 'replace' })]).pass, true));
test('fails no rewrite', () => eq(checks.usesRewriteOp([call('superdoc_edit', { action: 'delete' })]).pass, false));

// --- noTextInsertForStructure ---
console.log('noTextInsertForStructure');
test('passes with superdoc_create', () => eq(checks.noTextInsertForStructure([call('superdoc_create', { action: 'heading' })]).pass, true));
test('fails text.insert without create', () => eq(checks.noTextInsertForStructure([call('superdoc_mutations', { steps: [{ op: 'text.insert', where: {} }] })]).pass, false));
test('skips no mutations no create', () => eq(checks.noTextInsertForStructure([call('superdoc_search')]), true));

// --- noRequireAny ---
console.log('noRequireAny');
test('fails require any in step', () => eq(checks.noRequireAny([call('superdoc_mutations', { steps: [{ op: 'text.rewrite', where: { require: 'any' } }] })]).pass, false));
test('passes require first', () => eq(checks.noRequireAny([call('superdoc_mutations', { steps: [{ op: 'text.rewrite', where: { require: 'first' } }] })]).pass, true));

// --- usesTrackChangesDecide ---
console.log('usesTrackChangesDecide');
test('passes action decide', () => eq(checks.usesTrackChangesDecide([call('superdoc_track_changes', { action: 'decide' })]).pass, true));
test('fails action list', () => eq(checks.usesTrackChangesDecide([call('superdoc_track_changes', { action: 'list' })]).pass, false));
test('fails not called', () => eq(checks.usesTrackChangesDecide([call('superdoc_search')]).pass, false));

// --- benchmark individual metrics ---
console.log('benchmarkMetrics');
test('benchmarkSteps returns step count as score', () => {
  const { benchmarkSteps } = require('./checks.cjs');
  const output = JSON.stringify({ stepCount: 5 });
  const result = benchmarkSteps(output);
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 5);
  assert.ok(result.reason.includes('5'));
});

test('benchmarkLatency returns seconds as score', () => {
  const { benchmarkLatency } = require('./checks.cjs');
  const output = JSON.stringify({ duration: 12500 });
  const result = benchmarkLatency(output);
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 13);
});

test('benchmarkTokens returns total tokens as score', () => {
  const { benchmarkTokens } = require('./checks.cjs');
  const output = JSON.stringify({ usage: { input_tokens: 8000, output_tokens: 2000 } });
  const result = benchmarkTokens(output);
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 10000);
  assert.ok(result.reason.includes('8000 in'));
});

test('benchmarkPath returns 1 for superdoc, 0 for raw', () => {
  const { benchmarkPath } = require('./checks.cjs');
  assert.strictEqual(benchmarkPath(JSON.stringify({ pathUsed: 'superdoc-mcp' })).score, 1);
  assert.strictEqual(benchmarkPath(JSON.stringify({ pathUsed: 'raw' })).score, 0);
  assert.ok(benchmarkPath(JSON.stringify({ pathUsed: 'superdoc-mcp' })).reason.includes('superdoc'));
});

test('benchmarkMetrics combined still works', () => {
  const { benchmarkMetrics } = require('./checks.cjs');
  const output = JSON.stringify({ stepCount: 3, duration: 5000, usage: { input_tokens: 1000, output_tokens: 500 }, pathUsed: 'raw' });
  const result = benchmarkMetrics(output, {});
  assert.strictEqual(result.pass, true);
  assert.ok(result.reason.includes('3 steps'));
});

// --- benchmarkFidelity ---
console.log('benchmarkFidelity');
test('benchmarkFidelity passes when outputFile is null (reading task)', () => {
  const output = JSON.stringify({ stepCount: 3 }); // no outputFile
  const result = checks.benchmarkFidelity(output, { vars: { fidelityChecks: '[{"type":"trackedChangeCount","min":1}]' } });
  assert.strictEqual(result.pass, true);
  assert.ok(result.reason.includes('no output file'));
});

test('benchmarkFidelity runs checks from vars.fidelityChecks', () => {
  const ndaPath = resolve(__dirname, '../fixtures/docs/nda.docx');
  const output = JSON.stringify({ outputFile: ndaPath });
  const context = { vars: { fidelityChecks: JSON.stringify([{ type: 'trackedChangeCount', min: 0 }]) } };
  const result = checks.benchmarkFidelity(output, context);
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 1);
});

// --- benchmarkDiff ---
console.log('benchmarkDiff');
test('benchmarkDiff returns 0 ratio for same file', () => {
  const ndaPath = resolve(__dirname, '../fixtures/docs/nda.docx');
  const output = JSON.stringify({ outputFile: ndaPath });
  const context = { vars: { fixture: 'nda.docx' } };
  const result = checks.benchmarkDiff(output, context);
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 0);
  assert.ok(result.reason.includes('0/'));
});

console.log();
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
