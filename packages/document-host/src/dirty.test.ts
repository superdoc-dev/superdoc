/**
 * Unit proofs for the dirty-tracking classifier. These pin the exact dryRun /
 * mutates semantics that decide whether `export()` re-serializes or returns the
 * original bytes verbatim - including the formatRange input-level dryRun quirk
 * and the guard that keeps a stray `input.dryRun` from causing a false-clean save.
 */
import { test, expect } from 'bun:test';
import { COMMAND_CATALOG } from '@superdoc/document-api';
import { isMutatingInvoke } from './dirty';

test('read-only op (catalog mutates:false) is not dirty', () => {
  expect(COMMAND_CATALOG['getText'].mutates).toBe(false);
  expect(isMutatingInvoke('getText', {}, undefined)).toBe(false);
});

test('mutating op (catalog mutates:true) is dirty', () => {
  expect(COMMAND_CATALOG['insert'].mutates).toBe(true);
  expect(isMutatingInvoke('insert', {}, undefined)).toBe(true);
});

test('unknown op defaults to mutating (fail-safe against false-clean save)', () => {
  expect(isMutatingInvoke('not.a.real.op', {}, undefined)).toBe(true);
});

test('a leading doc. prefix is stripped before catalog lookup', () => {
  expect(isMutatingInvoke('doc.getText', {}, undefined)).toBe(false);
  expect(isMutatingInvoke('doc.insert', {}, undefined)).toBe(true);
});

test('options.dryRun turns a mutating op into a non-dirty preview', () => {
  expect(isMutatingInvoke('insert', {}, { dryRun: true })).toBe(false);
});

test('only dryRun === true counts as a preview', () => {
  expect(isMutatingInvoke('insert', {}, { dryRun: 'yes' })).toBe(true);
  expect(isMutatingInvoke('insert', {}, { dryRun: false })).toBe(true);
});

test('formatRange honors input-level dryRun (its dryRun lives on input, not options)', () => {
  // Mirrors @superdoc/document-api formatRange: dryRun = input.dryRun ?? options.dryRun.
  expect(isMutatingInvoke('formatRange', { dryRun: true }, undefined)).toBe(false);
  expect(isMutatingInvoke('formatRange', {}, { dryRun: true })).toBe(false);
  // Without any dryRun it follows the catalog (a real format mutation).
  expect(isMutatingInvoke('formatRange', { properties: { bold: true } }, undefined)).toBe(
    COMMAND_CATALOG['formatRange'].mutates === true,
  );
});

test('input-level dryRun is ignored for non-formatRange ops (no false-clean save)', () => {
  // These ops read dryRun from options only; a stray input.dryRun must not mark a real
  // mutation clean, or export() would silently drop the change.
  expect(isMutatingInvoke('insert', { dryRun: true }, undefined)).toBe(true);
  expect(isMutatingInvoke('format.apply', { dryRun: true }, undefined)).toBe(true);
});

test('formatRange input.dryRun precedence: input:false overrides options:true (op mutates)', () => {
  // @superdoc/document-api resolves formatRange dryRun as input.dryRun ?? options.dryRun, so an
  // explicit input.dryRun:false means a real mutation even when options.dryRun:true. The session
  // must stay dirty or the edit is dropped on export.
  expect(isMutatingInvoke('formatRange', { dryRun: false }, { dryRun: true })).toBe(true);
});

test('options.dryRun is ignored for mutating ops that do not support dryRun', () => {
  // comments.create / clearContent take RevisionGuardOptions (no dryRun); the op ignores a stray
  // dryRun and mutates, so the session must stay dirty (no false-clean save).
  expect(COMMAND_CATALOG['comments.create'].supportsDryRun).toBe(false);
  expect(COMMAND_CATALOG['clearContent'].supportsDryRun).toBe(false);
  expect(isMutatingInvoke('comments.create', {}, { dryRun: true })).toBe(true);
  expect(isMutatingInvoke('clearContent', {}, { dryRun: true })).toBe(true);
});
