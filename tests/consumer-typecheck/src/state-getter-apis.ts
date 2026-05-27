/**
 * Consumer typecheck: `state` getter on `SuperDoc`.
 *
 * Locks the return shape of the `state` getter against the emitted
 * `.d.ts` with strict identity equality. The drain of the final
 * `state:returns` debt entry on the public-method coverage gate.
 *
 * Before this PR the getter returned an inline anonymous shape
 * `{ documents: RuntimeDocument[]; users: User[] }`. `RuntimeDocument`
 * is internal-only (declared in `core/types/index.ts` with an
 * "Internal use only; not part of any public typedef" header), so
 * consumers reading `sd.state.documents` got a type they couldn't
 * import or name.
 *
 * This PR introduces a new public type, `SuperDocState`, that exposes
 * `documents` as the public `Document[]` view. The runtime still
 * walks `RuntimeDocument[]` internally - `RuntimeDocument extends
 * Document`, so the value is structurally assignable - but the public
 * surface stops at `Document`, which is now also exported from the
 * facade alongside `SuperDocState`. Consumers should not rely on the
 * richer runtime fields (`getEditor`, `getPresentationEditor`,
 * `restoreComments`, `removeComments`, `ydoc`, `provider`); those
 * stay on the internal `RuntimeDocument` type.
 *
 * Drained obligation (1, final entry):
 *   - state:returns
 */
import type { Document, SuperDoc, SuperDocState, User } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

// Lock the getter return against the named public type.
const _stateOk: AssertEqual<SuperDoc['state'], SuperDocState> = true;

// And lock SuperDocState's own shape so a future widening (e.g.
// adding a richer `documents` element type) shows up here.
const _stateShapeOk: AssertEqual<SuperDocState, { documents: Document[]; users: User[] }> = true;

// Consumer-style read: the destructured documents are `Document`, not
// `RuntimeDocument`, so the runtime-only fields are not part of the
// inferred surface.
const snapshot: SuperDocState = sd.state;
const _docs: Document[] = snapshot.documents;
const _users: User[] = snapshot.users;
void _docs;
void _users;

void [_stateOk, _stateShapeOk];
