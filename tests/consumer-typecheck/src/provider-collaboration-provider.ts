/**
 * Consumer typecheck: `Document.provider` and `SuperDoc.provider` are typed
 * as `CollaborationProvider`, not `HocuspocusProvider` (SD-2828).
 *
 * The runtime stores whatever provider the consumer passed via
 * `Config.modules.collaboration.provider`. Consumers may pass any
 * Yjs-compatible provider — Hocuspocus, LiveblocksYjsProvider,
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

// `SuperDoc.provider` is `CollaborationProvider | undefined`. A consumer
// using a non-Hocuspocus provider can read it directly without `as`.
const sdProvider: CollaborationProvider | undefined = sd.provider;

// `Config['documents']` carries the per-document `Document` shape.
type DocumentEntry = NonNullable<Config['documents']>[number];

// `Document.provider` is `CollaborationProvider | undefined`. Same shape
// as the SuperDoc-level field; consumers reading `doc.provider` see
// the same widened type.
declare const docEntry: DocumentEntry;
const docProvider: CollaborationProvider | undefined = docEntry.provider;

// Construct a minimal `CollaborationProvider`-shaped object — the public
// interface only requires the Yjs-shaped `on` / `off` methods. Consumers
// of non-Hocuspocus providers (Liveblocks, Tiptap, custom) must be able
// to assign such a value and have it satisfy the `Document.provider`
// shape.
const minimalProvider: CollaborationProvider = {
  on: () => {},
  off: () => {},
};

const docWithMinimalProvider: DocumentEntry = {
  type: 'docx',
  provider: minimalProvider,
};

// Reference all bindings so `tsc --noEmit` doesn't strip them.
void [sdProvider, docProvider, minimalProvider, docWithMinimalProvider];
