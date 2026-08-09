import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import type { UIConfig } from 'superdoc';
import {
  SuperDocUIProvider,
  useSetSuperDoc,
  useSuperDocComments,
  useSuperDocDocument,
  useSuperDocSelection,
  useSuperDocUI,
} from 'superdoc/ui/react';
import type { CommentInfo, SelectionCapture, WorkflowReceipt } from 'superdoc/ui';
import 'superdoc/style.css';

// The one surface this application replaces. Everything else — toolbar, context
// menu, search, the document canvas — stays built in. Declared at module scope
// because a new object on every render would rebuild the Editor.
const EDITOR_UI = {
  comments: false,
} satisfies UIConfig;

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

export default function App() {
  return (
    <SuperDocUIProvider>
      <main className='layout'>
        <Editor />
        <CommentsPanel />
      </main>
    </SuperDocUIProvider>
  );
}

function Editor() {
  const mountRef = useRef<HTMLDivElement>(null);
  const setSuperDoc = useSetSuperDoc();

  useEffect(() => {
    if (!mountRef.current) return;
    // `onReady` is asynchronous, so a mount that is torn down before the
    // document finishes loading can still fire it. Under StrictMode, React
    // does exactly that on every dev mount. Binding then would publish a
    // destroyed instance and leave the panel reading dead state.
    let destroyed = false;

    const superdoc = new SuperDoc({
      selector: mountRef.current,
      document: '/contract.docx',
      user: CURRENT_USER,
      ui: EDITOR_UI,
      onReady: ({ superdoc: ready }) => {
        if (!destroyed) setSuperDoc(ready);
      },
      onException: ({ error }) => console.error('SuperDoc could not open the document.', error),
    });

    // The component owns the Editor, so the component destroys it. That also
    // disposes the controller the provider is publishing.
    return () => {
      destroyed = true;
      superdoc.destroy();
    };
  }, [setSuperDoc]);

  return <div className='canvas' ref={mountRef} />;
}

function CommentsPanel() {
  const ui = useSuperDocUI();
  const comments = useSuperDocComments();
  const selection = useSuperDocSelection();
  const { mode } = useSuperDocDocument();

  const [status, setStatus] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Viewing mode is the one refusal this panel can anticipate: it is on the
  // public document slice. The comments `readOnly` and `allowResolve`
  // interaction policies are NOT publicly observable, so controls they forbid
  // stay visible and surface their refusal through the receipt instead. That is
  // a presentation limit, not a safety one — the controller refuses those
  // mutations either way.
  const readOnly = mode === 'viewing';

  // Announce through a live region rather than an alert, so a failure reaches a
  // screen reader without stealing focus from the composer the user is in.
  const announce = useCallback((message: string) => setStatus(message), []);

  const report = useCallback(
    (receipt: Awaited<WorkflowReceipt>, success: string) => {
      if (!receipt.success) {
        announce(receipt.failure.message);
        return false;
      }
      announce(success);
      return true;
    },
    [announce],
  );

  const threads = useMemo(() => toThreads(comments.items), [comments.items]);

  if (!ui) {
    return (
      <aside aria-label='Comments' className='panel'>
        <p>Loading the document…</p>
      </aside>
    );
  }

  return (
    <aside aria-label='Comments' className='panel'>
      <header>
        <h2>Comments</h2>
        <p>{comments.listStatus === 'pending' ? 'Loading…' : `${threads.length} threads`}</p>
      </header>

      {!readOnly && (
        <NewCommentComposer
          announce={announce}
          composerRef={composerRef}
          report={report}
          selectionIsEmpty={selection.empty}
          ui={ui}
        />
      )}

      {comments.listStatus !== 'pending' && threads.length === 0 && (
        <p className='empty'>No comments yet. Select text in the document to start a thread.</p>
      )}

      <ul className='threads'>
        {threads.map((thread) => (
          <Thread
            active={thread.root.id === comments.activeId}
            announce={announce}
            key={thread.root.id}
            readOnly={readOnly}
            report={report}
            returnFocusTo={composerRef}
            thread={thread}
            ui={ui}
          />
        ))}
      </ul>

      <p aria-live='polite' className='status' role='status'>
        {status}
      </p>
    </aside>
  );
}

type UIHandle = NonNullable<ReturnType<typeof useSuperDocUI>>;
type Report = (receipt: Awaited<WorkflowReceipt>, success: string) => boolean;
type Announce = (message: string) => void;

