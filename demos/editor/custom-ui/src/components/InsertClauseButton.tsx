import { useEffect, useRef, useState } from 'react';
import type {
  CustomCommandHandleState,
  CustomCommandRegistrationResult,
} from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

/**
 * Hardcoded clause library for the demo. A real consumer would fetch
 * this from their own API and gate it on permissions / authoring
 * context — exactly the kind of state SuperDoc has no way to know
 * about, which is why `register({ getState })` + `invalidate()` exist.
 */
const CLAUSES = [
  {
    id: 'confidentiality',
    title: 'Confidentiality',
    body: 'Each party agrees to maintain the confidentiality of all information disclosed by the other party in connection with this agreement and to use such information solely for the purposes contemplated herein.',
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: 'This agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.',
  },
  {
    id: 'severability',
    title: 'Severability',
    body: 'If any provision of this agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.',
  },
] as const;

type ClauseId = (typeof CLAUSES)[number]['id'];

interface InsertClausePayload {
  clauseId: ClauseId;
}

const STATIC_DISABLED: CustomCommandHandleState<unknown> = {
  active: false,
  disabled: true,
  value: undefined,
  source: 'custom',
};

/**
 * Demonstrates `ui.commands.register({...})` — the surface SuperDoc
 * exposes for consumer-defined toolbar buttons. The component:
 *
 *   1. Registers `'demo.insertClause'` on mount and unregisters
 *      on unmount, so the command's lifetime matches the component's.
 *      A real consumer app usually holds the registration for the
 *      session, but the pattern is the same.
 *
 *   2. Reads its disabled state from the command's own observable —
 *      `reg.handle.observe(state => ...)`. Custom commands are first-
 *      class on `state.toolbar.commands`, so this is the canonical
 *      way to drive a toolbar button's enabled/disabled state.
 *
 *   3. Routes the actual mutation through the public Document API
 *      (`editor.doc.insert`) using `state.selection.selectionTarget`,
 *      which already carries the cursor in the explicit
 *      start/end-point shape `editor.doc.insert` consumes. No
 *      inline lift, no adapter-helper import.
 *
 * Capturing the registration return value (`reg.handle`) is the
 * typed path: it carries the consumer's `TPayload` / `TValue`
 * generics. Dynamic-lookup callers should use
 * `ui.commands.get('demo.insertClause')` (returns
 * `DynamicCommandHandle | undefined`); the older bracket-index path
 * still works at runtime but loses the per-command typing.
 */
export function InsertClauseButton() {
  const ui = useSuperDocUI();
  const [open, setOpen] = useState(false);
  const [commandState, setCommandState] = useState<CustomCommandHandleState<unknown>>(STATIC_DISABLED);
  const regRef = useRef<CustomCommandRegistrationResult<InsertClausePayload, unknown> | null>(null);

  // Register the custom command on mount; unregister on unmount.
  // `ui` is null until `<EditorMount>` reports onReady — until then
  // there's nothing to register against.
  useEffect(() => {
    if (!ui) return;

    const reg = ui.commands.register<InsertClausePayload>({
      id: 'demo.insertClause',
      // Mod-Shift-C dispatches `execute` with no payload, which the
      // body below treats as "open the picker" rather than performing
      // an insert. (A consumer with a single-clause flow would skip
      // the menu and pass `{ clauseId: 'confidentiality' }` directly.)
      shortcut: 'Mod-Shift-C',
      getState: ({ state }) => ({
        active: false,
        // Disabled when there's nothing positional to anchor the
        // insert against, or when the document is read-only.
        disabled:
          !state.ready ||
          state.documentMode === 'viewing' ||
          state.selection.target === null,
      }),
      execute: ({ payload, editor, superdoc }) => {
        // The keyboard dispatch path doesn't consult `getState`; without
        // this gate, Mod-Shift-C would pop the picker even when the
        // toolbar button is grayed out (no selection target / viewing
        // mode), letting the user choose a clause that the insert
        // branch can't honor — silent dead-end. Mirror the disabled
        // check from `getState` so the shortcut and the button agree.
        const live = ui.selection.getSnapshot();
        const documentMode = superdoc.config?.documentMode ?? null;
        const disabled = documentMode === 'viewing' || live.target === null;

        if (!payload) {
          if (disabled) return false;
          setOpen(true);
          return true;
        }
        if (disabled) return false;
        const clause = CLAUSES.find((c) => c.id === payload.clauseId);
        if (!clause) return false;

        // Route through the public Document API. The selection slice
        // already exposes the cursor in BOTH shapes the doc-api
        // consumes: `target` (TextTarget, for comments / format.apply)
        // and `selectionTarget` (SelectionTarget, for insert /
        // replace). Pass `selectionTarget` straight through.
        const selectionTarget = ui.selection.getSnapshot().selectionTarget;
        if (!selectionTarget) return false;
        const receipt = editor?.doc?.insert?.({
          value: clause.body,
          type: 'text',
          target: selectionTarget,
        });
        return receipt?.success === true;
      },
    });

    regRef.current = reg;
    const unobserve = reg.handle.observe(setCommandState);
    return () => {
      unobserve();
      reg.unregister();
      regRef.current = null;
    };
  }, [ui]);

  const insert = (clauseId: ClauseId) => {
    setOpen(false);
    regRef.current?.handle.execute({ clauseId });
  };

  return (
    <div className="clause-menu">
      <button
        className="tb-btn"
        disabled={!ui || commandState.disabled}
        title="Insert standard clause"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Insert clause
      </button>
      {open && (
        <div className="menu" role="menu">
          {CLAUSES.map((clause) => (
            <button key={clause.id} role="menuitem" onClick={() => insert(clause.id)}>
              <div className="clause-title">{clause.title}</div>
              <div className="clause-preview">{clause.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
