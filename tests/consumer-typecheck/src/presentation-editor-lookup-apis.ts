/**
 * Consumer typecheck: PresentationEditor lookup on `SuperDoc`.
 *
 * Locks the `getPresentationEditorForDocument` contract (parameters
 * and returns) against the emitted `.d.ts` with strict identity
 * equality. A future migration that narrows or widens the signature
 * will fail the obligation diff rather than slipping past CI.
 *
 * Both halves of the contract reference publicly exported types:
 *   - parameter is `[documentId: string]`
 *   - return is `PresentationEditor | null` (PresentationEditor is
 *     re-exported from `@superdoc/super-editor` via the facade and is
 *     classified as `legacy-root` - typed for backward compatibility,
 *     not the recommended public path, but still part of the surface)
 *
 * Runtime behavior the typedef does not capture: the method returns
 * null on empty/non-string ids before walking the document store.
 * That's a runtime concern; the type signature does not (and should
 * not) encode it.
 *
 * Drained obligations (2):
 *   - getPresentationEditorForDocument:parameters
 *   - getPresentationEditorForDocument:returns
 */
import type { PresentationEditor, SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

const _paramsOk: AssertEqual<Parameters<SuperDoc['getPresentationEditorForDocument']>, [documentId: string]> = true;
const _returnOk: AssertEqual<
  ReturnType<SuperDoc['getPresentationEditorForDocument']>,
  PresentationEditor | null
> = true;

const _looked: PresentationEditor | null = sd.getPresentationEditorForDocument('doc-id-1');
void _looked;

void [_paramsOk, _returnOk];
