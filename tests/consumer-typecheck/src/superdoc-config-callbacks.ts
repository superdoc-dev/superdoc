/**
 * Consumer typecheck: SuperDoc Config callbacks — `onContentError` and
 * `onException` payload shapes (SD-673 Phase 4D).
 *
 * Phase 4D widened both callbacks to match the runtime emit reality:
 *
 * - `onContentError` was `{ error: object, ... documentId: string, file: File }`.
 *   Runtime emits `error` as `unknown` (super-editor doesn't normalize
 *   to `Error` in every path), and `file` reflects `Document.data`
 *   (`File | Blob | null | undefined`).
 *
 * - `onException` was `{ error: Error, editor?, code? }` — too narrow
 *   to express the three runtime emit shapes (store init, restore,
 *   editor lifecycle). Widened to `SuperDocExceptionPayload` so
 *   consumers can narrow with `'stage' in params` etc.
 *
 * This fixture pins both contracts. A future re-narrowing fails the
 * matching assertion and CI fails.
 */

import type {
  Config,
  Editor,
  SuperDocExceptionEditorPayload,
  SuperDocExceptionPayload,
  SuperDocExceptionStorePayload,
} from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// =============================================================================
// onContentError — widened error / file
// =============================================================================

type OnContentErrorParams = Parameters<NonNullable<Config['onContentError']>>[0];

// `error` is `unknown` (not `Error`, not `object`). Consumers must narrow.
const _errorIsUnknown: Equal<OnContentErrorParams['error'], unknown> = true;
void _errorIsUnknown;

// `file` matches `Document.data` (`File | Blob | null | undefined`).
const _fileIsWide: Equal<OnContentErrorParams['file'], File | Blob | null | undefined> = true;
void _fileIsWide;

// `documentId` stays `string` — runtime guarantees it via `#initDocuments`.
const _documentIdIsString: Equal<OnContentErrorParams['documentId'], string> = true;
void _documentIdIsString;

// `editor` is `Editor` — required, not optional.
const _editorIsEditor: Equal<OnContentErrorParams['editor'], Editor> = true;
void _editorIsEditor;

// Concrete usage: consumer narrows `unknown` before reading `.message`.
const onContentError: NonNullable<Config['onContentError']> = ({ error, editor, documentId, file }) => {
  // @ts-expect-error SD-673 Phase 4D: `error` is `unknown`; consumers must narrow.
  void error.message;
  if (error instanceof Error) {
    void error.message;
  }
  // `file` can be Blob, not just File — must narrow before reading File-only fields.
  // @ts-expect-error SD-673 Phase 4D: `file` is `File | Blob | null | undefined`.
  void file.name;
  if (file instanceof File) {
    void file.name;
  }
  void editor;
  void documentId;
};
void onContentError;

// =============================================================================
// onException — widened to discriminated union
// =============================================================================

type OnExceptionParams = Parameters<NonNullable<Config['onException']>>[0];

// `Config.onException` parameter equals the published `SuperDocExceptionPayload`.
const _exceptionIsUnion: Equal<OnExceptionParams, SuperDocExceptionPayload> = true;
void _exceptionIsUnion;

// Narrowing: `'stage' in params` picks the store-init shape uniquely.
// `'code' in params` picks the editor shape (only editor has `code`).
// The restore shape (`{ error, document }`) overlaps structurally with
// the store shape (which also has `document`) and with editor (where
// `code` is optional, so `'code' in params` only narrows the positive
// case). Consumers that need to act on a specific shape narrow once
// they've ruled out the discriminator-bearing shapes; consumers that
// only need `error` can read it directly across the union.
const onException: NonNullable<Config['onException']> = (params) => {
  if ('stage' in params && params.stage === 'document-init') {
    const storeParams: SuperDocExceptionStorePayload = params;
    void storeParams.document;
    return;
  }
  if ('code' in params) {
    const editorParams: SuperDocExceptionEditorPayload = params;
    void editorParams.code;
    // The editor field allows `null` (password-prompt re-emit forwards
    // `originalException?.editor ?? null`). Consumers must accept null
    // alongside undefined; assigning to `Editor` alone must fail.
    const editorField: Editor | null | undefined = editorParams.editor;
    void editorField;
    // @ts-expect-error SD-673 Phase 4D: editor can be null, not just `Editor | undefined`.
    const tooNarrow: Editor | undefined = editorParams.editor;
    void tooNarrow;
    return;
  }
  // Residual: TS can't fully eliminate the editor shape here because
  // its `code` field is optional, so the residual is still the full
  // union. `error` is the safe field to read across every shape.
  void params.error;
};
void onException;

// Every union member exposes `error`. Without narrowing, the type is the
// intersection across members: `Error | unknown` collapses to `unknown`.
const onExceptionAccessError: NonNullable<Config['onException']> = ({ error }) => {
  const _errorAccessIsUnknown: Equal<typeof error, unknown> = true;
  void _errorAccessIsUnknown;
};
void onExceptionAccessError;