function NewCommentComposer({
  announce,
  composerRef,
  report,
  selectionIsEmpty,
  ui,
}: {
  announce: Announce;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  report: Report;
  selectionIsEmpty: boolean;
  ui: UIHandle;
}) {
  const [text, setText] = useState('');
  const [capture, setCapture] = useState<SelectionCapture | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();

  // Capture on the press, before focus moves anywhere. `mousedown` fires
  // before the browser moves focus to the button; `click` fires after. Reading
  // the selection at submit time instead would tie the comment to whatever is
  // selected then, which is not what the user was looking at when they started
  // writing.
  const captureNow = useCallback(() => {
    const frozen = ui.selection.capture();
    if (frozen) setCapture(frozen);
  }, [ui]);

  const startComment = useCallback(() => {
    // Keyboard activation never fires mousedown, so the click handler is the
    // only hook the keyboard path has. That works because this controller keeps
    // its selection when a control takes focus — it is NOT the same guarantee
    // as capturing on the press. A control that cleared the selection on focus
    // would need a keydown handler instead.
    captureNow();
    composerRef.current?.focus();
  }, [captureNow, composerRef]);

  const submit = useCallback(async () => {
    if (!capture || pending) return;

    setPending(true);
    try {
      // The capture is the target, not the live selection. A selection change
      // made while this composer was open does not retarget the draft.
      const created = report(await ui.comments.createFromCapture(capture, { text }), 'Comment added.');
      if (!created) return;

      setText('');
      setCapture(null);
    } finally {
      setPending(false);
    }
  }, [capture, pending, report, text, ui]);

  const cancel = useCallback(() => {
    setText('');
    setCapture(null);
    announce('Draft discarded.');
  }, [announce]);

  return (
    <form
      className='composer'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <button disabled={selectionIsEmpty && !capture} onMouseDown={captureNow} onClick={startComment} type='button'>
        Add comment
      </button>

      <label htmlFor={fieldId}>New comment</label>
      <textarea
        id={fieldId}
        onChange={(event) => setText(event.target.value)}
        placeholder='Select text in the document, then write your comment.'
        ref={composerRef}
        rows={3}
        value={text}
      />

      <div className='actions'>
        <button disabled={!capture || pending || text.trim().length === 0} type='submit'>
          {pending ? 'Adding…' : 'Comment'}
        </button>
        <button disabled={pending} onClick={cancel} type='button'>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Thread({
  active,
  announce,
  readOnly,
  report,
  returnFocusTo,
  thread,
  ui,
}: {
  active: boolean;
  announce: Announce;
  readOnly: boolean;
  report: Report;
  returnFocusTo: React.RefObject<HTMLTextAreaElement | null>;
  thread: CommentThread;
  ui: UIHandle;
}) {
  const { root, replies } = thread;
  const resolved = root.status === 'resolved';

  const reveal = useCallback(async () => {
    ui.comments.setActive(root.id);
    const shown = await ui.comments.scrollTo(root.id);
    // Activation and navigation are separate outcomes. Reporting success when
    // the anchor could not be reached would hide a real failure.
    if (!shown.success) announce(shown.reason ?? 'The comment could not be shown.');
  }, [announce, root.id, ui]);

  return (
    <li className={active ? 'thread active' : 'thread'}>
      <article aria-current={active ? 'true' : undefined}>
        <CommentBody comment={root} readOnly={readOnly} report={report} ui={ui} />

        {replies.map((reply) => (
          <CommentBody comment={reply} key={reply.id} readOnly={readOnly} report={report} reply ui={ui} />
        ))}

        <div className='actions'>
          <button onClick={() => void reveal()} type='button'>
            Show in document
          </button>

          {!readOnly && (
            <>
              <button
                onClick={async () => {
                  const receipt = resolved ? await ui.comments.reopen(root.id) : await ui.comments.resolve(root.id);
                  report(receipt, resolved ? 'Thread reopened.' : 'Thread resolved.');
                }}
                type='button'
              >
                {resolved ? 'Reopen' : 'Resolve'}
              </button>

              <DeleteThread commentId={root.id} report={report} returnFocusTo={returnFocusTo} ui={ui} />
            </>
          )}
        </div>

        {!readOnly && !resolved && <ReplyComposer commentId={root.id} report={report} ui={ui} />}
      </article>
    </li>
  );
}

function CommentBody({
  comment,
  readOnly,
  reply = false,
  report,
  ui,
}: {
  comment: CommentInfo;
  readOnly: boolean;
  reply?: boolean;
  report: Report;
  ui: UIHandle;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text ?? '');
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // The Edit button is unmounted while the editor is open, so its ref is null
  // for as long as `editing` is true. Focusing it in the same handler that
  // clears `editing` therefore does nothing: React has not re-rendered yet.
  // Restore focus in an effect, after the button is back in the tree.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    editButtonRef.current?.focus();
  }, [editing]);

  const stopEditing = useCallback(() => {
    // Cancel and success both return focus to the control that opened the
    // editor, so keyboard users are not dropped at the top of the panel.
    restoreFocus.current = true;
    setEditing(false);
  }, []);

  // A mode switch can land while an editor is open. Clearing the state here
  // rather than only hiding the form matters twice: the draft does not reappear
  // if the document returns to editing, and the guard on the early return below
  // cannot be defeated by state that outlived the mode it belonged to.
  useEffect(() => {
    if (!readOnly || !editing) return;
    setEditing(false);
    setDraft(comment.text ?? '');
  }, [comment.text, editing, readOnly]);

  // Rendering the editor is gated on `readOnly` because this early return
  // happens before the write controls below reach their own guard.
  if (editing && !readOnly) {
    return (
      <form
        className='edit'
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          try {
            if (report(await ui.comments.edit(comment.id, { text: draft }), 'Comment updated.')) stopEditing();
          } finally {
            setPending(false);
          }
        }}
      >
        <label htmlFor={fieldId}>Edit comment</label>
        <textarea autoFocus id={fieldId} onChange={(event) => setDraft(event.target.value)} rows={2} value={draft} />
        <button disabled={pending || draft.trim().length === 0} type='submit'>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setDraft(comment.text ?? '');
            stopEditing();
          }}
          type='button'
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className={reply ? 'comment reply' : 'comment'}>
      <p className='author'>{comment.creatorName ?? 'Unknown author'}</p>
      <p className='body'>{comment.text || 'Comment without text'}</p>
      {!readOnly && (
        <button
          onClick={() => {
            setDraft(comment.text ?? '');
            setEditing(true);
          }}
          ref={editButtonRef}
          type='button'
        >
          Edit
        </button>
      )}
    </div>
  );
}

