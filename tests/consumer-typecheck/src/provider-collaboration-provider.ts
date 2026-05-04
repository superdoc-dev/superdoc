/**
 * Consumer typecheck: `Document.provider` and `SuperDoc.provider` are typed
 * as `CollaborationProvider`, not `HocuspocusProvider` (SD-2828).
 *
 * The runtime stores whatever provider the consumer passed via
 * `Config.modules.collaboration.provider`. Consumers may pass any
 * Yjs-compatible provider: Hocuspocus, LiveblocksYjsProvider,
 * TiptapCollabProvider, or a hand-rolled adapter that conforms to the
 * `CollaborationProvider` shape. The previous typedef narrowed both
 * fields to `HocuspocusProvider`, which lied about the runtime for any
 * non-Hocuspocus consumer.
 *
 * This fixture pins the contract: the field types accept any
 * `CollaborationProvider`-shaped value. If a future change re-narrows
 * either field to `HocuspocusProvider`, the assignments below stop
 * compiling and CI fails.
 */
import type { CollaborationProvider, Config, SuperDoc } from 'superdoc';

declare const sd: SuperDoc;

// Strict type-equality assertion. A narrower type (e.g. `HocuspocusProvider`)
// would still be assignable to `CollaborationProvider | undefined`, so a
// plain assignment here would silently pass under a re-narrowing
// regression. The `Equal` trick fails the test if the field's exact type
// drifts in either direction.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

// `SuperDoc.provider` must be exactly `CollaborationProvider | undefined`.
const _sdProviderTypeIsExact: AssertEqual<typeof sd.provider, CollaborationProvider | undefined> = true;

// `Config['documents']` carries the per-document `Document` shape.
type DocumentEntry = NonNullable<Config['documents']>[number];

// `Document.provider` must be exactly `CollaborationProvider | undefined`.
declare const docEntry: DocumentEntry;
const _docProviderTypeIsExact: AssertEqual<typeof docEntry.provider, CollaborationProvider | undefined> = true;

// Construct a `CollaborationProvider`-shaped object with the Yjs-style
// `on` / `off` methods consumers typically supply. Every field on the
// public `CollaborationProvider` interface is optional, so even an empty
// `{}` would satisfy the type; including `on`/`off` here mirrors what
// real non-Hocuspocus providers (Liveblocks, Tiptap, custom adapters)
// expose and what the runtime calls into.
const minimalProvider: CollaborationProvider = {
  on: () => {},
  off: () => {},
};

const docWithMinimalProvider: DocumentEntry = {
  type: 'docx',
  provider: minimalProvider,
};

// Reference all bindings so `tsc --noEmit` doesn't strip them.
void [_sdProviderTypeIsExact, _docProviderTypeIsExact, minimalProvider, docWithMinimalProvider];
