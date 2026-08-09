/**
 * Consumer typecheck: `canPerformPermission` on `SuperDoc`.
 *
 * Locks the parameters and return shape against the emitted `.d.ts`
 * with strict identity equality. A future migration that narrows or
 * widens either side will fail the obligation diff rather than
 * slipping past CI.
 *
 * The parameter was previously an anonymous inline literal:
 *
 *   {
 *     permission?: string;
 *     role?: string;
 *     isInternal?: boolean;
 *     comment?: (object & Record<string, unknown>) | null;
 *     trackedChange?: ({ id?: string; commentId?: string; comment?: unknown }
 *       & Record<string, unknown>) | null;
 *   }
 *
 * This PR promotes it to a named public type, `CanPerformPermissionParams`,
 * exported from `superdoc` and used in the method signature. Consumers
 * now get IDE help on the call site and the contract is stable across
 * migrations. Distinct from the non-exported `PermissionResolverParams`
 * helper, which models the resolver callback payload with resolved
 * `currentUser` and `superdoc` context attached.
 *
 * Drained obligations (2):
 *   - canPerformPermission:parameters
 *   - canPerformPermission:returns
 */
import type { CanPerformPermissionParams, SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

// Parameters: tuple of one optional `CanPerformPermissionParams`.
const _paramsOk: AssertEqual<
  Parameters<SuperDoc['canPerformPermission']>,
  [params?: CanPerformPermissionParams]
> = true;

// Return: boolean. False short-circuits cover the no-permission and
// no-resolver/default-deny paths.
const _returnOk: AssertEqual<ReturnType<SuperDoc['canPerformPermission']>, boolean> = true;

// Construct the param object from the named type so the call site
// proves consumer ergonomics, not just the shape.
const params: CanPerformPermissionParams = {
  permission: 'comment.create',
  role: 'editor',
  isInternal: true,
  comment: { id: 'c-1', authorEmail: 'a@x.com' },
  trackedChange: { id: 'tc-1', commentId: 'c-1' },
};
const _allowed: boolean = sd.canPerformPermission(params);
void _allowed;

// Empty-payload call: typed as the optional tuple.
const _emptyAllowed: boolean = sd.canPerformPermission();
void _emptyAllowed;

void [_paramsOk, _returnOk];
