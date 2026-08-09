/**
 * Consumer typecheck: document-management public APIs on `SuperDoc`.
 *
 * Locks the `removeDocument` contract against the emitted `.d.ts` so the
 * public-method coverage gate sees both obligations this PR added:
 *
 *   - `removeDocument(documentId)` accepts a single string id
 *   - `removeDocument(documentId)` returns `Promise<boolean>`
 *
 * The boolean resolves to whether a mounted document with that id was removed.
 * That runtime behavior is not re-tested here; this fixture only protects the
 * supported consumer type surface.
 */
import type { SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

const _removeDocumentParamsOk: AssertEqual<Parameters<SuperDoc['removeDocument']>, [documentId: string]> = true;
const _removeDocumentReturnOk: AssertEqual<ReturnType<SuperDoc['removeDocument']>, Promise<boolean>> = true;

const _removeDocumentResult: Promise<boolean> = sd.removeDocument('doc-id-1');

void [_removeDocumentParamsOk, _removeDocumentReturnOk, _removeDocumentResult];
