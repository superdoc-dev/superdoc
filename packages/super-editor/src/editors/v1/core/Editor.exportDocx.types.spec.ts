/**
 * Type-level regression tests for Editor#exportDocx overload resolution.
 *
 * Runtime: vitest sees one trivial assertion and passes.
 * Compile-time: every annotated assignment inside `_typeOnlyAssertions` fails
 * `tsc --noEmit` if an overload ever stops resolving to the expected return
 * type. The function is never called — it exists solely to force the type
 * checker to evaluate the assignments.
 *
 * File uses `.spec.ts` (not `.test.ts`) so tsconfig.json still type-checks it
 * while tsconfig.build.json keeps it out of the published dist.
 */

import { describe, it, expect } from 'vitest';
import type { Editor } from './Editor.js';

// Never invoked — pure type-level assertions. Wrapped in a function so vitest
// doesn't try to execute the assignments at module load time.

function _typeOnlyAssertions(editor: Editor): void {
  // Three narrow overloads.
  const _xmlOnly: Promise<string> = editor.exportDocx({ exportXmlOnly: true });
  const _jsonOnly: Promise<string> = editor.exportDocx({ exportJsonOnly: true });
  const _updatedDocs: Promise<Record<string, string | null>> = editor.exportDocx({ getUpdatedDocs: true });

  // Default overload: T defaults to Blob, so browser consumers get
  // Promise<Blob> without casting.
  const _defaultNoArgs: Promise<Blob> = editor.exportDocx();
  const _defaultWithParams: Promise<Blob> = editor.exportDocx({ commentsType: 'external' });

  // Bare call, no contextual type — the default `T = Blob` must fire here, or
  // consumers still get the `Blob | Buffer` union downstream.
  const _bareInferred = editor.exportDocx();
  const _proveBareIsBlob: Promise<Blob> = _bareInferred;

  // Node-headless consumers opt in to Buffer.
  const _explicitBuffer: Promise<Buffer> = editor.exportDocx<Buffer>();
  const _explicitBlob: Promise<Blob> = editor.exportDocx<Blob>();

  // Soundness guard: combining an explicit type argument with a narrow-flag
  // param must NOT compile. Without this guard, `<Buffer>({ getUpdatedDocs: true })`
  // typed as `Promise<Buffer>` while the runtime returned a file map.
  // @ts-expect-error getUpdatedDocs: true is incompatible with the default overload
  editor.exportDocx<Buffer>({ getUpdatedDocs: true });
  // @ts-expect-error exportXmlOnly: true is incompatible with the default overload
  editor.exportDocx<Buffer>({ exportXmlOnly: true });
  // @ts-expect-error exportJsonOnly: true is incompatible with the default overload
  editor.exportDocx<Buffer>({ exportJsonOnly: true });

  // Customer scenario: Angular's `fromPromise` expects `Promise<T>` and yields
  // `Observable<T>`. Mirroring its shape — the default overload must flow into
  // `Promise<Blob>` without cast or type argument. (slack: p1776255665152579)
  const fromPromise = <T>(_p: Promise<T>): { value: T } => ({ value: undefined as unknown as T });
  const _angularBlob: { value: Blob } = fromPromise(editor.exportDocx({ commentsType: 'external' }));

  // Silence unused-variable warnings.
  void _xmlOnly;
  void _jsonOnly;
  void _updatedDocs;
  void _defaultNoArgs;
  void _defaultWithParams;
  void _proveBareIsBlob;
  void _explicitBuffer;
  void _explicitBlob;
  void _angularBlob;
}

describe('Editor#exportDocx overload resolution (type-only)', () => {
  it('passes when the file type-checks', () => {
    expect(true).toBe(true);
  });
});
