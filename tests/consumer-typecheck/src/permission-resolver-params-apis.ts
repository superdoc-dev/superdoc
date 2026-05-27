/**
 * Consumer typecheck: `PermissionResolverParams` export and resolver
 * callback contracts.
 *
 * Locks two things against the emitted `.d.ts`:
 *
 *   1. `PermissionResolverParams` is reachable as a named public type
 *      from `superdoc` (was a non-exported helper before this PR).
 *      Resolver authors can now `import type { PermissionResolverParams }
 *      from 'superdoc'` and write `(params: PermissionResolverParams)`
 *      explicitly, instead of relying on inferred shape from
 *      `Parameters<NonNullable<Config['permissionResolver']>>[0]`.
 *
 *   2. Both `Config.permissionResolver` and
 *      `Modules.comments.permissionResolver` use the named type, with
 *      identical signatures. Drift between the two resolver slots
 *      would slip past method-coverage fixtures (callbacks are not
 *      gate-tracked) but fails here on `AssertEqual`.
 *
 * Promoted as part of the same DX initiative that exported
 * `CanPerformPermissionParams` (the consumer input shape). The two
 * types overlap on `permission` / `role` / `isInternal` / `comment` /
 * `trackedChange` but serve opposite directions of the flow:
 *
 *   - `CanPerformPermissionParams` = what consumers pass INTO
 *     `SuperDoc#canPerformPermission`.
 *   - `PermissionResolverParams`   = what consumer resolvers RECEIVE,
 *     enriched with `defaultDecision`, `currentUser`, and `superdoc`.
 *
 * One real omission landed alongside this export: the runtime always
 * forwards `defaultDecision: boolean` to the resolver, but the old
 * non-exported helper omitted it. Adding it lets resolvers branch off
 * (or defer to) the built-in policy without re-deriving it. Existing
 * resolvers that didn't read `defaultDecision` are unaffected.
 */
import type { Config, Modules, PermissionResolverParams } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamOf<F extends ((...args: any) => any) | undefined> = Parameters<NonNullable<F>>[0];

// ─── Config.permissionResolver ──────────────────────────────────────
const _topLevelResolverParamsOk: AssertEqual<ParamOf<Config['permissionResolver']>, PermissionResolverParams> = true;

// ─── Modules.comments.permissionResolver ────────────────────────────
// Modules.comments is `false | object`. Narrow to the object form
// before pulling the resolver slot out.
type CommentsModule = Exclude<NonNullable<Modules['comments']>, false>;
const _commentsResolverParamsOk: AssertEqual<
  ParamOf<CommentsModule['permissionResolver']>,
  PermissionResolverParams
> = true;

// ─── Resolver authors construct payloads against the named type ─────
const sample: PermissionResolverParams = {
  permission: 'comment.create',
  role: 'editor',
  isInternal: true,
  defaultDecision: true,
  comment: { id: 'c-1' },
  trackedChange: { id: 'tc-1' },
  currentUser: { name: 'A', email: 'a@x.com' },
  superdoc: null,
};
void sample;

// Returning `boolean | undefined` matches what isAllowed accepts.
const _resolver: NonNullable<Config['permissionResolver']> = (params) => {
  // defaultDecision is now visible on the typed payload.
  return params.defaultDecision;
};
void _resolver;

void [_topLevelResolverParamsOk, _commentsResolverParamsOk];