function ReplyComposer({ commentId, report, ui }: { commentId: string; report: Report; ui: UIHandle }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const fieldId = useId();

  return (
    <form
      className='reply-composer'
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
          if (report(await ui.comments.reply(commentId, { text }), 'Reply added.')) setText('');
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor={fieldId}>Reply</label>
      <input id={fieldId} onChange={(event) => setText(event.target.value)} type='text' value={text} />
      <button disabled={pending || text.trim().length === 0} type='submit'>
        {pending ? 'Replying…' : 'Reply'}
      </button>
    </form>
  );
}

function DeleteThread({
  commentId,
  report,
  returnFocusTo,
  ui,
}: {
  commentId: string;
  report: Report;
  returnFocusTo: React.RefObject<HTMLTextAreaElement | null>;
  ui: UIHandle;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  // Same unmount problem as the edit affordance: the Delete button is not in
  // the tree while the confirmation is showing, so focusing its ref in the same
  // handler that hides the confirmation is a no-op.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (confirming || !restoreFocus.current) return;
    restoreFocus.current = false;
    deleteButtonRef.current?.focus();
  }, [confirming]);

  const closeConfirmation = useCallback(() => {
    restoreFocus.current = true;
    setConfirming(false);
  }, []);

  // Confirmation belongs to the application. The controller deletes what it is
  // told to delete and does not prompt.
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} ref={deleteButtonRef} type='button'>
        Delete
      </button>
    );
  }

  return (
    <span className='confirm' role='group' aria-label='Confirm deletion'>
      <span>Delete this thread?</span>
      <button
        autoFocus
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            // On success the whole thread leaves the list, so focus has to go
            // somewhere deliberate rather than to a removed node's ancestor.
            // On failure the thread is still here, so returning to the Delete
            // button leaves the user where they can retry or move on.
            if (report(await ui.comments.delete(commentId), 'Thread deleted.')) returnFocusTo.current?.focus();
            else closeConfirmation();
          } finally {
            setPending(false);
          }
        }}
        type='button'
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      <button disabled={pending} onClick={closeConfirmation} type='button'>
        Keep
      </button>
    </span>
  );
}

interface CommentThread {
  root: CommentInfo;
  replies: CommentInfo[];
}

/**
 * Group the flat comment feed into threads.
 *
 * This derives from `comments.items` on every render rather than being copied
 * into state, so collaboration updates, undo, and redo stay authoritative. A
 * cached thread list would drift from the document.
 */
function toThreads(items: readonly CommentInfo[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();

  for (const item of items) {
    if (!item.parentCommentId) threads.set(item.id, { root: item, replies: [] });
  }
  for (const item of items) {
    const parentId = item.rootCommentId ?? item.parentCommentId;
    if (parentId) threads.get(parentId)?.replies.push(item);
  }

  return [...threads.values()];
}
