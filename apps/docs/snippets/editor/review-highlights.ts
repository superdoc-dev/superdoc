import { defineSuperDocExtension, SuperDoc } from 'superdoc';
import type { SuperDocVisualTarget } from 'superdoc';
import type { SelectionTarget } from 'superdoc/ui';
import 'superdoc/style.css';
import './review-highlights.css';

const editorHost = document.querySelector<HTMLElement>('#editor');
const attachButton = document.querySelector<HTMLButtonElement>('#attach-finding');
const withdrawButton = document.querySelector<HTMLButtonElement>('#withdraw-finding');
const status = document.querySelector<HTMLParagraphElement>('#review-status');
const findingList = document.querySelector<HTMLUListElement>('#finding-list');

if (!editorHost || !attachButton || !withdrawButton || !status || !findingList) {
  throw new Error('The review-highlight controls are incomplete.');
}

const NAMESPACE = 'urn:example:review-findings:1';
const FINDING_ID = 'finding-1';

type VisualStore = {
  read: () => readonly SuperDocVisualTarget[];
  replace: (targets: readonly SuperDocVisualTarget[]) => void;
  subscribe: (listener: () => void) => () => void;
};

const createVisualStore = (): VisualStore => {
  let targets: readonly SuperDocVisualTarget[] = [];
  const listeners = new Set<() => void>();

  return {
    read: () => targets,
    replace(nextTargets) {
      targets = nextTargets;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const visualStore = createVisualStore();
let superdoc: SuperDoc | null = null;
let stopSelection: (() => void) | null = null;
let refreshSequence = 0;
// Bumped whenever the extension activates against a new source. A mutation
// captures it before its first await and re-checks before writing: the facade
// it holds follows the host into the replacement document, so a continuation
// that resumes after a swap would otherwise write the previous document's
// intent into the new one.
let sourceGeneration = 0;

// Tracks whether this namespace currently owns the finding, so a pending write
// can restore Withdraw without a refresh. `null` means the last refresh failed
// and the document's metadata state is unknown.
let findingOwnedHere = false;

const renderRows = (rows: Array<{ id: string; anchorStatus: string }>, idTaken: boolean | null) => {
  findingList.replaceChildren();
  for (const row of rows) {
    const item = document.createElement('li');
    item.textContent = `${row.id} · ${row.anchorStatus}`;
    findingList.append(item);
  }
  // Withdraw follows the rows this namespace owns. Attach follows whether the
  // id is taken anywhere in the document, which is the rule `attach()` applies.
  // Both come from the listed metadata rather than from the last click, so an
  // opened DOCX that already carries the finding starts in the correct state.
  //
  // A null `idTaken` means the refresh failed. Neither control can be trusted
  // then, so both fail closed until a complete refresh succeeds: reporting "no
  // rows, id free" would enable Attach for an id that may already exist.
  findingAttached = idTaken !== false;
  findingOwnedHere = idTaken === null ? false : rows.some((row) => row.id === FINDING_ID);
  withdrawButton.disabled = mutationPending || !findingOwnedHere;
  updateAttachButton();
};

const refreshHighlights = async () => {
  const sequence = ++refreshSequence;
  const doc = superdoc?.activeEditor?.doc;
  if (!doc) {
    visualStore.replace([]);
    // No document, so no metadata state to report. Unknown rather than empty:
    // attaching is impossible here anyway, and claiming the id is free would be
    // a statement about a document that is not open.
    renderRows([], null);
    return;
  }

  try {
    // Rows and highlights stay scoped to this namespace, but the id check does
    // not: `attach()` rejects an id that exists under any namespace, so gating
    // on the filtered list alone would leave Attach enabled for an id another
    // namespace already holds.
    const [listed, everything] = await Promise.all([doc.metadata.list({ namespace: NAMESPACE }), doc.metadata.list()]);
    const rows = await Promise.all(
      listed.items.map(async (item) => ({
        id: item.id,
        anchorStatus: item.anchorStatus,
        resolved: await doc.metadata.resolve({ id: item.id }),
      })),
    );
    if (sequence !== refreshSequence) return;

    visualStore.replace(
      rows.flatMap((row) => {
        if (row.resolved === null) return [];
        // Map to the visual layer's own address shape rather than handing it a
        // Document API `SelectionTarget`. The two are structurally similar but
        // not interchangeable, and the paint path reads a single block range.
        //
        // `SelectionPoint` is a union, so narrow to its text variant: a
        // node-edge endpoint carries no offset and cannot be painted.
        const { start, end } = row.resolved.target;
        if (start.kind !== 'text' || end.kind !== 'text') return [];
        return [{ kind: 'text' as const, blockId: start.blockId, range: { start: start.offset, end: end.offset } }];
      }),
    );
    renderRows(
      rows,
      everything.items.some((item) => item.id === FINDING_ID),
    );
  } catch (error) {
    if (sequence !== refreshSequence) return;
    visualStore.replace([]);
    // The refresh failed, so the document's metadata state is unknown. Fail
    // closed rather than reporting an empty document with a free id.
    renderRows([], null);
    status.textContent = error instanceof Error ? error.message : String(error);
  }
};

const reviewHighlightExtension = defineSuperDocExtension({
  id: 'example.reviewHighlights',
  activate(ctx) {
    const layer = ctx.visuals.highlight('findings', {
      className: 'review-finding-highlight',
      scope: 'text',
    });
    ctx.disposables.add(layer);

    // Targets in the store were resolved against whichever document was open
    // when they were stored. This activation may be for a different one, and a
    // block id from the previous document can collide with a block in the new
    // one, which would paint a finding over unrelated text.
    //
    // A refresh started against a previous document can still be awaiting its
    // list or resolve calls. Bumping the sequence retires those in-flight
    // passes: they hold the old document facade, and their results would
    // otherwise land after this clear and repaint targets from that document.
    //
    // Clear the panel and controls too, not just the paint. The refresh below
    // is asynchronous and can fail, and until it lands the rows would describe
    // the previous document while Attach and Withdraw acted on its state.
    //
    // Publish the unknown state, not an empty one: at this point the document
    // may already carry the finding, and the refresh that would tell us has not
    // run. `false` would claim the id is free and let a selection made during
    // that read enable Attach for an id that already exists.
    refreshSequence += 1;
    sourceGeneration += 1;
    visualStore.replace([]);
    layer.replace([]);
    renderRows([], null);

    const paint = () => layer.replace(visualStore.read());
    const stopVisualStore = visualStore.subscribe(paint);

    // Every refresh re-resolves every stored finding, so a keystroke burst
    // would run that O(N) walk once per mutation. Coalesce to one refresh per
    // frame, and hold the frame open until the refresh settles: clearing it
    // when the callback fires would start a fresh list + N resolves every frame
    // while the previous one is still in flight. `refreshSequence` discards
    // those stale results but never cancels their requests, so they would pile
    // up into exactly the load this coalescing exists to avoid.
    let refreshHandle: number | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const runRefresh = async () => {
      refreshInFlight = true;
      try {
        await refreshHighlights();
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          scheduleRefresh();
        }
      }
    };

    function scheduleRefresh() {
      // At most one queued follow-up: mutations arriving during a refresh only
      // need one more pass once it lands, not one per mutation.
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      if (refreshHandle !== null) return;
      refreshHandle = requestAnimationFrame(() => {
        refreshHandle = null;
        void runRefresh();
      });
    }

    const cancelRefresh = () => {
      if (refreshHandle !== null) cancelAnimationFrame(refreshHandle);
      refreshHandle = null;
      refreshQueued = false;
    };

    return [
      { dispose: stopVisualStore },
      { dispose: cancelRefresh },
      // Resolve against this document rather than repainting the cleared store.
      // If source completion never arrives, nothing stale is painted meanwhile.
      ctx.onReady(() => void refreshHighlights()),
      ctx.onSourceComplete(() => void refreshHighlights()),
      ctx.onMutation({ affects: ['text', 'block'] }, () => {
        layer.invalidate();
        scheduleRefresh();
      }),
    ];
  },
});

// `attach()` accepts only a non-empty text range inside one body paragraph.
// nodeEdge endpoints and cross-paragraph spans cannot be represented as the
// hidden inline SDT that carries the anchor, and the adapter resolves the
// paragraph against document.xml, so a header, footer, note, or textbox block
// id is not found and the call fails with TARGET_NOT_FOUND. `capture()` still
// returns a `selectionTarget` in every one of those cases, so enabling on its
// presence alone offers an action that predictably fails.
const isAttachableTarget = (target: SelectionTarget | null | undefined): target is SelectionTarget => {
  if (!target) return false;
  if (target.start.kind !== 'text' || target.end.kind !== 'text') return false;
  if (target.start.blockId !== target.end.blockId) return false;
  if (target.start.offset === target.end.offset) return false;
  // A selection crossing deletion-side tracked text carries tracked-space
  // offsets. `attach()` resolves those endpoints against tracked text, then
  // the anchor rewrite searches visible `<w:t>` runs only, so the same numbers
  // mean different positions: the call either fails with TARGET_NOT_FOUND or
  // wraps a different visible range and stores a durable finding on the wrong
  // text. Reject until anchoring translates coordinate spaces.
  if (target.coordinateSpace === 'tracked') return false;
  // Body is the default, so an omitted story is body. Any named story other
  // than body is outside what the adapter can anchor today.
  const story = target.story ?? target.start.story;
  return story === undefined || story.storyType === 'body';
};

// The example manages one fixed finding id, and metadata ids are unique
// document-wide: `attach()` throws INVALID_INPUT when the id is already
// anchored, including when the opened DOCX already carried it. Attaching is
// therefore only available while that id is absent.
let findingAttached = false;

// Both mutations are async against a worker-backed Document API. Without a
// shared pending flag, a second click before the first settles launches a
// concurrent write with the same fixed id: one succeeds, the other reports
// INVALID_INPUT, and the status ends up claiming failure for a finding that
// does exist. Hold both controls disabled until the write and its refresh
// settle, then let the refreshed metadata decide their real state.
let mutationPending = false;

const setMutationPending = (pending: boolean) => {
  mutationPending = pending;
  updateAttachButton();
  // Withdraw is otherwise owned by renderRows(). Restore it from the last known
  // rows when pending clears, rather than only forcing it on: a failed write
  // does not refresh, so leaving it disabled would strand the control while its
  // finding row is still on screen.
  withdrawButton.disabled = pending || !findingOwnedHere;
};

// A capture is only trustworthy once its read has settled. While a re-read is
// in flight the slice reports `pending` or `stale` and still carries the
// PREVIOUS range, so acting on it would anchor the finding to text the user no
// longer has selected.
const readReadyTarget = (): SelectionTarget | null => {
  const capture = superdoc?.ui.selection.capture();
  if (!capture || capture.status !== 'ready') return null;
  return capture.selectionTarget ?? null;
};

const updateAttachButton = () => {
  attachButton.disabled = mutationPending || findingAttached || !isAttachableTarget(readReadyTarget());
};

const attachFinding = async () => {
  if (mutationPending) return;
  const generation = sourceGeneration;
  const doc = superdoc?.activeEditor?.doc;
  // Re-read at click time, not from the state that enabled the button: the
  // selection can have moved since, and a mid-flight read must not be used.
  const target = readReadyTarget();
  if (!doc || !isAttachableTarget(target)) return;

  setMutationPending(true);
  try {
    // `attach()` also rejects a range overlapping another entry's anchor, and
    // an anchor is invisible in the document, so a reader cannot see why a
    // selection is unavailable. The button state cannot cover this: it depends
    // on the selection and needs an async read. Preflight instead, and say
    // which entry is in the way rather than surfacing a bare INVALID_TARGET.
    const overlapping = await doc.metadata.list({ within: target });
    // The document may have been replaced while that read was in flight. The
    // target came from the previous source, and a block id can collide in the
    // new one, so a resumed continuation would anchor to unrelated text.
    //
    // This covers the swap; `expectedRevision` below covers an edit to the
    // same document. Neither covers a swap landing during the write's own
    // await, because the replacement carries its own revision sequence.
    if (generation !== sourceGeneration) return;
    const blocking = overlapping.items.find((item) => item.id !== FINDING_ID);
    if (blocking) {
      status.textContent = `That range already carries metadata (${blocking.id}). Select text outside it.`;
      return;
    }

    // Guard the write on the revision the preflight read evaluated. Without it
    // an edit landing between the two applies this target to a document that
    // has moved on. The generation check above covers a document swap; this
    // covers an edit to the same document.
    const result = await doc.metadata.attach(
      {
        id: FINDING_ID,
        namespace: NAMESPACE,
        target,
        payload: {
          kind: 'verification',
          summary: 'Check this statement against the source material.',
        },
      },
      { expectedRevision: overlapping.evaluatedRevision },
    );
    if (!result.success) {
      status.textContent = result.failure.message;
      return;
    }

    status.textContent = `Attached ${result.id}.`;
    await refreshHighlights();
    superdoc?.focus();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setMutationPending(false);
  }
};

const withdrawFinding = async () => {
  if (mutationPending) return;
  const generation = sourceGeneration;
  const doc = superdoc?.activeEditor?.doc;
  if (!doc) return;

  setMutationPending(true);
  try {
    // `remove()` identifies its target by id alone, and the id space is
    // document-wide. If the entry this example owned was withdrawn elsewhere
    // and the id reused under another namespace, removing by id would delete
    // that other application's metadata and anchor. The button state comes
    // from the last refresh and remote changes are not observed, so re-read
    // ownership here and pass the revision that read evaluated to the write:
    // an edit landing in between fails the guard rather than removing a record
    // this check never saw.
    const current = await doc.metadata.list({ namespace: NAMESPACE });
    if (generation !== sourceGeneration) return;
    if (!current.items.some((item) => item.id === FINDING_ID)) {
      status.textContent = `${FINDING_ID} is no longer owned by ${NAMESPACE}. Refreshing instead of removing it.`;
      await refreshHighlights();
      return;
    }

    const result = await doc.metadata.remove({ id: FINDING_ID }, { expectedRevision: current.evaluatedRevision });
    if (!result.success) {
      status.textContent = result.failure.message;
      return;
    }

    status.textContent = `Withdrew ${result.id}.`;
    await refreshHighlights();
    superdoc?.focus();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setMutationPending(false);
  }
};

superdoc = new SuperDoc({
  selector: editorHost,
  document: '/contract.docx',
  extensions: [reviewHighlightExtension],
  onReady: ({ superdoc: readySuperDoc }) => {
    superdoc = readySuperDoc;
    stopSelection = readySuperDoc.ui.selection.observe(updateAttachButton);
    updateAttachButton();
    void refreshHighlights();
  },
});

attachButton.addEventListener('click', attachFinding);
withdrawButton.addEventListener('click', withdrawFinding);

window.addEventListener('beforeunload', () => {
  attachButton.removeEventListener('click', attachFinding);
  withdrawButton.removeEventListener('click', withdrawFinding);
  stopSelection?.();
  superdoc?.destroy();
});
